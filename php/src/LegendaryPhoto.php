<?php

declare(strict_types=1);

namespace Morse;

/**
 * Legendary profile pictures (t337).
 *
 *  - setLegendaryPhoto {image: data URL}: JPEG/PNG/WebP only, at most 6 MB decoded and 8000 px a side.
 *    Decoded with GD, centre-cropped, resampled to 256x256 and re-encoded (WebP, or JPEG when the
 *    host's GD has no WebP), which drops EXIF/GPS and anything hidden in the file. Stored in the
 *    database as base64, so nothing uploaded ever lands on disk or in a web folder.
 *  - skipLegendaryPhoto: the player wears the first letter of their email instead.
 *  - legendaryPhotos {ids}: kind/version/letter for up to 24 players.
 *  - GET /api/photo?u=<userId>&v=<version>: the re-encoded bytes (signed-in players only).
 * Writes go through Rpc::dispatch (POST + same-site/Origin check) and are rate limited.
 */
final class LegendaryPhoto
{
    public const SIZE = 256;
    public const MAX_BYTES = 6 * 1024 * 1024;
    public const MAX_SIDE = 8000;
    /** Saves per player per hour. */
    public const RATE_LIMIT = 12;
    public const RATE_WINDOW_SEC = 3600;

    public static function register(): void
    {
        foreach (['setLegendaryPhoto', 'skipLegendaryPhoto', 'legendaryPhotos', 'myLegendaryPhoto'] as $name) {
            Rpc::register($name, [self::class, $name]);
        }
    }

    /** First letter (or digit) of the email, else the username, upper case. */
    public static function letterFor(string $userId): string
    {
        $email = (string) (Db::value('SELECT email FROM `user` WHERE id = ? LIMIT 1', [$userId]) ?? '');
        $name = (string) (Db::value('SELECT username FROM profiles WHERE user_id = ? LIMIT 1', [$userId]) ?? '');
        foreach ([$email, $name] as $s) {
            if (preg_match('/[\p{L}\p{N}]/u', $s, $m)) {
                return mb_strtoupper($m[0]);
            }
        }
        return 'M';
    }

    private static function throttle(string $userId): void
    {
        $bucket = 'legendary-photo:' . $userId;
        $now = Db::nowMs();
        $row = Db::one('SELECT `hits`, `window_start` FROM `auth_throttle` WHERE `bucket` = ?', [$bucket]);
        if ($row === null || Db::toMs($row['window_start']) + self::RATE_WINDOW_SEC * 1000 < $now) {
            Db::upsert('auth_throttle', ['bucket' => $bucket, 'hits' => 1, 'window_start' => Db::ts($now)], ['bucket'], ['hits', 'window_start']);
            return;
        }
        if ((int) $row['hits'] >= self::RATE_LIMIT) {
            throw new RpcError('Too many picture changes. Try again in a while.', 429);
        }
        Db::run('UPDATE `auth_throttle` SET `hits` = `hits` + 1 WHERE `bucket` = ?', [$bucket]);
    }

