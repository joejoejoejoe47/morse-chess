<?php

declare(strict_types=1);

namespace Morse;

/** Port of src/lib/mores-constants.ts (server-relevant parts). */
final class Constants
{
    public const BOT_USER_ID = 'bot-mores';
    public const BOT_USERNAME = 'MorseBot';
    public const BOT_V2_USER_ID = 'bot-mores-v2';
    public const BOT_V2_USERNAME = 'MorseBotv2';
    public const START_SCORE = 1200;
    public const ELO_K = 32;
    public const ELO_FLOOR = 100;
    public const TURN_MS = 60000;
    public const USERNAME_RE = '/^[a-zA-Z0-9_]{8,20}$/';

    public static function isBotUserId(string $id): bool
    {
        return $id === self::BOT_USER_ID || $id === self::BOT_V2_USER_ID;
    }

    /** @return 'v1'|'v2'|null */
    public static function botKindOf(string $id): ?string
    {
        if ($id === self::BOT_V2_USER_ID) {
            return 'v2';
        }
        if ($id === self::BOT_USER_ID) {
            return 'v1';
        }
        return null;
    }

    public static function usernameToEmail(string $username): string
    {
        return strtolower(trim($username)) . '@players.moreschess.app';
    }
}
