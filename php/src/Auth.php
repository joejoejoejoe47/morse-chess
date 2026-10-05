<?php

declare(strict_types=1);

namespace Morse;

/**
 * Email + password accounts with opaque server-side sessions.
 *
 * Replaces Better Auth. The endpoints keep Better Auth's shapes
 * (/api/auth/sign-up/email, /sign-in/email, /sign-out, /get-session) so the
 * React client needed only a small adapter. Federated sign-in (Google / X via
 * the Grok broker) was specific to the original hosting platform and is not
 * ported.
 */
final class Auth
{
    public const COOKIE = 'morse_session';
    private const SESSION_DAYS = 30;

    /** @var array<string,mixed>|null|false false = not resolved yet */
    private static array|null|false $cached = false;

    // ── session lookup ─────────────────────────────────────────────────────

    /** @return array{id:string,name:string,email:string,image:?string,emailVerified:bool}|null */
    public static function currentUser(): ?array
    {
        if (self::$cached !== false) {
            return self::$cached;
        }
        $token = Http::cookie(self::COOKIE);
        if ($token === null) {
            return self::$cached = null;
        }
        $row = Db::one(
            'SELECT s.`id` AS sid, s.`expiresAt` AS expiresAt, u.`id` AS uid, u.`name` AS name, u.`email` AS email,
                    u.`image` AS image, u.`emailVerified` AS ev
             FROM `session` s JOIN `user` u ON u.`id` = s.`userId`
             WHERE s.`token` = ? LIMIT 1',
            [hash('sha256', $token)]
        );
        if ($row === null || Db::toMs($row['expiresAt']) < Db::nowMs()) {
            return self::$cached = null;
        }
        // Slide the expiry forward at most once an hour to avoid a write per request.
        $remaining = Db::toMs($row['expiresAt']) - Db::nowMs();
        if ($remaining < (self::SESSION_DAYS * 86400 * 1000) - 3600 * 1000) {
            $newExpiry = Db::nowMs() + self::SESSION_DAYS * 86400 * 1000;
            Db::run('UPDATE `session` SET `expiresAt` = ?, `updatedAt` = ? WHERE `id` = ?', [Db::ts($newExpiry), Db::now(), $row['sid']]);
            Http::setCookie(self::COOKIE, $token, intdiv($newExpiry, 1000));
        }
        return self::$cached = [
            'id' => (string) $row['uid'],
            'name' => (string) $row['name'],
            'email' => (string) $row['email'],
            'image' => $row['image'] !== null ? (string) $row['image'] : null,
            'emailVerified' => Db::bool($row['ev']),
        ];
    }

    /** The verified user id, or a 401. */
    public static function requireUserId(): string
    {
        $user = self::currentUser();
        if ($user === null) {
            throw new RpcError('Unauthorized', 401);
        }
        return $user['id'];
    }

    // ── account operations ─────────────────────────────────────────────────

    /** @return array{id:string,name:string,email:string,image:?string,emailVerified:bool} */
    public static function signUp(string $email, string $password, string $name): array
    {
        $email = self::normalizeEmail($email);
        $name = trim($name);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new RpcError('Invalid email address.', 400);
        }
        self::checkPassword($password);
        if ($name === '' || mb_strlen($name) > 100) {
            throw new RpcError('Name is required.', 400);
        }
        self::throttle('signup:' . Http::ip(), 10, 3600, true);

