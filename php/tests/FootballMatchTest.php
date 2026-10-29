<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\Db;
use Morse\FootballMatch as FM;
use Morse\Mores;

FM::$dice = static fn (): float => 99.0; // no luck unless a test asks for it (t237u)

test_db();
$now = Db::now();
foreach ([['u1', 'GusTheBest'], ['u2', 'RexTheGreat'], ['u3', 'ThirdPlayer']] as [$id, $name]) {
    Db::run('INSERT INTO profiles (user_id, username, username_lc, last_seen, created_at) VALUES (?, ?, ?, ?, ?)', [$id, $name, strtolower($name), $now, $now]);
}

// ── the challenge ──
check(FM::sendFootballChallenge('u1', ['username' => 'nobodyhere1'])['error'] === 'No player with that username.', 'unknown user');
check(FM::sendFootballChallenge('u1', ['username' => 'gusthebest'])['error'] === 'You cannot challenge yourself.', 'not yourself');
$sent = FM::sendFootballChallenge('u1', ['username' => 'RexTheGreat']);
check($sent['ok'] === true && isset($sent['challengeId']), 'challenge sent');
check(FM::sendFootballChallenge('u1', ['username' => 'RexTheGreat'])['ok'] === false, 'no double challenge');
$home2 = Mores::getHomeState('u2', []);
check(count($home2['inbox']) === 1 && $home2['inbox'][0]['kind'] === 'football' && $home2['inbox'][0]['fromUsername'] === 'GusTheBest', 'shows in the inbox as football');
$home1 = Mores::getHomeState('u1', []);
check($home1['outgoing'][0]['kind'] === 'football' && $home1['outgoing'][0]['status'] === 'pending', 'sender sees it pending');
check(Mores::getChallengeInbox('u2', [])[0]['kind'] === 'football', 'bell sees football');
// decline
Mores::respondChallenge('u2', ['id' => $sent['challengeId'], 'accept' => false]);
check(Mores::getHomeState('u1', [])['outgoing'][0]['status'] === 'declined', 'sender sees declined');
// cancel
$c2 = FM::sendFootballChallenge('u1', ['username' => 'RexTheGreat']);
Mores::cancelChallenge('u1', ['id' => $c2['challengeId']]);
check(Mores::getHomeState('u2', [])['inbox'] === [], 'cancelled challenge gone');
// accept
$c3 = FM::sendFootballChallenge('u1', ['username' => 'RexTheGreat']);
$acc = Mores::respondChallenge('u2', ['id' => $c3['challengeId'], 'accept' => true]);
check($acc['ok'] === true && is_string($acc['gameId'] ?? null), 'accepted makes a game');
$gid = $acc['gameId'];
check(Mores::getHomeState('u1', [])['footballGameId'] === $gid, 'challenger is sent to the game');
check(Mores::getHomeState('u2', [])['activeGameId'] === null, 'no chess game made');
$v = FM::footballSync('u1', ['gameId' => $gid, 'ready' => true]);
check($v['side'] === 'w' && $v['phase'] === 'count', 'challenger plays home, countdown waits');
$v = FM::footballSync('u2', ['gameId' => $gid, 'ready' => true]);
check($v['side'] === 'b' && $v['until'] > 0, 'both ready: countdown runs');
$threw = false;
try {
    FM::footballSync('u3', ['gameId' => $gid]);
} catch (\Morse\RpcError) {
    $threw = true;
}
check($threw, 'outsiders cannot see the game');

