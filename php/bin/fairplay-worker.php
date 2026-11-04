#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Fair-play analysis worker. Run it from cron, e.g. every 5 minutes:
 *   php php/bin/fairplay-worker.php --limit 10
 * Set FAIRPLAY_ENGINE (see src/UciEngine.php) so games get engine-checked; without it only
 * the timing / focus / rating signals are computed.
 */

require __DIR__ . '/../src/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    exit(1);
}
$limit = 10;
foreach ($argv as $i => $a) {
    if ($a === '--limit') {
        $limit = max(1, (int) ($argv[$i + 1] ?? 10));
    }
}
try {
    \Morse\Db::ensureSchema();
    $engine = \Morse\UciEngine::fromConfig();
    $n = \Morse\FairPlay::runPending($engine, $limit);
    fwrite(STDOUT, "Fair play: $n player-games analysed" . ($engine === null ? ' (no engine configured)' : '') . "\n");
} catch (Throwable $e) {
    fwrite(STDERR, 'Fair-play worker failed: ' . $e->getMessage() . "\n");
    exit(1);
}
