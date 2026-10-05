<?php

declare(strict_types=1);

namespace Morse;

/**
 * Pure-PHP scrypt (N=16384, r=8, p=1, 32-byte key), used ONLY to verify club
 * passwords hashed by the old Node app (`salt:hash`, node:crypto scryptSync).
 * New hashes use password_hash(); a successful legacy check is upgraded.
 * Costs roughly a second or two of CPU and ~20 MB of RAM per call.
 */
final class Scrypt
{
    private const N = 16384;
    private const R = 8;

    /** Node's `scryptSync(password, saltString, 32)` as raw bytes. */
    public static function derive(string $password, string $salt, int $dkLen = 32): string
    {
        $r = self::R;
        $b = hash_pbkdf2('sha256', $password, $salt, 1, 128 * $r, true);
        $x = array_values(unpack('V*', $b));
        $n = self::N;
        $v = [];
        for ($i = 0; $i < $n; $i++) {
            $v[$i] = pack('V*', ...$x);
            $x = self::blockMix($x, $r);
        }
        for ($i = 0; $i < $n; $i++) {
            $j = $x[(2 * $r - 1) * 16] & ($n - 1);
            $vj = unpack('V*', $v[$j]);
            $k = 0;
            foreach ($vj as $w) {
                $x[$k] ^= $w;
                $k++;
            }
            $x = self::blockMix($x, $r);
        }
        return hash_pbkdf2('sha256', $password, pack('V*', ...$x), 1, $dkLen, true);
    }

    /** @param list<int> $b @return list<int> */
    private static function blockMix(array $b, int $r): array
    {
        $t = array_slice($b, (2 * $r - 1) * 16, 16);
        $even = [];
        $odd = [];
        for ($i = 0; $i < 2 * $r; $i++) {
            $o = $i * 16;
            for ($k = 0; $k < 16; $k++) {
                $t[$k] ^= $b[$o + $k];
            }
            $t = self::salsa8($t);
            if ($i % 2 === 0) {
                array_push($even, ...$t);
            } else {
                array_push($odd, ...$t);
            }
        }
        return array_merge($even, $odd);
    }

    /** @param list<int> $in @return list<int> */
    private static function salsa8(array $in): array
    {
        [$x0, $x1, $x2, $x3, $x4, $x5, $x6, $x7, $x8, $x9, $x10, $x11, $x12, $x13, $x14, $x15] = $in;
        $m = 0xffffffff;
        for ($i = 0; $i < 4; $i++) {
            $u = ($x0 + $x12) & $m; $x4 ^= (($u << 7) | ($u >> 25)) & $m;
            $u = ($x4 + $x0) & $m; $x8 ^= (($u << 9) | ($u >> 23)) & $m;
            $u = ($x8 + $x4) & $m; $x12 ^= (($u << 13) | ($u >> 19)) & $m;
            $u = ($x12 + $x8) & $m; $x0 ^= (($u << 18) | ($u >> 14)) & $m;
            $u = ($x5 + $x1) & $m; $x9 ^= (($u << 7) | ($u >> 25)) & $m;
            $u = ($x9 + $x5) & $m; $x13 ^= (($u << 9) | ($u >> 23)) & $m;
            $u = ($x13 + $x9) & $m; $x1 ^= (($u << 13) | ($u >> 19)) & $m;
            $u = ($x1 + $x13) & $m; $x5 ^= (($u << 18) | ($u >> 14)) & $m;
            $u = ($x10 + $x6) & $m; $x14 ^= (($u << 7) | ($u >> 25)) & $m;
            $u = ($x14 + $x10) & $m; $x2 ^= (($u << 9) | ($u >> 23)) & $m;
            $u = ($x2 + $x14) & $m; $x6 ^= (($u << 13) | ($u >> 19)) & $m;
            $u = ($x6 + $x2) & $m; $x10 ^= (($u << 18) | ($u >> 14)) & $m;
            $u = ($x15 + $x11) & $m; $x3 ^= (($u << 7) | ($u >> 25)) & $m;
            $u = ($x3 + $x15) & $m; $x7 ^= (($u << 9) | ($u >> 23)) & $m;
            $u = ($x7 + $x3) & $m; $x11 ^= (($u << 13) | ($u >> 19)) & $m;
            $u = ($x11 + $x7) & $m; $x15 ^= (($u << 18) | ($u >> 14)) & $m;
            $u = ($x0 + $x3) & $m; $x1 ^= (($u << 7) | ($u >> 25)) & $m;
            $u = ($x1 + $x0) & $m; $x2 ^= (($u << 9) | ($u >> 23)) & $m;
            $u = ($x2 + $x1) & $m; $x3 ^= (($u << 13) | ($u >> 19)) & $m;
            $u = ($x3 + $x2) & $m; $x0 ^= (($u << 18) | ($u >> 14)) & $m;
            $u = ($x5 + $x4) & $m; $x6 ^= (($u << 7) | ($u >> 25)) & $m;
            $u = ($x6 + $x5) & $m; $x7 ^= (($u << 9) | ($u >> 23)) & $m;
            $u = ($x7 + $x6) & $m; $x4 ^= (($u << 13) | ($u >> 19)) & $m;
            $u = ($x4 + $x7) & $m; $x5 ^= (($u << 18) | ($u >> 14)) & $m;
            $u = ($x10 + $x9) & $m; $x11 ^= (($u << 7) | ($u >> 25)) & $m;
            $u = ($x11 + $x10) & $m; $x8 ^= (($u << 9) | ($u >> 23)) & $m;
            $u = ($x8 + $x11) & $m; $x9 ^= (($u << 13) | ($u >> 19)) & $m;
            $u = ($x9 + $x8) & $m; $x10 ^= (($u << 18) | ($u >> 14)) & $m;
            $u = ($x15 + $x14) & $m; $x12 ^= (($u << 7) | ($u >> 25)) & $m;
            $u = ($x12 + $x15) & $m; $x13 ^= (($u << 9) | ($u >> 23)) & $m;
            $u = ($x13 + $x12) & $m; $x14 ^= (($u << 13) | ($u >> 19)) & $m;
            $u = ($x14 + $x13) & $m; $x15 ^= (($u << 18) | ($u >> 14)) & $m;
        }
        $x = [$x0, $x1, $x2, $x3, $x4, $x5, $x6, $x7, $x8, $x9, $x10, $x11, $x12, $x13, $x14, $x15];
        $out = [];
        for ($i = 0; $i < 16; $i++) {
            $out[] = ($x[$i] + $in[$i]) & $m;
        }
        return $out;
    }

    /** Verify a legacy `saltHex:hashHex` string. */
    public static function verifyLegacy(string $password, string $stored): bool
    {
        $parts = explode(':', $stored);
        if (count($parts) < 2 || $parts[0] === '' || $parts[1] === '') {
            return false;
        }
        $prev = @hex2bin($parts[1]);
        if ($prev === false || $prev === '') {
            return false;
        }
        $next = self::derive($password, $parts[0], strlen($prev));
        return hash_equals($prev, $next);
    }
}
