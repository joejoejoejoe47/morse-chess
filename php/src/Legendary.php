<?php

declare(strict_types=1);

namespace Morse;

use DateTimeImmutable;
use DateTimeZone;

/**
 * Morse Chess Legendary (alltherex.com/chessLegendary/): the same accounts, games, coins and
 * database as Morse Chess, with a few read-only lobby reads plus the daily challenge.
 *
 *  - legendaryLobby: real "online now" / "live games" counts, the top 3 human players, and a
 *    watchable game when two of them are playing each other right now.
 *  - legendaryDaily / claimLegendaryDaily: one challenge per Chicago day, progress counted from
 *    the games table, the coin reward paid once (primary key on user + day).
 *  - watchGame: a read-only spectator snapshot of a game between two top players. It never moves
 *    the bot, never settles a clock and never returns chat.
 */
final class Legendary
{
    public const TZ = 'America/Chicago';
    public const DAILY_REWARD = 5;
    /** A game counts toward the daily challenge only after this many half-moves (stops resign spam). */
    public const DAILY_MIN_PLIES = 10;
    /** How many human leaders are shown; Watch Live needs two of these playing each other. */
    public const TOP = 3;

    /** @var list<array{id:string,title:string,goal:int,kind:string}> */
    public const CHALLENGES = [
        ['id' => 'win1', 'title' => 'Win 1 game', 'goal' => 1, 'kind' => 'win'],
        ['id' => 'play3', 'title' => 'Play 3 games', 'goal' => 3, 'kind' => 'play'],
        ['id' => 'win2', 'title' => 'Win 2 games', 'goal' => 2, 'kind' => 'win'],
        ['id' => 'timed2', 'title' => 'Play 2 timed games', 'goal' => 2, 'kind' => 'timed'],
        ['id' => 'win3', 'title' => 'Win 3 games', 'goal' => 3, 'kind' => 'win'],
        ['id' => 'play2', 'title' => 'Play 2 games', 'goal' => 2, 'kind' => 'play'],
    ];

    public static function register(): void
    {
        foreach (['legendaryLobby', 'legendaryDaily', 'claimLegendaryDaily', 'watchGame'] as $name) {
            Rpc::register($name, [self::class, $name]);
        }
    }

    /** @return array{day:string,startMs:int,endMs:int} The Chicago calendar day containing $nowMs. */
    public static function dayWindow(?int $nowMs = null): array
    {
        $tz = new DateTimeZone(self::TZ);
        $now = (new DateTimeImmutable('@' . intdiv($nowMs ?? Db::nowMs(), 1000)))->setTimezone($tz);
        $start = $now->setTime(0, 0, 0);
        $end = $start->modify('+1 day');
        return [
            'day' => $start->format('Y-m-d'),
            'startMs' => $start->getTimestamp() * 1000,
            'endMs' => $end->getTimestamp() * 1000,
        ];
    }

    /** @return array{id:string,title:string,goal:int,kind:string} Same challenge for everyone on a given day. */
    public static function challengeFor(string $day): array
    {
        $n = (int) floor((new DateTimeImmutable($day . ' 00:00:00', new DateTimeZone('UTC')))->getTimestamp() / 86400);
        return self::CHALLENGES[$n % count(self::CHALLENGES)];
    }

    /** @return list<string> */
    private static function botIds(): array
    {
        return [Constants::BOT_USER_ID, Constants::BOT_V2_USER_ID];
    }

    /** @return list<array{user_id:string,username:string,score:int,avatar_json:string}> */
    private static function topHumans(int $n): array
    {
        $rows = Db::all(
            'SELECT user_id, username, score, avatar_json FROM profiles
             WHERE user_id <> ? AND user_id <> ?
             ORDER BY score DESC, created_at ASC LIMIT ' . max(1, $n),
            self::botIds()
        );
        return array_map(static fn (array $r): array => [
            'user_id' => (string) $r['user_id'],
            'username' => (string) $r['username'],
            'score' => (int) $r['score'],
            'avatar_json' => (string) ($r['avatar_json'] ?? ''),
        ], $rows);
    }

    /** @return array{id:string,white:string,black:string}|null */
    private static function liveTopGame(array $topIds): ?array
    {
        if (count($topIds) < 2) {
            return null;
        }
        $in = Db::in($topIds);
        $row = Db::one(
            "SELECT id, white_user_id, black_user_id FROM games
             WHERE status = 'active' AND white_user_id IN ($in) AND black_user_id IN ($in) AND white_user_id <> black_user_id
             ORDER BY created_at DESC LIMIT 1",
            array_merge($topIds, $topIds)
        );
        return $row === null ? null : ['id' => (string) $row['id'], 'white' => (string) $row['white_user_id'], 'black' => (string) $row['black_user_id']];
    }

