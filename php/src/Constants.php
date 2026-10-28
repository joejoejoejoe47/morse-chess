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
    /**
     * Morse coins for games (owner rule, Oct 28): beat a "very high score" player -> 5 coins,
     * beat anyone else -> 2 coins. Losses, draws and aborted games pay nothing.
     * "Very high score" = the opponent's rating when the game STARTED is at least this much
     * (300 above the 1200 everyone starts on; live, only the top few accounts and both MorseBots are there).
     */
    public const HIGH_SCORE_AT = 1500;
    public const COINS_WIN_HIGH = 5;
    public const COINS_WIN = 2;
    /** A game that ends by resign or clock before this many half-moves is "aborted" (no coins). Checkmate always counts. */
    public const COINS_MIN_PLIES = 6;
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
