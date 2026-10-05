<?php

declare(strict_types=1);

namespace Morse;

use PDOException;
use Throwable;

/**
 * Port of src/lib/server/clubs.ts: chess clubs, join requests, mail, ready
 * check-ins, calls, club tournaments / enemy battles and the bracket chart.
 *
 * Passwords: new clubs use password_hash(). Clubs created by the old Node app
 * hold `saltHex:scryptHex`; those are verified with the pure-PHP Scrypt class
 * and silently upgraded to password_hash() on the first successful check.
 */
final class Clubs
{
    private const NAME_RE = "/^[A-Za-z0-9][A-Za-z0-9 _'-]{2,22}\$/D";
    private const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    private const MATCH_MS = 600000;

    private static bool $ensured = false;

    public static function register(): void
    {
        foreach ([
            'createChessClub' => 'createChessClub',
            'joinChessClub' => 'joinChessClub',
            'enterChessClub' => 'enterChessClub',
            'loadChessClub' => 'loadChessClub',
            'listJoinRequests' => 'listJoinRequests',
            'respondJoin' => 'respondJoin',
            'sendClubMail' => 'sendClubMail',
            'setClubReady' => 'setClubReady',
            'setClubBoard' => 'setClubBoard',
            'placeClubCall' => 'placeClubCall',
            'pollClubCalls' => 'pollClubCalls',
            'startOwnTournament' => 'startOwnTournament',
            'startEnemyBattle' => 'startEnemyBattle',
            'watchClubGame' => 'watchClubGame',
            'getBracket' => 'getBracket',
            'seatBracket' => 'seatBracket',
            'crownBracket' => 'crownBracket',
        ] as $rpc => $method) {
            Rpc::register($rpc, [self::class, $method]);
        }
    }

    // ── small helpers ──────────────────────────────────────────────────────

    /** String(x ?? "") */
    private static function str(mixed $v): string
    {
        if ($v === null || is_array($v)) {
            return '';
        }
        if (is_bool($v)) {
            return $v ? 'true' : 'false';
        }
        return (string) $v;
    }

    /** JS-ish trim (unicode whitespace). */
    private static function trim(string $s): string
    {
        return preg_replace('/^\s+|\s+$/u', '', $s) ?? $s;
    }

    private static function lc(string $s): string
    {
        return mb_strtolower($s);
    }

    private static function cleanName(string $raw): string
    {
        $name = self::trim($raw);
        $name = preg_replace('/\s+/u', ' ', $name) ?? $name;
        if (!preg_match(self::NAME_RE, $name)) {
            throw new RpcError('Club names are 3–23 letters, numbers, or spaces.');
        }
        return $name;
    }

    private static function cleanPassword(string $password): string
    {
        $len = mb_strlen($password);
        if ($len < 4 || $len > 64) {
            throw new RpcError('Password must be 4 to 64 characters.');
        }
        return $password;
    }

    private static function ensure(): void
    {
        if (self::$ensured) {
            return;
        }
        self::$ensured = true;
        Db::run(
            'UPDATE profiles SET coins = 100000000 WHERE username_lc = ? AND coins < 100000000',
            ['bily_super423']
        );
    }

    private static function hashPassword(string $password): string
    {
        // Pre-hashed (see Auth::hash) so bcrypt's 72-byte limit never silently truncates a 64-char password.
        return Auth::hash($password);
    }

    /** @param array<string,mixed> $club row with id + password_hash */
    private static function checkPassword(string $password, array $club): bool
    {
        $stored = (string) $club['password_hash'];
        if ($stored === '') {
            return false;
        }
        if ($stored[0] === '$') {
            if (Auth::verify($password, $stored)) {
                if (password_needs_rehash($stored, PASSWORD_DEFAULT)) {
                    Db::run('UPDATE chess_clubs SET password_hash = ? WHERE id = ?', [self::hashPassword($password), $club['id']]);
                }
                return true;
            }
            // Plain password_hash() of the raw password (older PHP-side format): accept and upgrade.
            if (password_verify($password, $stored)) {
                Db::run('UPDATE chess_clubs SET password_hash = ? WHERE id = ?', [self::hashPassword($password), $club['id']]);
                return true;
            }
            return false;
        }
        if (!Scrypt::verifyLegacy($password, $stored)) {
            return false;
        }
        Db::run('UPDATE chess_clubs SET password_hash = ? WHERE id = ?', [self::hashPassword($password), $club['id']]);
        return true;
    }

    private static function touch(string $userId): void
    {
        Db::run('UPDATE profiles SET last_seen = ? WHERE user_id = ?', [Db::now(), $userId]);
    }

    /** @return array<string,mixed>|null */
    private static function clubByName(string $name): ?array
    {
        return Db::one(
            'SELECT id, name, password_hash, host_user_id, board_id FROM chess_clubs WHERE name_lc = ? LIMIT 1',
            [self::lc(self::trim($name))]
        );
    }

    /** @return array<string,mixed>|null */
    private static function membership(string $clubId, string $userId): ?array
    {
        return Db::one('SELECT ready FROM chess_club_members WHERE club_id = ? AND user_id = ? LIMIT 1', [$clubId, $userId]);
    }

    /** @return list<string> */
    private static function ownedBoards(mixed $raw): array
    {
        return array_values(array_filter(explode(',', (string) ($raw ?? '')), static fn ($s) => $s !== ''));
    }

    /** @return array<string,mixed>|null */
    private static function profileBits(string $userId): ?array
    {
        return Db::one(
            'SELECT username, score, owned_boards, club_locked, coins, avatar_json FROM profiles WHERE user_id = ? LIMIT 1',
            [$userId]
        );
    }

