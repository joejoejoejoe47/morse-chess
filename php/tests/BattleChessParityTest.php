<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\BoardGames;

// Replays games recorded from src/lib/boardgames/battlechess.ts (scratch-bc/parity-gen.ts) and checks
// the PHP copy finds the same legal moves and lands on the same board after every move.
$fx = json_decode((string) file_get_contents(__DIR__ . '/fixtures/bc-parity.json'), true);
$key = static fn (array $m): string => $m['from'] . '>' . $m['to'] . ($m['promo'] ?? '') . (!empty($m['shot']) ? '*' : '') . (!empty($m['board']) ? 'B' : '') . (!empty($m['charm']) ? 'C' : '') . (!empty($m['embark']) ? 'E' : '') . (!empty($m['disembark']) ? 'D' : '') . (!empty($m['capture']) ? 'x' : '');
$legalBad = 0;
$afterBad = 0;
$plies = 0;
$first = '';
foreach ($fx['games'] as $g) {
    foreach ($g['steps'] as $st) {
        $plies++;
        $s = BoardGames::bcParse($st['fen']);
        $legal = array_map($key, BoardGames::bcLegal($s));
        sort($legal, SORT_STRING);
        if ($legal !== $st['legal']) {
            $legalBad++;
            if ($first === '') {
                $first = 'legal @' . $st['fen'] . ' php-only=' . implode(' ', array_diff($legal, $st['legal'])) . ' ts-only=' . implode(' ', array_diff($st['legal'], $legal));
            }
            continue;
        }
        $pick = null;
        foreach (BoardGames::bcLegal($s) as $m) {
            if ($key($m) === $st['pick']) {
                $pick = $m;
                break;
            }
        }
        $after = $pick ? BoardGames::bcString(BoardGames::bcApply($s, $pick)) : '';
        if ($after !== $st['after']) {
            $afterBad++;
            if ($first === '') {
                $first = 'after ' . $st['pick'] . ' php=' . $after . ' ts=' . $st['after'];
            }
        }
    }
}
check($plies > 300, "replayed $plies plies");
check($legalBad === 0, "legal moves match on every ply ($legalBad off) $first");
check($afterBad === 0, "every board after a move matches ($afterBad off)");
$old = BoardGames::bcParse($fx['old']);
check($old !== null && BoardGames::bcString($old) === $fx['oldStr'], 'an old 20x14 save loads into the new sea');

// Boats: board, sail with the rider, step ashore; a sunk boat takes its rider.
$s = BoardGames::bcParse(\Morse\Variants::START_FEN['battlechess']);
check(BoardGames::bcTerrain(-4, 8) === 'M' && BoardGames::bcHill(17, 1), 'grassy mountains stand on the treasure islands');
check(BoardGames::bcTerrain(-5, 9) === 'L' && BoardGames::bcTerrain(17, 11) === 'L' && BoardGames::bcTerrain(-4, -2) === 'L' && BoardGames::bcTerrain(-7, 9) === 'W', 'the 3x3 treasure islands and 3x1 docks are land');
$cells = $s['cells'];
$put = static function (array &$c, int $x, int $y, string $p): void {
    $c[13 - $y][$x + 7] = $p;
};
// white rook on the plank strip next to white's boat
$put($cells, -4, 11, '.');
$put($cells, 17, 10, 'S'); // boat just below the strip (x 16..18, y 11)
$put($cells, 17, 11, 'R');
$t = $s;
$t['cells'] = $cells;
$moves = BoardGames::bcLegal($t);
$board = array_values(array_filter($moves, static fn (array $m): bool => !empty($m['embark']) && $m['from'] === BoardGames::bcSq(17, 11)));
check(count($board) === 1 && $board[0]['to'] === BoardGames::bcSq(17, 10), 'a rook beside its boat may climb aboard');
$t2 = BoardGames::bcApply($t, $board[0]);
check(($t2['cargo'][BoardGames::bcSq(17, 10)] ?? '') === 'R' && str_contains(BoardGames::bcString($t2), ';' . BoardGames::bcSq(17, 10) . '=R'), 'the rider is stored with the boat');
$t2['turn'] = 'w';
$sail = BoardGames::bcFind($t2, BoardGames::bcSq(17, 10), BoardGames::bcSq(17, 5));
check($sail !== null, 'the boat sails with its rider');
$t3 = BoardGames::bcApply($t2, $sail);
check(($t3['cargo'][BoardGames::bcSq(17, 5)] ?? '') === 'R' && !isset($t3['cargo'][BoardGames::bcSq(17, 10)]), 'the rider moved with the boat');
finish();
