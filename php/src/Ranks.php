<?php

declare(strict_types=1);

namespace Morse;

/**
 * Ranks (owner t370u): "it should be hard to even get a gold rank", ranks can degrade, MasterGus on top.
 *
 *  - You are UNRANKED until you finish PLACEMENT_GAMES rated games.
 *  - A tier needs BOTH its Elo and its number of wins over real players (MorseBot wins don't count).
 *  - Degrade: drop below a tier's Elo (losses) and you fall to the tier you still qualify for;
 *    every DECAY_DAYS without a rated game also drops one tier (never below Bronze).
 *  - Grandfather: players who held a tier under the old Elo-only badges keep it as a floor
 *    (player_rank_floors) so nobody is demoted by the stricter rules without the owner's say-so.
 *  - The master username is always Legendary, rank #1.
 */
final class Ranks
{
    public const PLACEMENT_GAMES = 10;
    public const DECAY_DAYS = 21;
    /** Players who joined before this keep their old badge as a floor. */
    public const GRANDFATHER_BEFORE = '2026-11-22 00:00:00';

    /** id => [elo, wins over humans]. Order = low → high. */
    public const TIERS = [
        'bronze' => [0, 0],
        'silver' => [1200, 10],
        'gold' => [1500, 40],
        'platinum' => [1650, 75],
        'diamond' => [1800, 120],
        'master' => [2000, 200],
        'legendary' => [2200, 300],
    ];

    /** The old Elo-only badge thresholds (src/lib/legendary/theme.ts RANKS) — used only to grandfather. */
    public const LEGACY = ['bronze' => 0, 'silver' => 1100, 'gold' => 1300, 'platinum' => 1500, 'diamond' => 1700, 'master' => 1900, 'legendary' => 2100];

    /** @var array<string,array<string,mixed>>|null */
    private static ?array $table = null;

    public static function register(): void
    {
        Rpc::register('myRank', [self::class, 'myRank']);
        Rpc::register('rankTable', [self::class, 'rankTable']);
    }

