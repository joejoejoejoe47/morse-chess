<?php

declare(strict_types=1);

namespace Morse;

/**
 * Runtime configuration.
 *
 * Values come from (first match wins): real environment variables, then the
 * `.env` file in the php/ directory. Nothing else is read, so shared hosts that
 * only offer a control-panel "environment" screen or an uploaded .env both work.
 *
 *   DB_DRIVER     mysql (default) | sqlite
 *   DB_HOST       127.0.0.1
 *   DB_PORT       3306
 *   DB_NAME       morse_chess
 *   DB_USER       root
 *   DB_PASS       (empty)
 *   DB_SOCKET     optional unix socket path (some shared hosts need it)
 *   DB_SQLITE     path of the SQLite file when DB_DRIVER=sqlite (default storage/morse.sqlite)
 *   APP_URL       public origin, e.g. https://chess.example.com (optional; derived from the request otherwise)
 *   TRUSTED_ORIGINS  comma separated extra origins allowed to POST (optional)
 *   APP_DEBUG     1 to include exception messages in 500 responses
 */
final class Config
{
    /** @var array<string,string>|null */
    private static ?array $file = null;

    public static function root(): string
    {
        return dirname(__DIR__);
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        $env = getenv($key);
        if ($env !== false && trim($env) !== '') {
            return trim($env);
        }
        if (isset($_ENV[$key]) && trim((string) $_ENV[$key]) !== '') {
            return trim((string) $_ENV[$key]);
        }
        self::$file ??= self::loadFile(self::root() . '/.env');
        $value = self::$file[$key] ?? null;
        return ($value !== null && trim($value) !== '') ? trim($value) : $default;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $v = self::get($key);
        if ($v === null) {
            return $default;
        }
        return in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
    }

    public static function storagePath(string $suffix = ''): string
    {
        $dir = self::root() . '/storage';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return $suffix === '' ? $dir : $dir . '/' . ltrim($suffix, '/');
    }

    /** @return array<string,string> */
    private static function loadFile(string $path): array
    {
        $out = [];
        if (!is_file($path) || !is_readable($path)) {
            return $out;
        }
        foreach (file($path, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            $eq = strpos($line, '=');
            if ($eq === false) {
                continue;
            }
            $key = trim(substr($line, 0, $eq));
            $val = trim(substr($line, $eq + 1));
            if (strlen($val) >= 2 && ($val[0] === '"' || $val[0] === "'") && substr($val, -1) === $val[0]) {
                $val = substr($val, 1, -1);
            }
            $out[$key] = $val;
        }
        return $out;
    }
}
