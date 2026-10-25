<?php

declare(strict_types=1);

namespace Morse;

/** Morse coin store: sell and buy saved kings (AV) and Lego boards (LG). */
final class Store
{
    public static function register(): void
    {
        Rpc::register('listMarket', [self::class, 'listMarket']);
        Rpc::register('mySellables', [self::class, 'mySellables']);
        Rpc::register('listAvatarModels', [self::class, 'listAvatarModels']);
        Rpc::register('saveAvatarModel', [self::class, 'saveAvatarModel']);
        Rpc::register('wearAvatarModel', [self::class, 'wearAvatarModel']);
        Rpc::register('createMarketListing', [self::class, 'createMarketListing']);
        Rpc::register('buyMarketListing', [self::class, 'buyMarketListing']);
    }

    /** @param array<string,mixed> $data */
    public static function listMarket(string $userId, array $data): mixed
    {
        $q = trim((string) ($data['q'] ?? ''));
        $q = mb_substr($q, 0, 40);
        $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
        $sql = 'SELECT id, seller_id, seller_name, kind, name, price, blurb, shot, created_at FROM market_listings WHERE status = ?';
        $params = ['live'];
        if ($q !== '') {
            $sql .= ' AND (name LIKE ? OR seller_name LIKE ?)';
            $params[] = $like;
            $params[] = $like;
        }
        $sql .= ' ORDER BY created_at DESC LIMIT 60';
        $out = [];
        foreach (Db::all($sql, $params) as $r) {
            $out[] = self::card($r, $userId);
        }
        $coins = (int) (Db::value('SELECT coins FROM profiles WHERE user_id = ?', [$userId]) ?? 0);
        return ['listings' => $out, 'coins' => $coins];
    }

    /** @param array<string,mixed> $data */
    public static function mySellables(string $userId, array $data): mixed
    {
        return [
            'avatars' => self::models($userId, true),
            'boards' => self::boards($userId),
        ];
    }

    /** @param array<string,mixed> $data */
    public static function listAvatarModels(string $userId, array $data): mixed
    {
        return ['models' => self::models($userId, false)];
    }

    /** @param array<string,mixed> $data */
    public static function saveAvatarModel(string $userId, array $data): mixed
    {
        $name = self::cleanName((string) ($data['name'] ?? ''), 'My king');
        $loadout = self::cleanLoadout($data['loadout'] ?? null);
        if ((int) Db::value('SELECT COUNT(*) FROM avatar_models WHERE user_id = ?', [$userId]) >= 24) {
            $old = Db::value('SELECT id FROM avatar_models WHERE user_id = ? ORDER BY created_at ASC LIMIT 1', [$userId]);
            if (is_string($old) && $old !== '') {
                Db::run('DELETE FROM avatar_models WHERE id = ? AND user_id = ?', [$old, $userId]);
            }
        }
        $id = Util::uuid();
        Db::run(
            'INSERT INTO avatar_models (id, user_id, name, loadout_json, created_at) VALUES (?, ?, ?, ?, ?)',
            [$id, $userId, $name, json_encode($loadout, JSON_UNESCAPED_SLASHES), Db::now()]
        );
        return ['id' => $id, 'models' => self::models($userId, false)];
    }

    /** @param array<string,mixed> $data */
    public static function wearAvatarModel(string $userId, array $data): mixed
    {
        $row = Db::one('SELECT loadout_json FROM avatar_models WHERE id = ? AND user_id = ?', [(string) ($data['id'] ?? ''), $userId]);
        if ($row === null) {
            throw new RpcError('That king is not in your cabinet.', 404);
        }
        $loadout = json_decode((string) $row['loadout_json'], true);
        if (!is_array($loadout)) {
            throw new RpcError('That king is damaged.');
        }
        return Avatar::saveAvatar($userId, ['loadout' => $loadout]);
    }

