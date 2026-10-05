<?php

declare(strict_types=1);

// Autoload Morse\Foo from src/Foo.php (no Composer needed on shared hosting).
spl_autoload_register(static function (string $class): void {
    $prefix = 'Morse\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }
    $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

// UTC everywhere.
date_default_timezone_set('UTC');
mb_internal_encoding('UTF-8');

// Never leak PHP errors into JSON responses; they go to the error log.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// Register every RPC module.
\Morse\Modules::registerAll();
