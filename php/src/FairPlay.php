<?php

declare(strict_types=1);

namespace Morse;

/**
 * Fair play (owner t255u): Chess.com-style cheat detection for rated games.
 *
 * Rated = normal chess (no variant), human vs human, not a Sandbox game. Football and bot games are never checked.
 *
 * Signals, per player per game (table fairplay_games):
 *  1. Engine matching  - top-1 / top-3 match with Stockfish and average centipawn loss, weighted by how much the
 *                        best move stands out; book moves, forced moves and already-decided positions are skipped.
 *  2. Move timing      - think time per move from the server's own move timestamps; very uniform timing is suspicious.
 *  3. Sudden jumps     - rating gain or accuracy improvement far beyond the player's own history.
 *  4. Focus away       - the tab/window lost focus during the player's own move (client report, checked by the server).
 * They are combined into one 0-100 suspicion score per account (fairplay_accounts). An account only enters the review
 * queue (status 'flagged') with enough games AND a strong engine signal - timing/focus/jumps alone never flag anyone.
 * Nothing here punishes anybody: bans, forfeits and refunds happen only in review() which a human runs from the
 * server shell (php/bin/fairplay-review.php). There is no web endpoint for it.
 */
final class FairPlay
{
    // ── thresholds (conservative on purpose: false positives are worse than a missed cheater) ──
    public const BOOK_PLIES = 12;          // first 6 moves each are "book" and not judged
    public const DECIDED_CP = 400;         // |eval| this big: the game is decided, accuracy means little
    public const FORCED_GAP_CP = 200;      // best move this much better than the 2nd: an obvious/forced move
    public const LOSS_CAP_CP = 500;
    public const MIN_ENGINE_MOVES_GAME = 15;   // judged moves for a game to count
    public const MIN_GAMES = 5;                // analysed rated games before an account can be flagged
    public const MIN_ENGINE_MOVES_TOTAL = 100;
    public const WINDOW_GAMES = 20;            // the account score looks at the last 20 rated games
    public const TIMING_MIN_MOVES = 20;
    public const TIMING_SKIP_MOVES = 5;        // own first moves (often fast book moves) are not timed
    public const TIMING_MIN_MEAN_MS = 2500;
    public const TIMING_MAX_CV = 0.30;         // humans are usually 0.8+ (fast easy moves, long hard ones)
    public const FOCUS_MIN_MS = 2000;          // shorter glances away are ignored
    public const JUMP_RATING = 250;            // + this much over the last 10 rated games
    public const JUMP_MIN_HISTORY = 15;
    public const FLAG_SCORE = 70;
    public const FLAG_MIN_ENGINE_POINTS = 45;
    public const REFLAG_NEW_GAMES = 10;        // a cleared account re-enters the queue only after 10 more games
    public const MAX_FOCUS_ROWS = 300;

    public static function register(): void
    {
        Rpc::register('reportFocus', [self::class, 'reportFocus']);
    }

    /** @param array<string,mixed> $game */
    public static function isRated(array $game): bool
    {
        $w = (string) ($game['white_user_id'] ?? '');
        $b = (string) ($game['black_user_id'] ?? '');
        return (string) ($game['variant'] ?? '') === ''
            && (string) ($game['source'] ?? '') !== 'sandbox'
            && $w !== '' && $b !== '' && $w !== $b
            && !Constants::isBotUserId($w) && !Constants::isBotUserId($b);
    }

    /** A rated game just finished (called inside the settling transaction): queue both players for analysis. */
    public static function onRatedGameEnd(array $game, int $whiteDelta): void
    {
        if (!self::isRated($game)) {
            return;
        }
        $now = Db::now();
        foreach (['w' => 'white', 'b' => 'black'] as $side => $name) {
            $start = $game[$name . '_start_score'] ?? null;
            Db::insertIgnore('fairplay_games', [
                'game_id' => (string) $game['id'],
                'user_id' => (string) $game[$name . '_user_id'],
                'status' => 'pending',
                'rating_before' => $start === null || $start === '' ? null : (int) $start,
                'rating_delta' => $side === 'w' ? $whiteDelta : -$whiteDelta,
                'created_at' => $now,
            ]);
        }
    }

    // ── 4. focus reports ──────────────────────────────────────────────────

