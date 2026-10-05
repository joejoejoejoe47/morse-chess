<?php
require __DIR__ . '/bootstrap.php';
use Morse\Chess;

function perft(Chess $c, int $d): int {
    $ms = $c->moves(true);
    if ($d === 1) return count($ms);
    $n = 0;
    foreach ($ms as $m) {
        $c->move(['from'=>$m['from'],'to'=>$m['to'],'promotion'=>$m['promotion'] ?? null]);
        $n += perft($c, $d - 1);
        $c->undo();
    }
    return $n;
}
$cases = [
 ['start', null, [20,400,8902]],
 ['kiwipete','r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',[48,2039,97862]],
 ['pos3','8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',[14,191,2812,43238]],
 ['pos4','r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',[6,264,9467]],
 ['pos5','rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',[44,1486,62379]],
];
foreach ($cases as [$name,$fen,$exp]) {
    foreach ($exp as $i=>$want) {
        $t=microtime(true);
        $got = perft(new Chess($fen), $i+1);
        check($got===$want, "perft $name d".($i+1)." got $got want $want");
        if ($i===count($exp)-1) printf("  %s d%d %d nodes %.2fs\n",$name,$i+1,$got,microtime(true)-$t);
    }
}
$c=new Chess(); foreach(['f3','e5','g4','Qh4#'] as $s){ check($c->move($s)!==null,"fool $s"); }
check($c->isCheckmate() && $c->isGameOver(),'fool mate');
check((new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))->isStalemate(),'stalemate');
check((new Chess('8/8/8/8/8/8/8/K6k w - - 0 1'))->isInsufficientMaterial(),'KvK');
check((new Chess('8/8/8/8/8/8/8/KN5k w - - 0 1'))->isInsufficientMaterial(),'KNvK');
check(!(new Chess('8/8/8/8/8/8/P7/K6k w - - 0 1'))->isInsufficientMaterial(),'KPvK sufficient');
check((new Chess('8/8/8/8/8/8/8/K6k w - - 100 80'))->isDraw(),'50 move');
$c=new Chess(); foreach(['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8'] as $s)$c->move($s);
check($c->isThreefoldRepetition(),'threefold');
$c=new Chess('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
check($c->move('exf6')!==null,'en passant');
$c=new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'); $m=$c->move(['from'=>'a7','to'=>'a8','promotion'=>'q']);
check($m!==null && $c->get('a8')['type']==='q','promotion');
check((new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'))->move('O-O')!==null,'castle');
check((new Chess())->move(['from'=>'e2','to'=>'e5'])===null,'illegal null');
try { new Chess('garbage'); check(false,'bad fen'); } catch (\Throwable $e) { check(true,'bad fen'); }
$f='rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'; check((new Chess($f))->fen()===$f,'fen roundtrip');
finish();
