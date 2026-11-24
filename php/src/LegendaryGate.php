<?php

declare(strict_types=1);

namespace Morse;

/**
 * The Legendary entry gate (owner t381u): the first time a player enters /chessLegendary/ they pay a
 * one-time 100 Morse coin fee. One row per unlocked player in legendary_unlocks (additive table); the
 * primary key makes the unlock idempotent and the coin debit is conditional, inside one transaction.
 *
 * Nobody who was already at Legendary pays: on the first gate check after this ships, everyone with
 * Legendary activity (a Legendary photo/letter row or a daily claim) is grandfathered in once
 * (reason 'grandfathered'). MasterGus never pays.
 */
final class LegendaryGate
{
    public const FEE = 100;
    private const SEED = '__seeded__';
    private const SEED2 = '__seeded_v2__';

    public static function register(): void
    {
        foreach (['legendaryAccess', 'unlockLegendary'] as $name) {
            Rpc::register($name, [self::class, $name]);
        }
    }

    /**
     * Grandfather every player who already used Legendary (owner rule: never take anything away).
     * v1 covered photos + daily claims. v2 (owner t383) adds every other trace, erring toward
     * inclusion: rank records, campaign rows, GC coin gifts (sent or received), any Checkers /
     * Chinese Chess / Battle Chess game in any state, Legendary gear (paid frames, the Royal Legacy
     * finish) owned or worn, a non-default frame / finish / Legendary attack in the loadout.
     * Each pass runs once (marker rows) and only inserts; nothing is ever removed. Returns rows added.
     */
    public static function seed(): int
    {
        $added = 0;
        if ((int) Db::value('SELECT COUNT(*) FROM legendary_unlocks WHERE user_id = ?', [self::SEED]) === 0) {
            $added += self::grant(self::idsV1());
            Db::insertIgnore('legendary_unlocks', ['user_id' => self::SEED, 'paid' => 0, 'reason' => 'seed marker', 'created_at' => Db::now()]);
        }
        if ((int) Db::value('SELECT COUNT(*) FROM legendary_unlocks WHERE user_id = ?', [self::SEED2]) === 0) {
            $added += self::grant(array_merge(self::idsV1(), self::idsV2()));
            Db::insertIgnore('legendary_unlocks', ['user_id' => self::SEED2, 'paid' => 0, 'reason' => 'seed marker v2', 'created_at' => Db::now()]);
        }
        return $added;
    }

    /** @param list<string> $ids */
    private static function grant(array $ids): int
    {
        $now = Db::now();
        $added = 0;
        foreach (array_unique($ids) as $id) {
            if ($id === '' || str_starts_with($id, '__') || str_starts_with($id, 'bot-')) {
                continue;
            }
            $added += Db::insertIgnore('legendary_unlocks', ['user_id' => $id, 'paid' => 0, 'reason' => 'grandfathered', 'created_at' => $now]);
        }
        return $added;
    }

    /** @return list<string> */
    private static function col(string $sql): array
    {
        try {
            return array_map(static fn (array $r): string => (string) array_values($r)[0], Db::all($sql));
        } catch (\Throwable) {
            return []; // a table that is not there yet simply adds nobody
        }
    }

    /** @return list<string> */
    private static function idsV1(): array
    {
        return array_merge(
            self::col('SELECT user_id FROM legendary_photos'),
            self::col('SELECT DISTINCT user_id FROM legendary_daily_claims'),
        );
    }