    /** @param array<string,mixed> $data */
    public static function myRank(string $userId, array $data): mixed
    {
        $t = self::table();
        $r = $t[$userId] ?? null;
        if ($r === null) {
            $p = Db::one('SELECT score FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
            return ['ranked' => false, 'tier' => null, 'place' => null, 'score' => (int) ($p['score'] ?? 0), 'games' => 0, 'wins' => 0, 'placementLeft' => self::PLACEMENT_GAMES, 'decayInDays' => null];
        }
        return self::publicRow($r, true);
    }

    /** Public ladder (usernames + tiers only). @param array<string,mixed> $data */
    public static function rankTable(string $userId, array $data): mixed
    {
        $rows = array_values(array_filter(self::table(), static fn (array $r): bool => $r['ranked']));
        usort($rows, static fn (array $a, array $b): int => $a['place'] <=> $b['place']);
        return array_map(static fn (array $r): array => self::publicRow($r, false), array_slice($rows, 0, 50));
    }

    /** Tier id for a user, or null if unranked (used by the lobby leaderboard). */
    public static function tierOf(string $userId): ?string
    {
        $r = self::table()[$userId] ?? null;
        return $r !== null && $r['ranked'] ? $r['tier'] : null;
    }

    /** @param array<string,mixed> $r */
    private static function publicRow(array $r, bool $mine): array
    {
        $out = [
            'username' => $r['username'],
            'ranked' => $r['ranked'],
            'tier' => $r['ranked'] ? $r['tier'] : null,
            'place' => $r['ranked'] ? $r['place'] : null,
            'score' => $r['score'],
            'earned' => $r['earned'],
            'grandfathered' => $r['grandfathered'],
            'pinned' => $r['pinned'],
        ];
        if ($mine) {
            $out += [
                'games' => $r['games'],
                'wins' => $r['wins'],
                'placementLeft' => max(0, self::PLACEMENT_GAMES - $r['games']),
                'decayInDays' => $r['decayInDays'],
            ];
        }
        return $out;
    }

    public static function tierIndex(?string $id): int
    {
        $i = $id === null ? false : array_search($id, array_keys(self::TIERS), true);
        return $i === false ? -1 : (int) $i;
    }

    /** Highest tier the numbers earn (no decay, no floor). */
    public static function earned(int $score, int $humanWins): string
    {
        $best = 'bronze';
        foreach (self::TIERS as $id => [$elo, $wins]) {
            if ($score >= $elo && $humanWins >= $wins) {
                $best = $id;
            }
        }
        return $best;
    }

    public static function legacyTier(int $score): string
    {
        $best = 'bronze';
        foreach (self::LEGACY as $id => $min) {
            if ($score >= $min) {
                $best = $id;
            }
        }
        return $best;
    }

    /**
     * One-time grandfathering: every pre-cutoff human who has finished a rated game and showed a Silver+
     * badge under the old Elo-only rules keeps that badge as a floor. (Accounts that never played sit on
     * the 1200 start score — they were never really "Silver" and start unranked.)
     * @param array<string,array{games:int,wins:int,last:string}> $stats
     */
    private static function seedFloors(array $stats): void
    {
        if (Db::value("SELECT COUNT(*) FROM player_rank_floors WHERE user_id = '__seeded__'") > 0) {
            return;
        }
        $now = Db::ts(Db::nowMs());
        $rows = Db::all(
            'SELECT user_id, score FROM profiles WHERE created_at < ? AND user_id <> ? AND user_id <> ?',
            [self::GRANDFATHER_BEFORE, Constants::BOT_USER_ID, Constants::BOT_V2_USER_ID]
        );
        foreach ($rows as $r) {
            $tier = self::legacyTier((int) $r['score']);
            if ($tier !== 'bronze' && ($stats[(string) $r['user_id']]['games'] ?? 0) > 0) {
                Db::insertIgnore('player_rank_floors', ['user_id' => (string) $r['user_id'], 'tier' => $tier, 'reason' => 'grandfathered', 'created_at' => $now]);
            }
        }
        Db::insertIgnore('player_rank_floors', ['user_id' => '__seeded__', 'tier' => '', 'reason' => 'seed marker', 'created_at' => $now]);
    }

    /** @return array<string,array<string,mixed>> user_id => rank row (cached per request). */
    public static function table(): array
    {
        if (self::$table !== null) {
            return self::$table;
        }
        $bots = [Constants::BOT_USER_ID, Constants::BOT_V2_USER_ID];
        $botIn = Db::in($bots);
        $stats = [];
        $q = "SELECT %s AS uid, %s AS opp, winner_user_id, created_at FROM games
              WHERE scored = 1 AND variant = '' AND source <> 'sandbox' AND status IN ('white_win', 'black_win', 'draw')";
        foreach ([['white_user_id', 'black_user_id'], ['black_user_id', 'white_user_id']] as [$me, $opp]) {
            foreach (Db::all(sprintf($q, $me, $opp)) as $g) {
                $u = (string) $g['uid'];
                $s = $stats[$u] ?? ['games' => 0, 'wins' => 0, 'last' => ''];
                $s['games']++;
                if ($g['winner_user_id'] === $u && !in_array((string) $g['opp'], $bots, true)) {
                    $s['wins']++;
                }
                if ((string) $g['created_at'] > $s['last']) {
                    $s['last'] = (string) $g['created_at'];
                }
                $stats[$u] = $s;
            }
        }
        self::seedFloors($stats);
        $floors = [];
        foreach (Db::all("SELECT user_id, tier FROM player_rank_floors WHERE user_id <> '__seeded__'") as $f) {
            $floors[(string) $f['user_id']] = (string) $f['tier'];
        }
        $nowMs = Db::nowMs();
        $rows = [];
        foreach (Db::all("SELECT user_id, username, score FROM profiles WHERE user_id NOT IN ($botIn)", $bots) as $p) {
            $id = (string) $p['user_id'];
            $s = $stats[$id] ?? ['games' => 0, 'wins' => 0, 'last' => ''];
            $score = (int) $p['score'];
            $pinned = Catalog::isMasterUsername((string) $p['username']);
            $floor = $floors[$id] ?? null;
            $earned = self::earned($score, $s['wins']);
            $idx = self::tierIndex($earned);
            $decayIn = null;
            if ($s['last'] !== '') {
                $idleDays = (int) floor(($nowMs - (int) (strtotime($s['last'] . ' UTC') * 1000)) / 86400000);
                $idx = max(0, $idx - intdiv(max(0, $idleDays), self::DECAY_DAYS));
                $decayIn = self::DECAY_DAYS - (max(0, $idleDays) % self::DECAY_DAYS);
            }
            $placed = $s['games'] >= self::PLACEMENT_GAMES;
            $grand = false;
            if ($floor !== null && self::tierIndex($floor) > ($placed ? $idx : -1)) {
                $idx = self::tierIndex($floor);
                $grand = true;
            }
            $ranked = $placed || $floor !== null || $pinned;
            if ($pinned) {
                $idx = count(self::TIERS) - 1;
            }
            $rows[$id] = [
                'userId' => $id,
                'username' => (string) $p['username'],
                'score' => $score,
                'games' => $s['games'],
                'wins' => $s['wins'],
                'earned' => $placed ? $earned : null,
                'tier' => array_keys(self::TIERS)[$idx],
                'ranked' => $ranked,
                'grandfathered' => $grand && !$pinned,
                'pinned' => $pinned,
                'decayInDays' => $decayIn,
                'place' => null,
            ];
        }
        $ladder = array_values(array_filter($rows, static fn (array $r): bool => $r['ranked']));
        usort($ladder, static function (array $a, array $b): int {
            if ($a['pinned'] !== $b['pinned']) {
                return $a['pinned'] ? -1 : 1;
            }
            return [self::tierIndex($b['tier']), $b['score']] <=> [self::tierIndex($a['tier']), $a['score']];
        });
        foreach ($ladder as $i => $r) {
            $rows[$r['userId']]['place'] = $i + 1;
        }
        return self::$table = $rows;
    }
}
