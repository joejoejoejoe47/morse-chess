<?php

declare(strict_types=1);

/**
 * Front controller for Plesk / shared hosting.
 *   <base>/api/*    -> PHP JSON API
 *   everything else -> the built React app (static files; unknown paths fall back to index.html)
 *
 * It works from any mount point (site root or a folder such as /chess) and finds
 * the PHP code in either layout:
 *   deployed:  <folder>/index.php  +  <folder>/app/src/...
 *   dev:       php/public/index.php  +  php/src/...
 */

$appDir = is_dir(__DIR__ . '/app/src') ? __DIR__ . '/app' : dirname(__DIR__);
require $appDir . '/src/bootstrap.php';

$base = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/index.php'))), '/');
$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
if ($base !== '' && ($path === $base || str_starts_with($path, $base . '/'))) {
    $path = substr($path, strlen($base)) ?: '/';
}

// Built-in dev server: let it serve real static files itself.
if (PHP_SAPI === 'cli-server') {
    $file = __DIR__ . $path;
    if ($path !== '/' && is_file($file) && !str_ends_with($file, '.php')) {
        return false;
    }
}

if ($path === '/api' || str_starts_with($path, '/api/')) {
    \Morse\Api::handle($path);
}

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

$index = is_file(__DIR__ . '/app.html') ? __DIR__ . '/app.html' : __DIR__ . '/index.html';
if (!is_file($index)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo "The front end has not been built yet.\nRun `npm install && npm run build` and copy the contents of dist/ next to this file.\n";
    exit;
}

$html = (string) file_get_contents($index);
$inject = '<base href="' . htmlspecialchars($base . '/', ENT_QUOTES) . '" />'
    . '<script>window.MORSE_BASE=' . json_encode($base, JSON_UNESCAPED_SLASHES) . ';</script>';
$html = str_contains($html, '<!--MORSE_BASE-->')
    ? str_replace('<!--MORSE_BASE-->', $inject, $html)
    : preg_replace('/<head([^>]*)>/i', '<head$1>' . $inject, $html, 1);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
echo $html;
