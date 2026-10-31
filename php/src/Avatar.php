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
        Rpc::register('setLegacyKit', [self::class, 'setLegacyKit']);
    }

    /** @return list<string> insertion-ordered set: stored ids first, then starters */
    private static function ownedSet(mixed $raw): array
    {
        $set = [];
        foreach (explode(',', (string) ($raw ?? '')) as $part) {
            $part = trim($part);
            if ($part === 'propeller') {
                $part = 'gold-crown'; // renamed hat crown; ownership carries over
            }
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
            'lgAttackId' => $keep($loadout['lgAttackId'] ?? 'lg-none', 'lg-none'),
            'finishId' => $keep($loadout['finishId'] ?? 'king-onyx', 'king-onyx'),
            'fbCelebrate' => $keep($loadout['fbCelebrate'] ?? 'fireworks', 'fireworks'),
            'fbSong' => $keep($loadout['fbSong'] ?? 'song-none', 'song-none'),
        ]);
    }

    /** @return array{coins:int,username:string,owned:list<string>,loadout:array<string,string>,gamesPlayed:int,legacyOff:bool,legacyOn:bool,raTrial:bool}|null */
    private static function readRow(string $userId, bool $lock = false): ?array
    {
        $row = Db::one(
            'SELECT avatar_json, piece_style, owned_gear, coins, username, games_played FROM profiles WHERE user_id = ? LIMIT 1' . ($lock ? Db::forUpdate() : ''),
            [$userId]
        );
        if ($row === null) {
            return null;
        }
        $owned = self::ownedSet($row['owned_gear']);
        $json = (string) ($row['avatar_json'] ?? '');
        $decoded = $json !== '' ? json_decode($json, true) : [];
        $parsed = Catalog::parseLoadout(is_array($decoded) ? $decoded : []);
        $style = in_array($row['piece_style'], ['2d', 'an', 'ra', 'lg', 'cl', 'pa', '3d'], true) ? (string) $row['piece_style'] : '3d';
        // "Back to normal": the Royal Legacy kit stays owned but is switched off, so the
        // king and pieces are the regular ones again, exactly as before unlocking.
        $legacyOff = is_array($decoded) && !empty($decoded['legacyOff']);
        $legacyOn = in_array(Kit::LEGACY, $owned, true) && !$legacyOff;
        $loadout = self::clampLoadout($parsed, self::wearable($owned, $legacyOff));
        $loadout['style'] = $style;
        return [
            'coins' => (int) $row['coins'],
            'username' => (string) $row['username'],
            'owned' => $owned,
            'loadout' => $loadout,
            'gamesPlayed' => (int) ($row['games_played'] ?? 0),
            'legacyOff' => $legacyOff,
            'legacyOn' => $legacyOn,
            'raTrial' => !in_array('royal', $owned, true) && Catalog::raTrialGame((int) ($row['games_played'] ?? 0) + 1),
        ];
    }

    /** @param array<string,mixed> $data */
    public static function getAvatar(string $userId, array $data): mixed
    {
        $row = self::readRow($userId);
        // lgOk: the account may wear LG (the store's preview shows the LG tab only then).
        return $row === null ? null : array_merge($row, ['lgOk' => self::ownsLegoBoard($userId)]);
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
            $next = self::clampLoadout($wanted, self::wearable($current['owned'], $current['legacyOff']));
            $style = $wanted['style'];
            if ($style === 'ra' && !in_array('royal', $current['owned'], true) && !$current['raTrial']) {
                $style = $current['loadout']['style'] === 'ra' ? '3d' : $current['loadout']['style'];
            }
            if ($style === 'lg' && !self::ownsLegoBoard($userId)) {
                $style = $current['loadout']['style'] === 'lg' ? '3d' : $current['loadout']['style'];
            }
            $next['style'] = $style;
            $stored = $current['legacyOff'] ? array_merge($next, ['legacyOff' => true]) : $next;
            Db::run(
                'UPDATE profiles SET avatar_json = ?, piece_style = ? WHERE user_id = ?',
                [json_encode($stored, JSON_UNESCAPED_SLASHES), $next['style'], $userId]
            );
            Kit::reset();
            return array_merge($current, ['loadout' => $next]);
        });
    }

    /**
     * Gear the king may wear: with the Royal Legacy kit switched off, the Royal Legacy King
     * finish is put away (it is still owned).
     * @param list<string> $owned
     * @return list<string>
     */
    private static function wearable(array $owned, bool $legacyOff): array
    {
        return $legacyOff ? array_values(array_filter($owned, static fn (string $id): bool => $id !== Kit::LEGACY)) : $owned;
    }

    /**
     * Royal Legacy kit on/off for an owner ("Back to normal" / "Use Royal Legacy").
     * Ownership never changes and no coins move. Kept in the profile next to the saved loadout.
     * @param array<string,mixed> $data
     */
    public static function setLegacyKit(string $userId, array $data): mixed
    {
        $on = !empty($data['on']);
        return Db::transaction(static function () use ($userId, $on): array {
            $current = self::readRow($userId, true);
            if ($current === null) {
                throw new RpcError('Claim a username first.');
            }
            if (!in_array(Kit::LEGACY, $current['owned'], true)) {
                throw new RpcError('Unlock the Royal Legacy kit first.');
            }
            $row = Db::one('SELECT avatar_json FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
            $json = (string) ($row['avatar_json'] ?? '');
            $decoded = $json !== '' ? json_decode($json, true) : [];
            $data = is_array($decoded) ? $decoded : [];
            if ($data === []) {
                $data = $current['loadout'];
            }
            if ($on) {
                unset($data['legacyOff']);
                // Turning it back on wears the Royal Legacy King again.
                $data['finishId'] = Kit::LEGACY;
            } else {
                $data['legacyOff'] = true;
                if (($data['finishId'] ?? '') === Kit::LEGACY) {
                    $data['finishId'] = 'king-onyx';
                }
            }
            Db::run('UPDATE profiles SET avatar_json = ? WHERE user_id = ?', [json_encode($data, JSON_UNESCAPED_SLASHES), $userId]);
            Kit::reset();
            return self::readRow($userId) ?? $current;
        });
    }

    /** LG (LEGO Marvel figures) needs the Lego Universe board: bought, or gifted to the account. */
    private static function ownsLegoBoard(string $userId): bool
    {
        $row = Db::one('SELECT owned_boards, username FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
        if ($row === null) {
            return false;
        }
        $owned = array_filter(array_map('trim', explode(',', (string) ($row['owned_boards'] ?? ''))));
        return in_array(Catalog::LEGO_BOARD_ID, $owned, true)
            || in_array(Catalog::LEGO_BOARD_ID, Catalog::giftBoardsFor((string) ($row['username'] ?? '')), true);
    }

    /** @param array<string,mixed> $data */
    public static function setPieceStyle(string $userId, array $data): mixed
    {
        $style = $data['style'] ?? null;
        // 'cl' (Classic) and 'pa' (Parlor) are free 3D sets.
        $style = in_array($style, ['2d', 'an', 'ra', 'lg', 'cl', 'pa'], true) ? $style : '3d';
        if ($style === 'lg' && !self::ownsLegoBoard($userId)) {
            throw new RpcError('LG comes with the Brick Verse board (60 Morse coins).');
        }
        if ($style === 'ra') {
            $current = self::readRow($userId);
            if ($current === null || (!in_array('royal', $current['owned'], true) && !$current['raTrial'])) {
                throw new RpcError('RA costs 200 Morse coins.');
            }
        }
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
