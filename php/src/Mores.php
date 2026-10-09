<?php

declare(strict_types=1);

namespace Morse;

use PDOException;

/**
 * Port of src/lib/server/mores.ts: usernames, purse, matchmaking queue,
 * challenges, live games (clocks, chat, camera), Elo/coins settlement and the
 * MorseBot v1/v2 search bots. Handlers are registered under the original
 * server-function names.
 *
 * Concurrency notes: the Node server serialised everything in one process; here
 * every read-modify-write (coins, move application, queue pairing, challenge
 * accept, game settlement) runs inside Db::transaction with row locks or an
 * atomic conditional UPDATE. The bot's search runs OUTSIDE any transaction.
 *
 * @phpstan-type Game array<string,mixed>
 */
final class Mores
{
    private const PIECE_VAL = ['p' => 100, 'n' => 320, 'b' => 330, 'r' => 500, 'q' => 900, 'k' => 0];

    private const PST = [
        'p' => [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
        'n' => [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
        'b' => [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
        'r' => [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
        'q' => [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
        'k' => [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
    ];

    /**
     * Opening book. NOTE: faithfully ported, including a quirk of the original:
     * fenKey() keeps FOUR fen fields (placement, turn, castling, en-passant)
     * while these keys have only three, so no key ever matches and the book is
     * effectively dead (the bots always search). Kept identical on purpose.
     */
    private const BOOK = [
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq' => ['e2e4', 'd2d4', 'g1f3', 'c2c4'],
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq' => ['e7e5', 'c7c5', 'e7e6', 'c7c6', 'g8f6'],
        'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq' => ['d7d5', 'g8f6', 'e7e6', 'c7c5'],
        'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq' => ['g1f3', 'b1c3', 'f1c4', 'f1b5'],
        'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq' => ['g1f3', 'b1c3', 'c2c3', 'd2d4'],
        'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq' => ['b8c6', 'g8f6'],
        'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq' => ['f1b5', 'd2d4', 'b1c3'],
        'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq' => ['d2d4', 'b1c3', 'f1c4'],
        'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq' => ['d2d4'],
        'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq' => ['e7e5', 'g8f6', 'c7c5'],
    ];

    public static function register(): void
    {
        // usernameAvailable runs before sign-in (the sign-up form), so no session is required.
        Rpc::register('usernameAvailable', [self::class, 'usernameAvailable'], false);
        foreach ([
            'claimUsername', 'getPurse', 'getHomeState', 'joinQueue', 'leaveQueue', 'sendChallenge',
            'respondChallenge', 'cancelChallenge', 'openGameLive', 'openGameChat', 'closeGameChat',
            'openGameCamera', 'closeGameCamera', 'sendGameChat', 'getGame', 'makeMove', 'claimTimeout',
            'resignGame', 'startBotGame', 'buyBoard', 'setEquippedBoard', 'listClubUsers', 'getChallengeInbox',
            'getSandbox', 'buySandbox',
        ] as $name) {
            Rpc::register($name, [self::class, $name]);
        }
    }

    // ── small helpers ──────────────────────────────────────────────────────

    private static function toInt(mixed $v, int $fallback): int
    {
        if (is_int($v)) {
            return $v;
        }
        if (is_float($v)) {
            return is_finite($v) ? (int) $v : $fallback;
        }
        if (is_string($v) && is_numeric($v)) {
            return (int) $v;
        }
        return $fallback;
    }

    /** JS Math.round (halves round toward +Infinity). */
    private static function jsRound(float $x): int
    {
        return (int) floor($x + 0.5);
    }

    private static function parseMode(mixed $v): string
    {
        return $v === 'breeze' ? 'breeze' : 'timed';
    }

    private static function str(array $data, string $key): string
    {
        $v = $data[$key] ?? '';
        return is_scalar($v) ? (string) $v : '';
    }

    private static function cleanUsername(string $raw): string
    {
        $username = preg_replace('/^\s+|\s+$/u', '', $raw) ?? $raw;
        if (!preg_match(Constants::USERNAME_RE, $username)) {
            throw new RpcError('Club names are 8–20 letters, numbers, or underscores.');
        }
        return $username;
    }

    /** @return list<string> */
    private static function ownedList(mixed $raw): array
    {
        $out = [];
        foreach (explode(',', (string) ($raw ?? '')) as $part) {
            $part = trim($part);
            if ($part !== '') {
                $out[] = $part;
            }
        }
        return $out;
    }

    private static function onlineCutoff(): string
    {
        return Db::ts(Db::nowMs() - 20000);
    }

    /** @return array{0:string,1:string} */
    private static function botIdParams(): array
    {
        return [Constants::BOT_USER_ID, Constants::BOT_V2_USER_ID];
    }

    private static function validSquare(string $sq): bool
    {
        return (bool) preg_match('/^[a-h][1-8]$/', $sq);
    }

    // ── profiles ───────────────────────────────────────────────────────────

    private static function ensureBots(): void
    {
        $have = (int) Db::value('SELECT COUNT(*) FROM profiles WHERE user_id IN (?, ?)', self::botIdParams());
        if ($have >= 2) {
            return;
        }
        $now = Db::now();
        foreach ([[Constants::BOT_USER_ID, Constants::BOT_USERNAME], [Constants::BOT_V2_USER_ID, Constants::BOT_V2_USERNAME]] as [$id, $name]) {
            Db::upsert('profiles', [
                'user_id' => $id,
                'username' => $name,
                'username_lc' => strtolower($name),
                'score' => Constants::START_SCORE,
                'last_seen' => $now,
                'created_at' => $now,
            ], ['user_id'], ['username', 'username_lc']);
        }
    }

    private static function ensureEloScale(): void
    {
        Db::run(
            'UPDATE profiles SET score = ? + (score * 4), elo_scaled = 1
             WHERE elo_scaled = 0 AND score < 400 AND user_id <> ? AND user_id <> ?',
            [Constants::START_SCORE, Constants::BOT_USER_ID, Constants::BOT_V2_USER_ID]
        );
        Db::run('UPDATE profiles SET elo_scaled = 1 WHERE elo_scaled = 0');
    }

    /**
     * @return array{user_id:string,username:string,username_lc:string,score:int,equipped_board:string,coins:int,bot_streak:int,owned_boards:string,avatar_json:?string}|null
     */
    private static function profileById(string $userId, bool $lock = false): ?array
    {
        // The house "master" account always starts with a purse of at least 1000 coins (one time).
        Db::run(
            "UPDATE profiles SET coins = CASE WHEN coins < 1000 THEN 1000 ELSE coins END, coins_ready = 1
             WHERE username_lc = 'mastergus' AND coins_ready = 0"
        );
        $row = Db::one(
            'SELECT user_id, username, username_lc, score, equipped_board, coins, bot_streak, owned_boards, avatar_json, sandbox_owned
             FROM profiles WHERE user_id = ? LIMIT 1' . ($lock ? Db::forUpdate() : ''),
            [$userId]
        );
        if ($row === null) {
            return null;
        }
        $eq = (string) ($row['equipped_board'] ?? '');
        return [
            'user_id' => (string) $row['user_id'],
            'username' => (string) $row['username'],
            'username_lc' => (string) $row['username_lc'],
            'score' => (int) $row['score'],
            'equipped_board' => $eq !== '' ? $eq : Catalog::defaultBoardId(),
            'coins' => self::toInt($row['coins'], 0),
            'bot_streak' => self::toInt($row['bot_streak'], 0),
            'owned_boards' => implode(',', self::ownedList($row['owned_boards'])),
            'avatar_json' => $row['avatar_json'] !== null ? (string) $row['avatar_json'] : null,
            'sandbox_owned' => self::toInt($row['sandbox_owned'] ?? 0, 0),
        ];
    }

    private static function touchProfile(string $userId): void
    {
        Db::run('UPDATE profiles SET last_seen = ? WHERE user_id = ?', [Db::now(), $userId]);
    }

    // ── games ──────────────────────────────────────────────────────────────

    private static function insertGame(string $a, string $b, string $mode, bool $pull = false, int $clockMs = Constants::TURN_MS): string
    {
        $id = Util::uuid();
        $aWhite = Util::chance(0.5);
        $white = $aWhite ? $a : $b;
        $black = $aWhite ? $b : $a;
        $chess = new Chess();
        $now = Db::now();
        Db::run(
            "INSERT INTO games (id, white_user_id, black_user_id, mode, fen, status, turn, turn_started_at, created_at,
                                white_clock_ms, black_clock_ms, pull)
             VALUES (?, ?, ?, ?, ?, 'active', 'w', ?, ?, ?, ?, ?)",
            [$id, $white, $black, $mode, $chess->fen(), $now, $now, $clockMs, $clockMs, $pull ? 1 : 0]
        );
        return $id;
    }

    /** @return array<string,mixed>|null */
    private static function loadGame(string $gameId): ?array
    {
        return Db::one('SELECT * FROM games WHERE id = ? LIMIT 1', [$gameId]);
    }

    /** @return array{w:int,b:int} */
    private static function liveClocks(array $game): array
    {
        $storedW = self::toInt($game['white_clock_ms'] ?? null, Constants::TURN_MS);
        $storedB = self::toInt($game['black_clock_ms'] ?? null, Constants::TURN_MS);
        if (($game['status'] ?? '') !== 'active' || ($game['mode'] ?? '') !== 'timed') {
            return ['w' => $storedW, 'b' => $storedB];
        }
        $elapsed = max(0, Db::nowMs() - Db::toMs($game['turn_started_at']));
        if ($game['turn'] === 'w') {
            return ['w' => max(0, $storedW - $elapsed), 'b' => $storedB];
        }
        return ['w' => $storedW, 'b' => max(0, $storedB - $elapsed)];
    }

    private static function activeGameIdFor(string $userId): ?string
    {
        $row = Db::one(
            "SELECT id FROM games WHERE status = 'active' AND (white_user_id = ? OR black_user_id = ?) LIMIT 1",
            [$userId, $userId]
        );
        return $row !== null ? (string) $row['id'] : null;
    }

    // ── Elo & coins ────────────────────────────────────────────────────────

    private static function applyElo(string $whiteId, string $blackId, float $whiteScore): int
    {
        // Lock both rows in a stable order so two concurrent settlements cannot deadlock or lose an update.
        $ids = [$whiteId, $blackId];
        sort($ids);
        $scores = [];
        foreach (array_unique($ids) as $id) {
            $v = Db::value('SELECT score FROM profiles WHERE user_id = ? LIMIT 1' . Db::forUpdate(), [$id]);
            if ($v !== null) {
                $scores[$id] = (int) $v;
            }
        }
        $ra = $scores[$whiteId] ?? Constants::START_SCORE;
        $rb = $scores[$blackId] ?? Constants::START_SCORE;
        $expected = 1 / (1 + 10 ** (($rb - $ra) / 400));
        $dWhite = self::jsRound(Constants::ELO_K * ($whiteScore - $expected));
        $dBlack = -$dWhite;
        $nextW = max(Constants::ELO_FLOOR, $ra + $dWhite);
        $nextB = max(Constants::ELO_FLOOR, $rb + $dBlack);
        Db::run('UPDATE profiles SET score = ? WHERE user_id = ?', [$nextW, $whiteId]);
        Db::run('UPDATE profiles SET score = ? WHERE user_id = ?', [$nextB, $blackId]);
        return $dWhite;
    }

    private static function settleElo(array &$game, string $status, ?string $winnerUserId): void
    {
        $whiteScore = $status === 'draw' ? 0.5 : ($winnerUserId === $game['white_user_id'] ? 1.0 : 0.0);
        $whiteDelta = self::applyElo((string) $game['white_user_id'], (string) $game['black_user_id'], $whiteScore);
        Db::run('UPDATE games SET last_prize = ? WHERE id = ?', [$whiteDelta, $game['id']]);
        $game['last_prize'] = $whiteDelta;
        $game['scored'] = 1;
    }

    private static function finishGame(array &$game, string $status, ?string $winnerUserId): void
    {
        if ($game['status'] !== 'active') {
            return;
        }
        $applied = Db::transaction(static function () use (&$game, $status, $winnerUserId): bool {
            $changed = Db::run(
                "UPDATE games SET status = ?, winner_user_id = ?, scored = 1 WHERE id = ? AND status = 'active'",
                [$status, $winnerUserId, $game['id']]
            );
            if ($changed === 0) {
                return false; // someone else already settled this game
            }
            self::settleElo($game, $status, $winnerUserId);
            $game['status'] = $status;
            $game['winner_user_id'] = $winnerUserId;
            self::noteBotStreak($game, $status, $winnerUserId);
            self::awardStyleCoin($game, $winnerUserId);
            return true;
        });
        if (!$applied) {
            $latest = self::loadGame((string) $game['id']);
            if ($latest !== null) {
                $game = $latest;
            }
        }
    }

    private static function noteBotStreak(array &$game, string $status, ?string $winnerUserId): void
    {
        $whiteBot = Constants::isBotUserId((string) $game['white_user_id']);
        $blackBot = Constants::isBotUserId((string) $game['black_user_id']);
        if ($whiteBot === $blackBot) {
            if (!$whiteBot) {
                Db::run('UPDATE profiles SET bot_streak = 0 WHERE user_id = ?', [$game['white_user_id']]);
                Db::run('UPDATE profiles SET bot_streak = 0 WHERE user_id = ?', [$game['black_user_id']]);
            }
            return;
        }
        $humanId = (string) ($whiteBot ? $game['black_user_id'] : $game['white_user_id']);
        $won = $status !== 'draw' && $winnerUserId === $humanId;
        if (!$won) {
            Db::run('UPDATE profiles SET bot_streak = 0 WHERE user_id = ?', [$humanId]);
            return;
        }
        $row = Db::one('SELECT bot_streak FROM profiles WHERE user_id = ? LIMIT 1' . Db::forUpdate(), [$humanId]);
        $streak = self::toInt($row['bot_streak'] ?? null, 0) + 1;
        $award = 0;
        $next = $streak;
        if ($streak >= 6) {
            $award = 5;
            $next = 0;
        }
        Db::run('UPDATE profiles SET bot_streak = ?, coins = coins + ? WHERE user_id = ?', [$next, $award, $humanId]);
        if ($award > 0) {
            Db::run('UPDATE games SET coin_award = ? WHERE id = ?', [$award, $game['id']]);
            $game['coin_award'] = $award;
        }
    }

    private static function awardStyleCoin(array &$game, ?string $winnerUserId): void
    {
        if ($winnerUserId === null || $winnerUserId === '' || Constants::isBotUserId($winnerUserId)) {
            return;
        }
        $row = Db::one('SELECT piece_style FROM profiles WHERE user_id = ? LIMIT 1' . Db::forUpdate(), [$winnerUserId]);
        $style = (string) ($row['piece_style'] ?? '');
        if (($style !== '' ? $style : '3d') !== '3d') {
            return;
        }
        Db::run('UPDATE profiles SET coins = coins + 2 WHERE user_id = ?', [$winnerUserId]);
        $next = self::toInt($game['coin_award'] ?? null, 0) + 2;
        Db::run('UPDATE games SET coin_award = ? WHERE id = ?', [$next, $game['id']]);
        $game['coin_award'] = $next;
    }

    // ── bot engine ─────────────────────────────────────────────────────────

    private static function pstAt(string $type, string $color, int $rankFromTop, int $file): int
    {
        $table = self::PST[$type] ?? null;
        if ($table === null) {
            return 0;
        }
        $idx = $color === 'w' ? $rankFromTop * 8 + $file : (7 - $rankFromTop) * 8 + $file;
        return $table[$idx] ?? 0;
    }

    private static function evaluate(Chess $chess, string $bot): int
    {
        if ($chess->isCheckmate()) {
            return $chess->turn() === $bot ? -100000 : 100000;
        }
        if ($chess->isDraw() || $chess->isStalemate()) {
            return 0;
        }
        $s = 0;
        // Same walk as chess.board(): rank 8 first, files a..h.
        $placement = explode(' ', $chess->fen(), 2)[0];
        $r = 0;
        $f = 0;
        $len = strlen($placement);
        for ($i = 0; $i < $len; $i++) {
            $ch = $placement[$i];
            if ($ch === '/') {
                $r++;
                $f = 0;
                continue;
            }
            if ($ch >= '1' && $ch <= '8') {
                $f += (int) $ch;
                continue;
            }
            $lower = strtolower($ch);
            $color = $ch === $lower ? 'b' : 'w';
            $val = (self::PIECE_VAL[$lower] ?? 0) + self::pstAt($lower, $color, $r, $f);
            $s += $color === $bot ? $val : -$val;
            $f++;
        }
        if ($chess->isCheck()) {
            $s += $chess->turn() === $bot ? -40 : 40;
        }
        return $s;
    }

    /** @return list<array<string,mixed>> */
    private static function orderMoves(Chess $chess): array
    {
        $moves = $chess->moves(true);
        $score = static fn (array $m): int
            => (!empty($m['captured']) ? 20 + (self::PIECE_VAL[$m['captured']] ?? 0) : 0) + (!empty($m['promotion']) ? 90 : 0);
        // PHP 8 sorting is stable, like Array.prototype.sort.
        usort($moves, static fn (array $a, array $b): int => $score($b) <=> $score($a));
        return $moves;
    }

    /** @return array{from:string,to:string,promotion?:string} */
    private static function mv(array $m): array
    {
        $out = ['from' => $m['from'], 'to' => $m['to']];
        if (!empty($m['promotion'])) {
            $out['promotion'] = $m['promotion'];
        }
        return $out;
    }

    private static function fenKey(Chess $chess): string
    {
        return implode(' ', array_slice(explode(' ', $chess->fen()), 0, 4));
    }

    private static function quiesce(Chess $chess, string $bot, int $deadline): int|float
    {
        $stand = self::evaluate($chess, $bot);
        if (Db::nowMs() > $deadline) {
            return $stand;
        }
        $botTurn = $chess->turn() === $bot;
        $best = $stand;
        $caps = array_values(array_filter($chess->moves(true), static fn (array $m): bool => !empty($m['captured']) || !empty($m['promotion'])));
        foreach (array_slice($caps, 0, 16) as $m) {
            $chess->move(self::mv($m));
            $sc = self::evaluate($chess, $bot);
            $chess->undo();
            $best = $botTurn ? max($best, $sc) : min($best, $sc);
        }
        return $best;
    }

    private static function minimax(Chess $chess, string $bot, int $depth, int|float $alpha, int|float $beta, int $deadline): int|float
    {
        if (Db::nowMs() > $deadline) {
            return self::evaluate($chess, $bot);
        }
        if ($chess->isCheckmate()) {
            return $chess->turn() === $bot ? -120000 - $depth : 120000 + $depth;
        }
        if ($chess->isDraw() || $chess->isStalemate()) {
            return 0;
        }
        if ($depth <= 0) {
            return self::quiesce($chess, $bot, $deadline);
        }
        $moves = self::orderMoves($chess);
        if (!$moves) {
            return self::evaluate($chess, $bot);
        }
        $botTurn = $chess->turn() === $bot;
        $best = $botTurn ? -INF : INF;
        foreach ($moves as $m) {
            $chess->move(self::mv($m));
            $sc = self::minimax($chess, $bot, $depth - 1, $alpha, $beta, $deadline);
            $chess->undo();
            if ($botTurn) {
                if ($sc > $best) {
                    $best = $sc;
                }
                if ($sc > $alpha) {
                    $alpha = $sc;
                }
            } else {
                if ($sc < $best) {
                    $best = $sc;
                }
                if ($sc < $beta) {
                    $beta = $sc;
                }
            }
            if ($beta <= $alpha) {
                break;
            }
            if (Db::nowMs() > $deadline) {
                break;
            }
        }
        return $best;
    }

    /** @return array{from:string,to:string,promotion:?string}|null */
    public static function pickBotMove(string $fen, string $botSide, string $kind): ?array
    {
        $chess = new Chess($fen);
        if ($chess->turn() !== $botSide) {
            return null;
        }
        $book = self::BOOK[self::fenKey($chess)] ?? null;
        $moves = self::orderMoves($chess);
        if (!$moves) {
            return null;
        }
        if ($book) {
            $legal = [];
            foreach ($moves as $m) {
                $legal[$m['from'] . $m['to'] . ($m['promotion'] ?? '')] = true;
            }
            $opts = [];
            foreach ($book as $u) {
                $from = substr($u, 0, 2);
                $to = substr($u, 2, 2);
                if (isset($legal[$from . $to]) || isset($legal[$from . $to . 'q'])) {
                    $opts[] = ['from' => $from, 'to' => $to];
                }
            }
            if ($opts) {
                if ($kind === 'v1') {
                    return ['from' => $opts[0]['from'], 'to' => $opts[0]['to'], 'promotion' => null];
                }
                $best = $opts[0];
                $bestSc = -INF;
                foreach ($opts as $u) {
                    $played = $chess->move(['from' => $u['from'], 'to' => $u['to']]);
                    if (!$played) {
                        continue;
                    }
                    $sc = self::evaluate($chess, $botSide);
                    $chess->undo();
                    if ($sc > $bestSc) {
                        $bestSc = $sc;
                        $best = $u;
                    }
                }
                return ['from' => $best['from'], 'to' => $best['to'], 'promotion' => null];
            }
        }
        $deadline = Db::nowMs() + ($kind === 'v2' ? 850 : 480);
        $maxDepth = $kind === 'v2' ? 4 : 3;
        $pick = $moves[0];
        for ($depth = 1; $depth <= $maxDepth; $depth++) {
            if ($depth > 1 && Db::nowMs() > $deadline) {
                break;
            }
            $depthBest = -INF;
            $depthPick = $pick;
            $finished = true;
            foreach ($moves as $m) {
                // Depth 1 is cheap and always completes; deeper passes are abandoned on timeout.
                if ($depth > 1 && Db::nowMs() > $deadline) {
                    $finished = false;
                    break;
                }
                $chess->move(self::mv($m));
                $sc = self::minimax($chess, $botSide, $depth - 1, -INF, INF, $deadline);
                $chess->undo();
                if ($sc > $depthBest) {
                    $depthBest = $sc;
                    $depthPick = $m;
                }
            }
            // PHP searches slower than the original Node bot, so a pass cut short by the
            // clock holds only a few moves' scores: keep the last COMPLETE pass instead.
            if ($depth > 1 && (!$finished || Db::nowMs() > $deadline)) {
                break;
            }
            if ($depthBest > -INF) {
                $pick = $depthPick;
            }
            if ($depthBest >= 120000) {
                break; // forced mate found
            }
        }
        return ['from' => $pick['from'], 'to' => $pick['to'], 'promotion' => $pick['promotion'] ?? null];
    }

    // ── move application ───────────────────────────────────────────────────

    /** @return array{ok:true}|array{ok:false,error:string} */
    private static function recordAndApplyMove(array &$game, string $from, string $to, ?string $promotion = null): array
    {
        $expectedFen = (string) $game['fen'];
        $chess = new Chess($expectedFen);
        $isSq = self::validSquare($from);
        $needsPromo = $isSq && ($chess->get($from)['type'] ?? null) === 'p' && (str_ends_with($to, '8') || str_ends_with($to, '1'));
        $promo = in_array($promotion, ['q', 'r', 'b', 'n'], true) ? $promotion : null;
        if ($needsPromo && $promo === null) {
            return ['ok' => false, 'error' => 'Choose a piece.'];
        }
        $arg = ['from' => $from, 'to' => $to];
        if ($promo !== null) {
            $arg['promotion'] = $promo;
        }
        $moved = $isSq && self::validSquare($to) ? $chess->move($arg) : null;
        if (!$moved) {
            return ['ok' => false, 'error' => 'That move is not legal.'];
        }

        $status = 'active';
        $winner = null;
        if ($chess->isCheckmate()) {
            $status = $moved['color'] === 'w' ? 'white_win' : 'black_win';
            $winner = (string) ($moved['color'] === 'w' ? $game['white_user_id'] : $game['black_user_id']);
        } elseif ($chess->isDraw() || $chess->isStalemate()) {
            $status = 'draw';
        }

        $nowMs = Db::nowMs();
        $now = Db::ts($nowMs);
        $clocks = self::liveClocks($game);

        $result = Db::transaction(static function () use (&$game, $chess, $moved, $status, $winner, $now, $clocks, $expectedFen): ?string {
            // The conditional UPDATE is the lock: only one concurrent move can match the expected fen.
            $changed = Db::run(
                "UPDATE games SET fen = ?, turn = ?, last_move_from = ?, last_move_to = ?, last_move_san = ?,
                    turn_started_at = ?, white_clock_ms = ?, black_clock_ms = ?, status = ?, winner_user_id = ?, scored = ?
                 WHERE id = ? AND fen = ? AND status = 'active'",
                [
                    $chess->fen(), $chess->turn(), $moved['from'], $moved['to'], $moved['san'],
                    $now, $clocks['w'], $clocks['b'], $status, $winner, $status !== 'active' ? 1 : 0,
                    $game['id'], $expectedFen,
                ]
            );
            if ($changed === 0) {
                return 'That move already happened.';
            }
            $ply = (int) Db::value('SELECT COUNT(*) FROM game_moves WHERE game_id = ?', [$game['id']]) + 1;
            Db::insertIgnore('game_moves', [
                'game_id' => $game['id'], 'ply' => $ply, 'san' => $moved['san'],
                'from_sq' => $moved['from'], 'to_sq' => $moved['to'], 'created_at' => $now,
            ]);

            $game['fen'] = $chess->fen();
            $game['turn'] = $chess->turn();
            $game['last_move_from'] = $moved['from'];
            $game['last_move_to'] = $moved['to'];
            $game['last_move_san'] = $moved['san'];
            $game['turn_started_at'] = $now;
            $game['white_clock_ms'] = $clocks['w'];
            $game['black_clock_ms'] = $clocks['b'];
            $game['status'] = $status;
            $game['winner_user_id'] = $winner;

            if ($status === 'white_win' || $status === 'black_win' || $status === 'draw') {
                self::settleElo($game, $status, $winner);
            }
            return null;
        });
        if ($result !== null) {
            return ['ok' => false, 'error' => $result];
        }
        return ['ok' => true];
    }

    private static function maybeTimeout(array &$game): void
    {
        if ($game['status'] !== 'active' || $game['mode'] !== 'timed') {
            return;
        }
        $clocks = self::liveClocks($game);
        $remaining = $game['turn'] === 'w' ? $clocks['w'] : $clocks['b'];
        if ($remaining > 0) {
            return;
        }
        $winner = (string) ($game['turn'] === 'w' ? $game['black_user_id'] : $game['white_user_id']);
        self::finishGame($game, $game['turn'] === 'w' ? 'black_win' : 'white_win', $winner);
    }

    private static function maybeBotMove(array &$game): void
    {
        $latest = self::loadGame((string) $game['id']);
        if ($latest === null) {
            return;
        }
        $game = $latest;
        if ($game['status'] !== 'active') {
            return;
        }
        $w = (string) $game['white_user_id'];
        $b = (string) $game['black_user_id'];
        $botSide = Constants::isBotUserId($w) ? 'w' : (Constants::isBotUserId($b) ? 'b' : null);
        if ($botSide === null || $game['turn'] !== $botSide) {
            return;
        }
        $position = new Chess((string) $game['fen']);
        if ($position->turn() !== $botSide) {
            return;
        }
        $kind = ($w === Constants::BOT_V2_USER_ID || $b === Constants::BOT_V2_USER_ID) ? 'v2' : 'v1';
        $battle = str_contains((string) ($game['last_move_san'] ?? ''), 'x');
        $thinkMs = $battle ? 4200 : ($kind === 'v2' ? 280 : 420);
        if (Db::nowMs() - Db::toMs($game['turn_started_at']) < $thinkMs) {
            return;
        }
        $pick = self::pickBotMove((string) $game['fen'], $botSide, $kind);
        if ($pick === null) {
            $again = self::loadGame((string) $game['id']);
            if ($again === null || $again['fen'] !== $game['fen']) {
                return;
            }
            if ($position->isCheckmate()) {
                $winner = (string) ($botSide === 'w' ? $game['black_user_id'] : $game['white_user_id']);
                self::finishGame($game, $botSide === 'w' ? 'black_win' : 'white_win', $winner);
            } else {
                self::finishGame($game, 'draw', null);
            }
            return;
        }
        $piece = $position->get($pick['from']);
        if (!$piece || $piece['color'] !== $botSide) {
            return;
        }
        self::recordAndApplyMove($game, $pick['from'], $pick['to'], $pick['promotion']);
    }

    // ── snapshot ───────────────────────────────────────────────────────────

    /** @return array<string,mixed>|null */
    private static function snapshotFor(array &$game, string $userId, bool $playBot = false): ?array
    {
        if ($game['white_user_id'] !== $userId && $game['black_user_id'] !== $userId) {
            return null;
        }
        self::maybeTimeout($game);
        if ($playBot) {
            self::maybeBotMove($game);
        }
        $fresh = self::loadGame((string) $game['id']) ?? $game;
        $white = self::profileById((string) $fresh['white_user_id']);
        $black = self::profileById((string) $fresh['black_user_id']);
        $moves = Db::all('SELECT san, from_sq, to_sq FROM game_moves WHERE game_id = ? ORDER BY ply ASC', [$fresh['id']]);
        $chatRows = Db::all('SELECT id, user_id, body, image FROM game_chat WHERE game_id = ? ORDER BY id ASC LIMIT 80', [$fresh['id']]);
        $nameOf = static function (string $id) use ($fresh, $white, $black): string {
            if ($id === $fresh['white_user_id']) {
                return $white['username'] ?? 'White';
            }
            if ($id === $fresh['black_user_id']) {
                return $black['username'] ?? 'Black';
            }
            return 'Seat';
        };
        $you = $fresh['white_user_id'] === $userId ? 'w' : 'b';
        $clocks = self::liveClocks($fresh);
        $remainingMs = $fresh['turn'] === 'w' ? $clocks['w'] : $clocks['b'];
        $me = $you === 'w' ? $white : $black;
        $opp = $you === 'w' ? $black : $white;
        $prize = $fresh['last_prize'] ?? null;
        return [
            'id' => (string) $fresh['id'],
            'fen' => (string) $fresh['fen'],
            'mode' => self::parseMode($fresh['mode']),
            'status' => (string) $fresh['status'],
            'turn' => (string) $fresh['turn'],
            'you' => $you,
            'white' => [
                'userId' => (string) $fresh['white_user_id'],
                'username' => $white['username'] ?? 'White',
                'score' => $white['score'] ?? Constants::START_SCORE,
            ],
            'black' => [
                'userId' => (string) $fresh['black_user_id'],
                'username' => $black['username'] ?? 'Black',
                'score' => $black['score'] ?? Constants::START_SCORE,
            ],
            'lastMove' => ($fresh['last_move_from'] ?? '') !== '' && ($fresh['last_move_to'] ?? '') !== '' && ($fresh['last_move_san'] ?? '') !== ''
                ? ['from' => (string) $fresh['last_move_from'], 'to' => (string) $fresh['last_move_to'], 'san' => (string) $fresh['last_move_san']]
                : null,
            'remainingMs' => $remainingMs,
            'whiteClockMs' => $clocks['w'],
            'blackClockMs' => $clocks['b'],
            'serverNow' => Db::nowMs(),
            'moves' => array_map(static fn (array $m): array => ['san' => (string) $m['san'], 'from' => (string) $m['from_sq'], 'to' => (string) $m['to_sq']], $moves),
            'winnerUserId' => $fresh['winner_user_id'] !== null ? (string) $fresh['winner_user_id'] : null,
            'myScore' => $me['score'] ?? Constants::START_SCORE,
            'opponentName' => $opp['username'] ?? 'Opponent',
            'myBoard' => Catalog::boardById($me['equipped_board'] ?? null)['id'],
            'chatOpen' => Db::bool($fresh['chat_open'] ?? 0),
            'liveOpen' => Db::bool($fresh['live_open'] ?? 0),
            'cameraOpen' => Db::bool($fresh['camera_open'] ?? 0),
            'chat' => array_map(static fn (array $r): array => [
                'id' => (int) $r['id'],
                'from' => $nameOf((string) $r['user_id']),
                'text' => (string) $r['body'],
                'image' => ($r['image'] ?? '') !== '' ? (string) $r['image'] : null,
            ], $chatRows),
            'scorePrize' => $prize === null ? null : ($you === 'w' ? self::toInt($prize, 0) : -self::toInt($prize, 0)),
            'pull' => Db::bool($fresh['pull'] ?? 0),
            'coins' => $me['coins'] ?? 0,
            'coinAward' => $fresh['winner_user_id'] === $userId ? self::toInt($fresh['coin_award'] ?? null, 0) : 0,
            'ownedBoards' => self::ownedList($me['owned_boards'] ?? ''),
            'whiteLook' => ($white['avatar_json'] ?? '') ?: '',
            'blackLook' => ($black['avatar_json'] ?? '') ?: '',
        ];
    }

    // ── matchmaking ────────────────────────────────────────────────────────

    private static function lastHumanOpponent(string $userId): ?string
    {
        $game = Db::one(
            'SELECT white_user_id, black_user_id FROM games WHERE white_user_id = ? OR black_user_id = ? ORDER BY created_at DESC LIMIT 1',
            [$userId, $userId]
        );
        if ($game === null) {
            return null;
        }
        $other = $game['white_user_id'] === $userId ? (string) $game['black_user_id'] : (string) $game['white_user_id'];
        return Constants::isBotUserId($other) ? null : $other;
    }

    private static function onlyOtherOnline(string $userId, string $otherId): bool
    {
        $seats = Db::all(
            'SELECT user_id FROM profiles WHERE last_seen > ? AND user_id <> ? AND user_id <> ? AND user_id <> ?',
            [self::onlineCutoff(), $userId, Constants::BOT_USER_ID, Constants::BOT_V2_USER_ID]
        );
        return count($seats) === 1 && $seats[0]['user_id'] === $otherId;
    }

    private static function tryMatch(string $userId, string $mode): ?string
    {
        $rows = Db::all(
            'SELECT user_id FROM match_queue WHERE user_id <> ? AND mode = ? ORDER BY joined_at ASC',
            [$userId, $mode]
        );
        if (!$rows) {
            return null;
        }
        $avoid = self::lastHumanOpponent($userId);
        $alone = $avoid !== null ? self::onlyOtherOnline($userId, $avoid) : true;
        $pick = null;
        foreach ($rows as $row) {
            if ($alone || $row['user_id'] !== $avoid) {
                $pick = (string) $row['user_id'];
                break;
            }
        }
        if ($pick === null) {
            return null;
        }
        return Db::transaction(static function () use ($userId, $pick, $mode): ?string {
            // Deleting the other player's queue row is the atomic claim.
            if (Db::run('DELETE FROM match_queue WHERE user_id = ?', [$pick]) === 0) {
                return null;
            }
            Db::run('DELETE FROM match_queue WHERE user_id = ?', [$userId]);
            Db::run(
                "UPDATE challenges SET status = 'cancelled'
                 WHERE status = 'pending' AND kind = 'pull' AND (from_user_id = ? OR from_user_id = ? OR to_user_id = ? OR to_user_id = ?)",
                [$userId, $pick, $userId, $pick]
            );
            return self::insertGame($userId, $pick, $mode, true);
        });
    }

    /** @return array{gameId:?string,miss:bool} */
    private static function expirePull(string $userId, string $mode, mixed $joinedAt, int $pinged): array
    {
        $wait = Db::nowMs() - Db::toMs($joinedAt);
        $paired = self::tryMatch($userId, $mode);
        if ($paired !== null) {
            return ['gameId' => $paired, 'miss' => false];
        }
        if ($wait < 5000) {
            return ['gameId' => null, 'miss' => false];
        }
        Db::run('DELETE FROM match_queue WHERE user_id = ?', [$userId]);
        Db::run("UPDATE challenges SET status = 'cancelled' WHERE from_user_id = ? AND kind = 'pull' AND status = 'pending'", [$userId]);
        if ($pinged > 0) {
            return ['gameId' => null, 'miss' => true];
        }
        return ['gameId' => self::insertGame($userId, Constants::BOT_USER_ID, $mode, true), 'miss' => false];
    }

    // ── RPC handlers ───────────────────────────────────────────────────────

    /** @param array<string,mixed> $data */
    public static function usernameAvailable(string $userId, array $data): mixed
    {
        $username = self::cleanUsername(self::str($data, 'username'));
        return Db::one('SELECT 1 AS x FROM profiles WHERE username_lc = ? LIMIT 1', [strtolower($username)]) === null;
    }

    /** @param array<string,mixed> $data */
    public static function claimUsername(string $userId, array $data): mixed
    {
        $username = self::cleanUsername(self::str($data, 'username'));
        self::ensureEloScale();
        $existing = self::profileById($userId);
        if ($existing !== null) {
            return ['username' => $existing['username'], 'score' => $existing['score']];
        }
        $master = Catalog::isMasterUsername($username);
        $score = $master ? Catalog::masterScore() : Constants::START_SCORE;
        $coins = $master ? 1000 : 0;
        $now = Db::now();
        try {
            Db::run(
                'INSERT INTO profiles (user_id, username, username_lc, score, last_seen, created_at, equipped_board, elo_scaled, coins, coins_ready)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                [$userId, $username, strtolower($username), $score, $now, $now, Catalog::defaultBoardId(), $coins, $coins > 0 ? 1 : 0]
            );
        } catch (PDOException) {
            throw new RpcError('That club name is already taken.');
        }
        return ['username' => $username, 'score' => $score];
    }

    /** @param array<string,mixed> $data */
    public static function getPurse(string $userId, array $data): mixed
    {
        $profile = self::profileById($userId);
        if ($profile === null) {
            return null;
        }
        return ['coins' => $profile['coins']];
    }

    private static function expireNamedChallenges(): void
    {
        Db::run(
            "UPDATE challenges SET status = 'cancelled'
             WHERE status = 'pending' AND (kind IS NULL OR kind <> 'pull') AND created_at < ?",
            [Db::ts(Db::nowMs() - 5 * 60 * 1000)]
        );
    }

    /** @param array<string,mixed> $data */
    public static function getHomeState(string $userId, array $data): mixed
    {
        self::ensureBots();
        self::ensureEloScale();
        self::expireNamedChallenges();
        $profile = self::profileById($userId);
        if ($profile === null) {
            return [
                'profile' => null,
                'inbox' => [],
                'outgoing' => [],
                'activeGameId' => null,
                'queued' => false,
                'queueMode' => null,
                'queueMiss' => false,
                'online' => [],
                'leaders' => [],
            ];
        }
        self::touchProfile($userId);

        $active = Db::one(
            "SELECT id FROM games WHERE status = 'active' AND (white_user_id = ? OR black_user_id = ?) ORDER BY created_at DESC LIMIT 1",
            [$userId, $userId]
        );

        $q = Db::one('SELECT mode, joined_at, pinged FROM match_queue WHERE user_id = ? LIMIT 1', [$userId]);
        $queued = $q !== null;
        $queueMode = $q !== null ? self::parseMode($q['mode']) : null;
        $matched = null;
        $queueMiss = false;
        if ($q !== null) {
            $ended = self::expirePull($userId, self::parseMode($q['mode']), $q['joined_at'], self::toInt($q['pinged'], 0));
            if ($ended['gameId'] !== null) {
                $matched = $ended['gameId'];
                $queued = false;
                $queueMode = null;
            } elseif ($ended['miss']) {
                $queued = false;
                $queueMode = null;
                $queueMiss = true;
            }
        }

        $inboxRows = Db::all(
            "SELECT c.id, c.mode, c.status, c.created_at, p.username, c.kind
             FROM challenges c JOIN profiles p ON p.user_id = c.from_user_id
             WHERE c.to_user_id = ? AND c.status = 'pending'
             ORDER BY c.created_at DESC",
            [$userId]
        );
        $outRows = Db::all(
            "SELECT c.id, c.mode, c.status, c.created_at, p.username
             FROM challenges c JOIN profiles p ON p.user_id = c.to_user_id
             WHERE c.from_user_id = ? AND c.status IN ('pending', 'declined')
             ORDER BY c.created_at DESC LIMIT 8",
            [$userId]
        );
        $online = Db::all(
            'SELECT p.username, p.score FROM profiles p
             WHERE p.user_id <> ? AND p.user_id <> ? AND p.user_id <> ? AND p.last_seen > ?
               AND EXISTS (
                 SELECT 1 FROM games g
                 WHERE g.pull = 0
                   AND ((g.white_user_id = ? AND g.black_user_id = p.user_id)
                     OR (g.black_user_id = ? AND g.white_user_id = p.user_id))
               )
             ORDER BY p.score DESC LIMIT 12',
            [$userId, Constants::BOT_USER_ID, Constants::BOT_V2_USER_ID, self::onlineCutoff(), $userId, $userId]
        );
        $leaders = Db::all('SELECT username, score FROM profiles ORDER BY score DESC, created_at ASC LIMIT 8');

        return [
            'profile' => [
                'username' => $profile['username'],
                'score' => $profile['score'],
                'equippedBoard' => Catalog::boardById($profile['equipped_board'])['id'],
                'coins' => $profile['coins'],
                'ownedBoards' => self::ownedList($profile['owned_boards']),
            ],
            'inbox' => array_map(static fn (array $r): array => [
                'id' => (string) $r['id'],
                'fromUsername' => (string) $r['username'],
                'toUsername' => $profile['username'],
                'mode' => self::parseMode($r['mode']),
                'status' => (string) $r['status'],
                'createdAt' => Db::iso($r['created_at']),
                'kind' => ($r['kind'] ?? null) === 'pull' ? 'pull' : 'named',
            ], $inboxRows),
            'outgoing' => array_map(static fn (array $r): array => [
                'id' => (string) $r['id'],
                'fromUsername' => $profile['username'],
                'toUsername' => (string) $r['username'],
                'mode' => self::parseMode($r['mode']),
                'status' => (string) $r['status'],
                'createdAt' => Db::iso($r['created_at']),
                'kind' => 'named',
            ], $outRows),
            'activeGameId' => $matched ?? ($active !== null ? (string) $active['id'] : null),
            'queued' => $queued,
            'queueMode' => $queueMode,
            'queueMiss' => $queueMiss,
            'online' => array_map(static fn (array $r): array => ['username' => (string) $r['username'], 'score' => (int) $r['score']], $online),
            'leaders' => array_map(static fn (array $r): array => ['username' => (string) $r['username'], 'score' => (int) $r['score']], $leaders),
        ];
    }

    /** @param array<string,mixed> $data */
    public static function joinQueue(string $userId, array $data): mixed
    {
        $mode = self::parseMode($data['mode'] ?? null);
        $profile = self::profileById($userId);
        if ($profile === null) {
            throw new RpcError('Choose a club name first.');
        }
        $active = self::activeGameIdFor($userId);
        if ($active !== null) {
            return ['gameId' => $active];
        }
        $immediate = self::tryMatch($userId, $mode);
        if ($immediate !== null) {
            return ['gameId' => $immediate];
        }

        $busy = Db::all(
            "SELECT white_user_id AS id FROM games WHERE status = 'active'
             UNION SELECT black_user_id AS id FROM games WHERE status = 'active'
             UNION SELECT user_id AS id FROM match_queue"
        );
        $skip = [$userId => true, Constants::BOT_USER_ID => true, Constants::BOT_V2_USER_ID => true];
        foreach ($busy as $r) {
            $skip[(string) $r['id']] = true;
        }
        $seats = Db::all(
            'SELECT user_id FROM profiles WHERE last_seen > ? AND user_id <> ? AND user_id <> ? AND user_id <> ?',
            [self::onlineCutoff(), $userId, Constants::BOT_USER_ID, Constants::BOT_V2_USER_ID]
        );
        $avoid = self::lastHumanOpponent($userId);
        $alone = $avoid !== null ? self::onlyOtherOnline($userId, $avoid) : true;
        $targets = [];
        foreach ($seats as $s) {
            $id = (string) $s['user_id'];
            if (!isset($skip[$id]) && ($alone || $id !== $avoid)) {
                $targets[] = $id;
            }
        }
        Db::transaction(static function () use ($userId, $mode, $targets, $profile): void {
            foreach ($targets as $toId) {
                Db::run(
                    "INSERT INTO challenges (id, from_user_id, to_user_id, mode, status, kind, created_at) VALUES (?, ?, ?, ?, 'pending', 'pull', ?)",
                    [Util::uuid(), $userId, $toId, $mode, Db::now()]
                );
            }
            Db::upsert('match_queue', [
                'user_id' => $userId,
                'score' => $profile['score'],
                'mode' => $mode,
                'joined_at' => Db::now(),
                'pinged' => count($targets),
            ], ['user_id'], ['score', 'mode', 'joined_at', 'pinged']);
        });
        return ['gameId' => null];
    }

    /** @param array<string,mixed> $data */
    public static function leaveQueue(string $userId, array $data): mixed
    {
        Db::run('DELETE FROM match_queue WHERE user_id = ?', [$userId]);
        Db::run("UPDATE challenges SET status = 'cancelled' WHERE from_user_id = ? AND kind = 'pull' AND status = 'pending'", [$userId]);
        return ['ok' => true];
    }

    /** @param array<string,mixed> $data */
    public static function sendChallenge(string $userId, array $data): mixed
    {
        $username = self::cleanUsername(self::str($data, 'username'));
        $mode = self::parseMode($data['mode'] ?? null);
        self::ensureBots();
        self::expireNamedChallenges();
        $me = self::profileById($userId);
        if ($me === null) {
            throw new RpcError('Choose a club name first.');
        }
        $active = self::activeGameIdFor($userId);
        if ($active !== null) {
            return ['ok' => true, 'gameId' => $active];
        }
        $to = Db::one('SELECT user_id, username FROM profiles WHERE username_lc = ? LIMIT 1', [strtolower($username)]);
        if ($to === null) {
            return ['ok' => false, 'error' => 'No player with that username.'];
        }
        $toId = (string) $to['user_id'];
        if ($toId === $userId) {
            return ['ok' => false, 'error' => 'You cannot challenge yourself.'];
        }
        if (Constants::isBotUserId($toId)) {
            return ['ok' => true, 'gameId' => self::insertGame($userId, $toId, $mode)];
        }
        $pending = Db::one(
            "SELECT 1 AS x FROM challenges WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1",
            [$userId, $toId]
        );
        if ($pending !== null) {
            return ['ok' => false, 'error' => 'You already sent the user a challenge.'];
        }
        $id = Util::uuid();
        Db::run(
            "INSERT INTO challenges (id, from_user_id, to_user_id, mode, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
            [$id, $userId, $toId, $mode, Db::now()]
        );
        return ['ok' => true, 'challengeId' => $id];
    }

    /** @param array<string,mixed> $data */
    public static function respondChallenge(string $userId, array $data): mixed
    {
        $id = self::str($data, 'id');
        $accept = (bool) ($data['accept'] ?? false);
        self::expireNamedChallenges();
        $ch = Db::one('SELECT id, from_user_id, to_user_id, mode, status, kind FROM challenges WHERE id = ? LIMIT 1', [$id]);
        if ($ch === null || $ch['to_user_id'] !== $userId) {
            return ['ok' => false, 'error' => 'Challenge not found.'];
        }
        if ($ch['status'] !== 'pending') {
            return ['ok' => false, 'error' => 'That challenge is no longer open.'];
        }
        if (!$accept) {
            Db::run("UPDATE challenges SET status = 'declined' WHERE id = ?", [$ch['id']]);
            return ['ok' => true];
        }
        $from = (string) $ch['from_user_id'];
        $to = (string) $ch['to_user_id'];
        $isPull = ($ch['kind'] ?? null) === 'pull';
        if ($isPull) {
            $avoid = self::lastHumanOpponent($from);
            if ($avoid !== null && $avoid === $to && !self::onlyOtherOnline($from, $avoid)) {
                Db::run("UPDATE challenges SET status = 'cancelled' WHERE id = ?", [$ch['id']]);
                return ['ok' => false, 'error' => 'That seat just played. Someone else can sit.'];
            }
        }
        return Db::transaction(static function () use ($ch, $from, $to, $isPull): array {
            $claimed = Db::run("UPDATE challenges SET status = 'accepted' WHERE id = ? AND status = 'pending'", [$ch['id']]);
            if ($claimed === 0) {
                return ['ok' => false, 'error' => 'Someone else already sat down.'];
            }
            Db::run(
                "UPDATE challenges SET status = 'cancelled' WHERE kind = 'pull' AND status = 'pending' AND from_user_id = ? AND id <> ?",
                [$from, $ch['id']]
            );
            Db::run('DELETE FROM match_queue WHERE user_id IN (?, ?)', [$from, $to]);
            $gameId = self::insertGame($from, $to, self::parseMode($ch['mode']), $isPull);
            Db::run('UPDATE challenges SET game_id = ? WHERE id = ?', [$gameId, $ch['id']]);
            return ['ok' => true, 'gameId' => $gameId];
        });
    }

    /** @param array<string,mixed> $data */
    public static function cancelChallenge(string $userId, array $data): mixed
    {
        Db::run(
            "UPDATE challenges SET status = 'cancelled' WHERE id = ? AND from_user_id = ? AND status = 'pending'",
            [self::str($data, 'id'), $userId]
        );
        return ['ok' => true];
    }

    /**
     * Shared body of the seat-only game flag handlers.
     * @param array<string,mixed> $data
     * @param array<string,int> $set column => value
     */
    private static function seatFlag(string $userId, array $data, array $set): mixed
    {
        $game = self::loadGame(self::str($data, 'gameId'));
        if ($game === null) {
            return null;
        }
        if ($game['white_user_id'] !== $userId && $game['black_user_id'] !== $userId) {
            return null;
        }
        $sets = [];
        foreach (array_keys($set) as $col) {
            $sets[] = Db::ident($col) . ' = ?';
        }
        Db::run('UPDATE games SET ' . implode(', ', $sets) . ' WHERE id = ?', [...array_values($set), $game['id']]);
        foreach ($set as $col => $v) {
            $game[$col] = $v;
        }
        return self::snapshotFor($game, $userId);
    }

    /** @param array<string,mixed> $data */
    public static function openGameLive(string $userId, array $data): mixed
    {
        return self::seatFlag($userId, $data, ['chat_open' => 1, 'live_open' => 1]);
    }

    /** @param array<string,mixed> $data */
    public static function openGameChat(string $userId, array $data): mixed
    {
        return self::seatFlag($userId, $data, ['chat_open' => 1]);
    }

    /** @param array<string,mixed> $data */
    public static function closeGameChat(string $userId, array $data): mixed
    {
        return self::seatFlag($userId, $data, ['chat_open' => 0]);
    }

    /** @param array<string,mixed> $data */
    public static function openGameCamera(string $userId, array $data): mixed
    {
        return self::seatFlag($userId, $data, ['camera_open' => 1]);
    }

    /** @param array<string,mixed> $data */
    public static function closeGameCamera(string $userId, array $data): mixed
    {
        return self::seatFlag($userId, $data, ['camera_open' => 0]);
    }

    /** @param array<string,mixed> $data */
    public static function sendGameChat(string $userId, array $data): mixed
    {
        $raw = $data['text'] ?? '';
        $text = is_scalar($raw) ? (string) $raw : '';
        $text = preg_replace('/^\s+|\s+$/u', '', $text) ?? $text;
        $text = mb_substr($text, 0, 280);
        $image = Util::chatImage($data['image'] ?? null);
        $game = self::loadGame(self::str($data, 'gameId'));
        if ($game === null) {
            return null;
        }
        if ($game['white_user_id'] !== $userId && $game['black_user_id'] !== $userId) {
            return null;
        }
        Db::run('UPDATE games SET chat_open = 1 WHERE id = ?', [$game['id']]);
        if ($text !== '' || $image !== null) {
            Db::run(
                'INSERT INTO game_chat (game_id, user_id, body, image, created_at) VALUES (?, ?, ?, ?, ?)',
                [$game['id'], $userId, $text, $image, Db::now()]
            );
        }
        $game['chat_open'] = 1;
        return self::snapshotFor($game, $userId);
    }

    /** @param array<string,mixed> $data */
    public static function getGame(string $userId, array $data): mixed
    {
        $game = self::loadGame(self::str($data, 'gameId'));
        if ($game === null) {
            return null;
        }
        return self::snapshotFor($game, $userId, true);
    }

    /** @param array<string,mixed> $data */
    public static function makeMove(string $userId, array $data): mixed
    {
        $from = self::str($data, 'from');
        $to = self::str($data, 'to');
        $promotion = isset($data['promotion']) && is_string($data['promotion']) ? $data['promotion'] : null;
        $game = self::loadGame(self::str($data, 'gameId'));
        if ($game === null) {
            return ['ok' => false, 'error' => 'Game not found.'];
        }
        if ($game['status'] !== 'active') {
            return ['ok' => false, 'error' => 'This game is over.'];
        }
        self::maybeTimeout($game);
        if ($game['status'] !== 'active') {
            $snap = self::snapshotFor($game, $userId);
            return ['ok' => false, 'error' => 'Time expired.', 'game' => $snap];
        }
        if ($game['white_user_id'] !== $userId && $game['black_user_id'] !== $userId) {
            return ['ok' => false, 'error' => 'You are not seated at this board.'];
        }
        $side = $game['white_user_id'] === $userId ? 'w' : 'b';
        if ($game['turn'] !== $side) {
            return ['ok' => false, 'error' => 'Wait for your turn.'];
        }
        $piece = self::validSquare($from) ? (new Chess((string) $game['fen']))->get($from) : null;
        if (!$piece || $piece['color'] !== $side) {
            return ['ok' => false, 'error' => 'That is not your piece.'];
        }
        $applied = self::recordAndApplyMove($game, $from, $to, $promotion);
        if (!$applied['ok']) {
            return $applied;
        }
        $snap = self::snapshotFor($game, $userId, true);
        return ['ok' => true, 'game' => $snap];
    }

    /** @param array<string,mixed> $data */
    public static function claimTimeout(string $userId, array $data): mixed
    {
        $game = self::loadGame(self::str($data, 'gameId'));
        if ($game === null) {
            return null;
        }
        self::maybeTimeout($game);
        return self::snapshotFor($game, $userId);
    }

    /** @param array<string,mixed> $data */
    public static function resignGame(string $userId, array $data): mixed
    {
        $game = self::loadGame(self::str($data, 'gameId'));
        if ($game === null) {
            return null;
        }
        if ($game['white_user_id'] !== $userId && $game['black_user_id'] !== $userId) {
            return null;
        }
        if ($game['status'] === 'active') {
            $winner = (string) ($game['white_user_id'] === $userId ? $game['black_user_id'] : $game['white_user_id']);
            self::finishGame($game, $winner === $game['white_user_id'] ? 'white_win' : 'black_win', $winner);
        }
        return self::snapshotFor($game, $userId);
    }

    /** @param array<string,mixed> $data */
    public static function startBotGame(string $userId, array $data): mixed
    {
        $mode = self::parseMode($data['mode'] ?? null);
        $bot = ($data['bot'] ?? null) === 'v2' ? 'v2' : 'v1';
        self::ensureBots();
        $me = self::profileById($userId);
        if ($me === null) {
            throw new RpcError('Choose a club name first.');
        }
        $active = self::activeGameIdFor($userId);
        if ($active !== null) {
            return ['gameId' => $active];
        }
        $botId = $bot === 'v2' ? Constants::BOT_V2_USER_ID : Constants::BOT_USER_ID;
        return ['gameId' => self::insertGame($userId, $botId, $mode)];
    }

    /** @param array<string,mixed> $data */
    public static function buyBoard(string $userId, array $data): mixed
    {
        $board = Catalog::boardById(self::str($data, 'boardId'));
        return Db::transaction(static function () use ($userId, $board): array {
            $me = self::profileById($userId, true);
            if ($me === null) {
                throw new RpcError('Choose a club name first.');
            }
            $price = (int) ($board['coinCost'] ?? 0);
            if ($price <= 0) {
                return ['ok' => false, 'error' => 'That board is not sold for coins.'];
            }
            $owned = self::ownedList($me['owned_boards']);
            $purse = $me['coins'];
            if (in_array($board['id'], $owned, true)) {
                return ['ok' => true, 'coins' => $purse, 'owned' => $owned];
            }
            if ($purse < $price) {
                return ['ok' => false, 'error' => 'You need ' . number_format($price) . ' coins. You have ' . number_format($purse) . '.'];
            }
            $next = [...$owned, $board['id']];
            $changed = Db::run(
                'UPDATE profiles SET coins = coins - ?, owned_boards = ? WHERE user_id = ? AND coins >= ?',
                [$price, implode(',', $next), $userId, $price]
            );
            if ($changed === 0) {
                return ['ok' => false, 'error' => 'You need ' . number_format($price) . ' coins. You have ' . number_format($purse) . '.'];
            }
            return ['ok' => true, 'coins' => $purse - $price, 'owned' => $next];
        });
    }

    /** @param array<string,mixed> $data */
    public static function getSandbox(string $userId, array $data): mixed
    {
        $me = self::profileById($userId);
        if ($me === null) {
            throw new RpcError('Choose a club name first.');
        }
        return ['owned' => (int) ($me['sandbox_owned'] ?? 0) === 1, 'coins' => (int) $me['coins']];
    }

    /** @param array<string,mixed> $data */
    public static function buySandbox(string $userId, array $data): mixed
    {
        $price = 90;
        return Db::transaction(static function () use ($userId, $price): array {
            $me = self::profileById($userId, true);
            if ($me === null) {
                throw new RpcError('Choose a club name first.');
            }
            $purse = (int) $me['coins'];
            if ((int) ($me['sandbox_owned'] ?? 0) === 1) {
                return ['ok' => true, 'coins' => $purse, 'owned' => true];
            }
            if ($purse < $price) {
                return ['ok' => false, 'error' => 'You need 90 coins. You have ' . number_format($purse) . '.', 'coins' => $purse, 'owned' => false];
            }
            $changed = Db::run(
                'UPDATE profiles SET coins = coins - ?, sandbox_owned = 1 WHERE user_id = ? AND coins >= ? AND sandbox_owned = 0',
                [$price, $userId, $price]
            );
            if ($changed === 0) {
                return ['ok' => false, 'error' => 'You need 90 coins. You have ' . number_format($purse) . '.', 'coins' => $purse, 'owned' => false];
            }
            return ['ok' => true, 'coins' => $purse - $price, 'owned' => true];
        });
    }

    /** @param array<string,mixed> $data */
    public static function setEquippedBoard(string $userId, array $data): mixed
    {
        $me = self::profileById($userId);
        if ($me === null) {
            throw new RpcError('Choose a club name first.');
        }
        $board = Catalog::boardById(self::str($data, 'boardId'));
        $owned = self::ownedList($me['owned_boards']);
        if (!Catalog::boardUnlocked($me['score'], $board, $owned)) {
            $coin = (int) ($board['coinCost'] ?? 0);
            $name = (string) ($board['name'] ?? $board['id']);
            throw new RpcError($coin > 0 ? "Buy {$name} with {$coin} coins." : "Reach {$board['cost']} Elo to sit at {$name}.");
        }
        Db::run('UPDATE profiles SET equipped_board = ? WHERE user_id = ?', [$board['id'], $userId]);
        return ['equippedBoard' => $board['id'], 'score' => $me['score']];
    }

    /** @param array<string,mixed> $data */
    public static function listClubUsers(string $userId, array $data): mixed
    {
        $cutoff = self::onlineCutoff();
        $rows = Db::all(
            'SELECT username, score, last_seen FROM profiles
             WHERE user_id <> ? AND user_id <> ? AND user_id <> ?
             ORDER BY CASE WHEN last_seen > ? THEN 0 ELSE 1 END, score DESC, username ASC
             LIMIT 80',
            [$userId, Constants::BOT_USER_ID, Constants::BOT_V2_USER_ID, $cutoff]
        );
        $now = Db::nowMs();
        return array_map(static fn (array $r): array => [
            'username' => (string) $r['username'],
            'score' => (int) $r['score'],
            'online' => $r['last_seen'] !== null && $now - Db::toMs($r['last_seen']) < 20000,
        ], $rows);
    }

    /** @param array<string,mixed> $data */
    public static function getChallengeInbox(string $userId, array $data): mixed
    {
        self::touchProfile($userId);
        self::expireNamedChallenges();
        $rows = Db::all(
            "SELECT c.id, p.username, c.kind FROM challenges c JOIN profiles p ON p.user_id = c.from_user_id
             WHERE c.to_user_id = ? AND c.status = 'pending' ORDER BY c.created_at DESC LIMIT 24",
            [$userId]
        );
        return array_map(static fn (array $r): array => [
            'id' => (string) $r['id'],
            'fromUsername' => (string) $r['username'],
            'kind' => ($r['kind'] ?? null) === 'pull' ? 'pull' : 'named',
        ], $rows);
    }
}
