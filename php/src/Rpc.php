<?php

declare(strict_types=1);

namespace Morse;

use Throwable;

/**
 * Server-function registry. The React client used to call TanStack Start
 * `createServerFn` handlers; it now POSTs `{ "data": ... }` to
 * `/api/rpc/<name>` and gets back `{ "ok": true, "result": ... }` or
 * `{ "ok": false, "error": { "message": "...", "status": 4xx } }`.
 *
 * A handler is `function (string $userId, array $data): mixed`. `$userId` is the
 * verified session user (empty string for handlers registered with auth=false).
 * Throw RpcError for user-facing failures.
 */
final class Rpc
{
    /** @var array<string,array{0:callable,1:bool}> */
    private static array $routes = [];

    public static function register(string $name, callable $handler, bool $auth = true): void
    {
        self::$routes[$name] = [$handler, $auth];
    }

    /** @return list<string> */
    public static function names(): array
    {
        return array_keys(self::$routes);
    }

    public static function dispatch(string $name): never
    {
        try {
            if (Http::method() !== 'POST') {
                throw new RpcError('Method not allowed', 405);
            }
            Http::assertSameSite();
            if (!isset(self::$routes[$name])) {
                throw new RpcError('Unknown function', 404);
            }
            [$handler, $needsAuth] = self::$routes[$name];
            $userId = $needsAuth ? Auth::requireUserId() : (Auth::currentUser()['id'] ?? '');
            $body = Http::jsonBody();
            $data = $body['data'] ?? [];
            if (!is_array($data)) {
                $data = [];
            }
            $result = $handler($userId, $data);
            Http::json(['ok' => true, 'result' => $result === null ? null : $result]);
        } catch (RpcError $e) {
            Http::json(['ok' => false, 'error' => ['message' => $e->getMessage(), 'status' => $e->status]], $e->status);
        } catch (Throwable $e) {
            error_log('[rpc ' . $name . '] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $message = Config::bool('APP_DEBUG') ? $e->getMessage() : 'Something went wrong. Try once more.';
            Http::json(['ok' => false, 'error' => ['message' => $message, 'status' => 500]], 500);
        }
    }
}
