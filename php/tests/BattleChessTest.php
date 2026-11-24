<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\BoardGames;
use Morse\Variants;

check(!Variants::released('battlechess') && Variants::released('checkers') && Variants::released('xiangqi'), 'battle chess is owner preview; checkers + xiangqi are open');
$fen = Variants::START_FEN['battlechess'];
check(str_contains($fen, 'H') && str_contains($fen, 'I'), 'chests and pirate ships are on the board');
$moves = Variants::legalList('battlechess', $fen);
check(count($moves) > 8, 'white has an opening');
$m = Variants::botMove('battlechess', $fen, 400);
check($m !== null && BoardGames::tryMove('battlechess', $fen, $m['from'], $m['to'], null) !== null, 'MorseBot plays a legal first move');
// The same pawn push must storm the same way the browser does.
$played = BoardGames::tryMove('battlechess', $fen, 'e7', 'e5', null);
check($played !== null && $played['fen'] === 'bc|28/23I4/3S24/28/2H14FF9/10REBKQBNRABR7/10P1PPPPPPCNN7/7C20/11P16/28/20c7/7nncpppppppp10/7rbarnbqkber10/9ff14H2/28/24s3/4i23/28|b|e6|0|1|-', 'the pawn push matches the board');

finish();
