<?php

declare(strict_types=1);

namespace Morse;

/**
 * Football, player vs player (owner t234u). You type a username in the Football setup and press Send:
 * the other player gets the challenge in the usual Challenges list and bell pop-up, and on "Sit down"
 * both play the SAME game, kept here on the server (the browser only shows it):
 *
 *  - board 14 x 8, the home side ('w', the challenger) runs up the rows, 'b' runs down; the rules are a
 *    port of the bot game in src/components/variants/play.tsx (moves, throws, field goals, tackles,
 *    the king dropping the ball after 3 moves, interceptions, the 5-second rule, the 10-minute clock);
 *  - owner t238u: each team starts on its own side with the ball in its king's hands; players stay where
 *    they are between plays and a tackler stays on the tackle square. A tackled player is out until the next
 *    touchdown or turnover. Owner t239u: the teams line up facing each other two empty rows apart; when
 *    the ball carrier is tackled everyone left lines up again at that yard line (lineUpAt()), the king
 *    (of the team that has the ball now) holding it. Only the king throws forward; the
 *    king may kick a field goal from anywhere, the odds falling with the distance;
 *  - the replay after a touchdown ends early only when BOTH players press Skip;
 *  - no Elo, no coins. A player who closes the game for STALE_MS loses by forfeit; Leave = resign.
 *
 * State is one JSON blob in `football_games.state`, changed inside a row-locked transaction. Timed steps
 * (the dead-ball pause, the snap, the replay) are applied lazily by advance() on the next request.
 * Every change appends an event (with the board after it) that the browsers poll and animate.
 */
final class FootballMatch
{
    public const ROWS = 14;
    public const COLS = 8;
    public const GAME_MS = 600000;
    public const SHOT_MS = 5000;
    public const COUNT_MS = 4100;
    public const STALE_MS = 45000;
    /** both players get this long to open the game / pick a team before the kick-off goes anyway */
    public const READY_WAIT_MS = 90000;
    private const FILES = 'abcdefgh';
    private const BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    /** owner t239u: at a kickoff the offense's front row is on this yard line (w rows 4-5, b rows 8-9) */
    public const KICK_LINE = 5;
    /** Field goal odds in % (owner t238u): `near` one row from the end zone, down to `far` from `span` rows out. */
    public const FG = ['near' => 95, 'far' => 5, 'span' => 12];
    private const KEEP_EVENTS = 80;
    /**
     * Turnover risk (owner t237u): every run, tackle of the ball carrier and pass may go wrong. The chance (in %)
     * is a base plus the chess value of the defenders within 2 squares (full weight next to the spot, less
     * weight 2 away), capped. No defender near = no risk. Same numbers as FB_RISK in play.tsx.
     */
    public const VALUE = ['p' => 1, 'n' => 3, 'b' => 3, 'r' => 5, 'q' => 9, 'k' => 0];
    public const RISK = [
        'run' => ['base' => 2, 'near' => 1.5, 'far' => 0.5],
        'tackle' => ['base' => 10, 'near' => 3, 'far' => 1.5],
        'pass' => ['base' => 3, 'near' => 3, 'far' => 1.5],
    ];
    public const RISK_CAP = 50;
    /** A defender who jumps (SPACE / right-click) under a pass adds this much to the interception chance. */
    public const JUMP_BONUS = 40;
    public const JUMP_CAP = 85;
    /** Tests can make the dice say what they want. @var (\Closure(): float)|null */
    public static ?\Closure $dice = null;

    public static function register(): void
    {
        foreach (['sendFootballChallenge', 'footballSync', 'sendFootballMove', 'resignFootball'] as $name) {
            Rpc::register($name, [self::class, $name]);
        }
    }

    // ── challenge ──────────────────────────────────────────────────────────

