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
// /chesslegendary/... lands here too: send it to the one canonical spelling (permanent).
$canonical = '/chessLegendary';
if ($here !== $canonical && strcasecmp($here, $canonical) === 0) {
    $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
    $q = strpos($uri, '?');
    $rest = substr((string) parse_url($uri, PHP_URL_PATH), strlen($here)) ?: '/';
    header('Location: ' . $canonical . $rest . ($q === false ? '' : substr($uri, $q)), true, 301);
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

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
echo $html;
