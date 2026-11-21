<?php

declare(strict_types=1);

/**
 * Morse Chess Legendary front controller (alltherex.com/chessLegendary/).
 *
 * Legendary is a second skin over the SAME Morse Chess app: it serves the classic build's
 * app.html with the API and assets still pointed at /chess (same database, accounts, coins,
 * session cookie), the router mounted here, and the Legendary theme switched on.
 * Nothing in this folder talks to the database.
 *
 * Layout (deployed):  httpdocs/chess/app.html  +  httpdocs/chessLegendary/index.php
 * Override the sibling with MORSE_CHESS_DIR / MORSE_CHESS_BASE when testing locally.
 */

$chessDir = getenv('MORSE_CHESS_DIR') ?: dirname(__DIR__) . '/chess';
$chessBase = rtrim((string) (getenv('MORSE_CHESS_BASE') ?: '/chess'), '/');
$here = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/index.php'))), '/');

// The live folder is /chessLegendary/. IIS matches folders without caring about case, so
// /chesslegendary/... lands here too (and SCRIPT_NAME may still say /chessLegendary): look at the
// URL the browser asked for and send any other spelling to the canonical one (permanent).
$canonical = '/chessLegendary';
$uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
$asked = (string) parse_url($uri, PHP_URL_PATH);
$len = strlen($canonical);
if (strncasecmp($asked, $canonical, $len) === 0 && in_array(substr($asked, $len, 1), ['', '/'], true)
    && strncmp($asked, $canonical, $len) !== 0) {
    $q = strpos($uri, '?');
    header('Location: ' . $canonical . (substr($asked, $len) ?: '/') . ($q === false ? '' : substr($uri, $q)), true, 301);
    header('Cache-Control: public, max-age=86400');
    exit;
}

$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
if ($here !== '' && ($path === $here || str_starts_with($path, $here . '/'))) {
    $path = substr($path, strlen($here)) ?: '/';
}

// The API lives under /chess. A stray /chessLegendary/api call gets a pointer, not the page.
if ($path === '/api' || str_starts_with($path, '/api/')) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'The Morse Chess API is at ' . $chessBase . '/api.'], JSON_UNESCAPED_SLASHES);
    exit;
}

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

$index = $chessDir . '/app.html';
if (!is_file($index)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Morse Chess Legendary needs the Morse Chess build next door ({$chessBase}/).\n";
    exit;
}

$html = (string) file_get_contents($index);
$inject = '<base href="' . htmlspecialchars($chessBase . '/', ENT_QUOTES) . '" />'
    . '<script>window.MORSE_BASE=' . json_encode($chessBase, JSON_UNESCAPED_SLASHES)
    . ';window.MORSE_ROUTER_BASE=' . json_encode($here, JSON_UNESCAPED_SLASHES)
    . ';window.MORSE_THEME="legendary";document.documentElement.className+=" legendary";</script>'
    . '<meta name="theme-color" content="#0b0810" />';
$html = str_contains($html, '<!--MORSE_BASE-->')
    ? str_replace('<!--MORSE_BASE-->', $inject, $html)
    : (string) preg_replace('/<head([^>]*)>/i', '<head$1>' . $inject, $html, 1);
$html = (string) preg_replace('#<title>.*?</title>#is', '<title>Morse Chess Legendary</title>', $html, 1);
// Tab look (owner t368u): Legendary's own king favicon + names. /chess keeps its own icons.
$lg = htmlspecialchars($chessBase . '/legendary/', ENT_QUOTES);
$html = (string) preg_replace('#<link rel="(icon|apple-touch-icon|manifest)"[^>]*>\s*#i', '', $html);
$html = (string) preg_replace(
    '#</title>#i',
    '</title><link rel="icon" type="image/svg+xml" href="' . $lg . 'favicon.svg" />'
    . '<link rel="icon" type="image/png" sizes="32x32" href="' . $lg . 'icon-32.png" />'
    . '<link rel="icon" type="image/png" sizes="16x16" href="' . $lg . 'icon-16.png" />'
    . '<link rel="shortcut icon" href="' . $lg . 'favicon.ico" />'
    . '<link rel="apple-touch-icon" sizes="180x180" href="' . $lg . 'icon-180.png" />'
    . '<link rel="manifest" href="' . $lg . 'manifest.webmanifest" />',
    $html,
    1
);
$html = str_replace(
    ['<meta name="application-name" content="Morse Chess" />', '<meta property="og:title" content="Morse Chess" />'],
    ['<meta name="application-name" content="Morse Chess Legendary" />', '<meta property="og:title" content="Morse Chess Legendary" />'],
    $html
);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
echo $html;
