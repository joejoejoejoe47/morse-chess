<?php

declare(strict_types=1);

namespace Morse;

final class Util
{
    /** RFC 4122 v4 UUID (what crypto.randomUUID() returned in the Node app). */
    public static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        $h = bin2hex($b);
        return sprintf('%s-%s-%s-%s-%s', substr($h, 0, 8), substr($h, 8, 4), substr($h, 12, 4), substr($h, 16, 4), substr($h, 20, 12));
    }

    /** Math.random() < $p */
    public static function chance(float $p): bool
    {
        return (random_int(0, 999999) / 1000000) < $p;
    }

    /** data/catalog.json, decoded once. @return array<string,mixed> */
    public static function catalog(): array
    {
        static $catalog = null;
        if ($catalog === null) {
            $catalog = json_decode((string) file_get_contents(Config::root() . '/data/catalog.json'), true, 512, JSON_THROW_ON_ERROR);
        }
        return $catalog;
    }

    /** A shrunk chat picture, or null. Throws RpcError when the payload is not a picture. */
    public static function chatImage(mixed $raw): ?string
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        $image = is_string($raw) ? $raw : '';
        if ($image === '') {
            return null;
        }
        if (strlen($image) > 160000 || !preg_match('#\Adata:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}\z#', $image)) {
            throw new RpcError('That image is too big, or it is not a picture.');
        }
        return $image;
    }
}
