<?php

declare(strict_types=1);

/**
 * The old Morse Chess Legendary address (alltherex.com/chessledgendary/, misspelled). It moved to
 * /chessLegendary/ (t358): every path here answers with a permanent redirect to the same path and
 * query string there, e.g. /chessledgendary/store?x=1 -> /chessLegendary/store?x=1.
 */

$target = rtrim((string) (getenv('MORSE_LEGENDARY_HOME') ?: '/chessLegendary'), '/');
$here = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/index.php'))), '/');
$uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
$path = (string) parse_url($uri, PHP_URL_PATH);
if ($here !== '' && strncasecmp($path, $here, strlen($here)) === 0) {
    $path = substr($path, strlen($here));
}
if ($path === '' || $path === false) {
    $path = '/';
}
$q = strpos($uri, '?');
header('Location: ' . $target . $path . ($q === false ? '' : substr($uri, $q)), true, 301);
header('Cache-Control: public, max-age=86400');
header('Content-Type: text/plain; charset=utf-8');
echo "Morse Chess Legendary moved to {$target}/\n";
