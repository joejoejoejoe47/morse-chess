<?php

declare(strict_types=1);

/**
 * One-page installer. Enter the MySQL details Plesk gave you; it tests them,
 * creates the tables, and saves app/.env. If PHP is not allowed to write that
 * file (a common Plesk permission setup) it shows the exact text to paste into
 * app/.env yourself — the tables are still created. DELETE THIS FILE afterwards.
 */

$appDir = is_dir(__DIR__ . '/app/src') ? __DIR__ . '/app' : dirname(__DIR__);
require $appDir . '/src/bootstrap.php';

use Morse\Config;
use Morse\Db;

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

$envPath = $appDir . '/.env';
$error = '';
$manual = '';
$done = false;

// Already configured and working? Do not let a stranger re-point the site.
$already = false;
if (is_file($envPath) || getenv('DB_NAME') !== false) {
    try {
        Db::pdo();
        $already = true;
    } catch (Throwable $e) {
        $already = false;
    }
}

if (!$already && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $v = [
        'DB_DRIVER' => 'mysql',
        'DB_HOST' => trim((string) ($_POST['host'] ?? 'localhost')) ?: 'localhost',
        'DB_PORT' => (string) ((int) ($_POST['port'] ?? 3306) ?: 3306),
        'DB_NAME' => trim((string) ($_POST['name'] ?? '')),
        'DB_USER' => trim((string) ($_POST['user'] ?? '')),
        'DB_PASS' => (string) ($_POST['pass'] ?? ''),
    ];
    try {
        foreach ($v as $k => $val) {
            putenv("$k=$val");
        }
        Db::pdo();
        Db::ensureSchema(true);
        $lines = ["# Written by install.php"];
        foreach ($v as $k => $val) {
            $lines[] = $k . '=' . (preg_match('/[\s#"\']/', $val) ? '"' . str_replace('"', '\\"', $val) . '"' : $val);
        }
        $lines[] = 'APP_DEBUG=0';
        $text = implode("\n", $lines) . "\n";
        if (@file_put_contents($envPath, $text) === false) {
            $manual = $text;
            $error = 'The tables were created, but PHP is not allowed to write app/.env. In Plesk File Manager open the app folder, create a file named .env, paste the text below into it and save.';
        } else {
            @chmod($envPath, 0640);
            $done = true;
        }
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Install Morse Chess</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;background:#0c0d0b;color:#efe9da;margin:0;display:grid;place-items:center;min-height:100vh}
  main{width:min(92vw,30rem);background:#171813;border:1px solid #3a3a2c;border-radius:14px;padding:1.6rem}
  h1{margin:.2rem 0 1rem;font-weight:600} label{display:block;margin:.7rem 0 .2rem;color:#c9bd98;font-size:.9rem}
  input{width:100%;box-sizing:border-box;padding:.6rem;border-radius:8px;border:1px solid #4a4a38;background:#0c0d0b;color:inherit}
  button{margin-top:1.1rem;width:100%;padding:.7rem;border:0;border-radius:8px;background:#c9a24b;color:#16140d;font-weight:700;cursor:pointer}
  .err{background:#3a1b1b;border:1px solid #7a3333;padding:.7rem;border-radius:8px} .ok{background:#1b3a22;border:1px solid #337a44;padding:.7rem;border-radius:8px}
  textarea{width:100%;box-sizing:border-box;height:11rem;margin-top:.6rem;background:#0c0d0b;color:inherit;border:1px solid #4a4a38;border-radius:8px;padding:.6rem;font:13px/1.4 ui-monospace,monospace}
  .muted{color:#9c9577;font-size:.9rem}
</style>
</head>
<body><main>
<h1>Install Morse Chess</h1>
<?php if ($already): ?>
  <p class="ok">Already installed — the database connects. Delete <code>install.php</code> from the server, then open the club.</p>
<?php elseif ($done): ?>
  <p class="ok">Done. Tables created and settings saved. Delete <code>install.php</code>, then open the club.</p>
<?php else: ?>
  <p class="muted">Create a MySQL database and user in Plesk first (Databases → Add Database), then enter them here. The host is usually <code>localhost</code>.</p>
  <?php if ($error): ?><p class="err"><?= h($error) ?></p><?php endif; ?>
  <?php if ($manual): ?><textarea readonly onclick="this.select()"><?= h($manual) ?></textarea><?php endif; ?>
  <form method="post">
    <label>Host <input name="host" value="localhost" required></label>
    <label>Database name <input name="name" required></label>
    <label>Database user <input name="user" required></label>
    <label>Password <input name="pass" type="password"></label>
    <label>Port <input name="port" value="3306"></label>
    <button type="submit">Create tables &amp; save</button>
  </form>
<?php endif; ?>
</main></body></html>