    /** @param array<string,mixed> $data */
    public static function createMarketListing(string $userId, array $data): mixed
    {
        $kind = ($data['kind'] ?? '') === 'lg' ? 'lg' : 'av';
        $name = self::cleanName((string) ($data['name'] ?? ''), $kind === 'lg' ? 'Brick board' : 'King');
        $price = (int) ($data['price'] ?? 0);
        if ($price < 1 || $price > 1000000) {
            throw new RpcError('Set a price from 1 to 1,000,000 Morse coins.');
        }
        $blurb = trim(preg_replace('/\s+/u', ' ', (string) ($data['blurb'] ?? '')) ?? '');
        $blurb = mb_substr($blurb, 0, 400);
        $shot = (string) ($data['shot'] ?? '');
        if (!str_starts_with($shot, 'data:image/') || strlen($shot) < 32 || strlen($shot) > 500000) {
            throw new RpcError('Take a screenshot of what you are selling.');
        }
        $sourceId = (string) ($data['sourceId'] ?? '');
        if ($kind === 'av') {
            if ($sourceId !== '' && $sourceId !== 'current') {
                $row = Db::one('SELECT loadout_json FROM avatar_models WHERE id = ? AND user_id = ?', [$sourceId, $userId]);
                if ($row === null) {
                    throw new RpcError('That king is not yours.', 404);
                }
                $payload = (string) $row['loadout_json'];
            } else {
                $loadout = self::cleanLoadout($data['loadout'] ?? null);
                $payload = json_encode($loadout, JSON_UNESCAPED_SLASHES);
                if ($sourceId === '' || $sourceId === 'current') {
                    self::saveAvatarModel($userId, ['name' => $name, 'loadout' => $loadout]);
                }
            }
        } else {
            $row = Db::one('SELECT pieces, name FROM lego_builds WHERE id = ? AND user_id = ?', [$sourceId, $userId]);
            if ($row === null) {
                throw new RpcError('That board is not yours.', 404);
            }
            $payload = (string) $row['pieces'];
        }
        $seller = (string) (Db::value('SELECT username FROM profiles WHERE user_id = ?', [$userId]) ?? 'Player');
        $id = Util::uuid();
        Db::run(
            'INSERT INTO market_listings (id, seller_id, seller_name, kind, name, price, blurb, shot, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $userId, mb_substr($seller, 0, 64), $kind, $name, $price, $blurb, $shot, $payload, 'live', Db::now()]
        );
        return ['id' => $id];
    }

