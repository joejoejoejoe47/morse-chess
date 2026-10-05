<?php

declare(strict_types=1);

/**
 * Shared test harness. Runs against an in-memory SQLite database that is built
 * from the very same sql/schema.sql the MySQL install uses.
 */

require __DIR__ . '/../src/bootstrap.php';

use Morse\Db;

function test_db(): void
{
    $pdo = new PDO('sqlite::memory:', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys = OFF');
    Db::useConnection($pdo, 'sqlite');
    Db::runSchema((string) file_get_contents(__DIR__ . '/../sql/schema.sql'));
}

$GLOBALS['__t'] = ['pass' => 0, 'fail' => 0];

function check(bool $cond, string $label): void
{
    if ($cond) {
        $GLOBALS['__t']['pass']++;
    } else {
        $GLOBALS['__t']['fail']++;
        fwrite(STDERR, "  FAIL: $label\n");
    }
}

function finish(): never
{
    $t = $GLOBALS['__t'];
    echo "{$t['pass']} passed, {$t['fail']} failed\n";
    exit($t['fail'] > 0 ? 1 : 0);
}
