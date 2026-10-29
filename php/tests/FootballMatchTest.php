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
$men = static fn (array $b): array => array_column(array_filter(array_merge(...$b)), 'id');
$ballAt = static function (array $b): ?array {
    foreach ($b as $r => $row) {
        foreach ($row as $f => $u) {
            if (!empty($u['ball'])) {
                return [$r, $f, $u];
            }
        }
    }
    return null;
};
// t239u: the teams lined up two empty rows apart, the ball in the white king's hands
$hb = $ballAt($s['board']);
check($s['loose'] === null && $hb[0] === 4 && $hb[1] === 4 && $hb[2]['kind'] === 'k' && $hb[2]['side'] === 'w', 'start: the white king has the ball');
check(($s['board'][5][0]['kind'] ?? '') === 'p' && ($s['board'][8][0]['side'] ?? '') === 'b' && ($s['board'][9][4]['kind'] ?? '') === 'k' && count($men($s['board'])) === 32 && array_filter(array_merge($s['board'][6], $s['board'][7])) === [], 'start: lined up facing each other, two empty rows apart (t239u)');
check(FM::act($s, 'b', ['t' => 'move', 'from' => [8, 3], 'to' => [7, 3]], $t + 100) === 'Wait for your turn.', 'no moving out of turn');
check(FM::act($s, 'w', ['t' => 'move', 'from' => [5, 3], 'to' => [6, 3]], $t + 200) === null && $s['turn'] === 'b', 'pawn steps up, their turn');
// the 5-second rule: after 5 s the waiting side may sneak in one move
check(FM::act($s, 'w', ['t' => 'move', 'from' => [5, 0], 'to' => [6, 0]], $t + 3000) === 'Wait for your turn.', 'no bonus before 5 s');
check(FM::act($s, 'w', ['t' => 'move', 'from' => [5, 0], 'to' => [6, 0]], $t + 5300) === null, 'bonus move after 5 s');
check($s['turn'] === 'b', 'still their turn after a bonus move');
check(FM::act($s, 'w', ['t' => 'move', 'from' => [6, 0], 'to' => [7, 0]], $t + 5400) !== null, 'only one bonus per 5 s');
check(FM::act($s, 'b', ['t' => 'move', 'from' => [8, 4], 'to' => [7, 4]], $t + 5500) === null && $s['board'][6][3]['id'] === 'd2', 'players stay where they are between moves (t238u)');

/** a made-up position, ready to play */
$at = static function (array $board, string $turn, int $when) use ($s): array {
    $x = $s;
    $x['board'] = $board;
    $x['loose'] = null;
    $x['turn'] = $turn;
    $x['turnAt'] = $when;
    $x['bonus'] = 0;
    $x['phase'] = 'play';
    $x['flight'] = null;
    return $x;
};
$empty = array_fill(0, 14, array_fill(0, 8, null));

