<?php

declare(strict_types=1);

namespace Morse;

/**
 * "Create Lego board": owners of the Lego Universe board (and its gift account) build their own
 * surroundings out of LDraw pieces. Most pieces are free; the cool ones cost 1-5 Morse coins once.
 * A saved build can be put "in use": the Lego board then shows it around the chess board.
 */
final class LegoBuilder
{
    public const MAX_PIECES = 2500;
    public const MAX_BUILDS = 20;
    /** Build area in studs: x, z in [-AREA, AREA), the chess board keeps |x|,|z| < RESERVED clear. */
    public const AREA = 60;
    public const RESERVED = 19;
    public const MAX_Y = 160; // plates

    public static function register(): void
    {
        foreach (['legoBuilderState', 'buyLegoPart', 'saveLegoBuild', 'getLegoBuild', 'deleteLegoBuild', 'useLegoBuild', 'activeLegoBuild'] as $name) {
            Rpc::register($name, [self::class, $name]);
        }
    }

    /** @return array<string,int> part id => price in Morse coins */
    public static function prices(): array
    {
        static $p = null;
        if ($p === null) {
            $raw = json_decode((string) @file_get_contents(Config::root() . '/data/lego_parts.json'), true);
            $p = [];
            foreach (is_array($raw) ? $raw : [] as $id => $price) {
                $p[(string) $id] = max(0, (int) $price);
            }
        }
        return $p;
    }

