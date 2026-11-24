<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\BoardGames;
use Morse\Variants;

check(!Variants::released('battlechess') && Variants::released('checkers') && Variants::released('xiangqi'), 'battle chess is owner preview; checkers + xiangqi are open');
$fen = Variants::START_FEN['battlechess'];
check(str_contains($fen, 'H') && str_contains($fen, 'I'), 'chests and a pirate are on the island');
$moves = Variants::legalList('battlechess', $fen);
check(count($moves) > 8, 'white has an opening');
$m = Variants::botMove('battlechess', $fen, 400);
check($m !== null && BoardGames::tryMove('battlechess', $fen, $m['from'], $m['to'], null) !== null, 'MorseBot plays a legal first move');
// The same pawn push must storm the same way the browser does.
$played = BoardGames::tryMove('battlechess', $fen, 'e7', 'e5', null);
check($played !== null && $played['fen'] === 'bc|2W17/1H18/13FF5/6REBKQBNRABR3/6P1PPPPPPCNN3/3CI15/7P5H6/6H13/15ic3/3nncpppppppp6/3rbarnbkqber6/5ff11H1/17w2/20|b|e6|0|1|-', 'the pawn push matches the board');

finish();
