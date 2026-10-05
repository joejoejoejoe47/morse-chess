<?php

declare(strict_types=1);

namespace Morse;

/** Registers every RPC handler module. Each module exposes `register(): void`. */
final class Modules
{
    public static function registerAll(): void
    {
        foreach (['Avatar', 'Mores', 'Clubs'] as $name) {
            $class = __NAMESPACE__ . '\\' . $name;
            if (class_exists($class)) {
                $class::register();
            }
        }
    }
}