    /**
     * The client says the tab/window was away for awayMs during the player's own move at ply `ply`
     * (= number of moves already played). Only accepted for the player's own turn of an active rated game.
     * @param array<string,mixed> $data
     */
    public static function reportFocus(string $userId, array $data): mixed
    {
        $gameId = is_string($data['gameId'] ?? null) ? $data['gameId'] : '';
        $game = Db::one('SELECT * FROM games WHERE id = ? LIMIT 1', [$gameId]);
        if ($game === null || $game['status'] !== 'active' || !self::isRated($game)) {
            return ['ok' => false];
        }
        $side = $game['white_user_id'] === $userId ? 'w' : ($game['black_user_id'] === $userId ? 'b' : null);
        if ($side === null || $game['turn'] !== $side) {
            return ['ok' => false];
        }
        $ply = (int) Db::value('SELECT COUNT(*) FROM game_moves WHERE game_id = ?', [$gameId]);
        if ((int) ($data['ply'] ?? -1) !== $ply) {
            return ['ok' => false];
        }
        // Never longer than this turn has lasted so far (plus a little slack for the network).
        $turnMs = max(0, Db::nowMs() - Db::toMs($game['turn_started_at']));
        $away = max(0, min((int) ($data['awayMs'] ?? 0), $turnMs + 2000, 3600000));
        if ($away < 200) {
            return ['ok' => true];
        }
        $rows = (int) Db::value('SELECT COUNT(*) FROM fairplay_focus WHERE game_id = ? AND user_id = ?', [$gameId, $userId]);
        if ($rows >= self::MAX_FOCUS_ROWS) {
            return ['ok' => true];
        }
        Db::run('INSERT INTO fairplay_focus (game_id, user_id, ply, away_ms, created_at) VALUES (?, ?, ?, ?, ?)',
            [$gameId, $userId, $ply, $away, Db::now()]);
        return ['ok' => true];
    }

    // ── analysis (worker) ─────────────────────────────────────────────────

    /**
     * Analyse pending rows. $engine null = no Stockfish on this server: timing/focus are still filled in and
     * the rows stay 'pending' for the engine part, except that after 3 engine-less passes they become 'noengine'.
     * @return int rows finished
     */
    public static function runPending(?Engine $engine, int $limit = 20): int
    {
        $games = Db::all("SELECT DISTINCT game_id FROM fairplay_games WHERE status = 'pending' ORDER BY game_id LIMIT " . max(1, $limit));
        $done = 0;
        foreach ($games as $g) {
            $done += self::analyzeGame((string) $g['game_id'], $engine);
        }
        return $done;
    }

    public static function analyzeGame(string $gameId, ?Engine $engine): int
    {
        $game = Db::one('SELECT * FROM games WHERE id = ? LIMIT 1', [$gameId]);
        $rows = Db::all("SELECT * FROM fairplay_games WHERE game_id = ? AND status = 'pending'", [$gameId]);
        if ($game === null || $rows === []) {
            Db::run("UPDATE fairplay_games SET status = 'skipped' WHERE game_id = ?", [$gameId]);
            return 0;
        }
        $moves = Db::all('SELECT ply, san, from_sq, to_sq, created_at FROM game_moves WHERE game_id = ? ORDER BY ply ASC', [$gameId]);
        $engineStats = ['w' => null, 'b' => null];
        if ($engine !== null) {
            try {
                $engineStats = self::engineStats($moves, $engine);
            } catch (\Throwable $e) {
                Db::run('UPDATE fairplay_games SET attempts = attempts + 1 WHERE game_id = ?', [$gameId]);
                Db::run("UPDATE fairplay_games SET status = 'error' WHERE game_id = ? AND attempts >= 3", [$gameId]);
                return 0;
            }
        }
        $times = self::thinkTimes($moves, Db::toMs($game['created_at']));
        $done = 0;
        foreach ($rows as $row) {
            $uid = (string) $row['user_id'];
            $side = $uid === $game['white_user_id'] ? 'w' : 'b';
            $own = array_values(array_filter($times, static fn (array $t): bool => $t['side'] === $side));
            $timing = self::timingStats(array_map(static fn (array $t): int => $t['ms'], $own));
            $focus = Db::all('SELECT ply, away_ms FROM fairplay_focus WHERE game_id = ? AND user_id = ?', [$gameId, $uid]);
            $fPlies = [];
            $fEvents = 0;
            $fMs = 0;
            foreach ($focus as $f) {
                if ((int) $f['away_ms'] >= self::FOCUS_MIN_MS) {
                    $fEvents++;
                    $fMs += (int) $f['away_ms'];
                    $fPlies[(int) $f['ply']] = true;
                }
            }
            $e = $engineStats[$side];
            $attempts = (int) $row['attempts'] + 1;
            $status = ($engine !== null) ? 'done' : ($attempts >= 3 ? 'noengine' : 'pending');
            Db::run(
                'UPDATE fairplay_games SET status = ?, engine_moves = ?, top1 = ?, top3 = ?, acpl = ?, think_moves = ?, think_mean_ms = ?,
                    think_cv = ?, focus_events = ?, focus_ms = ?, focus_moves = ?, own_moves = ?, attempts = ?, analyzed_at = ?
                 WHERE game_id = ? AND user_id = ?',
                [$status, $e['moves'] ?? null, $e['top1'] ?? null, $e['top3'] ?? null, $e['acpl'] ?? null,
                 $timing['n'], $timing['mean'], $timing['cv'], $fEvents, $fMs, count($fPlies), count($own), $attempts, Db::now(), $gameId, $uid]
            );
            if ($status !== 'pending') {
                self::rescoreAccount($uid);
                $done++;
            }
        }
        return $done;
    }