    /**
     * Validate + re-encode. Public for tests.
     * @return array{mime:string,bytes:string}
     */
    public static function reencode(string $dataUrl): array
    {
        if (!function_exists('imagecreatefromstring')) {
            throw new RpcError('Pictures are not available on this server yet.', 503);
        }
        if (!preg_match('#^data:image/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$#', $dataUrl, $m)) {
            throw new RpcError('Use a JPG, PNG or WebP picture.');
        }
        if (strlen($m[2]) > (int) ceil(self::MAX_BYTES * 4 / 3) + 16) {
            throw new RpcError('That picture is too big (6 MB max).');
        }
        $raw = base64_decode($m[2], true);
        if ($raw === false || $raw === '' || strlen($raw) > self::MAX_BYTES) {
            throw new RpcError('That picture is too big or broken.');
        }
        $info = @getimagesizefromstring($raw);
        $allowed = [IMAGETYPE_JPEG, IMAGETYPE_PNG];
        if (defined('IMAGETYPE_WEBP')) {
            $allowed[] = IMAGETYPE_WEBP;
        }
        if ($info === false || !in_array($info[2], $allowed, true)) {
            throw new RpcError('Use a JPG, PNG or WebP picture.');
        }
        [$w, $h] = [(int) $info[0], (int) $info[1]];
        if ($w < 16 || $h < 16 || $w > self::MAX_SIDE || $h > self::MAX_SIDE) {
            throw new RpcError('That picture is too small or too large.');
        }
        $src = @imagecreatefromstring($raw);
        if ($src === false) {
            throw new RpcError('That picture could not be read.');
        }
        $side = min($w, $h);
        $dst = imagecreatetruecolor(self::SIZE, self::SIZE);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 18, 12, 26));
        imagecopyresampled($dst, $src, 0, 0, intdiv($w - $side, 2), intdiv($h - $side, 2), self::SIZE, self::SIZE, $side, $side);
        imagedestroy($src);
        ob_start();
        $mime = 'image/jpeg';
        if (function_exists('imagewebp') && @imagewebp($dst, null, 82)) {
            $mime = 'image/webp';
        } else {
            ob_clean();
            imagejpeg($dst, null, 86);
        }
        $bytes = (string) ob_get_clean();
        imagedestroy($dst);
        if ($bytes === '') {
            throw new RpcError('That picture could not be saved.');
        }
        return ['mime' => $mime, 'bytes' => $bytes];
    }

    /** @return array{kind:string,letter:string,v:int}|null */
    private static function row(string $userId): ?array
    {
        $r = Db::one('SELECT kind, letter, version FROM legendary_photos WHERE user_id = ? LIMIT 1', [$userId]);
        return $r === null ? null : ['kind' => (string) $r['kind'], 'letter' => (string) $r['letter'], 'v' => (int) $r['version']];
    }

    private static function store(string $userId, string $kind, string $mime, ?string $data): array
    {
        $letter = self::letterFor($userId);
        $prev = (int) (Db::value('SELECT version FROM legendary_photos WHERE user_id = ? LIMIT 1', [$userId]) ?? 0);
        Db::upsert('legendary_photos', [
            'user_id' => $userId,
            'kind' => $kind,
            'letter' => $letter,
            'mime' => $mime,
            'data' => $data,
            'version' => $prev + 1,
            'updated_at' => Db::now(),
        ], ['user_id'], ['kind', 'letter', 'mime', 'data', 'version', 'updated_at']);
        return ['set' => true, 'kind' => $kind, 'letter' => $letter, 'v' => $prev + 1];
    }

    /** @param array<string,mixed> $data */
    public static function myLegendaryPhoto(string $userId, array $data): mixed
    {
        $r = self::row($userId);
        return $r === null
            ? ['set' => false, 'kind' => 'letter', 'letter' => self::letterFor($userId), 'v' => 0]
            : ['set' => true] + $r;
    }

    /** @param array<string,mixed> $data */
    public static function setLegendaryPhoto(string $userId, array $data): mixed
    {
        $img = self::reencode((string) ($data['image'] ?? ''));
        self::throttle($userId);
        return self::store($userId, 'photo', $img['mime'], base64_encode($img['bytes']));
    }

    /** @param array<string,mixed> $data */
    public static function skipLegendaryPhoto(string $userId, array $data): mixed
    {
        self::throttle($userId);
        return self::store($userId, 'letter', '', null);
    }

    /** @param array<string,mixed> $data */
    public static function legendaryPhotos(string $userId, array $data): mixed
    {
        $ids = array_values(array_unique(array_filter(array_map('strval', (array) ($data['ids'] ?? [])), static fn (string $s): bool => $s !== '' && strlen($s) <= 64)));
        $ids = array_slice($ids, 0, 24);
        $out = [];
        if ($ids === []) {
            return $out;
        }
        foreach (Db::all('SELECT user_id, kind, letter, version FROM legendary_photos WHERE user_id IN (' . Db::in($ids) . ')', $ids) as $r) {
            $out[(string) $r['user_id']] = ['kind' => (string) $r['kind'], 'letter' => (string) $r['letter'], 'v' => (int) $r['version']];
        }
        foreach ($ids as $id) {
            if (!isset($out[$id])) {
                $name = (string) (Db::value('SELECT username FROM profiles WHERE user_id = ? LIMIT 1', [$id]) ?? '');
                $out[$id] = ['kind' => 'none', 'letter' => preg_match('/[\p{L}\p{N}]/u', $name, $m) ? mb_strtoupper($m[0]) : '?', 'v' => 0];
            }
        }
        return $out;
    }

    /** GET /api/photo?u=<userId>: the stored picture bytes. */
    public static function serve(): never
    {
        if (Auth::currentUser() === null) {
            Http::json(['ok' => false, 'error' => ['message' => 'Sign in first', 'status' => 401]], 401);
        }
        $uid = (string) ($_GET['u'] ?? '');
        $row = $uid === '' ? null : Db::one("SELECT mime, data FROM legendary_photos WHERE user_id = ? AND kind = 'photo' LIMIT 1", [$uid]);
        $bytes = $row === null ? false : base64_decode((string) $row['data'], true);
        if ($row === null || $bytes === false || !in_array($row['mime'], ['image/webp', 'image/jpeg'], true)) {
            http_response_code(404);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'no picture';
            exit;
        }
        http_response_code(200);
        header('Content-Type: ' . $row['mime']);
        header('Content-Length: ' . strlen($bytes));
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; sandbox");
        header('Content-Disposition: inline; filename="photo"');
        // The URL carries ?v=<version>, so a changed picture gets a new URL.
        header('Cache-Control: private, max-age=86400');
        echo $bytes;
        exit;
    }
}