    /** @return list<string> */
    public static function idsV2(): array
    {
        $ids = array_merge(
            self::col('SELECT user_id FROM player_rank_floors'),
            self::col('SELECT DISTINCT user_id FROM campaign_army'),
            self::col('SELECT user_id FROM campaign_meta'),
            self::col('SELECT DISTINCT user_id FROM campaign_progress'),
            self::col('SELECT DISTINCT user_id FROM campaign_runs'),
            self::col('SELECT DISTINCT user_id FROM campaign_rewards'),
            self::col('SELECT DISTINCT from_id FROM coin_gifts'),
            self::col('SELECT DISTINCT to_id FROM coin_gifts'),
            self::col("SELECT DISTINCT white_user_id FROM games WHERE variant IN ('checkers', 'xiangqi', 'battlechess')"),
            self::col("SELECT DISTINCT black_user_id FROM games WHERE variant IN ('checkers', 'xiangqi', 'battlechess')"),
        );
        $paidGear = ['gold', 'laurel', 'night', 'check', 'coin', 'gear', 'king-royal-legacy'];
        try {
            $rows = Db::all("SELECT user_id, owned_gear, avatar_json FROM profiles WHERE owned_gear <> '' OR avatar_json LIKE '%frameId%' OR avatar_json LIKE '%finishId%' OR avatar_json LIKE '%lgAttackId%'");
        } catch (\Throwable) {
            $rows = [];
        }
        foreach ($rows as $r) {
            $owned = array_map('trim', explode(',', (string) $r['owned_gear']));
            $look = json_decode((string) $r['avatar_json'], true);
            $look = is_array($look) ? $look : [];
            $worn = (isset($look['frameId']) && !in_array($look['frameId'], ['', 'plain'], true))
                || (isset($look['finishId']) && !in_array($look['finishId'], ['', 'king-onyx'], true))
                || (isset($look['lgAttackId']) && !in_array($look['lgAttackId'], ['', 'lg-none'], true));
            if ($worn || array_intersect($paidGear, $owned)) {
                $ids[] = (string) $r['user_id'];
            }
        }
        return $ids;
    }

    private static function profile(string $userId): array
    {
        $me = Db::one('SELECT username, coins FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
        if ($me === null) {
            throw new RpcError('Sign in first.', 401);
        }
        return $me;
    }

    private static function unlocked(string $userId, string $username): bool
    {
        return Catalog::isMasterUsername($username)
            || (int) Db::value('SELECT COUNT(*) FROM legendary_unlocks WHERE user_id = ?', [$userId]) > 0;
    }

    /** @return array{unlocked:bool,fee:int,coins:int,need:int} */
    public static function legendaryAccess(string $userId, array $data): mixed
    {
        self::seed();
        $me = self::profile($userId);
        $coins = (int) $me['coins'];
        $open = self::unlocked($userId, (string) $me['username']);
        $grand = (int) Db::value("SELECT COUNT(*) FROM legendary_unlocks WHERE reason = 'grandfathered'");
        return ['unlocked' => $open, 'fee' => self::FEE, 'coins' => $coins, 'need' => $open ? 0 : max(0, self::FEE - $coins), 'grandfathered' => $grand];
    }

    /** Pay the fee once. Paying again (double click, two tabs) never charges twice. */
    public static function unlockLegendary(string $userId, array $data): mixed
    {
        self::seed();
        return Db::transaction(static function () use ($userId): array {
            $me = Db::one('SELECT username, coins FROM profiles WHERE user_id = ? LIMIT 1' . Db::forUpdate(), [$userId]);
            if ($me === null) {
                throw new RpcError('Sign in first.', 401);
            }
            if (self::unlocked($userId, (string) $me['username'])) {
                return ['ok' => true, 'unlocked' => true, 'charged' => 0, 'coins' => (int) $me['coins']];
            }
            $paid = Db::run('UPDATE profiles SET coins = coins - ? WHERE user_id = ? AND coins >= ?', [self::FEE, $userId, self::FEE]);
            if ($paid === 0) {
                $need = self::FEE - (int) $me['coins'];
                throw new RpcError('You need ' . $need . ' more Morse ' . ($need === 1 ? 'coin' : 'coins') . ' to enter Legendary.');
            }
            if (Db::insertIgnore('legendary_unlocks', ['user_id' => $userId, 'paid' => self::FEE, 'reason' => 'paid', 'created_at' => Db::now()]) === 0) {
                throw new RpcError('Legendary is already unlocked.'); // rolls the debit back
            }
            $coins = (int) Db::value('SELECT coins FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
            return ['ok' => true, 'unlocked' => true, 'charged' => self::FEE, 'coins' => $coins];
        });
    }
}
