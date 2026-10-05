<?php

declare(strict_types=1);

namespace Morse;

use Throwable;

/** Routes everything under /api/. */
final class Api
{
    public static function handle(string $path): never
    {
        try {
            Db::ensureSchema();

            if ($path === '/api/health') {
                Db::value('SELECT 1');
                Http::json(['ok' => true, 'driver' => Db::driver()]);
            }

            if (preg_match('#^/api/rpc/([A-Za-z0-9_]+)$#', $path, $m)) {
                Rpc::dispatch($m[1]);
            }

            if (str_starts_with($path, '/api/auth/') || $path === '/api/club-sign-in') {
                self::auth($path);
            }

            if ($path === '/api/rtc') {
                Signaling::handle();
            }

            Http::json(['ok' => false, 'error' => ['message' => 'Not found', 'status' => 404]], 404);
        } catch (RpcError $e) {
            Http::json(['message' => $e->getMessage(), 'ok' => false, 'error' => ['message' => $e->getMessage(), 'status' => $e->status]], $e->status);
        } catch (Throwable $e) {
            error_log('[api ' . $path . '] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $message = Config::bool('APP_DEBUG') ? $e->getMessage() : 'Server error. Try once more.';
            Http::json(['message' => $message, 'ok' => false, 'error' => ['message' => $message, 'status' => 500]], 500);
        }
    }

    private static function auth(string $path): never
    {
        $method = Http::method();

        if ($path === '/api/auth/get-session' && $method === 'GET') {
            $user = Auth::currentUser();
            if ($user === null) {
                Http::json(null);
            }
            Http::json(['user' => $user, 'session' => ['userId' => $user['id']]]);
        }

        if ($method !== 'POST') {
            throw new RpcError('Method not allowed', 405);
        }
        Http::assertSameSite();
        $b = Http::jsonBody();

        switch ($path) {
            case '/api/auth/sign-up/email':
                $user = Auth::signUp((string) ($b['email'] ?? ''), (string) ($b['password'] ?? ''), (string) ($b['name'] ?? ''));
                Http::json(['user' => $user]);

            case '/api/auth/sign-in/email':
                $user = Auth::signIn((string) ($b['email'] ?? ''), (string) ($b['password'] ?? ''));
                Http::json(['user' => $user]);

            case '/api/auth/sign-out':
                Auth::signOut();
                Http::json(['success' => true]);

            case '/api/club-sign-in':
                self::clubSignIn($b);
        }
        throw new RpcError('Not found', 404);
    }

    /**
     * Sign in by username (or email) + password. Mirrors routes/api/club-sign-in.ts:
     * failures answer HTTP 200 with { ok: false, error } so the form can show them.
     * @param array<string,mixed> $b
     */
    private static function clubSignIn(array $b): never
    {
        $quiet = static fn (string $msg) => Http::json(['ok' => false, 'error' => $msg]);
        try {
            $username = trim((string) ($b['username'] ?? ''));
            $typed = strtolower(trim((string) ($b['email'] ?? '')));
            $password = (string) ($b['password'] ?? '');
            if (strlen($password) < 8) {
                $quiet('Password must be at least 8 characters.');
            }
            $email = '';
            if ($username !== '' && !str_contains($username, '@')) {
                $found = Db::value(
                    'SELECT u.`email` FROM `user` u JOIN `profiles` p ON p.`user_id` = u.`id` WHERE p.`username_lc` = ? LIMIT 1',
                    [strtolower($username)]
                );
                $email = strtolower((string) ($found ?? ''));
            }
            if ($email === '' && str_contains($typed, '@')) {
                $email = $typed;
            }
            if ($email === '' && str_contains($username, '@')) {
                $email = strtolower($username);
            }
            if ($email === '' && $username !== '') {
                $email = Constants::usernameToEmail($username);
            }
            if ($email === '') {
                $quiet('Enter your username or the email you created with.');
            }
            try {
                Auth::signIn($email, $password);
            } catch (RpcError $e) {
                if ($e->status === 429) {
                    $quiet($e->getMessage());
                }
                $quiet('No seat with that name and password. Use the email you created the account with.');
            }
            Http::json(['ok' => true]);
        } catch (RpcError $e) {
            throw $e;
        }
    }
}