        $exists = Db::value('SELECT `id` FROM `user` WHERE `email` = ? LIMIT 1', [$email]);
        if ($exists !== null) {
            throw new RpcError('User already exists. Use another email.', 422);
        }
        $id = self::randomId();
        $now = Db::now();
        Db::transaction(function () use ($id, $email, $name, $password, $now): void {
            Db::run(
                'INSERT INTO `user` (`id`, `name`, `email`, `emailVerified`, `image`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, 0, NULL, ?, ?)',
                [$id, $name, $email, $now, $now]
            );
            Db::run(
                'INSERT INTO `account` (`id`, `accountId`, `providerId`, `userId`, `password`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [self::randomId(), $id, 'credential', $id, self::hash($password), $now, $now]
            );
        });
        self::startSession($id);
        return ['id' => $id, 'name' => $name, 'email' => $email, 'image' => null, 'emailVerified' => false];
    }

    /** @return array{id:string,name:string,email:string,image:?string,emailVerified:bool} */
    public static function signIn(string $email, string $password): array
    {
        $email = self::normalizeEmail($email);
        $bucket = 'signin:' . sha1(Http::ip() . '|' . $email);
        self::throttle($bucket, 10, 600, false);

        $row = Db::one(
            'SELECT u.`id` AS id, u.`name` AS name, u.`email` AS email, u.`image` AS image, u.`emailVerified` AS ev, a.`password` AS pw
             FROM `user` u JOIN `account` a ON a.`userId` = u.`id` AND a.`providerId` = ?
             WHERE u.`email` = ? LIMIT 1',
            ['credential', $email]
        );
        $ok = $row !== null && is_string($row['pw']) && self::verify($password, $row['pw']);
        if (!$ok) {
            self::throttle($bucket, 10, 600, true);
            throw new RpcError('Invalid email or password', 401);
        }
        if (password_needs_rehash((string) $row['pw'], PASSWORD_DEFAULT)) {
            Db::run('UPDATE `account` SET `password` = ?, `updatedAt` = ? WHERE `userId` = ? AND `providerId` = ?', [self::hash($password), Db::now(), $row['id'], 'credential']);
        }
        self::startSession((string) $row['id']);
        return [
            'id' => (string) $row['id'],
            'name' => (string) $row['name'],
            'email' => (string) $row['email'],
            'image' => $row['image'] !== null ? (string) $row['image'] : null,
            'emailVerified' => Db::bool($row['ev']),
        ];
    }

    public static function signOut(): void
    {
        $token = Http::cookie(self::COOKIE);
        if ($token !== null) {
            Db::run('DELETE FROM `session` WHERE `token` = ?', [hash('sha256', $token)]);
        }
        Http::setCookie(self::COOKIE, '', time() - 3600);
        unset($_COOKIE[self::COOKIE]);
        self::$cached = null;
    }

    public static function startSession(string $userId): void
    {
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $now = Db::nowMs();
        $expires = $now + self::SESSION_DAYS * 86400 * 1000;
        Db::run(
            'INSERT INTO `session` (`id`, `expiresAt`, `token`, `createdAt`, `updatedAt`, `ipAddress`, `userAgent`, `userId`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                self::randomId(),
                Db::ts($expires),
                hash('sha256', $token), // only the hash is stored
                Db::ts($now),
                Db::ts($now),
                Http::ip(),
                mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500),
                $userId,
            ]
        );
        // Opportunistic cleanup of dead sessions.
        if (random_int(1, 50) === 1) {
            Db::run('DELETE FROM `session` WHERE `expiresAt` < ?', [Db::ts($now)]);
        }
        Http::setCookie(self::COOKIE, $token, intdiv($expires, 1000));
        $_COOKIE[self::COOKIE] = $token;
        self::$cached = false;
    }

    // ── helpers ────────────────────────────────────────────────────────────

    public static function randomId(): string
    {
        return bin2hex(random_bytes(16));
    }

    public static function normalizeEmail(string $email): string
    {
        return strtolower(trim($email));
    }

    public static function checkPassword(string $password): void
    {
        if (strlen($password) < 8) {
            throw new RpcError('Password too short', 400);
        }
        if (strlen($password) > 128) {
            throw new RpcError('Password too long', 400);
        }
    }

    /** Pre-hash so bcrypt's 72-byte limit never silently truncates a password. */
    public static function hash(string $password): string
    {
        return password_hash(base64_encode(hash('sha256', $password, true)), PASSWORD_DEFAULT);
    }

    public static function verify(string $password, string $hash): bool
    {
        return password_verify(base64_encode(hash('sha256', $password, true)), $hash);
    }

    /**
     * Fixed-window attempt counter. With $record=false it only checks the limit;
     * with $record=true it also counts one more hit.
     */
    private static function throttle(string $bucket, int $limit, int $windowSec, bool $record): void
    {
        $now = Db::nowMs();
        $row = Db::one('SELECT `hits`, `window_start` FROM `auth_throttle` WHERE `bucket` = ?', [$bucket]);
        if ($row === null || Db::toMs($row['window_start']) + $windowSec * 1000 < $now) {
            if ($record) {
                Db::upsert('auth_throttle', ['bucket' => $bucket, 'hits' => 1, 'window_start' => Db::ts($now)], ['bucket'], ['hits', 'window_start']);
            }
            return;
        }
        $hits = (int) $row['hits'];
        if ($hits >= $limit) {
            throw new RpcError('Too many attempts. Try again in a few minutes.', 429);
        }
        if ($record) {
            Db::run('UPDATE `auth_throttle` SET `hits` = `hits` + 1 WHERE `bucket` = ?', [$bucket]);
        }
    }
}
