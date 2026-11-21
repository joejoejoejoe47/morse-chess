<?php

declare(strict_types=1);

/**
 * The /chessLegendary/ front controller: serves the shared Morse Chess app.html with the API and
 * assets still at /chess, the router at /chessLegendary and the Legendary theme on.
 */

$checks = 0;
$fails = 0;
function mcheck(bool $ok, string $name): void
{
    global $checks, $fails;
    $checks++;
    if (!$ok) {
        $fails++;
        fwrite(STDERR, "FAIL $name\n");
    }
}

$tmp = sys_get_temp_dir() . '/mcl-mount-' . bin2hex(random_bytes(4));
mkdir($tmp . '/chess', 0777, true);
file_put_contents($tmp . '/chess/app.html', "<!doctype html><html><head><title>Morse Chess</title><!--MORSE_BASE--></head><body><div id=\"root\"></div><script src=\"./assets/index.js\"></script></body></html>");
$controller = dirname(__DIR__) . '/public-legendary/index.php';

function serve(string $controller, string $uri, string $chessDir, string $script = '/chessLegendary/index.php'): string
{
    $code = 'register_shutdown_function(function(){echo "\\n[code=".http_response_code()."]";});'
        . '$_SERVER["SCRIPT_NAME"]=' . var_export($script, true) . ';$_SERVER["REQUEST_URI"]=' . var_export($uri, true) . ';'
        . 'putenv("MORSE_CHESS_DIR=' . addslashes($chessDir) . '");require ' . var_export($controller, true) . ';';
    return (string) shell_exec(escapeshellarg(PHP_BINARY) . ' -r ' . escapeshellarg($code) . ' 2>&1');
}

$html = serve($controller, '/chessLegendary/store', $tmp . '/chess');
mcheck(str_contains($html, '<base href="/chess/" />'), 'assets resolve from /chess');
mcheck(str_contains($html, 'window.MORSE_BASE="/chess"'), 'API base stays /chess (same backend + DB)');
mcheck(str_contains($html, 'window.MORSE_ROUTER_BASE="/chessLegendary"'), 'router mounted at /chessLegendary');
mcheck(str_contains($html, 'window.MORSE_THEME="legendary"'), 'theme on');
mcheck(str_contains($html, '<title>Morse Chess Legendary</title>'), 'title');
mcheck(!str_contains($html, '<!--MORSE_BASE-->'), 'placeholder replaced');

$api = serve($controller, '/chessLegendary/api/rpc/getHomeState', $tmp . '/chess');
mcheck(str_contains($api, '/chess/api') && !str_contains($api, '<html'), 'stray API path points at /chess/api');

$missing = serve($controller, '/chessLegendary/', $tmp . '/nope');
mcheck(str_contains($missing, 'needs the Morse Chess build'), 'missing build is reported, not a blank page');

// Lower-case /chesslegendary/ (IIS ignores case) is sent to the canonical spelling.
$lower = serve($controller, '/chesslegendary/store', $tmp . '/chess', '/chesslegendary/index.php');
mcheck(str_contains($lower, '[code=301]') && !str_contains($lower, '<html'), 'lower-case folder 301s to /chessLegendary');
mcheck(str_contains($html, '[code=200]') || !str_contains($html, '[code=301]'), 'canonical folder is not redirected');

// The old misspelled /chessledgendary/ folder only redirects.
$old = serve(dirname(__DIR__) . '/public-legendary-redirect/index.php', '/chessledgendary/store?x=1', $tmp . '/chess', '/chessledgendary/index.php');
mcheck(str_contains($old, '[code=301]') && str_contains($old, 'moved to /chessLegendary/') && !str_contains($old, '<html'), 'old address 301s to /chessLegendary');

// The classic front controller is untouched by Legendary: no theme flag there.
$classic = (string) file_get_contents(dirname(__DIR__) . '/public/index.php');
mcheck(!str_contains($classic, 'MORSE_THEME'), 'classic /chess front controller has no Legendary flag');

@unlink($tmp . '/chess/app.html');
@rmdir($tmp . '/chess');
@rmdir($tmp);
echo "LegendaryMountTest: " . ($checks - $fails) . "/$checks passed\n";
exit($fails > 0 ? 1 : 0);