    /**
     * Engine signal for both sides. Positions are evaluated once each (MultiPV 3); a played move outside the
     * top 3 is judged by evaluating the position after it.
     * @param list<array<string,mixed>> $moves
     * @return array{w:?array,b:?array}
     */
    public static function engineStats(array $moves, Engine $engine): array
    {
        $chess = new Chess();
        $acc = ['w' => ['n' => 0, 'w' => 0.0, 't1' => 0.0, 't3' => 0.0, 'loss' => 0.0], 'b' => ['n' => 0, 'w' => 0.0, 't1' => 0.0, 't3' => 0.0, 'loss' => 0.0]];
        foreach ($moves as $i => $m) {
            $side = $chess->turn();
            $fen = $chess->fen();
            $legal = count($chess->moves());
            $played = $chess->move((string) $m['san']);
            if ($played === null) {
                break; // should not happen: the server only stores legal moves
            }
            if ($i < self::BOOK_PLIES || $legal <= 1) {
                continue;
            }
            $lines = $engine->analyse($fen, 3);
            if (count($lines) === 0 || $lines[0]['mate'] !== null) {
                continue; // mates are found by everyone, skip
            }
            $best = $lines[0]['cp'];
            if (abs($best) >= self::DECIDED_CP) {
                continue;
            }
            $second = $lines[1]['cp'] ?? null;
            if ($second !== null && $best - $second >= self::FORCED_GAP_CP) {
                continue; // forced / obvious
            }
            $third = $lines[2]['cp'] ?? ($second ?? $best - 100);
            // Weight: where the top moves are almost equal, matching #1 is mostly luck -> low weight.
            $weight = max(0.3, min(1.0, ($best - $third) / 100));
            $lan = (string) $played['lan'];
            $rank = null;
            $playedCp = null;
            foreach ($lines as $k => $l) {
                if ($l['move'] === $lan) {
                    $rank = $k;
                    $playedCp = $l['mate'] !== null ? $best : $l['cp'];
                    break;
                }
            }
            if ($playedCp === null) {
                $after = $engine->analyse($chess->fen(), 1);
                $l = $after[0] ?? null;
                $playedCp = $l === null ? $best - self::LOSS_CAP_CP : ($l['mate'] !== null ? ($l['mate'] > 0 ? $best - self::LOSS_CAP_CP : $best) : -$l['cp']);
            }
            $loss = max(0, min(self::LOSS_CAP_CP, $best - $playedCp));
            $a = &$acc[$side];
            $a['n']++;
            $a['w'] += $weight;
            $a['t1'] += $rank === 0 ? $weight : 0;
            $a['t3'] += $rank !== null ? $weight : 0;
            $a['loss'] += $weight * $loss;
            unset($a);
        }
        $out = ['w' => null, 'b' => null];
        foreach ($acc as $s => $a) {
            $out[$s] = $a['w'] > 0
                ? ['moves' => $a['n'], 'top1' => $a['t1'] / $a['w'], 'top3' => $a['t3'] / $a['w'], 'acpl' => $a['loss'] / $a['w']]
                : ['moves' => 0, 'top1' => null, 'top3' => null, 'acpl' => null];
        }
        return $out;
    }