// ── the rules, on a state with a made-up clock ──
$s = json_decode((string) Db::one('SELECT state FROM football_games WHERE id = ?', [$gid])['state'], true);
$t = (int) $s['until'];
FM::advance($s, $t + 1);
check($s['phase'] === 'play' && $s['turn'] === 'w', 'kick-off: home moves first');
$s0 = $s; // copy for the plain-tackle test (t236u)
check(FM::act($s, 'b', ['t' => 'move', 'from' => [8, 3], 'to' => [7, 3]], $t + 100) === 'Wait for your turn.', 'no moving out of turn');
check(FM::act($s, 'w', ['t' => 'move', 'from' => [6, 3], 'to' => [7, 3]], $t + 200) === null, 'pawn picks up the ball');
check(!empty($s['board'][7][3]['ball']) && $s['loose'] === null && $s['turn'] === 'b', 'he has it, their turn');
// the 5-second rule: after 5 s the waiting side may sneak in one move
check(FM::act($s, 'w', ['t' => 'move', 'from' => [6, 0], 'to' => [7, 0]], $t + 3000) === 'Wait for your turn.', 'no bonus before 5 s');
check(FM::act($s, 'w', ['t' => 'move', 'from' => [6, 0], 'to' => [7, 0]], $t + 5300) === null, 'bonus move after 5 s');
check($s['turn'] === 'b', 'still their turn after a bonus move');
check(FM::act($s, 'w', ['t' => 'move', 'from' => [7, 0], 'to' => [8, 0]], $t + 5400) !== null, 'only one bonus per 5 s');
// tackle: black pawn d7 (8,4) takes the ball carrier on (7,3)
$sF = $s; // same tackle, but the dice say fumble
check(FM::act($s, 'b', ['t' => 'move', 'from' => [8, 4], 'to' => [7, 3]], $t + 6000) === null, 'tackle');
check($s['phase'] === 'dead', 'the play is dead');
FM::advance($s, $t + 6000 + 1500);
check($s['phase'] === 'snap' && $s['turn'] === 'w', 'line up, the tackled team goes next');
$ids = [];
foreach ($s['board'] as $row) {
    foreach ($row as $u) {
        if ($u !== null) {
            $ids[] = $u['id'];
        }
    }
}
check(count($ids) === 31 && !in_array('d2', $ids, true), 'carrier tackled, no fumble: he is out, nobody comes back (t237u)');
$hb = null;
foreach ($s['board'] as $r => $row) {
    foreach ($row as $f => $u) {
        if (!empty($u['ball'])) {
            $hb = [$r, $f, $u];
        }
    }
}
check($hb !== null && $hb[2]['kind'] === 'k' && $hb[2]['side'] === 'w', 'no fumble: the tackled team keeps the ball at the spot (t237u)');
// the fumble: the dice roll under the tackle risk
check(FM::risk($sF['board'], [7, 3], 'b', 'tackle') > 10, 'tackle risk counts the tacklers near');
FM::$dice = static fn (): float => 0.0;
check(FM::act($sF, 'b', ['t' => 'move', 'from' => [8, 4], 'to' => [7, 3]], $t + 6000) === null, 'tackle (fumble)');
FM::$dice = static fn (): float => 99.0;
FM::advance($sF, $t + 6000 + 1500);
$idsF = array_column(array_filter(array_merge(...$sF['board'])), 'id');
$hbF = null;
foreach ($sF['board'] as $row) {
    foreach ($row as $u) {
        if (!empty($u['ball'])) {
            $hbF = $u;
        }
    }
}
check(count($idsF) === 32 && ($hbF['side'] ?? '') === 'b', 'fumble = turnover: their ball and everyone comes back (t236u/t237u)');
check(($sF['events'][count($sF['events']) - 1]['fresh'] ?? false) === true, 'turnover lineup says everyone is back');
FM::advance($s, $t + 6000 + 1500 + 1300);
check($s['phase'] === 'play', 'snap');

// a tackle of a player WITHOUT the ball: he stays out (t235u/t236u)
check(FM::act($s0, 'w', ['t' => 'move', 'from' => [6, 0], 'to' => [7, 0]], $t + 200) === null, 'pawn steps up (no ball)');
check(FM::act($s0, 'b', ['t' => 'move', 'from' => [8, 1], 'to' => [7, 0]], $t + 400) === null, 'plain tackle');
FM::advance($s0, $t + 400 + 1500);
$ids0 = array_column(array_filter(array_merge(...$s0['board'])), 'id');
check($s0['phase'] === 'snap' && count($ids0) === 31 && !in_array('a2', $ids0, true), 'plain tackle: the tackled player is out of the lineup');
check(($s0['events'][count($s0['events']) - 1]['fresh'] ?? true) === false, 'plain tackle: nobody comes back');

