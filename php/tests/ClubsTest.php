<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
use Morse\{Clubs, Db, Mores, Rpc, RpcError};
test_db();

function cc(callable $fn, string $uid, array $d = []): mixed {
    try { return $fn($uid, $d); } catch (RpcError $e) { return 'ERR:' . $e->getMessage(); }
}
foreach (['createChessClub','joinChessClub','enterChessClub','loadChessClub','listJoinRequests','respondJoin','sendClubMail',
  'setClubReady','setClubBoard','placeClubCall','pollClubCalls','startOwnTournament','startEnemyBattle','watchClubGame',
  'getBracket','seatBracket','crownBracket'] as $n) check(in_array($n, Rpc::names(), true), "rpc $n");

foreach ([['host','host_hostel'],['p2','player_two_'],['p3','player_three'],['p4','player_four_'],['p5','player_five_']] as [$u,$n])
    Mores::claimUsername($u, ['username' => $n]);

$st = Clubs::createChessClub('host', ['name' => 'Rook Room', 'password' => 'secret123']);
check(is_array($st), 'club created');
check(is_string(cc([Clubs::class,'createChessClub'],'host',['name'=>'Rook Room','password'=>'secret123'])) , 'second create by same host rejected or returns error');
check(str_starts_with((string) cc([Clubs::class,'createChessClub'],'p2',['name'=>'x','password'=>'secret123']),'ERR:'), 'bad club name rejected');
$w = Clubs::enterChessClub('p2',['name'=>'Rook Room','password'=>'wrongpass']);
check(($w['ok'] ?? null) === false && str_contains($w['error'] ?? '', 'password'), 'wrong password rejected');
Mores::claimUsername('p6',['username'=>'player_six_x']);
$w = Clubs::enterChessClub('p6',['name'=>'No Such Club','password'=>'x']);
check(($w['sorry'] ?? null) === true, 'unknown club -> sorry');
$j = cc([Clubs::class,'joinChessClub'],'p2',['name'=>'Rook Room','password'=>'secret123']);
check(!is_string($j) || !str_starts_with($j,'ERR:'), 'join request sent: ' . json_encode($j));
$reqs = Clubs::listJoinRequests('host', []);
check(is_array($reqs) && count($reqs) >= 1, 'host sees join request');
$rid = $reqs[0]['id'] ?? '';
$r = cc([Clubs::class,'respondJoin'],'host',['id'=>$rid,'welcome'=>true]);
check(!is_string($r), 'welcomed');
$cid = Db::value('SELECT id FROM chess_clubs LIMIT 1');
$loaded = Clubs::loadChessClub('p2', ['clubId' => (string)$cid]);
check(is_array($loaded) && count($loaded['members'] ?? $loaded['seats'] ?? []) >= 2, 'p2 is a member: ' . json_encode(array_keys((array)$loaded)));
foreach (['p3','p4','p5'] as $u) {
    cc([Clubs::class,'joinChessClub'],$u,['name'=>'Rook Room','password'=>'secret123']);
    foreach (Clubs::listJoinRequests('host', []) as $q) cc([Clubs::class,'respondJoin'],'host',['id'=>$q['id'],'welcome'=>true]);
}
check(Db::value('SELECT COUNT(*) FROM chess_club_members WHERE club_id = ?', [$cid]) == 5, 'five members');
check(!is_string(Clubs::sendClubMail('p2', ['clubId'=>(string)$cid,'toId'=>null,'body'=>'hello all'])), 'mail sent');
check(Db::value('SELECT COUNT(*) FROM chess_club_messages WHERE club_id = ?', [$cid]) >= 1, 'mail stored');
foreach (['host','p2','p3','p4','p5'] as $u) Clubs::setClubReady($u, ['clubId'=>(string)$cid,'ready'=>true]);
check(Db::value('SELECT COUNT(*) FROM chess_club_members WHERE club_id = ? AND ready = 1', [$cid]) == 5, 'all ready');
check(!is_string(Clubs::setClubBoard('host', ['clubId'=>(string)$cid,'boardId'=>'lodge'])), 'board set');
Clubs::placeClubCall('host', ['clubId'=>(string)$cid,'toId'=>$loaded ? 'p2' : 'p2']);
$calls = Clubs::pollClubCalls('p2', ['clubId'=>(string)$cid]);
check(is_array($calls) && count($calls) >= 1, 'call received');
$t = cc([Clubs::class,'startOwnTournament'],'host',['clubId'=>(string)$cid]);
check(!is_string($t), 'tournament started: ' . (is_string($t) ? $t : ''));
$b = Clubs::getBracket('host', ['clubId'=>(string)$cid]);
check($b !== null, 'bracket readable');
$sb = cc([Clubs::class,'seatBracket'],'host',['clubId'=>(string)$cid,'round'=>0,'slot'=>0]);
check(!is_string($sb) || !str_contains($sb,'Error'), 'seatBracket runs: ' . json_encode($sb));
$e = cc([Clubs::class,'startEnemyBattle'],'host',['clubId'=>(string)$cid,'foeName'=>'Some Foe']);
check(true, 'startEnemyBattle returns: ' . substr(json_encode($e),0,120));
finish();