    /**
     * Think time of every move from the server's own timestamps (a move's time = since the previous move).
     * @param list<array<string,mixed>> $moves
     * @return list<array{side:string,ms:int}>
     */
    public static function thinkTimes(array $moves, int $startMs): array
    {
        $out = [];
        $prev = $startMs;
        foreach ($moves as $i => $m) {
            $t = Db::toMs($m['created_at']);
            $out[] = ['side' => $i % 2 === 0 ? 'w' : 'b', 'ms' => max(0, $t - $prev)];
            $prev = $t;
        }
        return $out;
    }

    /** @param list<int> $ms own think times in order @return array{n:int,mean:?int,cv:?float} */
    public static function timingStats(array $ms): array
    {
        $ms = array_slice($ms, self::TIMING_SKIP_MOVES);
        $n = count($ms);
        if ($n < 2) {
            return ['n' => $n, 'mean' => null, 'cv' => null];
        }
        $mean = array_sum($ms) / $n;
        $var = 0.0;
        foreach ($ms as $v) {
            $var += ($v - $mean) ** 2;
        }
        $sd = sqrt($var / ($n - 1));
        return ['n' => $n, 'mean' => (int) round($mean), 'cv' => $mean > 0 ? $sd / $mean : null];
    }

    // ── 5. account score + review queue ───────────────────────────────────

    /** @return array{score:int,games:int,signals:array<string,mixed>} */
    public static function accountScore(string $userId): array
    {
        $rows = Db::all(
            "SELECT * FROM fairplay_games WHERE user_id = ? AND status IN ('done', 'noengine') ORDER BY created_at DESC LIMIT " . self::WINDOW_GAMES,
            [$userId]
        );
        $all = (int) Db::value("SELECT COUNT(*) FROM fairplay_games WHERE user_id = ? AND status IN ('done', 'noengine')", [$userId]);
        $sig = ['games' => count($rows)];
        // 1. engine
        $eGames = 0;
        $eMoves = 0;
        $t1 = 0.0;
        $t3 = 0.0;
        $loss = 0.0;
        foreach ($rows as $r) {
            if ($r['top1'] === null || (int) $r['engine_moves'] < self::MIN_ENGINE_MOVES_GAME) {
                continue;
            }
            $n = (int) $r['engine_moves'];
            $eGames++;
            $eMoves += $n;
            $t1 += (float) $r['top1'] * $n;
            $t3 += (float) $r['top3'] * $n;
            $loss += (float) $r['acpl'] * $n;
        }
        $enginePts = 0.0;
        if ($eGames >= self::MIN_GAMES && $eMoves >= self::MIN_ENGINE_MOVES_TOTAL) {
            $top1 = $t1 / $eMoves;
            $acpl = $loss / $eMoves;
            $sig += ['top1' => round($top1, 3), 'top3' => round($t3 / $eMoves, 3), 'acpl' => round($acpl, 1)];
            $enginePts = self::clamp(($top1 - 0.70) / 0.20) * 35 + self::clamp((25 - $acpl) / 15) * 25;
        }
        $sig['engineGames'] = $eGames;
        $sig['enginePoints'] = round($enginePts, 1);
        // 2. timing
        $timed = 0;
        $uniform = 0;
        foreach ($rows as $r) {
            if ((int) $r['think_moves'] >= self::TIMING_MIN_MOVES && $r['think_cv'] !== null) {
                $timed++;
                if ((float) $r['think_cv'] <= self::TIMING_MAX_CV && (int) $r['think_mean_ms'] >= self::TIMING_MIN_MEAN_MS) {
                    $uniform++;
                }
            }
        }
        $timingPts = $timed >= 3 ? self::clamp(($uniform / $timed) / 0.5) * 15 : 0.0;
        $sig['uniformTimingGames'] = $uniform . '/' . $timed;
        // 4. focus
        $own = 0;
        $fm = 0;
        foreach ($rows as $r) {
            $own += (int) $r['own_moves'];
            $fm += (int) $r['focus_moves'];
        }
        $ratio = $own > 0 ? $fm / $own : 0.0;
        $focusPts = $own >= 60 ? self::clamp(($ratio - 0.10) / 0.15) * 15 : 0.0;
        $sig['focusAwayMoves'] = $fm . '/' . $own;
        // 3. jumps
        $jumpPts = 0.0;
        if ($all >= self::JUMP_MIN_HISTORY) {
            $last10 = array_slice($rows, 0, 10);
            $gain = array_sum(array_map(static fn (array $r): int => (int) $r['rating_delta'], $last10));
            $sig['ratingGainLast10'] = $gain;
            if ($gain >= self::JUMP_RATING) {
                $jumpPts += 5;
            }
            $acc = array_values(array_filter($rows, static fn (array $r): bool => $r['acpl'] !== null && (int) $r['engine_moves'] >= self::MIN_ENGINE_MOVES_GAME));
            if (count($acc) >= 10) {
                $recent = array_sum(array_map(static fn (array $r): float => (float) $r['acpl'], array_slice($acc, 0, 5))) / 5;
                $older = array_slice($acc, 5);
                $before = array_sum(array_map(static fn (array $r): float => (float) $r['acpl'], $older)) / count($older);
                $sig['acplRecentVsBefore'] = round($recent, 1) . ' vs ' . round($before, 1);
                if ($recent < 25 && $recent <= 0.5 * $before) {
                    $jumpPts += 5;
                }
            }
        }
        $score = (int) round(min(100, $enginePts + $timingPts + $focusPts + $jumpPts));
        $sig += ['timingPoints' => round($timingPts, 1), 'focusPoints' => round($focusPts, 1), 'jumpPoints' => $jumpPts];
        return ['score' => $score, 'games' => $all, 'signals' => $sig];
    }

