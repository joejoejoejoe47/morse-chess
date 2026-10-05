#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Create / update the database schema.  Usage:  php php/bin/migrate.php
 * (The web app also does this automatically on its first API request, so this
 * is only needed if you want to see errors up front or lack write access to
 * php/storage.)
 */

require __DIR__ . '/../src/bootstrap.php';

try {
    \Morse\Db::ensureSchema(true);
    fwrite(STDOUT, 'Schema OK on ' . \Morse\Db::driver() . "\n");
} catch (Throwable $e) {
    fwrite(STDERR, 'Migration failed: ' . $e->getMessage() . "\n");
    exit(1);
}
