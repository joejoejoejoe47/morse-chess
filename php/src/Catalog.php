<?php

declare(strict_types=1);

namespace Morse;

/**
 * Board skins + avatar gear rules, read from data/catalog.json (generated from
 * the TypeScript sources by scripts/export-php-data.mjs).
 * Ports of boardById / boardUnlocked / gearPrice / parseLoadout.
 */
final class Catalog
{
    public static function defaultBoardId(): string
    {
        return (string) Util::catalog()['boards']['defaultId'];
    }

    public static function masterScore(): int
    {
        return (int) Util::catalog()['boards']['masterScore'];
    }

    public static function isMasterUsername(string $name): bool
    {
        return strtolower(trim($name)) === strtolower((string) Util::catalog()['boards']['masterUsername']);
    }

    /** @return array{id:string,cost:int,coinCost:int,sealed:bool} Unknown ids fall back to the first board, like the TS version. */
    public static function boardById(?string $id): array
    {
        $items = Util::catalog()['boards']['items'];
        foreach ($items as $b) {
            if ($b['id'] === ($id ?? '')) {
                return $b;
            }
        }
        return $items[0];
    }

    /**
     * @param array{id:string,cost:int,coinCost:int,sealed:bool}|string $board
     * @param list<string> $owned
     */
    public static function boardUnlocked(int|float $score, array|string $board, array $owned = []): bool
    {
        $b = is_string($board) ? self::boardById($board) : $board;
        if (($b['coinCost'] ?? 0) > 0) {
            return in_array($b['id'], $owned, true);
        }
        return (is_finite((float) $score) ? $score : 0) >= $b['cost'];
    }

    /** @return list<string> */
    public static function starterIds(): array
    {
        return Util::catalog()['avatar']['starterIds'];
    }

    public static function gearPrice(string $id): int
    {
        foreach (Util::catalog()['avatar']['groups'] as $rows) {
            foreach ($rows as $r) {
                if ($r['id'] === $id) {
                    return (int) $r['price'];
                }
            }
        }
        return 0;
    }

    public static function isKnownGear(string $id): bool
    {
        foreach (Util::catalog()['avatar']['groups'] as $rows) {
            foreach ($rows as $r) {
                if ($r['id'] === $id) {
                    return true;
                }
            }
        }
        return false;
    }

    /** @return array<string,string> */
    public static function defaultLoadout(): array
    {
        return Util::catalog()['avatar']['defaultLoadout'];
    }

    /**
     * Port of parseLoadout(): coerce any input into a valid loadout.
     * @return array<string,string>
     */
    public static function parseLoadout(mixed $raw): array
    {
        $src = is_array($raw) ? $raw : [];
        $groups = Util::catalog()['avatar']['groups'];
        $legacy = Util::catalog()['avatar']['legacy'];
        $style = $src['style'] ?? null;
        $style = in_array($style, ['2d', 'an', 'ra', '3d'], true) ? $style : '3d';
        $team = ($src['team'] ?? null) === 'b' ? 'b' : 'w';
        $pick = static function (mixed $id, string $fallback, array $rows): string {
            if (is_string($id)) {
                foreach ($rows as $r) {
                    if ($r['id'] === $id) {
                        return $id;
                    }
                }
            }
            return $fallback;
        };
        $swordRaw = in_array((string) ($src['swordId'] ?? ''), $legacy['sword']['from'], true) ? $legacy['sword']['to'] : ($src['swordId'] ?? null);
        $crownRaw = in_array((string) ($src['crownId'] ?? ''), $legacy['crown']['from'], true) ? $legacy['crown']['to'] : ($src['crownId'] ?? null);
        $attackRaw = in_array((string) ($src['attackId'] ?? ''), $legacy['attack']['from'], true) ? $legacy['attack']['to'] : ($src['attackId'] ?? null);
        return [
            'style' => $style,
            'team' => $team,
            'anId' => $pick($src['anId'] ?? null, 'knight', $groups['characters']),
            'kingId' => $pick($src['kingId'] ?? null, 'piece', $groups['characters']),
            'swordId' => $pick($swordRaw, 'none', $groups['swords']),
            'crownId' => $pick($crownRaw, 'poly-band', $groups['crowns']),
            'mountId' => $pick($src['mountId'] ?? null, 'none', $groups['mounts']),
            'frameId' => $pick($src['frameId'] ?? null, 'plain', $groups['frames']),
            'attackId' => $pick($attackRaw, 'march', $groups['attacks']),
        ];
    }
}