    /** @param array<string,mixed> $data */
    public static function sendFootballChallenge(string $userId, array $data): array
    {
        $raw = trim((string) (is_scalar($data['username'] ?? null) ? $data['username'] : ''));
        if (!preg_match(Constants::USERNAME_RE, $raw)) {
            return ['ok' => false, 'error' => 'Type a username (8–20 letters, numbers, or underscores).'];
        }
        $me = Db::one('SELECT user_id, username FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
        if ($me === null) {
            throw new RpcError('Choose a club name first.');
        }
        $active = self::activeIdFor($userId);
        if ($active !== null) {
            return ['ok' => true, 'gameId' => $active];
        }
        $to = Db::one('SELECT user_id, username FROM profiles WHERE username_lc = ? LIMIT 1', [strtolower($raw)]);
        if ($to === null) {
            return ['ok' => false, 'error' => 'No player with that username.'];
        }
        $toId = (string) $to['user_id'];
        if ($toId === $userId) {
            return ['ok' => false, 'error' => 'You cannot challenge yourself.'];
        }
        if (Constants::isBotUserId($toId)) {
            // the house bot plays football in the browser (the normal game vs the bot)
            return ['ok' => true, 'bot' => true, 'username' => (string) $to['username']];
        }
        Db::run(
            "UPDATE challenges SET status = 'cancelled' WHERE status = 'pending' AND kind = 'football' AND created_at < ?",
            [Db::ts(Db::nowMs() - Mores::NAMED_CHALLENGE_MS)]
        );
        $pending = Db::one(
            "SELECT 1 AS x FROM challenges WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1",
            [$userId, $toId]
        );
        if ($pending !== null) {
            return ['ok' => false, 'error' => 'You already sent the user a challenge.'];
        }
        $id = Util::uuid();
        Db::run(
            "INSERT INTO challenges (id, from_user_id, to_user_id, mode, status, created_at, kind, variant) VALUES (?, ?, ?, 'timed', 'pending', ?, 'football', '')",
            [$id, $userId, $toId, Db::now()]
        );
        return ['ok' => true, 'challengeId' => $id, 'username' => (string) $to['username']];
    }

    /**
     * "Sit down" on a football challenge (called from Mores::respondChallenge inside its claim).
     * @param array<string,mixed> $ch
     */
    public static function accept(array $ch): array
    {
        return Db::transaction(static function () use ($ch): array {
            $claimed = Db::run("UPDATE challenges SET status = 'accepted' WHERE id = ? AND status = 'pending'", [$ch['id']]);
            if ($claimed === 0) {
                return ['ok' => false, 'error' => 'That challenge is no longer open.'];
            }
            $from = (string) $ch['from_user_id'];
            $to = (string) $ch['to_user_id'];
            // one football game at a time: an old unfinished one between anybody here ends now
            foreach ([$from, $to] as $uid) {
                $old = self::activeIdFor($uid);
                if ($old !== null) {
                    self::endAbandoned($old);
                }
            }
            $gameId = self::create($from, $to);
            Db::run('UPDATE challenges SET game_id = ? WHERE id = ?', [$gameId, $ch['id']]);
            return ['ok' => true, 'gameId' => $gameId, 'football' => true];
        });
    }

    public static function create(string $white, string $black, ?int $now = null): string
    {
        $now ??= Db::nowMs();
        $id = Util::uuid();
        $start = self::startBoard();
        $state = [
            'board' => $start,
            'loose' => null,
            'turn' => 'w',
            'score' => ['w' => 0, 'b' => 0],
            'phase' => 'count',
            'until' => 0,
            'next' => null,
            'clockMs' => self::GAME_MS,
            'clockAt' => 0,
            'turnAt' => 0,
            'bonus' => 0,
            'flight' => null,
            'skip' => ['w' => false, 'b' => false],
            'ready' => ['w' => false, 'b' => false],
            'seen' => ['w' => $now, 'b' => $now],
            'drive' => [],
            'over' => '',
            'winner' => null,
            'createdAt' => $now,
            'seq' => 0,
            'events' => [],
        ];
        Db::run(
            "INSERT INTO football_games (id, white_user_id, black_user_id, status, state, rev, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, 0, ?, ?)",
            [$id, $white, $black, json_encode($state), Db::ts($now), Db::ts($now)]
        );
        return $id;
    }

    /** The football game this player is in right now (for the home page), or null. Ends games they walked away from. */
    public static function activeIdFor(string $userId): ?string
    {
        $row = Db::one(
            "SELECT id, white_user_id, state FROM football_games WHERE status = 'active' AND (white_user_id = ? OR black_user_id = ?) ORDER BY created_at DESC LIMIT 1",
            [$userId, $userId]
        );
        if ($row === null) {
            return null;
        }
        $state = json_decode((string) $row['state'], true);
        $side = $row['white_user_id'] === $userId ? 'w' : 'b';
        if (!is_array($state) || Db::nowMs() - (int) ($state['seen'][$side] ?? 0) > self::STALE_MS) {
            // they left the game long ago: it is over (the other player wins by forfeit)
            self::endAbandoned((string) $row['id'], $side);
            return null;
        }
        return (string) $row['id'];
    }

    private static function endAbandoned(string $gameId, ?string $leaver = null): void
    {
        Db::transaction(static function () use ($gameId, $leaver): void {
            $row = Db::one('SELECT * FROM football_games WHERE id = ? LIMIT 1' . Db::forUpdate(), [$gameId]);
            if ($row === null || $row['status'] !== 'active') {
                return;
            }
            $s = json_decode((string) $row['state'], true);
            if (!is_array($s)) {
                Db::run("UPDATE football_games SET status = 'done' WHERE id = ?", [$gameId]);
                return;
            }
            $now = Db::nowMs();
            self::advance($s, $now);
            if ($s['over'] === '') {
                self::gameOver($s, $now, 'forfeit', $leaver !== null ? self::other($leaver) : null);
            }
            self::save($gameId, (int) $row['rev'], $s);
        });
    }

    // ── RPCs ───────────────────────────────────────────────────────────────

    /** @param array<string,mixed> $data */
    public static function footballSync(string $userId, array $data): array
    {
        return self::withGame($userId, $data, static function (array &$s, string $side, int $now) use ($data): void {
            if (!empty($data['ready']) && !$s['ready'][$side]) {
                $s['ready'][$side] = true;
            }
        });
    }

    /** @param array<string,mixed> $data */
    public static function sendFootballMove(string $userId, array $data): array
    {
        return self::withGame($userId, $data, static function (array &$s, string $side, int $now) use ($data): void {
            $act = is_array($data['action'] ?? null) ? $data['action'] : [];
            $err = self::act($s, $side, $act, $now);
            if ($err !== null) {
                throw new RpcError($err);
            }
        });
    }

    /** Leave / resign: the other player wins. @param array<string,mixed> $data */
    public static function resignFootball(string $userId, array $data): array
    {
        return self::withGame($userId, $data, static function (array &$s, string $side, int $now): void {
            if ($s['over'] === '') {
                self::gameOver($s, $now, 'resign', self::other($side));
            }
        });
    }

    /**
     * @param array<string,mixed> $data
     * @param callable(array<string,mixed>&,string,int):void $fn
     */
    private static function withGame(string $userId, array $data, callable $fn): array
    {
        $gameId = (string) (is_scalar($data['gameId'] ?? null) ? $data['gameId'] : '');
        $since = (int) (is_numeric($data['since'] ?? null) ? $data['since'] : 0);
        return Db::transaction(static function () use ($userId, $gameId, $since, $fn): array {
            $row = Db::one('SELECT * FROM football_games WHERE id = ? LIMIT 1' . Db::forUpdate(), [$gameId]);
            if ($row === null || ($row['white_user_id'] !== $userId && $row['black_user_id'] !== $userId)) {
                throw new RpcError('Game not found.');
            }
            $s = json_decode((string) $row['state'], true);
            if (!is_array($s)) {
                throw new RpcError('Game not found.');
            }
            $side = $row['white_user_id'] === $userId ? 'w' : 'b';
            $now = Db::nowMs();
            $before = json_encode($s);
            if ($s['over'] === '') {
                $s['seen'][$side] = $now;
                self::advance($s, $now);
                $fn($s, $side, $now);
                self::advance($s, $now);
                // the other player closed the game a while ago: forfeit
                if ($s['over'] === '' && $now - (int) $s['seen'][self::other($side)] > self::STALE_MS) {
                    self::gameOver($s, $now, 'forfeit', $side);
                }
            }
            if (json_encode($s) !== $before) {
                self::save($gameId, (int) $row['rev'], $s);
            }
            return self::view($row, $s, $side, $since, $now);
        });
    }

    /** @param array<string,mixed> $s */
    private static function save(string $gameId, int $rev, array $s): void
    {
        Db::run(
            'UPDATE football_games SET state = ?, rev = ?, status = ?, updated_at = ? WHERE id = ?',
            [json_encode($s), $rev + 1, $s['over'] !== '' ? 'done' : 'active', Db::now(), $gameId]
        );
    }

    /** @param array<string,mixed> $row @param array<string,mixed> $s */
    private static function view(array $row, array $s, string $side, int $since, int $now): array
    {
        $names = [];
        $teams = [];
        foreach (['w' => 'white_user_id', 'b' => 'black_user_id'] as $sd => $col) {
            $p = Db::one('SELECT username, football_json FROM profiles WHERE user_id = ? LIMIT 1', [(string) $row[$col]]);
            $names[$sd] = (string) ($p['username'] ?? 'Player');
            $j = json_decode((string) ($p['football_json'] ?? ''), true);
            $t = is_array($j) && is_array($j['team'] ?? null) ? $j['team'] : null;
            $teams[$sd] = $t !== null && isset($t['name'], $t['color']) ? ['name' => (string) $t['name'], 'color' => (string) $t['color']] : null;
        }
        $events = $s['events'];
        $oldest = $events === [] ? $s['seq'] + 1 : (int) $events[0]['seq'];
        $events = array_values(array_filter($events, static fn (array $e): bool => (int) $e['seq'] > $since));
        $clock = (int) $s['clockMs'];
        if ($s['phase'] === 'play' && $s['over'] === '') {
            $clock -= max(0, $now - (int) $s['clockAt']);
        }
        return [
            'gameId' => (string) $row['id'],
            'now' => $now,
            'side' => $side,
            'names' => $names,
            'teams' => $teams,
            'seq' => (int) $s['seq'],
            // the browser missed events that were already dropped: it jumps to the board as it is
            'gap' => $since > 0 && $since + 1 < $oldest,
            'events' => $events,
            'board' => $s['board'],
            'loose' => $s['loose'],
            'turn' => $s['turn'],
            'score' => $s['score'],
            'phase' => $s['phase'],
            'until' => (int) $s['until'],
            'clockMs' => max(0, $clock),
            'clockRunning' => $s['phase'] === 'play' && $s['over'] === '',
            'turnAt' => (int) $s['turnAt'],
            'bonus' => (int) $s['bonus'],
            'skip' => $s['skip'],
            'ready' => $s['ready'],
            'over' => $s['over'],
            'winner' => $s['winner'],
        ];
    }

    // ── rules (canonical: 'w' plays up the rows) ───────────────────────────

    /** @return list<list<array<string,mixed>|null>> */
    public static function startBoard(): array
    {
        return self::formation('w');
    }

    /**
     * The line-up (owner t239u): both teams in rows facing each other, two empty rows apart, like the
     * original football start. $line is the yard line of the offense's front row, counted up the field from
     * its own end (KICK_LINE at a kickoff). The offense's back row is right behind it, the defense's front row
     * is two empty rows past it (closer near the goal line). Only players in $alive (a board) line up; tackled
     * players stay out. The king of $holder has the ball.
     * @param list<list<array<string,mixed>|null>>|null $alive
     * @return list<list<array<string,mixed>|null>>
     */
    public static function formation(string $holder, int $line = self::KICK_LINE, ?array $alive = null): array
    {
        $y = max(2, min(self::ROWS - 4, $line));
        $defFront = min($y + 3, self::ROWS - 2);
        // offense yards -> board row
        $row = static fn (int $yy): int => $holder === 'w' ? $yy : self::ROWS - 1 - $yy;
        $rows = [
            $holder => ['back' => $row($y - 1), 'pawns' => $row($y)],
            self::other($holder) => ['back' => $row($defFront + 1), 'pawns' => $row($defFront)],
        ];
        $ids = null;
        if ($alive !== null) {
            $ids = [];
            foreach ($alive as $cells) {
                foreach ($cells as $u) {
                    if ($u !== null) {
                        $ids[$u['id']] = true;
                    }
                }
            }
        }
        $board = self::blank();
        for ($f = 0; $f < 8; $f++) {
            $c = self::FILES[$f];
            foreach ([['w', 'back', self::BACK[$f], "{$c}1"], ['w', 'pawns', 'p', "{$c}2"], ['b', 'pawns', 'p', "{$c}7"], ['b', 'back', self::BACK[$f], "{$c}8"]] as [$side, $which, $kind, $id]) {
                if ($ids === null || isset($ids[$id])) {
                    $board[$rows[$side][$which]][$f] = ['side' => $side, 'kind' => $kind, 'id' => $id];
                }
            }
        }
        $kr = $rows[$holder]['back'];
        $at = ($board[$kr][4]['kind'] ?? null) === 'k' ? [$kr, 4] : null;
        foreach ($board as $r => $cells) {
            foreach ($cells as $f => $u) {
                if ($at === null && $u !== null && $u['side'] === $holder) {
                    $at = [$r, $f];
                }
            }
        }
        if ($at !== null) {
            $board[$at[0]][$at[1]]['ball'] = true;
            $board[$at[0]][$at[1]]['held'] = 0;
        }
        return $board;
    }

    /**
     * The ball carrier was tackled on board row $row (or the king put the ball down there), owner t239u:
     * everyone still in the game lines up there, $off (the team with the ball now) on its side of that line.
     * @return list<list<array<string,mixed>|null>>
     */
    public static function lineUpAt(array $b, int $row, string $off): array
    {
        return self::formation($off, $off === 'w' ? $row : self::ROWS - 1 - $row, $b);
    }

    /** Field goal chance in % for $side's king on row $r (owner t238u): sure from close in, a long shot from far. */
    public static function fieldGoalOdds(string $side, int $r): int
    {
        $d = max(1, min(self::FG['span'], $side === 'w' ? 12 - $r : $r - 1));
        return (int) round(self::FG['near'] - ($d - 1) * (self::FG['near'] - self::FG['far']) / (self::FG['span'] - 1));
    }

    /** @return list<list<null>> */
    private static function blank(): array
    {
        return array_fill(0, self::ROWS, array_fill(0, self::COLS, null));
    }

    private static function on(int $r, int $f): bool
    {
        return $r >= 0 && $r < self::ROWS && $f >= 0 && $f < self::COLS;
    }

    public static function other(string $side): string
    {
        return $side === 'w' ? 'b' : 'w';
    }

    public static function inEnd(string $side, int $r): bool
    {
        return $side === 'w' ? $r >= 12 : $r <= 1;
    }

    /** @return list<array{int,int}> */
    public static function moves(array $b, int $r, int $f): array
    {
        $u = $b[$r][$f] ?? null;
        if ($u === null) {
            return [];
        }
        $out = [];
        $push = static function (int $rr, int $ff) use ($b, $u, &$out): void {
            if (!self::on($rr, $ff)) {
                return;
            }
            $t = $b[$rr][$ff];
            if (($t['kind'] ?? null) === 'k') {
                return;
            }
            if ($t === null || $t['side'] !== $u['side']) {
                $out[] = [$rr, $ff];
            }
        };
        $slide = static function (int $dr, int $df) use ($b, $u, $r, $f, &$out): void {
            $rr = $r + $dr;
            $ff = $f + $df;
            while (self::on($rr, $ff)) {
                $t = $b[$rr][$ff];
                if ($t === null) {
                    $out[] = [$rr, $ff];
                } else {
                    if ($t['side'] !== $u['side'] && $t['kind'] !== 'k') {
                        $out[] = [$rr, $ff];
                    }
                    break;
                }
                $rr += $dr;
                $ff += $df;
            }
        };
        $k = $u['kind'];
        if ($k === 'p') {
            $rr = $r + ($u['side'] === 'w' ? 1 : -1);
            if (self::on($rr, $f) && $b[$rr][$f] === null) {
                $out[] = [$rr, $f];
            }
            foreach ([-1, 1] as $df) {
                $ff = $f + $df;
                $t = self::on($rr, $ff) ? $b[$rr][$ff] : null;
                if ($t !== null && $t['side'] !== $u['side'] && $t['kind'] !== 'k') {
                    $out[] = [$rr, $ff];
                }
            }
        } elseif ($k === 'n') {
            foreach ([[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as [$dr, $df]) {
                $push($r + $dr, $f + $df);
            }
        } elseif ($k === 'k') {
            for ($dr = -1; $dr <= 1; $dr++) {
                for ($df = -1; $df <= 1; $df++) {
                    if ($dr !== 0 || $df !== 0) {
                        $push($r + $dr, $f + $df);
                    }
                }
            }
        } else {
            $dirs = [];
            if ($k === 'b' || $k === 'q') {
                array_push($dirs, [-1, -1], [-1, 1], [1, -1], [1, 1]);
            }
            if ($k === 'r' || $k === 'q') {
                array_push($dirs, [-1, 0], [1, 0], [0, -1], [0, 1]);
            }
            foreach ($dirs as [$dr, $df]) {
                $slide($dr, $df);
            }
        }
        return $out;
    }

    private static function throwRange(string $kind): int
    {
        return match ($kind) {
            'q', 'k' => 99, // the king can throw to any of his own players (owner t237u)
            'n', 'b' => 5,
            'r' => 8,
            default => 1,
        };
    }

    /** @return list<array{int,int}> */
    public static function catches(array $b, int $r, int $f): array
    {
        $u = $b[$r][$f] ?? null;
        if ($u === null || empty($u['ball'])) {
            return [];
        }
        $reach = self::throwRange($u['kind']);
        $out = [];
        for ($rr = 0; $rr < self::ROWS; $rr++) {
            for ($ff = 0; $ff < self::COLS; $ff++) {
                $t = $b[$rr][$ff];
                if ($t === null || $t['side'] !== $u['side'] || ($rr === $r && $ff === $f)) {
                    continue;
                }
                // owner t238u: only the king throws forward; everyone else throws back (or sideways)
                if ($u['kind'] !== 'k' && ($u['side'] === 'w' ? $rr > $r : $rr < $r)) {
                    continue;
                }
                if ($u['kind'] === 'q' || $u['kind'] === 'k' || max(abs($rr - $r), abs($ff - $f)) <= $reach) {
                    $out[] = [$rr, $ff];
                }
            }
        }
        return $out;
    }

    /** Turnover chance in % at $at from $def's players near it (owner t237u). */
    public static function risk(array $b, array $at, string $def, string $kind): int
    {
        $k = self::RISK[$kind];
        $sum = 0.0;
        foreach (self::defenders($b, $at, $def) as $d) {
            $sum += self::VALUE[$d['kind']] * ($d['d'] <= 1 ? $k['near'] : $k['far']);
        }
        return $sum <= 0 ? 0 : (int) min(self::RISK_CAP, round($k['base'] + $sum));
    }

    /** $def's players within 2 squares of $at, the most valuable (then the closest) first. @return list<array{r:int,f:int,id:string,kind:string,d:int}> */
    public static function defenders(array $b, array $at, string $def): array
    {
        $out = [];
        for ($r = max(0, $at[0] - 2); $r <= min(self::ROWS - 1, $at[0] + 2); $r++) {
            for ($f = max(0, $at[1] - 2); $f <= min(self::COLS - 1, $at[1] + 2); $f++) {
                $u = $b[$r][$f] ?? null;
                if ($u !== null && $u['side'] === $def) {
                    $out[] = ['r' => $r, 'f' => $f, 'id' => (string) $u['id'], 'kind' => (string) $u['kind'], 'd' => max(abs($r - $at[0]), abs($f - $at[1]))];
                }
            }
        }
        usort($out, static fn (array $x, array $y): int => [self::VALUE[$y['kind']], $x['d']] <=> [self::VALUE[$x['kind']], $y['d']]);
        return $out;
    }

    /** 0 ≤ roll < 100, from the server only (the browsers never see it). */
    private static function roll(): float
    {
        return self::$dice !== null ? (float) (self::$dice)() : random_int(0, 9999) / 100;
    }

    /** @return ?array{int,int} */
    private static function findBall(array $b): ?array
    {
        foreach ($b as $r => $row) {
            foreach ($row as $f => $u) {
                if ($u !== null && !empty($u['ball'])) {
                    return [$r, $f];
                }
            }
        }
        return null;
    }

    /** Who stands under the line of a pass (same test as overMen() in field-units.tsx). @return list<array{id:string,r:int,f:int,s:string}> */
    public static function under(array $b, array $from, array $to): array
    {
        $dx = $to[1] - $from[1];
        $dz = $to[0] - $from[0];
        $len2 = $dx * $dx + $dz * $dz;
        $out = [];
        if ($len2 < 1e-6) {
            return $out;
        }
        foreach ($b as $r => $row) {
            foreach ($row as $f => $u) {
                if ($u === null || ([$r, $f] === [$from[0], $from[1]]) || ([$r, $f] === [$to[0], $to[1]])) {
                    continue;
                }
                $t = (($f - $from[1]) * $dx + ($r - $from[0]) * $dz) / $len2;
                if ($t <= 0.04 || $t >= 0.96) {
                    continue;
                }
                if (hypot($from[1] + $dx * $t - $f, $from[0] + $dz * $t - $r) > 0.62) {
                    continue;
                }
                $out[] = ['id' => (string) $u['id'], 'r' => $r, 'f' => $f, 'side' => (string) $u['side']];
            }
        }
        return $out;
    }

    /** How long the ball is in the air in the browser (it slows down over each man it passes). */
    private static function flightMs(array $b, array $from, array $to): int
    {
        $dur = 0.55 + hypot($to[0] - $from[0], $to[1] - $from[1]) * 0.06;
        $n = count(self::under($b, $from, $to));
        return (int) round($dur * (1 + 0.64 * $n) * 1000);
    }

    // ── game flow ──────────────────────────────────────────────────────────

    /** @param array<string,mixed> $s @param array<string,mixed> $extra */
    private static function event(array &$s, string $type, int $at, array $extra = []): void
    {
        $s['seq']++;
        $s['events'][] = ['seq' => $s['seq'], 't' => $type, 'at' => $at, 'board' => $s['board'], 'loose' => $s['loose'], 'score' => $s['score'], 'turn' => $s['turn']] + $extra;
        if (count($s['events']) > self::KEEP_EVENTS) {
            $s['events'] = array_slice($s['events'], -self::KEEP_EVENTS);
        }
    }

    /** Stop the 10-minute clock at $at (it only runs during play). */
    private static function stopClock(array &$s, int $at): void
    {
        if ($s['phase'] === 'play') {
            $s['clockMs'] = max(0, (int) $s['clockMs'] - max(0, $at - (int) $s['clockAt']));
            $s['clockAt'] = $at;
        }
    }

    private static function startPlay(array &$s, int $at): void
    {
        $s['phase'] = 'play';
        $s['clockAt'] = $at;
        $s['turnAt'] = $at;
        $s['bonus'] = 0;
        $s['until'] = 0;
    }

    private static function gameOver(array &$s, int $at, string $why, ?string $winner): void
    {
        self::stopClock($s, $at);
        if ($winner === null && $why === 'time') {
            $winner = $s['score']['w'] === $s['score']['b'] ? null : ($s['score']['w'] > $s['score']['b'] ? 'w' : 'b');
        }
        $s['over'] = $why;
        $s['winner'] = $winner;
        $s['phase'] = 'over';
        $s['flight'] = null;
        self::event($s, 'over', $at, ['why' => $why, 'winner' => $winner]);
    }

    /** Apply every timed step that is due by $now. */
    public static function advance(array &$s, int $now): void
    {
        for ($guard = 0; $guard < 20 && $s['over'] === ''; $guard++) {
            $ph = $s['phase'];
            if ($ph === 'count') {
                if ((int) $s['until'] === 0 && (($s['ready']['w'] && $s['ready']['b']) || $now - (int) $s['createdAt'] > self::READY_WAIT_MS)) {
                    $s['until'] = $now + self::COUNT_MS;
                    self::event($s, 'count', $now, ['until' => $s['until']]);
                }
                if ((int) $s['until'] > 0 && $now >= (int) $s['until']) {
                    $at = (int) $s['until'];
                    self::startPlay($s, $at);
                    self::event($s, 'snap', $at);
                    continue;
                }
                return;
            }
            if ($ph === 'play') {
                if ((int) $s['clockMs'] - ($now - (int) $s['clockAt']) <= 0) {
                    self::gameOver($s, (int) $s['clockAt'] + (int) $s['clockMs'], 'time', null);
                }
                return;
            }
            if ($now < (int) $s['until']) {
                return;
            }
            $at = (int) $s['until'];
            $next = $s['next'] ?? [];
            if ($ph === 'dead') {
                // an interception or a fumble on a run brings everyone back in the start formation; a tackled
                // ball carrier (fumble or not) or a king putting the ball down = everyone still in the game
                // lines up at that yard line (owner t239u)
                $all = !empty($next['all']);
                $holder = (string) $next['holder'];
                $s['board'] = $all ? self::formation($holder) : self::lineUpAt($s['board'], (int) $next['row'], $holder);
                $s['loose'] = null;
                $s['turn'] = (string) $next['first'];
                $s['drive'] = [];
                $s['flight'] = null;
                $s['phase'] = 'snap';
                $s['until'] = $at + 1300;
                self::event($s, 'lineup', $at, ['fresh' => $all]);
            } elseif ($ph === 'snap') {
                self::startPlay($s, $at);
                self::event($s, 'snap', $at);
            } elseif ($ph === 'tdpass') {
                $fl = $s['flight'];
                $s['flight'] = null;
                $c = $s['board'][$fl['to'][0]][$fl['to'][1]] ?? null;
                if ($c !== null && !empty($c['ball']) && $c['side'] === $fl['side']) {
                    self::touchdown($s, $fl['side'], (string) $c['id'], $at);
                } else {
                    self::startPlay($s, $at);
                }
            } elseif ($ph === 'steal') {
                // a defender near the catcher picked the pass off (owner t237u): a turnover
                $fl = $s['flight'];
                self::pickOff($s, (string) $fl['steal']['side'], $fl['steal'], $at, true);
            } elseif ($ph === 'goal') {
                self::kickoff($s, (string) $next['first'], $at, 'goal');
            } elseif ($ph === 'celebrate') {
                self::kickoff($s, (string) $next['first'], $at, 'td');
            } else {
                return;
            }
        }
    }

    /** After a score (or a missed kick): everyone back in the start formation, $first's king has the ball. */
    private static function kickoff(array &$s, string $first, int $at, string $after): void
    {
        $s['board'] = self::formation($first);
        $s['loose'] = null;
        $s['turn'] = $first;
        $s['drive'] = [];
        $s['flight'] = null;
        $s['skip'] = ['w' => false, 'b' => false];
        $s['next'] = null;
        self::startPlay($s, $at);
        self::event($s, 'kickoff', $at, ['first' => $first, 'after' => $after]);
    }

    private static function deadBall(array &$s, int $at, int $wait, int $row, string $holder, string $first, string $text, string $mover, bool $all = false): void
    {
        self::stopClock($s, $at);
        $s['phase'] = 'dead';
        $s['until'] = $at + $wait;
        $s['next'] = ['row' => $row, 'holder' => $holder, 'first' => $first, 'all' => $all];
        $s['flight'] = null;
        self::event($s, 'dead', $at, ['text' => $text, 'side' => $holder]);
    }

    /** Same replay length as touchdown() in play.tsx: up to 10 s of the drive, long pauses trimmed. */
    private static function replayMs(array $times): int
    {
        $n = count($times);
        if ($n === 0) {
            return 3300 + 2600;
        }
        $first = $n - 1;
        $span = 0;
        while ($first > 0) {
            $gap = min(1500, $times[$first] - $times[$first - 1]);
            if ($span + $gap > 10000) {
                break;
            }
            $span += $gap;
            $first--;
        }
        $off = 0;
        for ($i = $first + 1; $i < $n; $i++) {
            $off += max(120, min(1500, $times[$i] - $times[$i - 1]));
        }
        return 3300 + $off + 2600;
    }

    private static function touchdown(array &$s, string $scorer, string $carrier, int $at): void
    {
        self::stopClock($s, $at);
        $s['score'][$scorer] += 6;
        $s['loose'] = null;
        $s['phase'] = 'celebrate';
        $s['skip'] = ['w' => false, 'b' => false];
        $s['flight'] = null;
        $s['until'] = $at + self::replayMs($s['drive']);
        $s['next'] = ['first' => self::other($scorer)];
        self::event($s, 'td', $at, ['scorer' => $scorer, 'carrier' => $carrier]);
    }

    /** After a move or pass that did not end the play. */
    private static function finishTurn(array &$s, string $mover, bool $bonus, int $now): void
    {
        $side = self::other($mover);
        if (!$bonus) {
            $s['turn'] = $side;
            $s['turnAt'] = $now;
            $s['bonus'] = 0;
        }
        // the king of the team to move has held the ball 3 moves: he drops it and the play is dead
        foreach ($s['board'] as $r => $row) {
            foreach ($row as $f => $u) {
                if ($u !== null && $u['side'] === $side && $u['kind'] === 'k' && !empty($u['ball']) && (int) ($u['held'] ?? 0) >= 3) {
                    $s['board'][$r][$f]['ball'] = false;
                    $s['board'][$r][$f]['held'] = 0;
                    $s['loose'] = [$r, $f];
                    self::deadBall($s, $now, 1500, $r, $side, $side, 'Ball down!', $mover);
                    return;
                }
            }
        }
    }

    /** Can $side move right now (their turn, or a 5-second bonus move)? Returns [ok, isBonus]. */
    private static function mayMove(array $s, string $side, int $now): array
    {
        if ($s['phase'] !== 'play') {
            return [false, false];
        }
        if ($s['turn'] === $side) {
            return [true, false];
        }
        return [intdiv(max(0, $now - (int) $s['turnAt']), self::SHOT_MS) > (int) $s['bonus'], true];
    }

    /** @param array<string,mixed> $a */
    public static function act(array &$s, string $side, array $a, int $now): ?string
    {
        if ($s['over'] !== '') {
            return 'The game is over.';
        }
        $t = (string) ($a['t'] ?? '');
        $sq = static function (mixed $v): ?array {
            if (!is_array($v) || count($v) !== 2 || !is_int($v[0] ?? null) || !is_int($v[1] ?? null)) {
                return null;
            }
            return self::on($v[0], $v[1]) ? [$v[0], $v[1]] : null;
        };
        if ($t === 'skip') {
            if ($s['phase'] !== 'celebrate') {
                return null;
            }
            if (!$s['skip'][$side]) {
                $s['skip'][$side] = true;
                self::event($s, 'skip', $now, ['side' => $side]);
            }
            if ($s['skip']['w'] && $s['skip']['b']) {
                self::kickoff($s, (string) $s['next']['first'], $now, 'td');
            }
            return null;
        }
        if ($t === 'intercept') {
            return self::intercept($s, $side, (string) ($a['id'] ?? ''), $now);
        }
        $from = $sq($a['from'] ?? null);
        if ($from === null) {
            return 'Pick a player.';
        }
        [$ok, $bonus] = self::mayMove($s, $side, $now);
        if (!$ok) {
            return 'Wait for your turn.';
        }
        $b = $s['board'];
        $u = $b[$from[0]][$from[1]];
        if ($u === null || $u['side'] !== $side) {
            return 'That is not your player.';
        }
        if ($bonus) {
            $s['bonus'] = intdiv(max(0, $now - (int) $s['turnAt']), self::SHOT_MS);
        }
        $s['drive'][] = $now;
        if ($t === 'goal') {
            // owner t238u: the king may kick from anywhere; the farther out, the smaller the chance.
            // Make it or miss it, the other team gets the ball.
            if (empty($u['ball']) || $u['kind'] !== 'k') {
                return 'Only the king can kick a field goal.';
            }
            $pct = self::fieldGoalOdds($side, $from[0]);
            $good = self::roll() < $pct;
            $s['board'][$from[0]][$from[1]]['ball'] = false;
            $s['board'][$from[0]][$from[1]]['held'] = 0;
            $s['loose'] = null;
            self::stopClock($s, $now);
            if ($good) {
                $s['score'][$side] += 3;
            }
            $s['phase'] = 'goal';
            $s['until'] = $now + 4200;
            $s['next'] = ['first' => self::other($side)];
            $s['flight'] = null;
            self::event($s, 'goal', $now, ['good' => $good, 'pct' => $pct, 'cue' => ['from' => $from, 'to' => [$side === 'w' ? 13 : 0, 3], 'unit' => $u['id'], 'side' => $side, 'kind' => $u['kind'], 'goal' => true, 'miss' => !$good]]);
            return null;
        }
        $to = $sq($a['to'] ?? null);
        if ($to === null) {
            return 'Pick a square.';
        }
        if ($t === 'pass') {
            if (!in_array($to, self::catches($b, $from[0], $from[1]), true)) {
                return 'He cannot throw that far.';
            }
            $c = $b[$to[0]][$to[1]];
            $s['board'][$from[0]][$from[1]]['ball'] = false;
            $s['board'][$from[0]][$from[1]]['held'] = 0;
            $s['board'][$to[0]][$to[1]]['ball'] = true;
            $s['board'][$to[0]][$to[1]]['held'] = $c['kind'] === 'k' ? 1 : 0;
            $air = self::flightMs($s['board'], $from, $to);
            $def = self::other($side);
            $risk = self::risk($b, $to, $def, 'pass');
            $roll = self::roll();
            $s['flight'] = ['from' => $from, 'to' => $to, 'side' => $side, 'catcher' => $c['id'], 'at' => $now, 'until' => $now + $air + 1500, 'board' => $s['board'], 'risk' => $risk, 'roll' => $roll, 'tried' => []];
            self::event($s, 'pass', $now, ['risk' => $risk, 'cue' => ['from' => $from, 'to' => $to, 'unit' => $u['id'], 'side' => $side, 'kind' => $u['kind'], 'thrown' => true]]);
            if ($roll < $risk) {
                // picked off by the best defender near the catcher, just before the catch
                $d = self::defenders($b, $to, $def)[0];
                self::stopClock($s, $now);
                $s['flight']['steal'] = ['side' => $def, 'id' => $d['id'], 'r' => $d['r'], 'f' => $d['f']];
                $s['phase'] = 'steal';
                $s['until'] = $now + max(400, (int) round($air * 0.7));
                return null;
            }
            if (self::inEnd($side, $to[0])) {
                // the touchdown waits for the catch: the other team can still jump for it
                self::stopClock($s, $now);
                $s['phase'] = 'tdpass';
                $s['until'] = $now + max(900, $air + 950);
                return null;
            }
            self::finishTurn($s, $side, $bonus, $now);
            return null;
        }
        if ($t !== 'move') {
            return 'Unknown move.';
        }
        if (!in_array($to, self::moves($b, $from[0], $from[1]), true)) {
            return 'He cannot go there.';
        }
        $victim = $b[$to[0]][$to[1]];
        $loose = $s['loose'];
        $carry = !empty($u['ball']) || ($loose !== null && $loose[0] === $to[0] && $loose[1] === $to[1]) || !empty($victim['ball']);
        // owner t237u: tackling the carrier only MAYBE wins the ball (a fumble); a run near defenders may fumble too
        $def = self::other($side);
        $sack = !empty($victim['ball']);
        $fumble = false;
        if ($sack) {
            $after = $b;
            $after[$from[0]][$from[1]] = null;
            $after[$to[0]][$to[1]] = $u;
            $fumble = self::roll() < self::risk($after, $to, $side, 'tackle');
            $carry = $fumble;
        } elseif ($carry && $victim === null && !self::inEnd($side, $to[0])) {
            $fumble = self::roll() < self::risk($b, $to, $def, 'run');
        }
        $held = $u['kind'] === 'k' && $carry ? (int) ($u['held'] ?? 0) + 1 : 0;
        $s['board'][$from[0]][$from[1]] = null;
        $s['board'][$to[0]][$to[1]] = ['side' => $u['side'], 'kind' => $u['kind'], 'id' => $u['id'], 'ball' => $carry, 'held' => $held];
        if ($carry || ($loose !== null && $loose[0] === $to[0] && $loose[1] === $to[1])) {
            $s['loose'] = null;
        }
        if ($carry && is_array($s['flight']) && $s['flight']['catcher'] !== $u['id']) {
            $s['flight'] = null;
        }
        self::event($s, 'move', $now, ['cue' => ['from' => $from, 'to' => $to, 'unit' => $u['id'], 'side' => $side, 'kind' => $u['kind'], 'capture' => $victim !== null, 'victim' => $victim['kind'] ?? null, 'victimSide' => $victim['side'] ?? null]]);
        if ($carry && self::inEnd($side, $to[0])) {
            self::touchdown($s, $side, (string) $u['id'], $now);
            return null;
        }
        $first = $bonus ? $s['turn'] : self::other($side);
        if ($sack) {
            // the carrier is tackled and out (t235u). Fumble = turnover, everyone comes back (t236u/t237u);
            // no fumble = his team keeps the ball and both teams slide to this yard line (t238u)
            if ($fumble) {
                // the team that won the ball starts from the tackle spot (owner t239u)
                self::deadBall($s, $now, 1500, $to[0], $side, $side, 'Fumble! Turnover', $side);
            } else {
                self::deadBall($s, $now, 1500, $to[0], $def, $first, 'Tackled! Ball kept', $side);
            }
            return null;
        }
        if ($fumble) {
            // he ran into big defenders and dropped it: their ball right there, everyone back
            $s['board'][$to[0]][$to[1]]['ball'] = false;
            $s['board'][$to[0]][$to[1]]['held'] = 0;
            $s['loose'] = [$to[0], $to[1]];
            self::deadBall($s, $now, 1500, $to[0], $def, $first, 'Fumble! Turnover', $def, true);
            return null;
        }
        // owner t238u: any other tackle does not stop play. The tackled player is out (until a touchdown or a
        // turnover) and the tackler stays on his square.
        self::finishTurn($s, $side, $bonus, $now);
        return null;
    }

    /** SPACE / right-click while the other team's pass is over one of your players: he picks it off. */
    private static function intercept(array &$s, string $side, string $id, int $now): ?string
    {
        $fl = $s['flight'];
        if (!is_array($fl) || $fl['side'] === $side || $now > (int) $fl['until'] || ($s['phase'] !== 'play' && $s['phase'] !== 'tdpass')) {
            return 'Too late!';
        }
        if (!empty($fl['tried'][$side])) {
            return 'Missed it!';
        }
        // owner t238u: a pass to a man in the end zone with no defender near him is a sure touchdown
        if ($s['phase'] === 'tdpass' && (int) $fl['risk'] === 0) {
            return 'Missed it!';
        }
        $pick = null;
        foreach (self::under($fl['board'], $fl['from'], $fl['to']) as $m) {
            if ($m['id'] === $id && $m['side'] === $side && ($s['board'][$m['r']][$m['f']]['id'] ?? null) === $id) {
                $pick = $m;
            }
        }
        [$tr, $tf] = $fl['to'];
        $c = $s['board'][$tr][$tf] ?? null;
        if ($pick === null || $c === null || $c['id'] !== $fl['catcher'] || empty($c['ball'])) {
            return 'Missed it!';
        }
        // owner t237u: the jump adds to the interception chance; one try per pass
        $s['flight']['tried'][$side] = true;
        if ((float) $fl['roll'] >= min(self::JUMP_CAP, (int) $fl['risk'] + self::JUMP_BONUS)) {
            return 'Missed it!';
        }
        self::pickOff($s, $side, ['id' => $id, 'r' => $pick['r'], 'f' => $pick['f']], $now, false);
        return null;
    }

    /** $side's player takes the ball out of the air: a turnover (everyone comes back, t237u) or a touchdown. */
    private static function pickOff(array &$s, string $side, array $pick, int $now, bool $auto): void
    {
        $fl = $s['flight'];
        [$tr, $tf] = $fl['to'];
        $id = (string) $pick['id'];
        $s['board'][$tr][$tf]['ball'] = false;
        $s['board'][$tr][$tf]['held'] = 0;
        $j = $s['board'][$pick['r']][$pick['f']];
        $s['board'][$pick['r']][$pick['f']]['ball'] = true;
        $s['board'][$pick['r']][$pick['f']]['held'] = $j['kind'] === 'k' ? 1 : 0;
        $s['flight'] = null;
        $wasTd = $s['phase'] === 'tdpass' || $s['phase'] === 'steal';
        $s['phase'] = 'play';
        if ($wasTd) {
            $s['clockAt'] = $now;
        }
        $s['turn'] = $side;
        $s['turnAt'] = $now;
        $s['bonus'] = 0;
        $s['drive'][] = $now;
        self::event($s, 'intercept', $now, ['id' => $id, 'side' => $side, 'at2' => [$pick['r'], $pick['f']], 'from' => $fl['from'], 'auto' => $auto]);
        if (self::inEnd($side, $pick['r'])) {
            self::touchdown($s, $side, $id, $now + 700);
            return;
        }
        self::deadBall($s, $now, 650 + 1500, $pick['r'], $side, $side, 'Interception!', $side, true);
    }
}
