<?php

declare(strict_types=1);

namespace Morse;

use PDO;
use PDOException;
use Throwable;

/**
 * Thin PDO wrapper. MySQL / MariaDB is the primary target; SQLite is supported
 * so the whole app can run (and be tested) with zero setup.
 *
 * Rules every query in this codebase follows so it runs on both:
 *   - positional `?` placeholders only
 *   - timestamps are produced in PHP (Db::now() / Db::ts()) and stored as
 *     UTC 'Y-m-d H:i:s.v' strings, never with NOW()/CURRENT_TIMESTAMP
 *   - dialect differences go through the helpers below (insertIgnore, upsert,
 *     forUpdate), never raw `INSERT IGNORE` / `ON DUPLICATE KEY`
 *   - no GREATEST/LEAST/DATE_SUB; compute in PHP
 */
final class Db
{
    private static ?PDO $pdo = null;
    private static string $driver = 'mysql';

    public static function driver(): string
    {
        self::pdo();
        return self::$driver;
    }

    public static function isSqlite(): bool
    {
        return self::driver() === 'sqlite';
    }

    /** Replace the connection (used by tests). */
    public static function useConnection(PDO $pdo, string $driver): void
    {
        self::$pdo = $pdo;
        self::$driver = $driver;
    }

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }
        $driver = strtolower(Config::get('DB_DRIVER', 'mysql') ?? 'mysql');
        if ($driver === 'sqlite') {
            $path = Config::get('DB_SQLITE') ?? Config::storagePath('morse.sqlite');
            $pdo = new PDO('sqlite:' . $path, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            $pdo->exec('PRAGMA foreign_keys = ON');
            $pdo->exec('PRAGMA journal_mode = WAL');
            $pdo->exec('PRAGMA busy_timeout = 5000');
            self::$driver = 'sqlite';
        } else {
            $socket = Config::get('DB_SOCKET');
            $dsn = $socket
                ? sprintf('mysql:unix_socket=%s;dbname=%s;charset=utf8mb4', $socket, Config::get('DB_NAME', 'morse_chess'))
                : sprintf(
                    'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                    Config::get('DB_HOST', '127.0.0.1'),
                    Config::get('DB_PORT', '3306'),
                    Config::get('DB_NAME', 'morse_chess')
                );
            $pdo = new PDO($dsn, Config::get('DB_USER', 'root'), Config::get('DB_PASS', ''), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]);
            // All timestamps are UTC strings; keep the session consistent.
            $pdo->exec("SET time_zone = '+00:00'");
            self::$driver = 'mysql';
        }
        return self::$pdo = $pdo;
    }

    /**
     * @param array<int,mixed> $params
     * @return list<array<string,mixed>>
     */
    public static function all(string $sql, array $params = []): array
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute(self::bind($params));
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * @param array<int,mixed> $params
     * @return array<string,mixed>|null
     */
    public static function one(string $sql, array $params = []): ?array
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute(self::bind($params));
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $stmt->closeCursor();
        return $row === false ? null : $row;
    }

    /** First column of the first row, or null. @param array<int,mixed> $params */
    public static function value(string $sql, array $params = []): mixed
    {
        $row = self::one($sql, $params);
        if ($row === null) {
            return null;
        }
        return reset($row);
    }

    /** Execute a write; returns affected rows. @param array<int,mixed> $params */
    public static function run(string $sql, array $params = []): int
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute(self::bind($params));
        return $stmt->rowCount();
    }

    public static function insertId(): string
    {
        return (string) self::pdo()->lastInsertId();
    }

    /**
     * INSERT that silently does nothing when the primary/unique key exists.
     * @param array<string,mixed> $row
     */
    public static function insertIgnore(string $table, array $row): int
    {
        $cols = array_keys($row);
        $verb = self::isSqlite() ? 'INSERT OR IGNORE INTO' : 'INSERT IGNORE INTO';
        $sql = sprintf(
            '%s %s (%s) VALUES (%s)',
            $verb,
            self::ident($table),
            implode(', ', array_map([self::class, 'ident'], $cols)),
            implode(', ', array_fill(0, count($cols), '?'))
        );
        return self::run($sql, array_values($row));
    }

    /**
     * Insert, or update $updateCols from the new row when a key collides.
     * @param array<string,mixed> $row
     * @param list<string> $keyCols   conflict target (used by SQLite)
     * @param list<string> $updateCols
     */
    public static function upsert(string $table, array $row, array $keyCols, array $updateCols): int
    {
        $cols = array_keys($row);
        $base = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            self::ident($table),
            implode(', ', array_map([self::class, 'ident'], $cols)),
            implode(', ', array_fill(0, count($cols), '?'))
        );
        if (self::isSqlite()) {
            $set = implode(', ', array_map(fn ($c) => self::ident($c) . ' = excluded.' . self::ident($c), $updateCols));
            $sql = $base . ' ON CONFLICT (' . implode(', ', array_map([self::class, 'ident'], $keyCols)) . ') DO UPDATE SET ' . $set;
        } else {
            $set = implode(', ', array_map(fn ($c) => self::ident($c) . ' = VALUES(' . self::ident($c) . ')', $updateCols));
            $sql = $base . ' ON DUPLICATE KEY UPDATE ' . $set;
        }
        return self::run($sql, array_values($row));
    }

    /** ` FOR UPDATE` on MySQL (row lock inside a transaction); nothing on SQLite. */
    public static function forUpdate(): string
    {
        return self::isSqlite() ? '' : ' FOR UPDATE';
    }

    /** "?, ?, ?" for an IN (...) list. @param array<int,mixed> $values */
    public static function in(array $values): string
    {
        return implode(', ', array_fill(0, max(1, count($values)), '?'));
    }

    /**
     * Run $fn inside a transaction (nested calls join the outer one).
     * @template T
     * @param callable():T $fn
     * @return T
     */
    public static function transaction(callable $fn): mixed
    {
        $pdo = self::pdo();
        if ($pdo->inTransaction()) {
            return $fn();
        }
        $pdo->beginTransaction();
        try {
            $result = $fn();
            $pdo->commit();
            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    // ── time helpers ───────────────────────────────────────────────────────

    /** Current UTC time as a DB timestamp string. */
    public static function now(): string
    {
        return self::ts((int) floor(microtime(true) * 1000));
    }

    /** Epoch milliseconds -> DB timestamp string (UTC, millisecond precision). */
    public static function ts(int|float $ms): string
    {
        $ms = (int) $ms;
        $sec = intdiv($ms, 1000);
        $rem = $ms - $sec * 1000;
        if ($rem < 0) {
            $rem += 1000;
            $sec -= 1;
        }
        return gmdate('Y-m-d H:i:s', $sec) . sprintf('.%03d', $rem);
    }

    public static function nowMs(): int
    {
        return (int) floor(microtime(true) * 1000);
    }

    /**
     * Any DB-returned datetime (string / int seconds / int ms) -> epoch ms.
     * Port of asTime() from the TypeScript server.
     */
    public static function toMs(mixed $v): int
    {
        if (is_int($v) || is_float($v)) {
            $n = (float) $v;
            return (int) ($n < 1e12 ? $n * 1000 : $n);
        }
        if (is_string($v) && $v !== '') {
            if (ctype_digit($v)) {
                $n = (float) $v;
                return (int) ($n < 1e12 ? $n * 1000 : $n);
            }
            $s = $v;
            if (!preg_match('/(Z|[+-]\d{2}:?\d{2})$/', $s)) {
                $s = str_replace(' ', 'T', $s) . 'Z';
            }
            $t = strtotime($s);
            if ($t !== false) {
                $frac = 0;
                if (preg_match('/\.(\d{1,6})/', $v, $m)) {
                    $frac = (int) str_pad(substr($m[1], 0, 3), 3, '0');
                }
                return $t * 1000 + $frac;
            }
        }
        return self::nowMs();
    }

    /** DB datetime -> ISO-8601 string (what JS `new Date().toISOString()` gives). */
    public static function iso(mixed $v): string
    {
        $ms = self::toMs($v);
        return gmdate('Y-m-d\TH:i:s', intdiv($ms, 1000)) . sprintf('.%03dZ', $ms % 1000);
    }

    /** MySQL tinyint / "t" / true -> bool. */
    public static function bool(mixed $v): bool
    {
        if (is_bool($v)) {
            return $v;
        }
        if (is_string($v)) {
            return in_array(strtolower($v), ['1', 't', 'true', 'y', 'yes'], true);
        }
        return (bool) $v;
    }

    // ── internals ──────────────────────────────────────────────────────────

    public static function ident(string $name): string
    {
        return '`' . str_replace('`', '``', $name) . '`';
    }

    /**
     * @param array<int,mixed> $params
     * @return array<int,mixed>
     */
    private static function bind(array $params): array
    {
        $out = [];
        foreach (array_values($params) as $p) {
            if (is_bool($p)) {
                $out[] = $p ? 1 : 0;
            } else {
                $out[] = $p;
            }
        }
        return $out;
    }

    // ── schema ─────────────────────────────────────────────────────────────

    /**
     * Make sure the schema exists. Cheap on the hot path: a flag file keyed by
     * the schema file's hash is written after a successful run.
     */
    public static function ensureSchema(bool $force = false): void
    {
        $file = Config::root() . '/sql/schema.sql';
        $hash = sha1((string) file_get_contents($file) . self::driver());
        $flag = Config::storagePath('schema-' . substr($hash, 0, 16) . '.ok');
        if (!$force && is_file($flag)) {
            return;
        }
        self::runSchema((string) file_get_contents($file));
        @file_put_contents($flag, gmdate('c'));
    }

    public static function runSchema(string $sql): void
    {
        $pdo = self::pdo();
        $statements = self::isSqlite() ? self::translateForSqlite($sql) : self::splitStatements($sql);
        foreach ($statements as $stmt) {
            try {
                $pdo->exec($stmt);
            } catch (PDOException $e) {
                // Duplicate column / index / table on re-runs against an existing database.
                $code = (int) ($e->errorInfo[1] ?? 0);
                if (in_array($code, [1050, 1060, 1061], true)) {
                    continue;
                }
                if (self::isSqlite() && str_contains(strtolower($e->getMessage()), 'duplicate column')) {
                    continue;
                }
                throw $e;
            }
        }
    }

    /** @return list<string> */
    public static function splitStatements(string $sql): array
    {
        $lines = [];
        foreach (preg_split('/\R/', $sql) ?: [] as $line) {
            if (preg_match('/^\s*--/', $line)) {
                continue;
            }
            $lines[] = $line;
        }
        $parts = [];
        foreach (explode(';', implode("\n", $lines)) as $part) {
            $part = trim($part);
            if ($part !== '') {
                $parts[] = $part;
            }
        }
        return $parts;
    }

    /**
     * Turn the MySQL schema into SQLite statements: drop table options, map the
     * auto-increment key, hoist inline KEY lines into CREATE INDEX statements.
     * @return list<string>
     */
    public static function translateForSqlite(string $sql): array
    {
        $out = [];
        foreach (self::splitStatements($sql) as $stmt) {
            if (preg_match('/^INSERT\s+IGNORE\s+INTO/i', $stmt)) {
                $out[] = preg_replace('/^INSERT\s+IGNORE\s+INTO/i', 'INSERT OR IGNORE INTO', $stmt);
                continue;
            }
            if (!preg_match('/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`?(\w+)`?/i', $stmt, $m)) {
                $out[] = $stmt;
                continue;
            }
            $table = $m[1];
            $indexes = [];
            $body = [];
            foreach (preg_split('/\R/', $stmt) ?: [] as $line) {
                if (preg_match('/^\s*(UNIQUE\s+)?KEY\s+`?(\w+)`?\s*\(([^)]*)\)\s*,?\s*$/i', $line, $k)) {
                    $indexes[] = sprintf(
                        'CREATE %sINDEX IF NOT EXISTS `%s_%s` ON `%s` (%s)',
                        $k[1] !== '' ? 'UNIQUE ' : '',
                        $table,
                        $k[2],
                        $table,
                        $k[3]
                    );
                    continue;
                }
                $body[] = $line;
            }
            $create = implode("\n", $body);
            $create = preg_replace('/\)\s*ENGINE\s*=.*$/is', ')', $create) ?? $create;
            $create = preg_replace(
                '/`?(\w+)`?\s+(?:BIGINT|INT)(?:\(\d+\))?\s+(?:UNSIGNED\s+)?NOT\s+NULL\s+AUTO_INCREMENT(?:\s+PRIMARY\s+KEY)?/i',
                '`$1` INTEGER PRIMARY KEY AUTOINCREMENT',
                $create
            ) ?? $create;
            // A trailing comma before the closing paren is left behind when KEY lines were removed.
            $create = preg_replace('/,\s*\)\s*$/', "\n)", $create) ?? $create;
            // SQLite already has the AUTOINCREMENT key; drop a separate PRIMARY KEY (id) line.
            if (stripos($create, 'AUTOINCREMENT') !== false) {
                $create = preg_replace('/,\s*PRIMARY\s+KEY\s*\(`?\w+`?\)/i', '', $create) ?? $create;
            }
            $out[] = $create;
            foreach ($indexes as $idx) {
                $out[] = $idx;
            }
        }
        return $out;
    }
}