    /** @param array<string,mixed> $data */
    public static function buyMarketListing(string $userId, array $data): mixed
    {
        $id = (string) ($data['id'] ?? '');
        return Db::transaction(static function () use ($userId, $id): array {
            $row = Db::one('SELECT * FROM market_listings WHERE id = ? AND status = ?', [$id, 'live']);
            if ($row === null) {
                throw new RpcError('That listing is gone.', 404);
            }
            if ((string) $row['seller_id'] === $userId) {
                throw new RpcError('You cannot buy your own listing.');
            }
            $price = (int) $row['price'];
            $took = Db::run('UPDATE market_listings SET status = ?, buyer_id = ? WHERE id = ? AND status = ?', ['sold', $userId, $id, 'live']);
            if ($took === 0) {
                throw new RpcError('Someone else just bought that.');
            }
            $paid = Db::run('UPDATE profiles SET coins = coins - ? WHERE user_id = ? AND coins >= ?', [$price, $userId, $price]);
            if ($paid === 0) {
                Db::run('UPDATE market_listings SET status = ?, buyer_id = NULL WHERE id = ?', ['live', $id]);
                throw new RpcError('Not enough Morse coins.');
            }
            Db::run('UPDATE profiles SET coins = coins + ? WHERE user_id = ?', [$price, (string) $row['seller_id']]);
            $kind = (string) $row['kind'];
            if ($kind === 'av') {
                $loadout = json_decode((string) $row['payload'], true);
                if (!is_array($loadout)) {
                    throw new RpcError('That king is damaged.');
                }
                Db::run(
                    'INSERT INTO avatar_models (id, user_id, name, loadout_json, created_at) VALUES (?, ?, ?, ?, ?)',
                    [Util::uuid(), $userId, self::cleanName((string) $row['name'], 'King'), json_encode(self::cleanLoadout($loadout), JSON_UNESCAPED_SLASHES), Db::now()]
                );
            } else {
                $pieces = json_decode((string) $row['payload'], true);
                if (!is_array($pieces)) {
                    throw new RpcError('That board is damaged.');
                }
                $count = count($pieces);
                if ((int) Db::value('SELECT COUNT(*) FROM lego_builds WHERE user_id = ?', [$userId]) >= LegoBuilder::MAX_BUILDS) {
                    $old = Db::value('SELECT id FROM lego_builds WHERE user_id = ? AND active = 0 ORDER BY updated_at ASC LIMIT 1', [$userId]);
                    if (is_string($old) && $old !== '') {
                        Db::run('DELETE FROM lego_builds WHERE id = ? AND user_id = ?', [$old, $userId]);
                    }
                }
                $now = Db::now();
                Db::run(
                    'INSERT INTO lego_builds (id, user_id, name, pieces, piece_count, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
                    [Util::uuid(), $userId, self::cleanName((string) $row['name'], 'Brick board'), json_encode($pieces, JSON_UNESCAPED_SLASHES), $count, $now, $now]
                );
                $ownedRow = Db::one('SELECT owned_boards FROM profiles WHERE user_id = ?', [$userId]);
                $owned = array_values(array_filter(array_map('trim', explode(',', (string) ($ownedRow['owned_boards'] ?? '')))));
                if (!in_array(Catalog::LEGO_BOARD_ID, $owned, true)) {
                    $owned[] = Catalog::LEGO_BOARD_ID;
                    Db::run('UPDATE profiles SET owned_boards = ? WHERE user_id = ?', [implode(',', $owned), $userId]);
                }
            }
            $coins = (int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', [$userId]);
            return ['coins' => $coins, 'kind' => $kind];
        });
    }

    /** @param array<string,mixed> $r */
    private static function card(array $r, string $userId): array
    {
        return [
            'id' => (string) $r['id'],
            'seller' => (string) $r['seller_name'],
            'mine' => (string) $r['seller_id'] === $userId,
            'kind' => (string) $r['kind'],
            'name' => (string) $r['name'],
            'price' => (int) $r['price'],
            'blurb' => (string) $r['blurb'],
            'shot' => (string) $r['shot'],
        ];
    }

    /** @return list<array<string,mixed>> */
    private static function models(string $userId, bool $withCurrent): array
    {
        $out = [];
        if ($withCurrent) {
            $raw = Db::value('SELECT avatar_json FROM profiles WHERE user_id = ?', [$userId]);
            if (is_string($raw) && $raw !== '') {
                $out[] = ['id' => 'current', 'name' => 'King you are wearing', 'loadout' => json_decode($raw, true)];
            }
        }
        foreach (Db::all('SELECT id, name, loadout_json, created_at FROM avatar_models WHERE user_id = ? ORDER BY created_at DESC LIMIT 24', [$userId]) as $r) {
            $out[] = [
                'id' => (string) $r['id'],
                'name' => (string) $r['name'],
                'loadout' => json_decode((string) $r['loadout_json'], true),
            ];
        }
        return $out;
    }

    /** @return list<array<string,mixed>> */
    private static function boards(string $userId): array
    {
        $out = [];
        foreach (Db::all('SELECT id, name, piece_count FROM lego_builds WHERE user_id = ? ORDER BY updated_at DESC', [$userId]) as $r) {
            $out[] = ['id' => (string) $r['id'], 'name' => (string) $r['name'], 'count' => (int) $r['piece_count']];
        }
        return $out;
    }

    private static function cleanName(string $name, string $fallback): string
    {
        $name = trim(preg_replace('/\s+/u', ' ', $name) ?? '');
        $name = mb_substr($name === '' ? $fallback : $name, 0, 60);
        return $name;
    }

    /** @return array<string,mixed> */
    private static function cleanLoadout(mixed $raw): array
    {
        $parsed = Catalog::parseLoadout(is_array($raw) ? $raw : null);
        $json = json_encode($parsed, JSON_UNESCAPED_SLASHES);
        if (!is_string($json) || strlen($json) > 8000) {
            throw new RpcError('That king could not be packed.');
        }
        return $parsed;
    }
}
