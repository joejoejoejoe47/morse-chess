<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\BoardGames;
use Morse\Variants;

check(Variants::released('battlechess'), 'battle chess is released');
$fen = Variants::START_FEN['battlechess'];
check(str_starts_with($fen, 'bc|'), 'start position is a battle-chess board');
$moves = Variants::legalList('battlechess', $fen);
check(count($moves) > 8, 'white has an opening');
$m = Variants::botMove('battlechess', $fen, 400);
check($m !== null && BoardGames::tryMove('battlechess', $fen, $m['from'], $m['to'], null) !== null, 'MorseBot plays a legal first move');

finish();