    /** @return list<array<string,mixed>> */
    private static function seats(string $clubId, string $hostId): array
    {
        $rows = Db::all(
            'SELECT m.user_id, p.username, p.score, m.ready, p.last_seen, p.avatar_json
             FROM chess_club_members m
             JOIN profiles p ON p.user_id = m.user_id
             WHERE m.club_id = ?
             ORDER BY p.username ASC',
            [$clubId]
        );
        $now = Db::nowMs();
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'userId' => (string) $row['user_id'],
                'username' => (string) $row['username'],
                'score' => (int) $row['score'],
                'ready' => Db::bool($row['ready']),
                'online' => $now - Db::toMs($row['last_seen']) < 25000,
                'look' => (string) ($row['avatar_json'] ?? ''),
                'host' => (string) $row['user_id'] === $hostId,
            ];
        }
        return $out;
    }

    /** @param list<array<string,mixed>> $members */
    private static function readyAll(array $members): bool
    {
        if (count($members) < 2) {
            return false;
        }
        foreach ($members as $seat) {
            if (!$seat['online'] || !$seat['ready']) {
                return false;
            }
        }
        return true;
    }

    // ── events ─────────────────────────────────────────────────────────────

    /** @return array<string,mixed> */
    private static function emptyEvent(): array
    {
        return [
            'id' => '',
            'kind' => 'internal',
            'phase' => 'live',
            'boardId' => 'lodge',
            'gameIds' => [],
            'deadline' => 0,
            'champId' => null,
            'queue' => [],
            'cursor' => 0,
            'home' => ['clubId' => '', 'name' => '', 'roster' => [], 'lost' => []],
            'foe' => null,
            'series' => null,
            'winnerId' => null,
            'winnerName' => null,
            'winnerClubId' => null,
            'pairKey' => null,
            'settled' => [],
        ];
    }

    /** @return array<string,mixed> */
    private static function parseEvent(string $raw, string $id): array
    {
        $parsed = json_decode($raw, true);
        if (!is_array($parsed)) {
            return array_merge(self::emptyEvent(), ['id' => $id]);
        }
        $event = array_merge(self::emptyEvent(), $parsed, [
            'id' => $id,
            'settled' => isset($parsed['settled']) && is_array($parsed['settled']) ? array_values($parsed['settled']) : [],
        ]);
        foreach (['home'] as $k) {
            if (!is_array($event[$k])) {
                $event[$k] = self::emptyEvent()[$k];
            }
        }
        foreach (['gameIds', 'queue'] as $k) {
            if (!is_array($event[$k])) {
                $event[$k] = [];
            }
        }
        return $event;
    }

    /** @return array<string,mixed>|null */
    private static function activeEvent(string $clubId, bool $lock = false): ?array
    {
        $rows = Db::all(
            'SELECT id, state FROM chess_club_events
             WHERE club_id = ? OR INSTR(state, ?) > 0
             ORDER BY updated_at DESC
             LIMIT 8' . ($lock ? Db::forUpdate() : ''),
            [$clubId, $clubId]
        );
        foreach ($rows as $row) {
            $event = self::parseEvent((string) $row['state'], (string) $row['id']);
            if (($event['home']['clubId'] ?? null) === $clubId || (($event['foe']['clubId'] ?? null) === $clubId)) {
                return $event;
            }
        }
        return null;
    }

    /** @param array<string,mixed> $event */
    private static function encode(array $event): string
    {
        return (string) json_encode($event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    /** @param array<string,mixed> $event */
    private static function saveEvent(array $event): void
    {
        Db::upsert('chess_club_events', [
            'id' => $event['id'],
            'club_id' => $event['home']['clubId'],
            'kind' => $event['kind'],
            'state' => self::encode($event),
            'updated_at' => Db::now(),
        ], ['id'], ['state', 'updated_at']);
    }

    /** @return array<string,mixed>|null */
    private static function gameRow(string $id): ?array
    {
        return Db::one(
            'SELECT id, fen, status, winner_user_id, white_user_id, black_user_id, turn, last_move_from, last_move_to, last_move_san
             FROM games WHERE id = ? LIMIT 1',
            [$id]
        );
    }

    /** Piece-value sum for one colour, read straight off the FEN placement. */
    private static function material(string $fen, string $color): int
    {
        $values = ['p' => 1, 'n' => 3, 'b' => 3, 'r' => 5, 'q' => 9, 'k' => 0];
        $placement = explode(' ', $fen)[0];
        $score = 0;
        foreach (str_split($placement) as $ch) {
            if (!ctype_alpha($ch)) {
                continue;
            }
            $isWhite = ctype_upper($ch);
            if (($color === 'w') === $isWhite) {
                $score += $values[strtolower($ch)] ?? 0;
            }
        }
        return $score;
    }

    /** @param array<string,mixed> $event @return array<string,mixed> */
    private static function maybeExpire(array $event): array
    {
        if ($event['phase'] === 'crowned' || !$event['deadline'] || Db::nowMs() < (int) $event['deadline']) {
            return $event;
        }
        foreach ($event['gameIds'] as $id) {
            $game = self::gameRow((string) $id);
            if (!$game || $game['status'] !== 'active') {
                continue;
            }
            $white = self::material((string) $game['fen'], 'w');
            $black = self::material((string) $game['fen'], 'b');
            $winner = $white === $black ? null : ($white > $black ? $game['white_user_id'] : $game['black_user_id']);
            self::seal((string) $id, $winner === null ? null : (string) $winner);
        }
        $event['deadline'] = 0;
        return $event;
    }

    /**
     * @param list<array<string,mixed>> $roster
     * @param list<string> $lost
     * @return list<array<string,mixed>>
     */
    private static function undefeated(array $roster, array $lost): array
    {
        return array_values(array_filter($roster, static fn ($s) => !in_array($s['userId'], $lost, true)));
    }

    private static function openPair(string $a, string $b): string
    {
        $id = Util::uuid();
        $white = Util::chance(0.5) ? $a : $b;
        $black = $white === $a ? $b : $a;
        $now = Db::now();
        Db::run(
            "INSERT INTO games (id, white_user_id, black_user_id, mode, fen, status, turn, turn_started_at, created_at,
                white_clock_ms, black_clock_ms, pull)
             VALUES (?, ?, ?, 'timed', ?, 'active', 'w', ?, ?, ?, ?, 0)",
            [$id, $white, $black, self::START_FEN, $now, $now, self::MATCH_MS, self::MATCH_MS]
        );
        return $id;
    }

    private static function seal(string $gameId, ?string $winnerUserId): void
    {
        $game = self::gameRow($gameId);
        if (!$game || $game['status'] !== 'active') {
            return;
        }
        $status = !$winnerUserId ? 'draw' : ($winnerUserId === $game['white_user_id'] ? 'white_win' : 'black_win');
        $changed = Db::run(
            "UPDATE games SET status = ?, winner_user_id = ?, scored = 1 WHERE id = ? AND status = 'active'",
            [$status, $winnerUserId, $gameId]
        );
        if ($changed === 0 || !$winnerUserId) {
            return;
        }
        $loser = $winnerUserId === $game['white_user_id'] ? $game['black_user_id'] : $game['white_user_id'];
        Db::run('UPDATE profiles SET score = score + 8 WHERE user_id = ?', [$winnerUserId]);
        Db::run('UPDATE profiles SET score = CASE WHEN score - 8 < 100 THEN 100 ELSE score - 8 END WHERE user_id = ?', [$loser]);
        $style = Db::value('SELECT piece_style FROM profiles WHERE user_id = ? LIMIT 1', [$winnerUserId]);
        if (($style ?: '3d') === '3d') {
            Db::run('UPDATE profiles SET coins = coins + 1 WHERE user_id = ?', [$winnerUserId]);
        }
    }

    private static function seatName(array $queue, mixed $id): string
    {
        foreach ($queue as $seat) {
            if ($seat['userId'] === $id) {
                return (string) $seat['username'];
            }
        }
        return 'The king';
    }

    /** @param array<string,mixed> $event @return array<string,mixed> */
    private static function advance(array $event): array
    {
        $event = self::maybeExpire($event);
        $games = [];
        foreach ($event['gameIds'] as $id) {
            $games[] = self::gameRow((string) $id);
        }
        foreach ($games as $g) {
            if ($g && $g['status'] === 'active') {
                return $event;
            }
        }
        $games = array_values(array_filter($games));

        if ($event['kind'] === 'internal') {
            $finished = array_values(array_filter($games, static fn ($g) => $g['status'] !== 'active'));
            $last = $finished ? $finished[count($finished) - 1] : null;
            if ($last && !in_array($last['id'], $event['settled'], true)) {
                $event['settled'][] = $last['id'];
                if ($last['winner_user_id']) {
                    $event['champId'] = $last['winner_user_id'];
                } else {
                    $event['phase'] = 'crowned';
                    $event['winnerId'] = $event['champId'];
                    $event['winnerName'] = self::seatName($event['queue'], $event['champId']);
                    return $event;
                }
            }
            if ($event['cursor'] < count($event['queue']) && $event['champId']) {
                $next = $event['queue'][$event['cursor']] ?? null;
                $event['cursor'] += 1;
                if ($next && $next['userId'] !== $event['champId']) {
                    $id = self::openPair((string) $event['champId'], (string) $next['userId']);
                    $event['gameIds'] = [$id];
                    $event['deadline'] = Db::nowMs() + self::MATCH_MS;
                    return $event;
                }
            }
            if ($event['champId'] && $event['cursor'] >= count($event['queue'])) {
                $event['phase'] = 'crowned';
                $event['winnerId'] = $event['champId'];
                $event['winnerName'] = self::seatName($event['queue'], $event['champId']);
                $event['gameIds'] = [];
            }
            return $event;
        }

        if (!is_array($event['foe'])) {
            return $event;
        }
        $homeIds = array_map(static fn ($s) => $s['userId'], $event['home']['roster']);
        foreach ($games as $game) {
            if ($game['status'] === 'active' || in_array($game['id'], $event['settled'], true)) {
                continue;
            }
            $event['settled'][] = $game['id'];
            $winner = $game['winner_user_id'];
            $loser = $winner === null ? null : ($winner === $game['white_user_id'] ? $game['black_user_id'] : $game['white_user_id']);
            if (!$loser) {
                continue;
            }
            if (is_array($event['series'])) {
                if ($winner === $event['series']['homeId']) {
                    $event['series']['homeWins'] += 1;
                } elseif ($winner === $event['series']['foeId']) {
                    $event['series']['foeWins'] += 1;
                }
                $event['series']['played'] += 1;
            }
            if (in_array($loser, $homeIds, true)) {
                if (!in_array($loser, $event['home']['lost'], true)) {
                    $event['home']['lost'][] = $loser;
                }
            } elseif (!in_array($loser, $event['foe']['lost'], true)) {
                $event['foe']['lost'][] = $loser;
            }
        }

        if (is_array($event['series'])) {
            $s = $event['series'];
            if ($s['played'] >= 3 || $s['homeWins'] >= 2 || $s['foeWins'] >= 2) {
                $homeWon = $s['homeWins'] >= $s['foeWins'];
                $event['phase'] = 'crowned';
                $event['winnerClubId'] = $homeWon ? $event['home']['clubId'] : $event['foe']['clubId'];
                $event['winnerName'] = $homeWon ? $event['home']['name'] : $event['foe']['name'];
                $event['winnerId'] = $homeWon ? $s['homeId'] : $s['foeId'];
                $event['gameIds'] = [];
                return $event;
            }
            $id = self::openPair((string) $s['homeId'], (string) $s['foeId']);
            $event['gameIds'] = [$id];
            $event['deadline'] = Db::nowMs() + self::MATCH_MS;
            return $event;
        }

        $foe = $event['foe'];
        $homeLeft = self::undefeated($event['home']['roster'], $event['home']['lost']);
        $foeLeft = self::undefeated($foe['roster'], $foe['lost']);
        if (!$homeLeft || !$foeLeft) {
            if (count($event['home']['roster']) !== count($foe['roster']) && count($homeLeft) + count($foeLeft) > 0) {
                $homeId = $homeLeft[0]['userId'] ?? $event['champId'] ?? ($event['home']['roster'][0]['userId'] ?? null);
                $foeId = $foeLeft[0]['userId'] ?? null;
                if ($foeId === null) {
                    foreach ($foe['roster'] as $seat) {
                        if (!in_array($seat['userId'], $event['home']['lost'], true)) {
                            $foeId = $seat['userId'];
                            break;
                        }
                    }
                }
                $foeId ??= $foe['roster'][0]['userId'] ?? null;
                if ($homeId && $foeId) {
                    $event['phase'] = 'series';
                    $event['series'] = [
                        'homeId' => $homeId,
                        'foeId' => $foeId,
                        'homeWins' => $homeLeft ? 1 : 0,
                        'foeWins' => $foeLeft ? 1 : 0,
                        'played' => 0,
                    ];
                    $id = self::openPair((string) $homeId, (string) $foeId);
                    $event['gameIds'] = [$id];
                    $event['deadline'] = Db::nowMs() + self::MATCH_MS;
                    return $event;
                }
            }
            $event['phase'] = 'crowned';
            $homeWon = count($homeLeft) > 0;
            $event['winnerClubId'] = $homeWon ? $event['home']['clubId'] : $foe['clubId'];
            $event['winnerName'] = $homeWon ? $event['home']['name'] : $foe['name'];
            $event['winnerId'] = ($homeWon ? ($homeLeft[0] ?? null) : ($foeLeft[0] ?? null))['userId'] ?? null;
            $event['gameIds'] = [];
            return $event;
        }

        $take = min(2, count($homeLeft), count($foeLeft));
        $ids = [];
        for ($i = 0; $i < $take; $i++) {
            $ids[] = self::openPair((string) $homeLeft[$i]['userId'], (string) $foeLeft[$i]['userId']);
        }
        $event['gameIds'] = $ids;
        $event['deadline'] = Db::nowMs() + self::MATCH_MS;
        return $event;
    }

    // ── state pack ─────────────────────────────────────────────────────────

    /** @return array<string,mixed> */
    private static function pack(string $userId, ?string $clubId): array
    {
        self::touch($userId);
        $me = self::profileBits($userId);
        $common = [
            'locked' => Db::bool($me['club_locked'] ?? false),
            'ownedBoards' => self::ownedBoards($me['owned_boards'] ?? ''),
            'score' => (int) ($me['score'] ?? 0),
            'coins' => (int) ($me['coins'] ?? 0),
            'look' => (string) ($me['avatar_json'] ?? ''),
            'username' => (string) ($me['username'] ?? ''),
        ];
        if (!$clubId) {
            return array_merge(['club' => null, 'members' => [], 'messages' => [], 'requests' => [], 'event' => null], $common);
        }
        $club = Db::one('SELECT id, name, host_user_id, board_id FROM chess_clubs WHERE id = ? LIMIT 1', [$clubId]);
        if (!$club) {
            throw new RpcError('That chess club is gone.');
        }
        if (!self::membership((string) $club['id'], $userId)) {
            throw new RpcError('You are not in that chess club.');
        }
        $event = self::activeEvent((string) $club['id']);
        if ($event && $event['phase'] !== 'crowned') {
            $event = Db::transaction(static function () use ($club): ?array {
                // Re-read under a row lock so two polls cannot both open the next game.
                $fresh = self::activeEvent((string) $club['id'], true);
                if (!$fresh || $fresh['phase'] === 'crowned') {
                    return $fresh;
                }
                $next = self::advance($fresh);
                if (self::encode($next) !== self::encode($fresh)) {
                    self::saveEvent($next);
                }
                return $next;
            });
        }
        $members = self::seats((string) $club['id'], (string) $club['host_user_id']);
        $messages = Db::all(
            'SELECT m.id, m.from_user_id, m.to_user_id, m.body, m.created_at, p.username
             FROM chess_club_messages m
             JOIN profiles p ON p.user_id = m.from_user_id
             WHERE m.club_id = ?
               AND (m.to_user_id IS NULL OR m.to_user_id = ? OR m.from_user_id = ?)
             ORDER BY m.created_at ASC
             LIMIT 200',
            [$club['id'], $userId, $userId]
        );
        $isHost = $club['host_user_id'] === $userId;
        $requests = $isHost
            ? Db::all(
                "SELECT r.id, r.user_id, p.username
                 FROM chess_club_requests r
                 JOIN profiles p ON p.user_id = r.user_id
                 WHERE r.club_id = ? AND r.status = 'pending'
                 ORDER BY r.created_at ASC",
                [$club['id']]
            )
            : [];
        return array_merge([
            'club' => [
                'id' => (string) $club['id'],
                'name' => (string) $club['name'],
                'hostId' => (string) $club['host_user_id'],
                'boardId' => ($club['board_id'] ?? '') ?: 'lodge',
                'youHost' => $isHost,
            ],
            'members' => $members,
            'messages' => array_map(static fn ($row) => [
                'id' => (string) $row['id'],
                'fromId' => (string) $row['from_user_id'],
                'fromName' => (string) $row['username'],
                'toId' => $row['to_user_id'] === null ? null : (string) $row['to_user_id'],
                'body' => (string) $row['body'],
                'at' => Db::iso($row['created_at']),
            ], $messages),
            'requests' => array_map(static fn ($row) => [
                'id' => (string) $row['id'],
                'userId' => (string) $row['user_id'],
                'username' => (string) $row['username'],
            ], $requests),
            'event' => $event,
        ], $common);
    }

    // ── handlers ───────────────────────────────────────────────────────────

    /** @param array<string,mixed> $data */
    public static function createChessClub(string $userId, array $data): mixed
    {
        $name = self::cleanName(self::str($data['name'] ?? ''));
        $password = self::cleanPassword(self::str($data['password'] ?? ''));
        self::ensure();
        if (!self::profileBits($userId)) {
            throw new RpcError('Claim a username before you found a chess club.');
        }
        $id = Util::uuid();
        Db::transaction(static function () use ($name, $password, $userId, $id): void {
            if (self::clubByName($name)) {
                throw new RpcError('A chess club already wears that name.');
            }
            $now = Db::now();
            try {
                Db::run(
                    'INSERT INTO chess_clubs (id, name, name_lc, password_hash, host_user_id, board_id, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [$id, $name, self::lc($name), self::hashPassword($password), $userId, 'lodge', $now]
                );
            } catch (PDOException $e) {
                throw new RpcError('A chess club already wears that name.');
            }
            Db::run('INSERT INTO chess_club_members (club_id, user_id, ready, joined_at) VALUES (?, ?, 0, ?)', [$id, $userId, $now]);
            Db::run('UPDATE profiles SET club_locked = 0 WHERE user_id = ?', [$userId]);
        });
        return self::pack($userId, $id);
    }

    /** @param array<string,mixed> $data */
    public static function joinChessClub(string $userId, array $data): mixed
    {
        $name = self::cleanName(self::str($data['name'] ?? ''));
        $password = self::cleanPassword(self::str($data['password'] ?? ''));
        self::ensure();
        $club = self::clubByName($name);
        if (!$club || !self::checkPassword($password, $club)) {
            throw new RpcError('That club name and password do not match.');
        }
        if (self::membership((string) $club['id'], $userId)) {
            return ['ok' => true, 'already' => true, 'clubName' => (string) $club['name']];
        }
        $pending = Db::one(
            "SELECT id FROM chess_club_requests WHERE club_id = ? AND user_id = ? AND status = 'pending' LIMIT 1",
            [$club['id'], $userId]
        );
        if (!$pending) {
            Db::run(
                "INSERT INTO chess_club_requests (id, club_id, user_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
                [Util::uuid(), $club['id'], $userId, Db::now()]
            );
        }
        return ['ok' => true, 'already' => false, 'clubName' => (string) $club['name']];
    }

    /** @param array<string,mixed> $data */
    public static function enterChessClub(string $userId, array $data): mixed
    {
        $name = self::trim(self::str($data['name'] ?? ''));
        $password = self::str($data['password'] ?? '');
        self::ensure();
        $club = $name !== '' ? self::clubByName($name) : null;
        if (!$club) {
            Db::run('UPDATE profiles SET club_locked = 1 WHERE user_id = ?', [$userId]);
            return [
                'ok' => false,
                'sorry' => true,
                'error' => 'So sorry. That chess club does not exist. You cannot enter a chess club until the name and password belong to a real one.',
            ];
        }
        $member = self::membership((string) $club['id'], $userId);
        if (!self::checkPassword($password, $club)) {
            return ['ok' => false, 'sorry' => false, 'error' => 'That password does not open this chess club.'];
        }
        Db::run('UPDATE profiles SET club_locked = 0 WHERE user_id = ?', [$userId]);
        if (!$member) {
            return ['ok' => false, 'sorry' => false, 'error' => 'You have not been welcomed into that chess club.'];
        }
        return ['ok' => true, 'state' => self::pack($userId, (string) $club['id'])];
    }

    /** @param array<string,mixed> $data */
    public static function loadChessClub(string $userId, array $data): mixed
    {
        self::ensure();
        $clubId = !empty($data['clubId']) ? self::str($data['clubId']) : '';
        $me = self::profileBits($userId);
        if (Db::bool($me['club_locked'] ?? false)) {
            return self::pack($userId, null);
        }
        if ($clubId === '') {
            $clubId = (string) (Db::value(
                'SELECT club_id FROM chess_club_members WHERE user_id = ? ORDER BY joined_at DESC LIMIT 1',
                [$userId]
            ) ?? '');
        }
        if ($clubId === '') {
            return self::pack($userId, null);
        }
        try {
            return self::pack($userId, $clubId);
        } catch (Throwable $e) {
            if (!$e instanceof RpcError) {
                error_log('[loadChessClub] ' . $e->getMessage());
            }
            return self::pack($userId, null);
        }
    }

    /** @param array<string,mixed> $data */
    public static function listJoinRequests(string $userId, array $data): mixed
    {
        self::ensure();
        $rows = Db::all(
            "SELECT r.id, p.username, c.name AS club_name
             FROM chess_club_requests r
             JOIN chess_clubs c ON c.id = r.club_id
             JOIN profiles p ON p.user_id = r.user_id
             WHERE c.host_user_id = ? AND r.status = 'pending'
             ORDER BY r.created_at ASC",
            [$userId]
        );
        return array_map(static fn ($row) => [
            'id' => (string) $row['id'],
            'username' => (string) $row['username'],
            'clubName' => (string) $row['club_name'],
        ], $rows);
    }

    /** @param array<string,mixed> $data */
    public static function respondJoin(string $userId, array $data): mixed
    {
        $id = self::str($data['id'] ?? '');
        $welcome = ($data['welcome'] ?? null) === true;
        self::ensure();
        return Db::transaction(static function () use ($userId, $id, $welcome): array {
            $row = Db::one(
                "SELECT r.id, r.club_id, r.user_id, c.host_user_id
                 FROM chess_club_requests r
                 JOIN chess_clubs c ON c.id = r.club_id
                 WHERE r.id = ? AND r.status = 'pending' LIMIT 1" . Db::forUpdate(),
                [$id]
            );
            if (!$row || $row['host_user_id'] !== $userId) {
                throw new RpcError('That request is not yours to answer.');
            }
            if ($welcome) {
                Db::insertIgnore('chess_club_members', [
                    'club_id' => $row['club_id'],
                    'user_id' => $row['user_id'],
                    'ready' => 0,
                    'joined_at' => Db::now(),
                ]);
                Db::run("UPDATE chess_club_requests SET status = 'welcomed' WHERE id = ?", [$row['id']]);
            } else {
                Db::run("UPDATE chess_club_requests SET status = 'declined' WHERE id = ?", [$row['id']]);
            }
            return ['ok' => true];
        });
    }

    /** @param array<string,mixed> $data */
    public static function sendClubMail(string $userId, array $data): mixed
    {
        $clubId = self::str($data['clubId'] ?? '');
        $toId = !empty($data['toId']) ? self::str($data['toId']) : null;
        $body = mb_substr(self::trim(self::str($data['body'] ?? '')), 0, 500);
        if ($body === '') {
            throw new RpcError('Write something first.');
        }
        self::ensure();
        if (!self::membership($clubId, $userId)) {
            throw new RpcError('You are not in that chess club.');
        }
        if ($toId && $toId !== 'EVERY' && !self::membership($clubId, $toId)) {
            throw new RpcError('That player is not in the club.');
        }
        $to = (!$toId || $toId === 'EVERY') ? null : $toId;
        Db::run(
            'INSERT INTO chess_club_messages (id, club_id, from_user_id, to_user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [Util::uuid(), $clubId, $userId, $to, $body, Db::now()]
        );
        return ['ok' => true];
    }

    /** @param array<string,mixed> $data */
    public static function setClubReady(string $userId, array $data): mixed
    {
        self::ensure();
        Db::run(
            'UPDATE chess_club_members SET ready = ? WHERE club_id = ? AND user_id = ?',
            [($data['ready'] ?? null) === true ? 1 : 0, self::str($data['clubId'] ?? ''), $userId]
        );
        return ['ok' => true];
    }

    /** @param array<string,mixed> $data */
    public static function setClubBoard(string $userId, array $data): mixed
    {
        $clubId = self::str($data['clubId'] ?? '');
        $boardId = self::str($data['boardId'] ?? '');
        self::ensure();
        $host = Db::value('SELECT host_user_id FROM chess_clubs WHERE id = ? LIMIT 1', [$clubId]);
        if ($host !== $userId) {
            throw new RpcError('Only the host changes the club board.');
        }
        $me = self::profileBits($userId);
        $owned = self::ownedBoards($me['owned_boards'] ?? '');
        $board = Catalog::boardById($boardId);
        if (!Catalog::boardUnlocked((int) ($me['score'] ?? 0), $board, $owned)) {
            throw new RpcError('The host does not own that board.');
        }
        Db::run('UPDATE chess_clubs SET board_id = ? WHERE id = ?', [$board['id'], $clubId]);
        return ['ok' => true, 'boardId' => $board['id']];
    }

    /** @param array<string,mixed> $data */
    public static function placeClubCall(string $userId, array $data): mixed
    {
        $clubId = self::str($data['clubId'] ?? '');
        $toId = self::str($data['toId'] ?? '');
        self::ensure();
        if (!self::membership($clubId, $userId)) {
            throw new RpcError('You are not in that chess club.');
        }
        if (!self::membership($clubId, $toId)) {
            throw new RpcError('That player is not in the club.');
        }
        $id = Util::uuid();
        Db::run(
            'INSERT INTO chess_club_calls (id, club_id, from_user_id, to_user_id, created_at) VALUES (?, ?, ?, ?, ?)',
            [$id, $clubId, $userId, $toId, Db::now()]
        );
        return ['id' => $id];
    }

    /** @param array<string,mixed> $data */
    public static function pollClubCalls(string $userId, array $data): mixed
    {
        self::ensure();
        $rows = Db::all(
            'SELECT c.id, c.from_user_id, c.to_user_id, p.username, c.created_at
             FROM chess_club_calls c
             JOIN profiles p ON p.user_id = c.from_user_id
             WHERE c.club_id = ?
               AND (c.to_user_id = ? OR c.from_user_id = ?)
               AND c.created_at > ?
             ORDER BY c.created_at DESC
             LIMIT 4',
            [self::str($data['clubId'] ?? ''), $userId, $userId, Db::ts(Db::nowMs() - 70000)]
        );
        return array_map(static fn ($row) => [
            'id' => (string) $row['id'],
            'fromId' => (string) $row['from_user_id'],
            'toId' => (string) $row['to_user_id'],
            'fromName' => (string) $row['username'],
            'at' => Db::toMs($row['created_at']),
        ], $rows);
    }

    /** Serialise starts per club so two clicks cannot open two matches. */
    private static function lockClub(string $clubId): void
    {
        Db::one('SELECT id FROM chess_clubs WHERE id = ? LIMIT 1' . Db::forUpdate(), [$clubId]);
    }

    /** @param array<string,mixed> $data */
    public static function startOwnTournament(string $userId, array $data): mixed
    {
        $clubId = self::str($data['clubId'] ?? '');
        self::ensure();
        return Db::transaction(static function () use ($userId, $clubId): array {
            self::lockClub($clubId);
            $state = self::pack($userId, $clubId);
            if (!$state['club']) {
                throw new RpcError('Enter the chess club first.');
            }
            if (!self::readyAll($state['members'])) {
                throw new RpcError('Every player must be online and checked in.');
            }
            if ($state['event'] && $state['event']['phase'] !== 'crowned') {
                throw new RpcError('A match is already on the club board.');
            }
            $queue = $state['members'];
            usort($queue, static function ($a, $b) {
                return ($a['score'] <=> $b['score']) ?: (strcasecmp($a['username'], $b['username']) ?: strcmp($a['username'], $b['username']));
            });
            $gameId = self::openPair($queue[0]['userId'], $queue[1]['userId']);
            $event = array_merge(self::emptyEvent(), [
                'id' => Util::uuid(),
                'kind' => 'internal',
                'phase' => 'live',
                'boardId' => $state['club']['boardId'],
                'gameIds' => [$gameId],
                'deadline' => Db::nowMs() + self::MATCH_MS,
                'queue' => array_map(static fn ($s) => ['userId' => $s['userId'], 'username' => $s['username'], 'score' => $s['score']], $queue),
                'cursor' => 2,
                'home' => [
                    'clubId' => $state['club']['id'],
                    'name' => $state['club']['name'],
                    'roster' => array_map(static fn ($s) => ['userId' => $s['userId'], 'username' => $s['username']], $queue),
                    'lost' => [],
                ],
            ]);
            self::saveEvent($event);
            return $event;
        });
    }

    /** @param array<string,mixed> $data */
    public static function startEnemyBattle(string $userId, array $data): mixed
    {
        $clubId = self::str($data['clubId'] ?? '');
        $foeName = self::cleanName(self::str($data['foeName'] ?? ''));
        $pairKey = !empty($data['pairKey']) ? self::str($data['pairKey']) : '';
        self::ensure();
        return Db::transaction(static function () use ($userId, $clubId, $foeName, $pairKey): array {
            self::lockClub($clubId);
            $state = self::pack($userId, $clubId);
            if (!$state['club']) {
                throw new RpcError('Enter the chess club first.');
            }
            if (!self::readyAll($state['members'])) {
                throw new RpcError('Your whole club must be online and checked in.');
            }
            $foeClub = self::clubByName($foeName);
            if (!$foeClub) {
                throw new RpcError('That enemy chess club does not exist.');
            }
            if ($foeClub['id'] === $state['club']['id']) {
                throw new RpcError('A club cannot be its own enemy. Seat it twice on the bracket only when the chart needs that match.');
            }
            $foeSeats = self::seats((string) $foeClub['id'], (string) $foeClub['host_user_id']);
            if (!self::readyAll($foeSeats)) {
                throw new RpcError('The enemy club is not all online and checked in.');
            }
            $slim = static fn (array $rows) => array_map(static fn ($s) => ['userId' => $s['userId'], 'username' => $s['username']], $rows);
            $homeRoster = $slim($state['members']);
            $foeRoster = $slim($foeSeats);
            $take = min(2, count($homeRoster), count($foeRoster));
            $gameIds = [];
            for ($i = 0; $i < $take; $i++) {
                $gameIds[] = self::openPair($homeRoster[$i]['userId'], $foeRoster[$i]['userId']);
            }
            $event = array_merge(self::emptyEvent(), [
                'id' => Util::uuid(),
                'kind' => 'enemy',
                'phase' => 'live',
                'boardId' => $state['club']['boardId'],
                'gameIds' => $gameIds,
                'deadline' => Db::nowMs() + self::MATCH_MS,
                'home' => ['clubId' => $state['club']['id'], 'name' => $state['club']['name'], 'roster' => $homeRoster, 'lost' => []],
                'foe' => ['clubId' => (string) $foeClub['id'], 'name' => (string) $foeClub['name'], 'roster' => $foeRoster, 'lost' => []],
                'pairKey' => $pairKey !== '' ? $pairKey : null,
            ]);
            self::saveEvent($event);
            return $event;
        });
    }

    /** @param array<string,mixed> $data */
    public static function watchClubGame(string $userId, array $data): mixed
    {
        self::ensure();
        $game = self::gameRow(self::str($data['gameId'] ?? ''));
        if (!$game) {
            return null;
        }
        $moves = Db::all('SELECT san, from_sq, to_sq FROM game_moves WHERE game_id = ? ORDER BY ply ASC', [$game['id']]);
        $looks = Db::all(
            'SELECT user_id, avatar_json FROM profiles WHERE user_id = ? OR user_id = ?',
            [$game['white_user_id'], $game['black_user_id']]
        );
        $lookOf = static function (string $id) use ($looks): string {
            foreach ($looks as $row) {
                if ($row['user_id'] === $id) {
                    return (string) ($row['avatar_json'] ?? '');
                }
            }
            return '';
        };
        return [
            'id' => (string) $game['id'],
            'fen' => (string) $game['fen'],
            'status' => (string) $game['status'],
            'turn' => (string) $game['turn'],
            'whiteId' => (string) $game['white_user_id'],
            'blackId' => (string) $game['black_user_id'],
            'winnerId' => $game['winner_user_id'] === null ? null : (string) $game['winner_user_id'],
            'whiteLook' => $lookOf((string) $game['white_user_id']),
            'blackLook' => $lookOf((string) $game['black_user_id']),
            'you' => $game['white_user_id'] === $userId ? 'w' : ($game['black_user_id'] === $userId ? 'b' : null),
            'lastMove' => ($game['last_move_from'] && $game['last_move_to'])
                ? ['from' => (string) $game['last_move_from'], 'to' => (string) $game['last_move_to'], 'san' => $game['last_move_san']]
                : null,
            'moves' => array_map(static fn ($m) => ['san' => (string) $m['san'], 'from' => (string) $m['from_sq'], 'to' => (string) $m['to_sq']], $moves),
        ];
    }

    // ── bracket ────────────────────────────────────────────────────────────

    /** @return array{rounds:list<list<array<string,mixed>>>} */
    private static function freshBracket(): array
    {
        $round = static fn (int $n) => array_fill(0, $n, ['clubId' => null, 'name' => null]);
        return ['rounds' => [$round(8), $round(4), $round(2), $round(1)]];
    }

    /** @return array<string,mixed> */
    private static function readBracket(bool $lock = false): array
    {
        $payload = Db::value("SELECT payload FROM club_bracket WHERE id = 'live' LIMIT 1" . ($lock ? Db::forUpdate() : ''));
        if ($payload === null) {
            return self::freshBracket();
        }
        $decoded = json_decode((string) $payload, true);
        return is_array($decoded) && isset($decoded['rounds']) && is_array($decoded['rounds']) ? $decoded : self::freshBracket();
    }

    /** @param array<string,mixed> $bracket */
    private static function writeBracket(array $bracket): void
    {
        Db::upsert('club_bracket', [
            'id' => 'live',
            'payload' => self::encode($bracket),
            'updated_at' => Db::now(),
        ], ['id'], ['payload', 'updated_at']);
    }

    /** Number(x) || 0, as an array index (non-integers never match). */
    private static function index(mixed $v): int
    {
        $n = is_numeric($v) ? (float) $v : 0.0;
        if (!is_finite($n) || $n != floor($n)) {
            return -1;
        }
        return (int) $n;
    }

    /** @param array<string,mixed> $data */
    public static function getBracket(string $userId, array $data): mixed
    {
        self::ensure();
        return self::readBracket();
    }

    /** @param array<string,mixed> $data */
    public static function seatBracket(string $userId, array $data): mixed
    {
        $clubId = self::str($data['clubId'] ?? '');
        $roundIdx = self::index($data['round'] ?? 0);
        $slotIdx = self::index($data['slot'] ?? 0);
        self::ensure();
        $state = self::pack($userId, $clubId);
        if (!$state['club'] || !$state['club']['youHost']) {
            throw new RpcError('Only the host seats the club on the chart.');
        }
        $mine = $state['club']['id'];
        return Db::transaction(static function () use ($roundIdx, $slotIdx, $state, $mine): array {
            $bracket = self::readBracket(true);
            $round = $bracket['rounds'][$roundIdx] ?? null;
            if (!is_array($round) || !isset($round[$slotIdx]) || $slotIdx < 0) {
                throw new RpcError('That slot is not on the chart.');
            }
            $other = $round[$slotIdx % 2 === 0 ? $slotIdx + 1 : $slotIdx - 1] ?? null;
            $already = count(array_filter($round, static fn ($s) => ($s['clubId'] ?? null) === $mine));
            if (($other['clubId'] ?? null) === $mine) {
                // a club may meet itself only in a chart match that still needs both names
            } elseif ($already && ($round[$slotIdx]['clubId'] ?? null) !== $mine) {
                $needed = false;
                foreach ($round as $index => $slot) {
                    if ($index % 2 === 0 && ($slot['clubId'] ?? null) && (($round[$index + 1]['clubId'] ?? null) === $slot['clubId'])) {
                        $needed = true;
                        break;
                    }
                }
                if (!$needed && $already >= 1 && ($other['clubId'] ?? null) !== $mine) {
                    throw new RpcError('Your club can meet the same club only in the match the chart still needs.');
                }
            }
            $bracket['rounds'][$roundIdx][$slotIdx] = ['clubId' => $mine, 'name' => $state['club']['name']];
            self::writeBracket($bracket);
            return $bracket;
        });
    }

    /** @param array<string,mixed> $data */
    public static function crownBracket(string $userId, array $data): mixed
    {
        $clubId = self::str($data['clubId'] ?? '');
        $roundIdx = self::index($data['round'] ?? 0);
        $slotIdx = self::index($data['slot'] ?? 0);
        self::ensure();
        $state = self::pack($userId, $clubId);
        if (!$state['club']) {
            throw new RpcError('Enter your chess club first.');
        }
        $event = $state['event'];
        if (!$event || $event['phase'] !== 'crowned' || !$event['winnerName']) {
            throw new RpcError('Finish the battle before the chart moves.');
        }
        return Db::transaction(static function () use ($roundIdx, $slotIdx, $event): array {
            $bracket = self::readBracket(true);
            if (!isset($bracket['rounds'][$roundIdx + 1])) {
                return $bracket;
            }
            $pairStart = $slotIdx - (($slotIdx % 2 + 2) % 2);
            $nextSlot = (int) floor($pairStart / 2);
            $bracket['rounds'][$roundIdx + 1][$nextSlot] = ['clubId' => $event['winnerClubId'], 'name' => $event['winnerName']];
            self::writeBracket($bracket);
            return $bracket;
        });
    }
}