    /** @param array<string,mixed> $data */
    public static function legendaryLobby(string $userId, array $data): mixed
    {
        $cutoff = Db::ts(Db::nowMs() - 20000);
        $online = (int) Db::value(
            'SELECT COUNT(*) FROM profiles WHERE last_seen > ? AND user_id <> ? AND user_id <> ?',
            array_merge([$cutoff], self::botIds())
        );
        // Active games whose turn clock moved in the last 15 minutes (abandoned boards are not "live").
        $live = (int) Db::value(
            "SELECT COUNT(*) FROM games WHERE status = 'active' AND turn_started_at > ?",
            [Db::ts(Db::nowMs() - 15 * 60 * 1000)]
        );
        $top = self::topHumans(self::TOP);
        $ids = array_map(static fn (array $r): string => $r['user_id'], $top);
        $byId = [];
        foreach ($top as $r) {
            $byId[$r['user_id']] = $r;
        }
        $watch = null;
        $g = self::liveTopGame($ids);
        if ($g !== null) {
            $watch = [
                'gameId' => $g['id'],
                'white' => $byId[$g['white']]['username'] ?? 'White',
                'black' => $byId[$g['black']]['username'] ?? 'Black',
            ];
        }
        $me = Db::one('SELECT score FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
        $rank = null;
        if ($me !== null) {
            $rank = 1 + (int) Db::value(
                'SELECT COUNT(*) FROM profiles WHERE score > ? AND user_id <> ? AND user_id <> ?',
                array_merge([(int) $me['score']], self::botIds())
            );
        }
        return [
            'online' => $online,
            'liveGames' => $live,
            'leaders' => array_map(static fn (array $r, int $i): array => [
                'place' => $i + 1,
                'userId' => $r['user_id'],
                'username' => $r['username'],
                'score' => $r['score'],
                'tier' => Ranks::tierOf($r['user_id']),
                'look' => Kit::look($r['user_id'], $r['avatar_json']),
                'you' => $r['user_id'] === $userId,
            ], $top, array_keys($top)),
            'watch' => $watch,
            'myRank' => $rank,
        ];
    }

    /** @return array{done:int,goal:int} */
    private static function progress(string $userId, array $challenge, array $win): array
    {
        $rows = Db::all(
            "SELECT g.id, g.mode, g.winner_user_id,
                    (SELECT COUNT(*) FROM game_moves m WHERE m.game_id = g.id) AS plies
             FROM games g
             WHERE (g.white_user_id = ? OR g.black_user_id = ?)
               AND g.status IN ('white_win', 'black_win', 'draw')
               AND g.variant = '' AND g.source <> 'sandbox'
               AND g.created_at >= ? AND g.created_at < ?",
            [$userId, $userId, Db::ts($win['startMs']), Db::ts($win['endMs'])]
        );
        $done = 0;
        foreach ($rows as $r) {
            if ((int) $r['plies'] < self::DAILY_MIN_PLIES) {
                continue;
            }
            $ok = match ($challenge['kind']) {
                'win' => (string) ($r['winner_user_id'] ?? '') === $userId,
                'timed' => (string) $r['mode'] === 'timed',
                default => true,
            };
            if ($ok) {
                $done++;
            }
        }
        return ['done' => min($done, $challenge['goal']), 'goal' => $challenge['goal']];
    }

    /** @param array<string,mixed> $data */
    public static function legendaryDaily(string $userId, array $data): mixed
    {
        $win = self::dayWindow();
        $ch = self::challengeFor($win['day']);
        $p = self::progress($userId, $ch, $win);
        $claimed = Db::one('SELECT reward FROM legendary_daily_claims WHERE user_id = ? AND day = ? LIMIT 1', [$userId, $win['day']]);
        return [
            'day' => $win['day'],
            'id' => $ch['id'],
            'title' => $ch['title'],
            'goal' => $p['goal'],
            'progress' => $p['done'],
            'reward' => self::DAILY_REWARD,
            'claimed' => $claimed !== null,
            'resetsInMs' => max(0, $win['endMs'] - Db::nowMs()),
        ];
    }

    /** @param array<string,mixed> $data */
    public static function claimLegendaryDaily(string $userId, array $data): mixed
    {
        $win = self::dayWindow();
        $ch = self::challengeFor($win['day']);
        $p = self::progress($userId, $ch, $win);
        if ($p['done'] < $p['goal']) {
            throw new RpcError("Finish today's challenge first.");
        }
        return Db::transaction(static function () use ($userId, $win, $ch): array {
            $profile = Db::one('SELECT coins FROM profiles WHERE user_id = ? LIMIT 1' . Db::forUpdate(), [$userId]);
            if ($profile === null) {
                throw new RpcError('Claim a username first.');
            }
            $paid = Db::insertIgnore('legendary_daily_claims', [
                'user_id' => $userId,
                'day' => $win['day'],
                'challenge' => $ch['id'],
                'reward' => self::DAILY_REWARD,
                'claimed_at' => Db::now(),
            ]) === 1;
            if ($paid) {
                Db::run('UPDATE profiles SET coins = coins + ? WHERE user_id = ?', [self::DAILY_REWARD, $userId]);
            }
            $coins = (int) Db::value('SELECT coins FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
            return ['ok' => true, 'paid' => $paid ? self::DAILY_REWARD : 0, 'coins' => $coins, 'claimed' => true];
        });
    }

    /** @param array<string,mixed> $data */
    public static function watchGame(string $userId, array $data): mixed
    {
        $gameId = trim((string) ($data['gameId'] ?? ''));
        if ($gameId === '') {
            return null;
        }
        $game = Db::one('SELECT * FROM games WHERE id = ? LIMIT 1', [$gameId]);
        if ($game === null) {
            return null;
        }
        // Only games between two current top players can be watched (a little slack, so a game
        // that just changed the standings can still be seen to the end).
        $ids = array_map(static fn (array $r): string => $r['user_id'], self::topHumans(self::TOP + 2));
        $w = (string) $game['white_user_id'];
        $b = (string) $game['black_user_id'];
        if (!in_array($w, $ids, true) || !in_array($b, $ids, true)) {
            throw new RpcError('Only games between the top players can be watched.', 403);
        }
        $white = Db::one('SELECT username, score, avatar_json FROM profiles WHERE user_id = ? LIMIT 1', [$w]) ?? [];
        $black = Db::one('SELECT username, score, avatar_json FROM profiles WHERE user_id = ? LIMIT 1', [$b]) ?? [];
        $moves = Db::all('SELECT san, from_sq, to_sq FROM game_moves WHERE game_id = ? ORDER BY ply ASC', [$gameId]);
        // Clocks as they stand right now, without writing anything.
        $now = Db::nowMs();
        $wc = (int) $game['white_clock_ms'];
        $bc = (int) $game['black_clock_ms'];
        if ((string) $game['status'] === 'active' && (string) $game['mode'] === 'timed') {
            $spent = max(0, $now - Db::toMs($game['turn_started_at']));
            if ((string) $game['turn'] === 'w') {
                $wc = max(0, $wc - $spent);
            } else {
                $bc = max(0, $bc - $spent);
            }
        }
        $winner = $game['winner_user_id'] !== null ? (string) $game['winner_user_id'] : null;
        return [
            'id' => (string) $game['id'],
            'fen' => (string) $game['fen'],
            'mode' => (string) $game['mode'],
            'status' => (string) $game['status'],
            'turn' => (string) $game['turn'],
            'white' => ['username' => (string) ($white['username'] ?? 'White'), 'score' => (int) ($white['score'] ?? 0), 'look' => Kit::look($w, (string) ($white['avatar_json'] ?? ''))],
            'black' => ['username' => (string) ($black['username'] ?? 'Black'), 'score' => (int) ($black['score'] ?? 0), 'look' => Kit::look($b, (string) ($black['avatar_json'] ?? ''))],
            'lastMove' => ($game['last_move_from'] ?? '') !== '' && ($game['last_move_to'] ?? '') !== ''
                ? ['from' => (string) $game['last_move_from'], 'to' => (string) $game['last_move_to'], 'san' => (string) ($game['last_move_san'] ?? '')]
                : null,
            'moves' => array_map(static fn (array $m): array => ['san' => (string) $m['san'], 'from' => (string) $m['from_sq'], 'to' => (string) $m['to_sq']], $moves),
            'whiteClockMs' => $wc,
            'blackClockMs' => $bc,
            'winner' => $winner === null ? null : ($winner === $w ? 'w' : ($winner === $b ? 'b' : null)),
            'serverNow' => $now,
        ];
    }
}
