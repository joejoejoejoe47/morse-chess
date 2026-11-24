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

    public static function register(): void
    {
        foreach (['legendaryAccess', 'unlockLegendary'] as $name) {
            Rpc::register($name, [self::class, $name]);
        }
    }

    /** One-time: grandfather every player who already used Legendary. Returns how many were added. */
    public static function seed(): int
    {
        if ((int) Db::value('SELECT COUNT(*) FROM legendary_unlocks WHERE user_id = ?', [self::SEED]) > 0) {
            return 0;
        }
        $now = Db::now();
        $ids = [];
        foreach (Db::all('SELECT user_id FROM legendary_photos') as $r) {
            $ids[(string) $r['user_id']] = true;
        }
        foreach (Db::all('SELECT DISTINCT user_id FROM legendary_daily_claims') as $r) {
            $ids[(string) $r['user_id']] = true;
        }
        $added = 0;
        foreach (array_keys($ids) as $id) {
            $added += Db::insertIgnore('legendary_unlocks', ['user_id' => $id, 'paid' => 0, 'reason' => 'grandfathered', 'created_at' => $now]);
        }
        Db::insertIgnore('legendary_unlocks', ['user_id' => self::SEED, 'paid' => 0, 'reason' => 'seed marker', 'created_at' => $now]);
        return $added;
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
