<?php

declare(strict_types=1);

namespace Morse;

/** Request / response helpers. */
final class Http
{
    public static function isHttps(): bool
    {
        if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
            return true;
        }
        $fwd = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
        return $fwd === 'https' || str_starts_with($fwd, 'https,');
    }

    public static function host(): string
    {
        return (string) ($_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost');
    }

    public static function origin(): string
    {
        $configured = Config::get('APP_URL');
        if ($configured) {
            return rtrim($configured, '/');
        }
        return (self::isHttps() ? 'https' : 'http') . '://' . self::host();
    }

    public static function method(): string
    {
        return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    }

    public static function ip(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    public static function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $v = $_SERVER[$key] ?? null;
        return $v === null ? null : (string) $v;
    }

    /** @return array<string,mixed> decoded JSON object body ([] when absent/invalid) */
    public static function jsonBody(): array
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') {
            return $cache = [];
        }
        $data = json_decode($raw, true);
        return $cache = (is_array($data) ? $data : []);
    }

    /**
     * Port of assertSameSiteRequest(): reject scripted cross-site requests that
     * would otherwise ride the SameSite=Lax session cookie.
     */
    public static function assertSameSite(): void
    {
        $site = self::header('Sec-Fetch-Site');
        if ($site !== null && $site !== '' && !in_array($site, ['same-origin', 'none'], true)) {
            $dest = self::header('Sec-Fetch-Dest');
            $topLevelGet = self::header('Sec-Fetch-Mode') === 'navigate'
                && self::method() === 'GET'
                && $dest !== 'object' && $dest !== 'embed';
            if (!$topLevelGet) {
                throw new RpcError('Forbidden: cross-site request blocked', 403);
            }
        }
        $origin = self::header('Origin');
        if ($origin !== null && $origin !== '' && $origin !== 'null') {
            $originHost = parse_url($origin, PHP_URL_HOST);
            $originPort = parse_url($origin, PHP_URL_PORT);
            $originAuth = strtolower((string) $originHost . ($originPort ? ':' . $originPort : ''));
            $own = strtolower(self::host());
            $trusted = array_filter(array_map('trim', explode(',', Config::get('TRUSTED_ORIGINS', '') ?? '')));
            $trustedHosts = array_map(
                static function (string $o): string {
                    $h = parse_url($o, PHP_URL_HOST);
                    $p = parse_url($o, PHP_URL_PORT);
                    return strtolower((string) $h . ($p ? ':' . $p : ''));
                },
                $trusted
            );
            $appUrl = Config::get('APP_URL');
            if ($appUrl) {
                $h = parse_url($appUrl, PHP_URL_HOST);
                $p = parse_url($appUrl, PHP_URL_PORT);
                $trustedHosts[] = strtolower((string) $h . ($p ? ':' . $p : ''));
            }
            if ($originAuth !== $own && !in_array($originAuth, $trustedHosts, true)) {
                throw new RpcError('Forbidden: cross-site request blocked', 403);
            }
        }
    }

    public static function json(mixed $data, int $status = 200): never
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
            header('X-Content-Type-Options: nosniff');
        }
        echo json_encode(
            $data,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR
        );
        exit;
    }

    public static function setCookie(string $name, string $value, int $expires): void
    {
        setcookie($name, $value, [
            'expires' => $expires,
            'path' => '/',
            'secure' => self::isHttps(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function cookie(string $name): ?string
    {
        $v = $_COOKIE[$name] ?? null;
        return is_string($v) && $v !== '' ? $v : null;
    }
}