// a tackle of a player WITHOUT the ball: play goes on, the tackler stays on the square (t238u)
$b = $empty;
$b[2][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1', 'ball' => true, 'held' => 0];
$b[5][0] = ['side' => 'w', 'kind' => 'p', 'id' => 'a2'];
$b[6][1] = ['side' => 'b', 'kind' => 'p', 'id' => 'b7'];
$b[11][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$sP = $at($b, 'b', $t + 10000);
check(FM::act($sP, 'b', ['t' => 'move', 'from' => [6, 1], 'to' => [5, 0]], $t + 10100) === null, 'plain tackle');
check($sP['phase'] === 'play' && $sP['turn'] === 'w' && ($sP['board'][5][0]['id'] ?? '') === 'b7' && !in_array('a2', $men($sP['board']), true), 'plain tackle: he is out, the tackler stays, play goes on');

// the ball carrier is tackled, no fumble: everyone left lines up at that yard line, the king gets the ball (t239u)
$b = $empty;
$b[1][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1'];
$b[0][0] = ['side' => 'w', 'kind' => 'r', 'id' => 'a1'];
$b[4][1] = ['side' => 'w', 'kind' => 'n', 'id' => 'b1'];
$b[6][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'd2', 'ball' => true, 'held' => 0];
$b[7][4] = ['side' => 'b', 'kind' => 'p', 'id' => 'e7'];
$b[12][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$b[13][7] = ['side' => 'b', 'kind' => 'r', 'id' => 'h8'];
$sT = $at($b, 'b', $t + 11000);
$sF = $sT;
check(FM::act($sT, 'b', ['t' => 'move', 'from' => [7, 4], 'to' => [6, 3]], $t + 11100) === null && $sT['phase'] === 'dead', 'carrier tackled: the play is dead');
FM::advance($sT, $t + 11100 + 1500);
$g = $sT['board'];
check($sT['phase'] === 'snap' && $sT['turn'] === 'w', 'the tackled team goes next');
check(($g[5][4]['id'] ?? '') === 'e1' && ($g[5][0]['id'] ?? '') === 'a1' && ($g[5][1]['id'] ?? '') === 'b1', 'offense lined up on its side of the tackle line');
check(($g[9][4]['id'] ?? '') === 'e7' && ($g[10][4]['id'] ?? '') === 'e8' && ($g[10][7]['id'] ?? '') === 'h8' && array_filter(array_merge($g[7], $g[8])) === [], 'defense lined up two empty rows away');
check(!empty($g[5][4]['ball']) && count($men($g)) === 6, 'the king has the ball, the tackled carrier stays out');
check(($sT['events'][count($sT['events']) - 1]['fresh'] ?? true) === false, 'nobody comes back');
// same tackle, the dice say fumble: their ball, everyone left lines up at the tackle spot, their king has it (t239u)
check(FM::risk($sF['board'], [6, 3], 'b', 'tackle') >= 10, 'tackle risk');
FM::$dice = static fn (): float => 0.0;
check(FM::act($sF, 'b', ['t' => 'move', 'from' => [7, 4], 'to' => [6, 3]], $t + 11100) === null, 'tackle (fumble)');
FM::$dice = static fn (): float => 99.0;
FM::advance($sF, $t + 11100 + 1500);
$hbF = $ballAt($sF['board']);
$gF = $sF['board'];
check(count($men($gF)) === 6 && $hbF[0] === 7 && $hbF[1] === 4 && $hbF[2]['side'] === 'b' && $sF['turn'] === 'b', 'fumble on a tackle: their king has the ball at the tackle spot');
check(($gF[6][4]['id'] ?? '') === 'e7' && ($gF[2][4]['id'] ?? '') === 'e1' && array_filter(array_merge($gF[4], $gF[5])) === [], 'fumble lineup: black on its side of the line, white two rows away');
check(($sF['events'][count($sF['events']) - 1]['fresh'] ?? true) === false, 'tackled players stay out');
FM::advance($sF, $t + 11100 + 1500 + 1300);
check($sF['phase'] === 'play', 'snap');

// a lineup for black (the board is flipped for them)
$b = $empty;
$b[12][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$b[9][0] = ['side' => 'b', 'kind' => 'p', 'id' => 'a7'];
$b[9][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'd2'];
$b[1][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1'];
$g = FM::lineUpAt($b, 8, 'b');
check(($g[8][0]['id'] ?? '') === 'a7' && ($g[9][4]['id'] ?? '') === 'e8' && !empty($g[9][4]['ball']) && ($g[5][3]['id'] ?? '') === 'd2' && ($g[4][4]['id'] ?? '') === 'e1', 'black lineup at row 8, white two rows away');
// a lineup near the goal line still puts everybody somewhere on his own side
$full = FM::formation('w');
$g = FM::lineUpAt($full, 12, 'w');
$okSide = true;
foreach ($g as $r => $row) {
    foreach ($row as $u) {
        if ($u !== null && (($u['side'] === 'w' && $r > 11) || ($u['side'] === 'b' && $r < 12))) {
            $okSide = false;
        }
    }
}
check(count($men($g)) === 32 && $okSide, 'a lineup near the end zone keeps everyone, each on his side');

// passes: only the king throws forward (t238u)
$b = $empty;
$b[5][3] = ['side' => 'w', 'kind' => 'q', 'id' => 'd1', 'ball' => true, 'held' => 0];
$b[8][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'd2'];
$b[3][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'c2'];
$b[5][0] = ['side' => 'w', 'kind' => 'p', 'id' => 'a2'];
$b[1][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1'];
$b[12][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$cq = FM::catches($b, 5, 3);
check(!in_array([8, 3], $cq, true) && in_array([3, 3], $cq, true) && in_array([5, 0], $cq, true) && in_array([1, 4], $cq, true), 'the queen may throw back or sideways, not forward');
$sQ = $at($b, 'w', $t + 12000);
check(FM::act($sQ, 'w', ['t' => 'pass', 'from' => [5, 3], 'to' => [8, 3]], $t + 12100) !== null, 'a forward pass by the queen is not allowed');
check(FM::act($sQ, 'w', ['t' => 'pass', 'from' => [5, 3], 'to' => [3, 3]], $t + 12100) === null && !empty($sQ['board'][3][3]['ball']), 'a backward pass is fine');
$bk = $empty;
$bk[0][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1', 'ball' => true, 'held' => 1];
$bk[11][0] = ['side' => 'w', 'kind' => 'p', 'id' => 'a2'];
check(in_array([11, 0], FM::catches($bk, 0, 4), true), 'the king can throw to any of his players, forward too');

// pass + interception (the king throws)
$b = $empty;
$b[2][3] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1', 'ball' => true, 'held' => 0];
$b[8][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'd2'];
$b[5][3] = ['side' => 'b', 'kind' => 'p', 'id' => 'd7'];
$b[13][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$s2 = $at($b, 'w', $t + 20000);
$s2m = $s2;
FM::$dice = static fn (): float => 10.0;
check(FM::act($s2, 'w', ['t' => 'pass', 'from' => [2, 3], 'to' => [8, 3]], $t + 20100) === null, 'pass thrown');
FM::$dice = static fn (): float => 99.0;
check($s2['phase'] === 'play' && FM::risk($b, [8, 3], 'b', 'pass') === 0, 'nobody near the catcher: no pick-off risk');
check(FM::act($s2m, 'w', ['t' => 'pass', 'from' => [2, 3], 'to' => [8, 3]], $t + 20100) === null, 'pass thrown (bad dice)');
check(FM::act($s2m, 'b', ['t' => 'intercept', 'id' => 'd7'], $t + 20900) === 'Missed it!', 'the jump can miss');
check(count(FM::under($s2['flight']['board'], [2, 3], [8, 3])) === 1, 'the pass flies over the defender');
$s3 = $s2;
check(FM::act($s3, 'b', ['t' => 'intercept', 'id' => 'd7'], $t + 20900) === null, 'interception');
check(!empty($s3['board'][5][3]['ball']) && empty($s3['board'][8][3]['ball']) && $s3['phase'] === 'dead', 'defender has the ball, play dead');
check(!empty($s3['next']['all']) && $s3['next']['holder'] === 'b', 'an interception is a turnover: everyone comes back');
FM::advance($s3, $t + 20900 + 2200);
$hb3 = $ballAt($s3['board']);
check($hb3[0] === 9 && $hb3[2]['kind'] === 'k' && $hb3[2]['side'] === 'b', 'after the interception their king has the ball');
$s4 = $s2;
check(FM::act($s4, 'b', ['t' => 'intercept', 'id' => 'd7'], $t + 20100 + 9000) === 'Too late!', 'too late after the ball landed');
// pick-off without a jump: a queen right next to the catcher
$bq = $b;
$bq[9][3] = ['side' => 'b', 'kind' => 'q', 'id' => 'd8'];
$s5 = $at($bq, 'w', $t + 30000);
check(FM::risk($bq, [8, 3], 'b', 'pass') === 30, 'pass risk: 3 + queen next to him 27 = 30%');
FM::$dice = static fn (): float => 5.0;
check(FM::act($s5, 'w', ['t' => 'pass', 'from' => [2, 3], 'to' => [8, 3]], $t + 30000) === null && $s5['phase'] === 'steal', 'the dice say pick-off');
FM::$dice = static fn (): float => 99.0;
FM::advance($s5, $t + 32000);
check(!empty($s5['board'][9][3]['ball']) && $s5['phase'] === 'dead' && !empty($s5['next']['all']), 'the queen picked it off: turnover');
$ie = array_values(array_filter($s5['events'], static fn ($e) => $e['t'] === 'intercept'));
check(($ie[0]['auto'] ?? false) === true && $ie[0]['id'] === 'd8', 'the browsers are told it was a pick-off');

// a pass to a man in the end zone (t238u)
$b = $empty;
$b[6][3] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1', 'ball' => true, 'held' => 0];
$b[12][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'd2'];
$b[9][3] = ['side' => 'b', 'kind' => 'p', 'id' => 'd7'];
$b[13][7] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$sE = $at($b, 'w', $t + 33000);
$scE = $sE['score']['w'];
check(FM::act($sE, 'w', ['t' => 'pass', 'from' => [6, 3], 'to' => [12, 3]], $t + 33000) === null && $sE['phase'] === 'tdpass', 'pass into the end zone');
check(FM::act($sE, 'b', ['t' => 'intercept', 'id' => 'd7'], $t + 33400) === 'Missed it!', 'nobody near him: the jump cannot steal it');
FM::advance($sE, $t + 36000);
check($sE['phase'] === 'celebrate' && $sE['score']['w'] === $scE + 6, 'sure touchdown');
$bE = $b;
$bE[13][2] = ['side' => 'b', 'kind' => 'r', 'id' => 'c8'];
$sE2 = $at($bE, 'w', $t + 33000);
FM::$dice = static fn (): float => 30.0; // above the 18% risk, under 18 + 40 for a jump
check(FM::act($sE2, 'w', ['t' => 'pass', 'from' => [6, 3], 'to' => [12, 3]], $t + 33000) === null, 'pass into the end zone, a defender near');
check(FM::act($sE2, 'b', ['t' => 'intercept', 'id' => 'd7'], $t + 33400) === null && $sE2['phase'] === 'dead', 'with a defender near, the jump can pick it off');
FM::$dice = static fn (): float => 99.0;

// a run next to big defenders may fumble
$br = $empty;
$br[6][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'd2', 'ball' => true, 'held' => 0];
$br[8][4] = ['side' => 'b', 'kind' => 'q', 'id' => 'd8'];
$br[0][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1'];
$br[13][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$s6r = $at($br, 'w', $t + 40000);
check(FM::risk($br, [7, 3], 'b', 'run') === 16, 'run risk: 2 + queen next to him 13.5 = 16%');
FM::$dice = static fn (): float => 3.0;
check(FM::act($s6r, 'w', ['t' => 'move', 'from' => [6, 3], 'to' => [7, 3]], $t + 40000) === null && $s6r['phase'] === 'dead' && $s6r['next']['holder'] === 'b' && !empty($s6r['next']['all']), 'fumble on the run: their ball, everyone back');
FM::$dice = static fn (): float => 99.0;

// the king held it 3 moves: ball down, everyone lines up at his yard line, he keeps it (t239u lineup)
$b = $empty;
$b[4][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1', 'ball' => true, 'held' => 3];
$b[6][0] = ['side' => 'w', 'kind' => 'p', 'id' => 'a2'];
$b[9][0] = ['side' => 'b', 'kind' => 'p', 'id' => 'a7'];
$b[12][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$sD = $at($b, 'b', $t + 41000);
check(FM::act($sD, 'b', ['t' => 'move', 'from' => [12, 4], 'to' => [12, 3]], $t + 41100) === null && $sD['phase'] === 'dead', 'ball down');
FM::advance($sD, $t + 41100 + 1500);
check(!empty($sD['board'][3][4]['ball']) && (int) $sD['board'][3][4]['held'] === 0 && ($sD['board'][4][0]['id'] ?? '') === 'a2' && ($sD['board'][7][0]['id'] ?? '') === 'a7' && ($sD['board'][8][4]['id'] ?? '') === 'e8' && $sD['turn'] === 'w', 'ball down: lineup at the king, he keeps it');

// a receiver already downfield comes back to the line too
$b = $empty;
$b[2][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1'];
$b[8][0] = ['side' => 'w', 'kind' => 'p', 'id' => 'a2'];
$b[12][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$sh = FM::lineUpAt($b, 5, 'w');
check(($sh[4][4]['id'] ?? '') === 'e1' && !empty($sh[4][4]['ball']) && ($sh[5][0]['id'] ?? '') === 'a2' && ($sh[9][4]['id'] ?? '') === 'e8', 'lineup: a man past the line comes back to it');

// touchdown, skip needs both, everyone back
$b = $empty;
$b[11][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'd2', 'ball' => true, 'held' => 0];
$b[0][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1'];
$b[13][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$b[9][0] = ['side' => 'b', 'kind' => 'p', 'id' => 'a7'];
$s5 = $at($b, 'w', $t + 30000);
$sc = $s5['score']['w'];
check(FM::act($s5, 'w', ['t' => 'move', 'from' => [11, 3], 'to' => [12, 3]], $t + 30100) === null, 'run into the end zone');
check($s5['phase'] === 'celebrate' && $s5['score']['w'] === $sc + 6, 'touchdown +6');
FM::act($s5, 'w', ['t' => 'skip'], $t + 31000);
check($s5['phase'] === 'celebrate', 'one skip is not enough');
FM::act($s5, 'b', ['t' => 'skip'], $t + 31100);
check($s5['phase'] === 'play' && $s5['turn'] === 'b', 'both skipped: kick-off, the other team first');
$hb5 = $ballAt($s5['board']);
check(count($men($s5['board'])) === 32 && $hb5[0] === 9 && $hb5[2]['kind'] === 'k' && $hb5[2]['side'] === 'b', 'after a touchdown everyone is back, their king has the ball');

// field goals: the king only, from anywhere, odds by distance (t238u)
check(FM::fieldGoalOdds('w', 11) === 95 && FM::fieldGoalOdds('w', 0) === 5 && FM::fieldGoalOdds('b', 2) === 95 && FM::fieldGoalOdds('b', 13) === 5, 'field goal odds: 95% close in, 5% from your own end');
check(FM::fieldGoalOdds('w', 6) > FM::fieldGoalOdds('w', 5) && FM::fieldGoalOdds('w', 6) === FM::fieldGoalOdds('b', 7), 'closer is better, same for both teams');
$b = $empty;
$b[6][4] = ['side' => 'w', 'kind' => 'k', 'id' => 'e1', 'ball' => true, 'held' => 0];
$b[6][3] = ['side' => 'w', 'kind' => 'p', 'id' => 'd2'];
$b[13][4] = ['side' => 'b', 'kind' => 'k', 'id' => 'e8'];
$sG = $at($b, 'w', $t + 50000);
$sN = $sG;
$sX = $sG;
$sX['board'][6][4]['ball'] = false;
$sX['board'][6][3]['ball'] = true;
check(FM::act($sX, 'w', ['t' => 'goal', 'from' => [6, 3]], $t + 50000) === 'Only the king can kick a field goal.', 'only the king kicks');
$pG = FM::fieldGoalOdds('w', 6);
FM::$dice = static fn (): float => $pG - 1.0;
$fg = $sG['score']['w'];
check(FM::act($sG, 'w', ['t' => 'goal', 'from' => [6, 4]], $t + 50000) === null && $sG['score']['w'] === $fg + 3, 'field goal from midfield is good: +3');
FM::$dice = static fn (): float => (float) $pG;
check(FM::act($sN, 'w', ['t' => 'goal', 'from' => [6, 4]], $t + 50000) === null && $sN['score']['w'] === $fg, 'the dice say no good: no points');
FM::$dice = static fn (): float => 99.0;
$ge = $sN['events'][count($sN['events']) - 1];
check($ge['t'] === 'goal' && $ge['good'] === false && $ge['pct'] === $pG && ($ge['cue']['miss'] ?? false) === true, 'the browsers are told it missed');
FM::advance($sG, $t + 50000 + 4200);
FM::advance($sN, $t + 50000 + 4200);
$hG = $ballAt($sG['board']);
$hN = $ballAt($sN['board']);
check($sG['phase'] === 'play' && $sG['turn'] === 'b' && count($men($sG['board'])) === 32 && $hG[2]['side'] === 'b' && $hN[2]['side'] === 'b' && $sN['turn'] === 'b', 'make or miss, the other team gets the ball, everyone back');
$s6 = $sG;

// clock
$s7 = $s6;
FM::advance($s7, $t + 40000 + 4200 + FM::GAME_MS + 1);
check($s7['over'] === 'time', 'the 10-minute clock ends the game');

// leaving
$r = FM::resignFootball('u2', ['gameId' => $gid]);
check($r['over'] === 'resign' && $r['winner'] === 'w', 'leaving = the other player wins');
check(Mores::getHomeState('u1', [])['footballGameId'] === null, 'finished game no longer opens');
finish();
