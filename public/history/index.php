<?php

declare(strict_types=1);

// The first History deploy uploaded a /history/ asset folder, and the FTP deploy
// never deletes old files, so on the server /history is a real directory and
// Apache answers it before the app router. This hands that directory back to
// the app's front controller, which serves the History page.
$_SERVER['SCRIPT_NAME'] = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/history/index.php'), 2)), '/') . '/index.php';
require dirname(__DIR__) . '/index.php';
