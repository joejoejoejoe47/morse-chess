<?php

declare(strict_types=1);

/**
 * The /chessledgendary/ front controller: serves the shared Morse Chess app.html with the API and
 * assets still at /chess, the router at /chessledgendary and the Legendary theme on.
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

function serve(string $controller, string $uri, string $chessDir): string
{
    $code = '$_SERVER["SCRIPT_NAME"]="/chessledgendary/index.php";$_SERVER["REQUEST_URI"]=' . var_export($uri, true) . ';'
        . 'putenv("MORSE_CHESS_DIR=' . addslashes($chessDir) . '");require ' . var_export($controller, true) . ';';
    return (string) shell_exec(escapeshellarg(PHP_BINARY) . ' -r ' . escapeshellarg($code) . ' 2>&1');
}

$html = serve($controller, '/chessledgendary/store', $tmp . '/chess');
mcheck(str_contains($html, '<base href="/chess/" />'), 'assets resolve from /chess');
mcheck(str_contains($html, 'window.MORSE_BASE="/chess"'), 'API base stays /chess (same backend + DB)');
mcheck(str_contains($html, 'window.MORSE_ROUTER_BASE="/chessledgendary"'), 'router mounted at /chessledgendary');
mcheck(str_contains($html, 'window.MORSE_THEME="legendary"'), 'theme on');
mcheck(str_contains($html, '<title>Morse Chess Legendary</title>'), 'title');
mcheck(!str_contains($html, '<!--MORSE_BASE-->'), 'placeholder replaced');

$api = serve($controller, '/chessledgendary/api/rpc/getHomeState', $tmp . '/chess');
mcheck(str_contains($api, '/chess/api') && !str_contains($api, '<html'), 'stray API path points at /chess/api');

$missing = serve($controller, '/chessledgendary/', $tmp . '/nope');
mcheck(str_contains($missing, 'needs the Morse Chess build'), 'missing build is reported, not a blank page');

// The classic front controller is untouched by Legendary: no theme flag there.
$classic = (string) file_get_contents(dirname(__DIR__) . '/public/index.php');
mcheck(!str_contains($classic, 'MORSE_THEME'), 'classic /chess front controller has no Legendary flag');

@unlink($tmp . '/chess/app.html');
@rmdir($tmp . '/chess');
@rmdir($tmp);
echo "LegendaryMountTest: " . ($checks - $fails) . "/$checks passed\n";
exit($fails > 0 ? 1 : 0);