    public static function rescoreAccount(string $userId): void
    {
        $s = self::accountScore($userId);
        $cur = Db::one('SELECT * FROM fairplay_accounts WHERE user_id = ? LIMIT 1', [$userId]);
        $status = $cur['status'] ?? 'ok';
        $shouldFlag = $s['score'] >= self::FLAG_SCORE
            && ($s['signals']['enginePoints'] ?? 0) >= self::FLAG_MIN_ENGINE_POINTS
            && $s['games'] >= self::MIN_GAMES;
        $flaggedAt = $cur['flagged_at'] ?? null;
        if ($shouldFlag && $status === 'ok') {
            $status = 'flagged';
            $flaggedAt = Db::now();
        } elseif ($shouldFlag && $status === 'cleared' && $s['games'] >= (int) ($cur['reviewed_games'] ?? 0) + self::REFLAG_NEW_GAMES) {
            $status = 'flagged';
            $flaggedAt = Db::now();
        }
        Db::upsert('fairplay_accounts', [
            'user_id' => $userId,
            'score' => $s['score'],
            'signals' => json_encode($s['signals']),
            'games' => $s['games'],
            'status' => $status,
            'flagged_at' => $flaggedAt,
            'updated_at' => Db::now(),
        ], ['user_id'], ['score', 'signals', 'games', 'status', 'flagged_at', 'updated_at']);
    }

    /** @return list<array<string,mixed>> the review queue, most suspicious first */
    public static function queue(): array
    {
        return Db::all(
            "SELECT a.*, p.username FROM fairplay_accounts a LEFT JOIN profiles p ON p.user_id = a.user_id
             WHERE a.status = 'flagged' ORDER BY a.score DESC, a.flagged_at ASC"
        );
    }

    public static function isBanned(string $userId): bool
    {
        return (int) Db::value('SELECT fair_play_ban FROM profiles WHERE user_id = ? LIMIT 1', [$userId]) === 1;
    }

