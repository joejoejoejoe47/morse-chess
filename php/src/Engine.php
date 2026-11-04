<?php

declare(strict_types=1);

namespace Morse;

/** A chess engine for fair-play analysis. */
interface Engine
{
    /**
     * Best lines for a position, best first, scores from the side to move.
     * @return list<array{move:string,cp:int,mate:?int}>
     */
    public function analyse(string $fen, int $multiPv): array;
}
