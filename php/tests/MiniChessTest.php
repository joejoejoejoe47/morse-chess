<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\Variants;

// Gardner minichess (owner t220u): 5x5 in the a1-e5 corner of an 8x8 FEN.
check(Variants::valid('mini'), 'mini is a variant id');
check(!Variants::released('mini'), 'mini is not released (coming soon)');
check(Variants::size('mini') === 5 && Variants::size('horde') === 8, 'board sizes');
$s = Variants::parseFen(Variants::START_FEN['mini']);
$moves = array_map(static fn (array $m): string => $m['from'] . $m['to'], Variants::legalMoves('mini', $s));
sort($moves);
check($moves === ['a2a3', 'b1a3', 'b1c3', 'b2b3', 'c2c3', 'd2d3', 'e2e3'], 'start moves: single pawn steps and two knight moves');
// a rook on a1 with an empty first rank must stop at e1
$t = Variants::legalList('mini', '8/8/8/4k3/8/8/8/R3K3 w - - 0 1');
$off = array_filter($t, static fn (array $m): bool => strpos('fgh', $m['to'][0]) !== false || (int) $m['to'][1] > 5);
check(count($off) === 0, 'no moves leave the 5x5 board');
check(Variants::needsPromotion('mini', '8/8/8/4k3/P7/8/8/4K3 w - - 0 1', 'a4', 'a5'), 'pawn promotes on rank 5');
// bot plays a full legal game that stays on the board
$fen = Variants::START_FEN['mini'];
for ($i = 0; $i < 60; $i++) {
    $m = Variants::botMove('mini', $fen, 60);
    if ($m === null) {
        break;
    }
    $res = Variants::tryMove('mini', $fen, $m['from'], $m['to'], $m['promotion'] ?? null);
    check($res !== null, 'bot move is legal');
    $fen = $res['fen'];
    if ($res['status']['over']) {
        break;
    }
}
$place = explode('/', explode(' ', $fen)[0]);
check(preg_match('/[a-z]/i', $place[0] . $place[1] . $place[2]) === 0, 'nothing on ranks 6-8');

finish();