// lineUp with only survivors; only kings left = everyone back
$only = array_fill(0, 14, array_fill(0, 8, null));
$only[3][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1'];
$only[9][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$l = FM::lineUp(6, 'w', $only);
check($l['fresh'] === true && count(array_filter(array_merge(...$l['board']))) === 32, 'only the kings left: everyone comes back');
$some = $only;
$some[5][0] = ['side' => 'w', 'kind' => 'r', 'id' => 'a1'];
$l = FM::lineUp(6, 'w', $some);
check($l['fresh'] === false && count(array_filter(array_merge(...$l['board']))) === 3 && !empty($l['board'][4][4]['ball']), 'survivors only, king takes the snap');

// pass + interception
$b = array_fill(0, 14, array_fill(0, 8, null));
$b[2][3] = ['side' => 'w', 'kind' => 'q', 'id' => 'd1', 'ball' => true, 'held' => 0];
$b[8][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'd2'];
$b[5][3] = ['side' => 'b', 'kind' => 'p', 'id' => 'd7'];
$b[0][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1'];
$b[13][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$s2 = $s;
$s2['board'] = $b;
$s2['loose'] = null;
$s2['turn'] = 'w';
$s2['turnAt'] = $t + 20000;
$s2['bonus'] = 0;
$s2['phase'] = 'play';
$s2m = $s2;
FM::$dice = static fn (): float => 10.0;
check(FM::act($s2, 'w', ['t' => 'pass', 'from' => [2, 3], 'to' => [8, 3]], $t + 20100) === null, 'pass thrown');
FM::$dice = static fn (): float => 99.0;
check($s2['phase'] === 'play' && FM::risk($b, [8, 3], 'b', 'pass') === 0, 'nobody near the catcher: no pick-off risk');
// a bad roll: the jump misses (t237u: the jump only adds to the chance)
check(FM::act($s2m, 'w', ['t' => 'pass', 'from' => [2, 3], 'to' => [8, 3]], $t + 20100) === null, 'pass thrown (bad dice)');
check(FM::act($s2m, 'b', ['t' => 'intercept', 'id' => 'd7'], $t + 20900) === 'Missed it!', 'the jump can miss');
check(count(FM::under($s2['flight']['board'], [2, 3], [8, 3])) === 1, 'the pass flies over the defender');
$s3 = $s2;
check(FM::act($s3, 'b', ['t' => 'intercept', 'id' => 'd7'], $t + 20900) === null, 'interception');
check(!empty($s3['board'][5][3]['ball']) && empty($s3['board'][8][3]['ball']) && $s3['phase'] === 'dead', 'defender has the ball, play dead');
check(!empty($s3['next']['all']), 'an interception is a turnover: everyone comes back');
// pick-off without a jump: a queen right next to the catcher
$bq = $b;
$bq[9][3] = ['side' => 'b', 'kind' => 'q', 'id' => 'd8'];
$s5 = $s2;
$s5['board'] = $bq;
$s5['flight'] = null;
$s5['phase'] = 'play';
$s5['turn'] = 'w';
$s5['board'][2][3]['ball'] = true;
$s5['board'][8][3]['ball'] = false;
check(FM::risk($bq, [8, 3], 'b', 'pass') === 30, 'pass risk: 3 + queen next to him 27 = 30%');
FM::$dice = static fn (): float => 5.0;
check(FM::act($s5, 'w', ['t' => 'pass', 'from' => [2, 3], 'to' => [8, 3]], $t + 30000) === null && $s5['phase'] === 'steal', 'the dice say pick-off');
FM::$dice = static fn (): float => 99.0;
FM::advance($s5, $t + 32000);
check(!empty($s5['board'][9][3]['ball']) && $s5['phase'] === 'dead' && !empty($s5['next']['all']), 'the queen picked it off: turnover');
$ie = array_values(array_filter($s5['events'], static fn ($e) => $e['t'] === 'intercept'));
check(($ie[0]['auto'] ?? false) === true && $ie[0]['id'] === 'd8', 'the browsers are told it was a pick-off');
// a run next to big defenders may fumble
$br = array_fill(0, 14, array_fill(0, 8, null));
$br[6][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'd2', 'ball' => true, 'held' => 0];
$br[8][4] = ['side' => 'b', 'kind' => 'q', 'id' => 'd8'];
$br[0][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1'];
$br[13][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$s6r = $s5;
$s6r['board'] = $br;
$s6r['loose'] = null;
$s6r['phase'] = 'play';
$s6r['turn'] = 'w';
$s6r['flight'] = null;
check(FM::risk($br, [7, 3], 'b', 'run') === 16, 'run risk: 2 + queen next to him 13.5 = 16%');
FM::$dice = static fn (): float => 3.0;
check(FM::act($s6r, 'w', ['t' => 'move', 'from' => [6, 3], 'to' => [7, 3]], $t + 40000) === null && $s6r['phase'] === 'dead' && $s6r['next']['holder'] === 'b' && !empty($s6r['next']['all']), 'fumble on the run: their ball, everyone back');
FM::$dice = static fn (): float => 99.0;
// the king throws to anyone
$bk = array_fill(0, 14, array_fill(0, 8, null));
$bk[0][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1', 'ball' => true, 'held' => 1];
$bk[11][0] = ['side' => 'w', 'kind' => 'p', 'id' => 'a2'];
check(in_array([11, 0], FM::catches($bk, 0, 4), true), 'the king can throw to any of his players (t237u)');
$s4 = $s2;
check(FM::act($s4, 'b', ['t' => 'intercept', 'id' => 'd7'], $t + 20100 + 9000) === 'Too late!', 'too late after the ball landed');

// touchdown, skip needs both, everyone back
$b = array_fill(0, 14, array_fill(0, 8, null));
$b[11][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'd2', 'ball' => true, 'held' => 0];
$b[0][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1'];
$b[13][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$b[9][0] = ['side' => 'b', 'kind' => 'p', 'id' => 'a7'];
$s5 = $s2;
$s5['board'] = $b;
$s5['flight'] = null;
$s5['phase'] = 'play';
$s5['turn'] = 'w';
$s5['turnAt'] = $t + 30000;
$s5['bonus'] = 0;
$sc = $s5['score']['w'];
check(FM::act($s5, 'w', ['t' => 'move', 'from' => [11, 3], 'to' => [12, 3]], $t + 30100) === null, 'run into the end zone');
check($s5['phase'] === 'celebrate' && $s5['score']['w'] === $sc + 6, 'touchdown +6');
FM::act($s5, 'w', ['t' => 'skip'], $t + 31000);
check($s5['phase'] === 'celebrate', 'one skip is not enough');
FM::act($s5, 'b', ['t' => 'skip'], $t + 31100);
check($s5['phase'] === 'play' && $s5['turn'] === 'b', 'both skipped: kick-off, the other team first');
check(count(array_filter(array_merge(...$s5['board']))) === 32, 'after a touchdown everyone is back');

// field goal keeps the outs
$s6 = $s2;
$b = array_fill(0, 14, array_fill(0, 8, null));
$b[10][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'd2', 'ball' => true, 'held' => 0];
$b[0][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1'];
$b[13][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$b[13][0] = ['side' => 'b', 'kind' => 'r', 'id' => 'a8'];
$s6['board'] = $b;
$s6['flight'] = null;
$s6['phase'] = 'play';
$s6['turn'] = 'w';
$fg = $s6['score']['w'];
check(FM::act($s6, 'w', ['t' => 'goal', 'from' => [10, 3]], $t + 40000) === null && $s6['score']['w'] === $fg + 3, 'field goal +3');
FM::advance($s6, $t + 40000 + 4200);
check($s6['phase'] === 'play' && count(array_filter(array_merge(...$s6['board']))) === 4, 'after a field goal the tackled stay out');

// clock
$s7 = $s6;
FM::advance($s7, $t + 40000 + 4200 + FM::GAME_MS + 1);
check($s7['over'] === 'time', 'the 10-minute clock ends the game');

// leaving
$r = FM::resignFootball('u2', ['gameId' => $gid]);
check($r['over'] === 'resign' && $r['winner'] === 'w', 'leaving = the other player wins');
check(Mores::getHomeState('u1', [])['footballGameId'] === null, 'finished game no longer opens');
finish();
