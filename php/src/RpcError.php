<?php

declare(strict_types=1);

namespace Morse;

use RuntimeException;

/**
 * An error whose message is safe to show to the player. The original TypeScript
 * server threw plain `Error("That costs 40 Morse coins.")` for these; the front
 * end displays `err.message` verbatim, so throw this for every user-facing
 * failure. Anything else (PDO errors, bugs) is logged and answered with a
 * generic 500.
 */
final class RpcError extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400)
    {
        parent::__construct($message);
    }
}