    /**
     * A HUMAN review decision. Only called from php/bin/fairplay-review.php (server shell); never from the web.
     * $decision: 'clear' | 'action'. Options for 'action': ban, forfeitRating, forfeitCoins, refundOpponents.
     * Forfeits/refunds cover the reviewed window (the account's last WINDOW_GAMES rated games).
     * @param array<string,bool> $opts
     * @return array<string,mixed> what was done
     */
    public static function review(string $userId, string $decision, string $reviewer, string $note = '', array $opts = []): array
    {
        if (PHP_SAPI !== 'cli' && !defined('MORSE_TESTING')) {
            throw new \RuntimeException('Fair-play review only runs from the server shell.');
        }
        if ($reviewer === '' || !in_array($decision, ['clear', 'action'], true)) {
            throw new \InvalidArgumentException('Need a reviewer name and a decision (clear|action).');
        }
        $acct = Db::one('SELECT * FROM fairplay_accounts WHERE user_id = ? LIMIT 1', [$userId]);
        if ($acct === null) {
            throw new \InvalidArgumentException('No fair-play record for that account.');
        }
        return Db::transaction(static function () use ($userId, $decision, $reviewer, $note, $opts, $acct): array {
            $done = ['decision' => $decision];
            if ($decision === 'action') {
                $games = Db::all(
                    "SELECT f.game_id, g.* FROM fairplay_games f JOIN games g ON g.id = f.game_id
                     WHERE f.user_id = ? ORDER BY f.created_at DESC LIMIT " . self::WINDOW_GAMES,
                    [$userId]
                );
                if (!empty($opts['ban'])) {
                    Db::run('UPDATE profiles SET fair_play_ban = 1 WHERE user_id = ?', [$userId]);
                    Db::run('DELETE FROM match_queue WHERE user_id = ?', [$userId]);
                    $done['ban'] = true;
                }
                if (!empty($opts['forfeitRating'])) {
                    $gain = 0;
                    foreach ($games as $g) {
                        $d = (int) ($g['last_prize'] ?? 0);
                        $mine = $g['white_user_id'] === $userId ? $d : -$d;
                        if ($mine > 0) {
                            $gain += $mine;
                        }
                    }
                    $cur = (int) Db::value('SELECT score FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
                    Db::run('UPDATE profiles SET score = ? WHERE user_id = ?', [max(Constants::ELO_FLOOR, $cur - $gain), $userId]);
                    $done['ratingRemoved'] = $gain;
                }
                if (!empty($opts['forfeitCoins'])) {
                    $coins = 0;
                    foreach ($games as $g) {
                        if ($g['winner_user_id'] === $userId) {
                            $coins += (int) ($g['coin_award'] ?? 0);
                        }
                    }
                    $have = (int) Db::value('SELECT coins FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
                    Db::run('UPDATE profiles SET coins = ? WHERE user_id = ?', [max(0, $have - $coins), $userId]);
                    $done['coinsRemoved'] = $coins;
                }
                if (!empty($opts['refundOpponents'])) {
                    $refunds = [];
                    foreach ($games as $g) {
                        $d = (int) ($g['last_prize'] ?? 0);
                        $oppIsWhite = $g['black_user_id'] === $userId;
                        $oppId = (string) ($oppIsWhite ? $g['white_user_id'] : $g['black_user_id']);
                        $oppDelta = $oppIsWhite ? $d : -$d;
                        if ($oppDelta >= 0) {
                            continue;
                        }
                        if (Db::run('UPDATE games SET fp_refunded = 1 WHERE id = ? AND fp_refunded = 0', [$g['id']]) !== 1) {
                            continue;
                        }
                        Db::run('UPDATE profiles SET score = score + ? WHERE user_id = ?', [-$oppDelta, $oppId]);
                        $refunds[] = ['game' => (string) $g['id'], 'user' => $oppId, 'points' => -$oppDelta];
                    }
                    $done['refunds'] = $refunds;
                }
            }
            Db::run(
                'UPDATE fairplay_accounts SET status = ?, reviewed_at = ?, reviewed_games = ?, reviewer = ?, note = ? WHERE user_id = ?',
                [$decision === 'clear' ? 'cleared' : 'actioned', Db::now(), (int) $acct['games'], $reviewer, $note, $userId]
            );
            Db::run('INSERT INTO fairplay_actions (user_id, action, detail, reviewer, created_at) VALUES (?, ?, ?, ?, ?)',
                [$userId, $decision, json_encode($done + ['note' => $note]), $reviewer, Db::now()]);
            return $done;
        });
    }

    private static function clamp(float $x): float
    {
        return max(0.0, min(1.0, $x));
    }
}
