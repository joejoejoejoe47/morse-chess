<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\BoardGames;

// Battle Chess v3 (video v9KUWr3NChU, /workspace/mcl-art/battlechess-rules-v3.md). Same scenarios as scratch-bc/v3-check.ts.
$S0 = BoardGames::bcParse(\Morse\Variants::START_FEN['battlechess']);
$at = static fn (array $s, int $x, int $y): string => $s['cells'][13 - $y][$x + 7];
$put = static function (array &$s, int $x, int $y, string $p): void {
    $s['cells'][13 - $y][$x + 7] = $p;
};
$find = static function (array $s, callable $f): ?array {
    foreach (BoardGames::bcLegal($s) as $m) {
        if ($f($m)) {
            return $m;
        }
    }
    return null;
};
$sq = static fn (int $x, int $y): string => BoardGames::bcSq($x, $y);

check($at($S0, 6, 8) === 'K' && $at($S0, 7, 8) === 'Q' && $at($S0, 6, 1) === 'q' && $at($S0, 7, 1) === 'k', 'royalty is 180° symmetric');
check($find($S0, static fn ($m) => $m['from'] === 'i7' && $m['to'] === 'i5' && !empty($m['double'])) !== null, 'pawn double-step');
check($at($S0, -5, 9) === 'H' && $at($S0, 18, 0) === 'H' && $at($S0, -4, 11) === 'S' && $at($S0, 17, -2) === 's' && $at($S0, 16, 12) === 'I' && $at($S0, -3, -3) === 'i', 'chests, boats and pirates start in place');

// chest run
$s = $S0;
$put($s, -4, 10, 'R');
$emb = $find($s, static fn ($m) => !empty($m['embark']) && $m['from'] === $sq(-4, 10) && $m['to'] === $sq(-4, 11));
check($emb !== null, 'a rook boards its boat');
$s = BoardGames::bcApply($s, $emb);
$s['turn'] = 'w';
$dis = $find($s, static fn ($m) => !empty($m['disembark']) && $m['to'] === $sq(-5, 10));
check($dis !== null, 'the rider steps ashore next to the chest');
$s2 = BoardGames::bcApply($s, $dis);
$s2['turn'] = 'w';
$op = $find($s2, static fn ($m) => $m['from'] === $sq(-5, 10) && $m['to'] === $sq(-5, 9) && !empty($m['chest']));
check($op !== null, 'the rook takes the chest');
$s3 = BoardGames::bcApply($s2, $op);
check($at($s3, -5, 9) === 'R' && $at($s3, -4, 9) === 'W' && $at($s3, -4, 11) === 'S', 'the chest spawns a Mage; the empty boat stays');
$sb = $S0;
$sb['turn'] = 'b';
$put($sb, -5, 10, 'r');
check($find($sb, static fn ($m) => $m['to'] === $sq(-5, 9)) === null, "a side can't open the other side's chest");

// pirate intercepts a loaded boat
$sp = $S0;
$put($sp, -4, 11, '.');
$put($sp, 4, 11, 'S');
$sp['cargo'][$sq(4, 11)] = 'R';
$put($sp, 4, 12, 'i');
$sp['turn'] = 'b';
$pc = $find($sp, static fn ($m) => $m['from'] === $sq(4, 12) && $m['to'] === $sq(4, 11));
check($pc !== null && $pc['capture'], 'the pirate takes an enemy boat');
$sp2 = BoardGames::bcApply($sp, $pc);
check($at($sp2, 4, 11) === 'i' && !isset($sp2['cargo'][$sq(4, 11)]), 'the rider goes down with the boat');

// frigate carries a piece; deploy from a ship
$sf = $S0;
$put($sf, 10, 8, 'R');
$femb = $find($sf, static fn ($m) => !empty($m['embark']) && $m['from'] === 'k8' && $m['to'] === 'k9');
check($femb !== null, 'a piece boards a frigate');
$sf2 = BoardGames::bcApply($sf, $femb);
$sf2['turn'] = 'w';
$fs = $find($sf2, static fn ($m) => $m['from'] === 'k9' && $m['to'] === 'k11' && !empty($m['ship']));
check($fs !== null && (BoardGames::bcApply($sf2, $fs)['cargo']['k11'] ?? '') === 'R', 'the rider sails with the frigate');
$sd = $S0;
$put($sd, 3, 1, '.');
$sd['cargo']['c0'] = 'r';
$sd['turn'] = 'b';
$dep = $find($sd, static fn ($m) => !empty($m['disembark']) && $m['from'] === 'c0' && $m['to'] === 'd1');
check($dep !== null && $at(BoardGames::bcApply($sd, $dep), 3, 1) === 'r', 'deploy the rook from the ship onto the back rank');

// volcano warning then eruption
$sv = $S0;
$sv['storm'] = 'v4';
$sv2 = BoardGames::bcApply($sv, $find($sv, static fn ($m) => $m['from'] === 'i7' && $m['to'] === 'i5'));
check(str_contains($sv2['storm'], 'v3'), 'the volcano warning counts down');
$t = $S0;
$t['storm'] = 'v1';
$t['full'] = 3;
$n = BoardGames::bcApply($t, $find($t, static fn ($m) => $m['from'] === 'i7' && $m['to'] === 'i5'));
check(str_contains($n['storm'], 'V') && $n['made'] === ['k-1', 'o2', 'y7', 'z5'], 'the volcanoes erupt and lava turns water to land (same as TS)');
check(str_ends_with(BoardGames::bcString($n), '|V:b5.3,d8.3,k-1.3,k1.3,n4.3,o2.3,y7.3,z5.3;;k-1,o2,y7,z5'), 'the eruption writes the same save string as TS');

// assassin invisibility
$sa = $S0;
$put($sa, 11, 8, '.');
$put($sa, 5, 4, 'A');
$put($sa, 4, 3, 'p');
$sa2 = BoardGames::bcApply($sa, $find($sa, static fn ($m) => $m['from'] === 'f4' && $m['to'] === 'e3'));
check(($sa2['inv']['e3'] ?? 0) === 2, 'the assassin goes invisible after a capture');
check($find($sa2, static fn ($m) => $m['to'] === 'e3' && !empty($m['capture'])) === null, "an invisible assassin can't be captured");
finish();
