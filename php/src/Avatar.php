<?php

declare(strict_types=1);

namespace Morse;

/**
 * Port of src/lib/server/avatar.ts: the king's loadout, piece style and gear
 * shop. Handlers are registered under the original server-function names.
 */
final class Avatar
{
    public static function register(): void
    {
        Rpc::register('getAvatar', [self::class, 'getAvatar']);
        Rpc::register('saveAvatar', [self::class, 'saveAvatar']);
        Rpc::register('setPieceStyle', [self::class, 'setPieceStyle']);
        Rpc::register('buyGear', [self::class, 'buyGear']);
    }

    /** @return list<string> insertion-ordered set: stored ids first, then starters */
    private static function ownedSet(mixed $raw): array
    {
        $set = [];
        foreach (explode(',', (string) ($raw ?? '')) as $part) {
            $part = trim($part);
            if ($part !== '' && !in_array($part, $set, true)) {
                $set[] = $part;
            }
        }
        foreach (Catalog::starterIds() as $id) {
            if (!in_array($id, $set, true)) {
                $set[] = $id;
            }
        }
        return $set;
    }

    /**
     * @param array<string,string> $loadout
     * @param list<string> $owned
     * @return array<string,string>
     */
    private static function clampLoadout(array $loadout, array $owned): array
    {
        $keep = static fn (string $id, string $fallback): string
            => (in_array($id, $owned, true) || Catalog::gearPrice($id) === 0) ? $id : $fallback;
        return array_merge($loadout, [
            'anId' => $keep($loadout['anId'], 'knight'),
            'kingId' => $keep($loadout['kingId'], 'piece'),
            'swordId' => $keep($loadout['swordId'], 'none'),
            'crownId' => $keep($loadout['crownId'], 'poly-band'),
            'mountId' => $keep($loadout['mountId'], 'none'),
            'frameId' => $keep($loadout['frameId'], 'plain'),
            'attackId' => $keep($loadout['attackId'], 'march'),
        ]);
    }

    /** @return array{coins:int,username:string,owned:list<string>,loadout:array<string,string>}|null */
    private static function readRow(string $userId, bool $lock = false): ?array
    {
        $row = Db::one(
            'SELECT avatar_json, piece_style, owned_gear, coins, username FROM profiles WHERE user_id = ? LIMIT 1' . ($lock ? Db::forUpdate() : ''),
            [$userId]
        );
        if ($row === null) {
            return null;
        }
        $owned = self::ownedSet($row['owned_gear']);
        $json = (string) ($row['avatar_json'] ?? '');
        $decoded = $json !== '' ? json_decode($json, true) : [];
        $parsed = Catalog::parseLoadout(is_array($decoded) ? $decoded : []);
        $style = in_array($row['piece_style'], ['2d', 'an', 'ra', '3d'], true) ? (string) $row['piece_style'] : '3d';
        $loadout = self::clampLoadout($parsed, $owned);
        $loadout['style'] = $style;
        return [
            'coins' => (int) $row['coins'],
            'username' => (string) $row['username'],
            'owned' => $owned,
            'loadout' => $loadout,
        ];
    }

    /** @param array<string,mixed> $data */
    public static function getAvatar(string $userId, array $data): mixed
    {
        return self::readRow($userId);
    }

    /** @param array<string,mixed> $data */
    public static function saveAvatar(string $userId, array $data): mixed
    {
        $wanted = Catalog::parseLoadout($data['loadout'] ?? null);
        return Db::transaction(static function () use ($userId, $wanted): array {
            $current = self::readRow($userId, true);
            if ($current === null) {
                throw new RpcError('Claim a username before dressing the king.');
            }
            $next = self::clampLoadout($wanted, $current['owned']);
            $next['style'] = $wanted['style'];
            Db::run(
                'UPDATE profiles SET avatar_json = ?, piece_style = ? WHERE user_id = ?',
                [json_encode($next, JSON_UNESCAPED_SLASHES), $next['style'], $userId]
            );
            return array_merge($current, ['loadout' => $next]);
        });
    }

    /** @param array<string,mixed> $data */
    public static function setPieceStyle(string $userId, array $data): mixed
    {
        $style = $data['style'] ?? null;
        $style = in_array($style, ['2d', 'an', 'ra'], true) ? $style : '3d';
        Db::run('UPDATE profiles SET piece_style = ? WHERE user_id = ?', [$style, $userId]);
        return ['style' => $style];
    }

    /** @param array<string,mixed> $data */
    public static function buyGear(string $userId, array $data): mixed
    {
        $id = (string) ($data['id'] ?? '');
        if (!Catalog::isKnownGear($id)) {
            throw new RpcError('That piece is not in the cabinet.');
        }
        return Db::transaction(static function () use ($userId, $id): array {
            $current = self::readRow($userId, true);
            if ($current === null) {
                throw new RpcError('Claim a username first.');
            }
            $owned = $current['owned'];
            $price = Catalog::gearPrice($id);
            if (in_array($id, $owned, true) || $price === 0) {
                return $current;
            }
            if ($current['coins'] < $price) {
                throw new RpcError("That costs {$price} Morse coins.");
            }
            $owned[] = $id;
            // Conditional update: two parallel purchases cannot both spend the same coins.
            $changed = Db::run(
                'UPDATE profiles SET coins = coins - ?, owned_gear = ? WHERE user_id = ? AND coins >= ?',
                [$price, implode(',', $owned), $userId, $price]
            );
            if ($changed === 0) {
                throw new RpcError("That costs {$price} Morse coins.");
            }
            return array_merge($current, ['coins' => $current['coins'] - $price, 'owned' => $owned]);
        });
    }
}