    private static function allowed(string $userId): bool
    {
        $row = Db::one('SELECT owned_boards, username FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
        if ($row === null) {
            return false;
        }
        $owned = array_filter(array_map('trim', explode(',', (string) ($row['owned_boards'] ?? ''))));
        return in_array(Catalog::LEGO_BOARD_ID, $owned, true)
            || in_array(Catalog::LEGO_BOARD_ID, Catalog::giftBoardsFor((string) ($row['username'] ?? '')), true);
    }

    private static function requireAllowed(string $userId): void
    {
        if (!self::allowed($userId)) {
            throw new RpcError('Create Brick board comes with the Brick Heroes board.', 403);
        }
    }

    /** @return list<string> */
    private static function owned(string $userId): array
    {
        return array_map('strval', array_column(Db::all('SELECT part_id FROM lego_parts_owned WHERE user_id = ?', [$userId]), 'part_id'));
    }

    /** @return list<array<string,mixed>> */
    private static function builds(string $userId): array
    {
        $out = [];
        foreach (Db::all('SELECT id, name, piece_count, active, updated_at FROM lego_builds WHERE user_id = ? ORDER BY updated_at DESC', [$userId]) as $r) {
            $out[] = ['id' => (string) $r['id'], 'name' => (string) $r['name'], 'count' => (int) $r['piece_count'], 'active' => Db::bool($r['active']), 'updatedAt' => Db::iso($r['updated_at'])];
        }
        return $out;
    }

    /** @param array<string,mixed> $data */
    public static function legoBuilderState(string $userId, array $data): mixed
    {
        $allowed = self::allowed($userId);
        $coins = (int) (Db::value('SELECT coins FROM profiles WHERE user_id = ?', [$userId]) ?? 0);
        return [
            'allowed' => $allowed,
            'coins' => $coins,
            'prices' => self::prices(),
            'owned' => $allowed ? self::owned($userId) : [],
            'builds' => $allowed ? self::builds($userId) : [],
        ];
    }

    /** @param array<string,mixed> $data */
    public static function buyLegoPart(string $userId, array $data): mixed
    {
        self::requireAllowed($userId);
        $id = is_string($data['id'] ?? null) ? $data['id'] : '';
        $prices = self::prices();
        if (!array_key_exists($id, $prices)) {
            throw new RpcError('That piece is not in the box.');
        }
        $price = $prices[$id];
        return Db::transaction(static function () use ($userId, $id, $price): array {
            $have = in_array($id, self::owned($userId), true);
            if (!$have && $price > 0) {
                // Conditional update: two parallel purchases cannot both spend the same coins.
                $changed = Db::run('UPDATE profiles SET coins = coins - ? WHERE user_id = ? AND coins >= ?', [$price, $userId, $price]);
                if ($changed === 0) {
                    throw new RpcError("That piece costs {$price} Morse coins.");
                }
                Db::insertIgnore('lego_parts_owned', ['user_id' => $userId, 'part_id' => $id, 'bought_at' => Db::now()]);
            }
            return [
                'coins' => (int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', [$userId]),
                'owned' => self::owned($userId),
            ];
        });
    }

    /**
     * Validate a piece list from the client: [{p, x, y, z, r, c}] in studs / plates / quarter turns.
     * @return list<array{p:string,x:int,y:int,z:int,r:int,c:string}>
     */
    public static function cleanPieces(mixed $raw, array $prices, array $owned): array
    {
        if (!is_array($raw)) {
            throw new RpcError('The build is empty.');
        }
        if (count($raw) > self::MAX_PIECES) {
            throw new RpcError('A build can have at most ' . self::MAX_PIECES . ' pieces.');
        }
        $out = [];
        foreach ($raw as $pc) {
            if (!is_array($pc)) {
                throw new RpcError('Bad piece in the build.');
            }
            $p = is_string($pc['p'] ?? null) ? $pc['p'] : '';
            if (!array_key_exists($p, $prices)) {
                throw new RpcError('Unknown piece in the build.');
            }
            if ($prices[$p] > 0 && !in_array($p, $owned, true)) {
                throw new RpcError('Buy that piece before you save it in a build.');
            }
            $n = static function (string $k) use ($pc): int {
                $v = $pc[$k] ?? null;
                if (!is_int($v) && !(is_float($v) && floor($v) === $v)) {
                    throw new RpcError('Bad piece position.');
                }
                return (int) $v;
            };
            $x = $n('x');
            $z = $n('z');
            $y = $n('y');
            $r = $n('r');
            if ($x < -self::AREA || $x > self::AREA || $z < -self::AREA || $z > self::AREA || $y < 0 || $y > self::MAX_Y || $r < 0 || $r > 3) {
                throw new RpcError('A piece is outside the building area.');
            }
            $c = is_string($pc['c'] ?? null) ? strtolower($pc['c']) : '';
            if (!preg_match('/^#[0-9a-f]{6}$/', $c)) {
                throw new RpcError('Bad piece colour.');
            }
            $out[] = ['p' => $p, 'x' => $x, 'y' => $y, 'z' => $z, 'r' => $r, 'c' => $c];
        }
        return $out;
    }

    /** @param array<string,mixed> $data */
    public static function saveLegoBuild(string $userId, array $data): mixed
    {
        self::requireAllowed($userId);
        $name = trim(preg_replace('/\s+/u', ' ', is_string($data['name'] ?? null) ? $data['name'] : '') ?? '');
        $name = mb_substr($name === '' ? 'My Brick board' : $name, 0, 40);
        $pieces = self::cleanPieces($data['pieces'] ?? null, self::prices(), self::owned($userId));
        $json = json_encode($pieces, JSON_UNESCAPED_SLASHES);
        $id = is_string($data['id'] ?? null) ? $data['id'] : '';
        $now = Db::now();
        if ($id !== '') {
            $changed = Db::run('UPDATE lego_builds SET name = ?, pieces = ?, piece_count = ?, updated_at = ? WHERE id = ? AND user_id = ?', [$name, $json, count($pieces), $now, $id, $userId]);
            if ($changed === 0 && Db::value('SELECT COUNT(*) FROM lego_builds WHERE id = ? AND user_id = ?', [$id, $userId]) == 0) {
                throw new RpcError('That build is gone.', 404);
            }
        } else {
            if ((int) Db::value('SELECT COUNT(*) FROM lego_builds WHERE user_id = ?', [$userId]) >= self::MAX_BUILDS) {
                throw new RpcError('You can keep ' . self::MAX_BUILDS . ' builds. Delete one first.');
            }
            $id = Util::uuid();
            Db::run(
                'INSERT INTO lego_builds (id, user_id, name, pieces, piece_count, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
                [$id, $userId, $name, $json, count($pieces), $now, $now]
            );
        }
        return ['id' => $id, 'builds' => self::builds($userId)];
    }

    /** @param array<string,mixed> $data */
    public static function getLegoBuild(string $userId, array $data): mixed
    {
        self::requireAllowed($userId);
        $row = Db::one('SELECT id, name, pieces, active FROM lego_builds WHERE id = ? AND user_id = ?', [(string) ($data['id'] ?? ''), $userId]);
        if ($row === null) {
            throw new RpcError('That build is gone.', 404);
        }
        return ['id' => (string) $row['id'], 'name' => (string) $row['name'], 'active' => Db::bool($row['active']), 'pieces' => json_decode((string) $row['pieces'], true) ?: []];
    }

    /** @param array<string,mixed> $data */
    public static function deleteLegoBuild(string $userId, array $data): mixed
    {
        self::requireAllowed($userId);
        Db::run('DELETE FROM lego_builds WHERE id = ? AND user_id = ?', [(string) ($data['id'] ?? ''), $userId]);
        return ['builds' => self::builds($userId)];
    }

    /** Put one build in use on the Lego board (or none with id = null). @param array<string,mixed> $data */
    public static function useLegoBuild(string $userId, array $data): mixed
    {
        self::requireAllowed($userId);
        $id = is_string($data['id'] ?? null) ? $data['id'] : '';
        return Db::transaction(static function () use ($userId, $id): array {
            if ($id !== '' && Db::value('SELECT COUNT(*) FROM lego_builds WHERE id = ? AND user_id = ?', [$id, $userId]) == 0) {
                throw new RpcError('That build is gone.', 404);
            }
            Db::run('UPDATE lego_builds SET active = 0 WHERE user_id = ?', [$userId]);
            if ($id !== '') {
                Db::run('UPDATE lego_builds SET active = 1 WHERE id = ? AND user_id = ?', [$id, $userId]);
                // Playing on it means the Lego board is the one you sit at.
                Db::run("UPDATE profiles SET equipped_board = ?, piece_style = 'lg' WHERE user_id = ?", [Catalog::LEGO_BOARD_ID, $userId]);
            }
            return ['builds' => self::builds($userId)];
        });
    }

    /** The build the signed-in player has in use, for the Lego board's surroundings. @param array<string,mixed> $data */
    public static function activeLegoBuild(string $userId, array $data): mixed
    {
        if (!self::allowed($userId)) {
            return null;
        }
        $row = Db::one('SELECT id, name, pieces FROM lego_builds WHERE user_id = ? AND active = 1 LIMIT 1', [$userId]);
        if ($row === null) {
            return null;
        }
        return ['id' => (string) $row['id'], 'name' => (string) $row['name'], 'pieces' => json_decode((string) $row['pieces'], true) ?: []];
    }
}
