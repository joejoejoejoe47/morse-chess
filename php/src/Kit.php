<?php

declare(strict_types=1);

namespace Morse;

/**
 * The Royal Legacy kit. Owning the "king-royal-legacy" gear makes every 3D piece of that player
 * pearl and gold with the first letter of their username. Game looks carry it as two extra keys
 * ("kit" and "letter") next to the saved AV loadout; the client ignores them outside 3D.
 */
final class Kit
{
    public const LEGACY = 'king-royal-legacy';

    /** @var array<string,array{legacy:bool,letter:string}> */
    private static array $seen = [];

    /** The look JSON a game hands the board for one player. */
    public static function look(string $userId, ?string $avatarJson): string
    {
        $raw = (string) ($avatarJson ?? '');
        if ($userId === '') {
            return $raw;
        }
        $data = [];
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                return $raw;
            }
            $data = $decoded;
        }
        $off = !empty($data['legacyOff']);
        unset($data['legacyOff']);
        $kit = self::of($userId);
        if (!$kit['legacy'] || $off) {
            // Switched off ("Back to normal"): the regular set, and the legendary finish put away.
            if ($off && ($data['finishId'] ?? '') === self::LEGACY) {
                $data['finishId'] = 'king-onyx';
            }
            if (!$off) {
                return $raw;
            }
            return $data === [] ? '' : (string) json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }
        $data['kit'] = 'legacy';
        $data['letter'] = $kit['letter'];
        return (string) json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    /** First letter or digit of a username, upper case ("" when there is none). */
    public static function letter(string $username): string
    {
        if (preg_match('/[\p{L}\p{N}]/u', $username, $m) === 1) {
            return mb_strtoupper($m[0]);
        }
        return '';
    }

    /** @return array{legacy:bool,letter:string} */
    private static function of(string $userId): array
    {
        if (!isset(self::$seen[$userId])) {
            $row = Db::one('SELECT username, owned_gear FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
            $owned = array_map('trim', explode(',', (string) ($row['owned_gear'] ?? '')));
            self::$seen[$userId] = [
                'legacy' => in_array(self::LEGACY, $owned, true),
                'letter' => self::letter((string) ($row['username'] ?? '')),
            ];
        }
        return self::$seen[$userId];
    }

    /** Forget cached owners (after a purchase in the same request, and in tests). */
    public static function reset(): void
    {
        self::$seen = [];
    }
}
