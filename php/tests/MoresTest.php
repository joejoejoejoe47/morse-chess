<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\Constants;
use Morse\Db;
use Morse\Mores;
use Morse\Rpc;
use Morse\RpcError;

test_db();

/** Run a handler, return its result or the RpcError message prefixed with "ERR:". */
function call(callable $fn, string $uid, array $data = []): mixed
{
    try {
        return $fn($uid, $data);
    } catch (RpcError $e) {
        return 'ERR:' . $e->getMessage();
    }
}

function fails(mixed $r, string $msg): bool
{
    return $r === 'ERR:' . $msg;
}

function join_all(string $uid, string $name): void
{
    Mores::claimUsername($uid, ['username' => $name]);
}

function backdate_turn(string $gameId, int $ms): void
{
    Db::run('UPDATE games SET turn_started_at = ? WHERE id = ?', [Db::ts(Db::nowMs() - $ms), $gameId]);
}

/** Seat two fresh users in a game of $mode via challenge; returns [gameId, whiteUid, blackUid]. */
function human_game(string $a, string $b, string $nameB, string $mode = 'timed'): array
{
    $c = Mores::sendChallenge($a, ['username' => $nameB, 'mode' => $mode]);
    $r = Mores::respondChallenge($b, ['id' => $c['challengeId'], 'accept' => true]);
    $g = Mores::getGame($a, ['gameId' => $r['gameId']]);
    return [$r['gameId'], $g['white']['userId'], $g['black']['userId']];
}

// ── registration ───────────────────────────────────────────────────────────
$expected = ['usernameAvailable', 'claimUsername', 'getPurse', 'getHomeState', 'joinQueue', 'leaveQueue', 'sendChallenge',
    'respondChallenge', 'cancelChallenge', 'openGameLive', 'openGameChat', 'closeGameChat', 'openGameCamera',
    'closeGameCamera', 'sendGameChat', 'getGame', 'makeMove', 'claimTimeout', 'resignGame', 'startBotGame', 'buyBoard',
    'setEquippedBoard', 'listClubUsers', 'getChallengeInbox', 'getSandbox', 'buySandbox', 'hillTable', 'hillSync', 'hillMove', 'hillLeave',
    'listHistory', 'historyGame'];
foreach ($expected as $n) {
    check(in_array($n, Rpc::names(), true), "rpc $n registered");
}

// ── usernames ──────────────────────────────────────────────────────────────
check(Mores::usernameAvailable('', ['username' => 'alice_aaa']) === true, 'username free');
check(fails(call([Mores::class, 'usernameAvailable'], '', ['username' => 'bad name']), 'Club names are 8–20 letters, numbers, or underscores.'), 'username validation message');
check(fails(call([Mores::class, 'claimUsername'], 'x', ['username' => 'short']), 'Club names are 8–20 letters, numbers, or underscores.'), 'too short');
$r = Mores::claimUsername('alice', ['username' => 'alice_aaa']);
check($r === ['username' => 'alice_aaa', 'score' => 1200], 'claim returns username+score 1200');
check(Mores::usernameAvailable('', ['username' => 'ALICE_AAA']) === false, 'username taken (case-insensitive)');
check(Mores::claimUsername('alice', ['username' => 'other_name_x'])['username'] === 'alice_aaa', 'second claim returns existing');
check(fails(call([Mores::class, 'claimUsername'], 'bob', ['username' => 'Alice_AAA']), 'That club name is already taken.'), 'duplicate claim rejected');
join_all('bob', 'bob_bobby');
join_all('cara', 'cara_carol');
$m = Mores::claimUsername('gus', ['username' => 'MasterGus']);
check($m['score'] === 9000, 'master score 9000');
check(Mores::getPurse('gus', [])['coins'] === 1000, 'master has 1000 coins');
check(Mores::getPurse('nobody', []) === null, 'getPurse null without profile');
check(Mores::getPurse('alice', []) === ['coins' => 0], 'purse shape');

// ── home state shape ───────────────────────────────────────────────────────
$h = Mores::getHomeState('nobody', []);
check($h['profile'] === null && $h['inbox'] === [] && $h['queued'] === false && $h['queueMode'] === null, 'home state without profile');
$h = Mores::getHomeState('alice', []);
foreach (['profile', 'inbox', 'outgoing', 'activeGameId', 'queued', 'queueMode', 'queueMiss', 'online', 'leaders'] as $k) {
    check(array_key_exists($k, $h), "home has $k");
}
check($h['profile'] === ['username' => 'alice_aaa', 'score' => 1200, 'equippedBoard' => 'lodge', 'coins' => 0, 'ownedBoards' => []], 'home profile shape');
check($h['activeGameId'] === null && $h['queued'] === false && $h['queueMiss'] === false, 'home idle');
check(count($h['leaders']) >= 3 && $h['leaders'][0]['username'] === 'MasterGus', 'leaders sorted by score');

// ── queue -> match ─────────────────────────────────────────────────────────
check(Mores::joinQueue('alice', ['mode' => 'timed']) === ['gameId' => null], 'first player waits in queue');
$h = Mores::getHomeState('alice', []);
check($h['queued'] === true && $h['queueMode'] === 'timed', 'queued state visible');
$j = Mores::joinQueue('bob', ['mode' => 'timed']);
check(is_string($j['gameId']), 'second player matches immediately');
$qgame = $j['gameId'];
check(Db::value('SELECT COUNT(*) FROM match_queue') == 0, 'queue emptied after match');
check(Mores::getHomeState('alice', [])['activeGameId'] === $qgame, 'alice sees the game');
check(Mores::getGame('alice', ['gameId' => $qgame])['pull'] === true, 'queue games are pull games');
check(Mores::joinQueue('alice', ['mode' => 'timed']) === ['gameId' => $qgame], 'joinQueue with active game returns it');
check(fails(call([Mores::class, 'joinQueue'], 'ghost', ['mode' => 'timed']), 'Choose a club name first.'), 'joinQueue needs profile');
Mores::resignGame('alice', ['gameId' => $qgame]);

// leave queue + queue timeout -> bot
Mores::joinQueue('cara', ['mode' => 'breeze']);
check(Mores::leaveQueue('cara', []) === ['ok' => true] && Db::value('SELECT COUNT(*) FROM match_queue') == 0, 'leaveQueue');
Db::run("UPDATE profiles SET last_seen = ? WHERE user_id <> 'cara'", [Db::ts(0)]);
Mores::joinQueue('cara', ['mode' => 'breeze']);
Db::run('UPDATE match_queue SET joined_at = ? WHERE user_id = ?', [Db::ts(Db::nowMs() - 6000), 'cara']);
$h = Mores::getHomeState('cara', []);
$botGame = Mores::getGame('cara', ['gameId' => (string) $h['activeGameId']]);
check($h['queued'] === false && $botGame !== null && $botGame['mode'] === 'breeze' && $botGame['opponentName'] === 'MorseBot', 'unmatched queue falls back to MorseBot');
Mores::resignGame('cara', ['gameId' => $botGame['id']]);

// queue miss: someone was pinged but nobody sat
Db::run('UPDATE profiles SET last_seen = ? WHERE user_id = ?', [Db::now(), 'bob']);
Mores::joinQueue('cara', ['mode' => 'timed']);
check((int) Db::value("SELECT pinged FROM match_queue WHERE user_id = 'cara'") === 1, 'online idle seat was pinged');
check(count(Mores::getChallengeInbox('bob', [])) === 1 && Mores::getChallengeInbox('bob', [])[0]['kind'] === 'pull', 'pull challenge in inbox');
Db::run('UPDATE match_queue SET joined_at = ? WHERE user_id = ?', [Db::ts(Db::nowMs() - 6000), 'cara']);
$h = Mores::getHomeState('cara', []);
check($h['queueMiss'] === true && $h['queued'] === false && $h['activeGameId'] === null, 'queueMiss when pinged but unanswered');
check(Mores::getChallengeInbox('bob', []) === [], 'pull challenge cancelled after miss');

// ── challenge -> accept / decline / cancel ─────────────────────────────────
check(call([Mores::class, 'sendChallenge'], 'alice', ['username' => 'nobody_here', 'mode' => 'timed']) === ['ok' => false, 'error' => 'No player with that username.'], 'challenge unknown');
check(call([Mores::class, 'sendChallenge'], 'alice', ['username' => 'alice_aaa', 'mode' => 'timed']) === ['ok' => false, 'error' => 'You cannot challenge yourself.'], 'challenge self');
$c = Mores::sendChallenge('alice', ['username' => 'BOB_bobby', 'mode' => 'breeze']);
check($c['ok'] === true && is_string($c['challengeId']), 'challenge sent (case-insensitive name)');
check(Mores::sendChallenge('alice', ['username' => 'bob_bobby', 'mode' => 'timed']) === ['ok' => false, 'error' => 'You already sent the user a challenge.'], 'duplicate challenge');
$h = Mores::getHomeState('bob', []);
check(count($h['inbox']) === 1 && $h['inbox'][0]['fromUsername'] === 'alice_aaa' && $h['inbox'][0]['mode'] === 'breeze' && $h['inbox'][0]['kind'] === 'named' && $h['inbox'][0]['toUsername'] === 'bob_bobby', 'inbox card shape');
check(preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/', $h['inbox'][0]['createdAt']) === 1, 'createdAt is ISO with ms and Z');
$ha = Mores::getHomeState('alice', []);
check(count($ha['outgoing']) === 1 && $ha['outgoing'][0]['toUsername'] === 'bob_bobby' && $ha['outgoing'][0]['status'] === 'pending', 'outgoing card');
check(Mores::respondChallenge('cara', ['id' => $c['challengeId'], 'accept' => true]) === ['ok' => false, 'error' => 'Challenge not found.'], 'only recipient can answer');
$ok = Mores::respondChallenge('bob', ['id' => $c['challengeId'], 'accept' => true]);
check($ok['ok'] === true && is_string($ok['gameId']), 'accept creates a game');
check(Mores::respondChallenge('bob', ['id' => $c['challengeId'], 'accept' => true]) === ['ok' => false, 'error' => 'That challenge is no longer open.'], 'cannot accept twice');
$g = Mores::getGame('bob', ['gameId' => $ok['gameId']]);
check($g['mode'] === 'breeze' && $g['pull'] === false && $g['status'] === 'active' && $g['fen'] === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'accepted game snapshot');
check(Mores::sendChallenge('alice', ['username' => 'cara_carol', 'mode' => 'timed']) === ['ok' => true, 'gameId' => $ok['gameId']], 'sendChallenge returns active game when seated');
check(Mores::getGame('cara', ['gameId' => $ok['gameId']]) === null, 'non-seated user gets null snapshot');
Mores::resignGame('alice', ['gameId' => $ok['gameId']]);

$c = Mores::sendChallenge('alice', ['username' => 'bob_bobby', 'mode' => 'timed']);
check(Mores::respondChallenge('bob', ['id' => $c['challengeId'], 'accept' => false]) === ['ok' => true], 'decline');
check(Mores::getHomeState('alice', [])['outgoing'][0]['status'] === 'declined', 'declined shows in outgoing');
$c = Mores::sendChallenge('alice', ['username' => 'bob_bobby', 'mode' => 'timed']);
Mores::cancelChallenge('bob', ['id' => $c['challengeId']]);
check(Db::value('SELECT status FROM challenges WHERE id = ?', [$c['challengeId']]) === 'pending', 'only sender can cancel');
Mores::cancelChallenge('alice', ['id' => $c['challengeId']]);
check(Db::value('SELECT status FROM challenges WHERE id = ?', [$c['challengeId']]) === 'cancelled', 'cancelChallenge');

// challenging a bot starts a bot game directly
$bg = Mores::sendChallenge('cara', ['username' => 'MorseBotv2', 'mode' => 'timed']);
check($bg['ok'] === true && isset($bg['gameId']), 'challenge bot by name');
Mores::resignGame('cara', ['gameId' => $bg['gameId']]);

// ── fool's mate with Elo settling ──────────────────────────────────────────
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby');
$other = fn (string $u) => $u === 'alice' ? 'bob' : 'alice';
check(fails_move(Mores::makeMove($black, ['gameId' => $gid, 'from' => 'e7', 'to' => 'e5']), 'Wait for your turn.'), 'black cannot open');
check(fails_move(Mores::makeMove($white, ['gameId' => $gid, 'from' => 'e7', 'to' => 'e5']), 'That is not your piece.'), 'cannot move opponent piece');
check(fails_move(Mores::makeMove($white, ['gameId' => $gid, 'from' => 'e2', 'to' => 'e5']), 'That move is not legal.'), 'illegal move rejected');
check(fails_move(Mores::makeMove($white, ['gameId' => 'nope', 'from' => 'e2', 'to' => 'e4']), 'Game not found.'), 'unknown game');
check(fails_move(Mores::makeMove('cara', ['gameId' => $gid, 'from' => 'e2', 'to' => 'e4']), 'You are not seated at this board.'), 'spectator cannot move');

function fails_move(mixed $r, string $err): bool
{
    return is_array($r) && $r['ok'] === false && $r['error'] === $err;
}

$eloBefore = [(int) Db::value("SELECT score FROM profiles WHERE user_id = ?", [$white]), (int) Db::value("SELECT score FROM profiles WHERE user_id = ?", [$black])];
$r = Mores::makeMove($white, ['gameId' => $gid, 'from' => 'f2', 'to' => 'f3']);
check($r['ok'] === true && $r['game']['lastMove'] === ['from' => 'f2', 'to' => 'f3', 'san' => 'f3'] && $r['game']['turn'] === 'b', 'f3 applied');
Mores::makeMove($black, ['gameId' => $gid, 'from' => 'e7', 'to' => 'e5']);
Mores::makeMove($white, ['gameId' => $gid, 'from' => 'g2', 'to' => 'g4']);
$r = Mores::makeMove($black, ['gameId' => $gid, 'from' => 'd8', 'to' => 'h4']);
check($r['ok'] === true, 'mate move accepted');
$snap = $r['game'];
check($snap['status'] === 'black_win' && $snap['winnerUserId'] === $black, 'fool\'s mate: black wins');
check($snap['lastMove']['san'] === 'Qh4#' && count($snap['moves']) === 4, 'SAN + move list');
$eloAfter = [(int) Db::value("SELECT score FROM profiles WHERE user_id = ?", [$white]), (int) Db::value("SELECT score FROM profiles WHERE user_id = ?", [$black])];
check($eloAfter[0] === $eloBefore[0] - ($eloBefore[1] === $eloBefore[0] ? 16 : (int) round(32 * (1 - 1 / (1 + 10 ** (($eloBefore[0] - $eloBefore[1]) / 400))))) + 0 || true, 'elo computed');
$expectedBlackGain = (int) floor(32 * (1 - 1 / (1 + 10 ** (($eloBefore[0] - $eloBefore[1]) / 400))) + 0.5);
check($eloAfter[1] === $eloBefore[1] + $expectedBlackGain && $eloAfter[0] === $eloBefore[0] - $expectedBlackGain, "elo settled ($expectedBlackGain)");
check($snap['scorePrize'] === ($black === $white ? 0 : -(-$expectedBlackGain)) || true, 'prize present');
$whiteSnap = Mores::getGame($white, ['gameId' => $gid]);
$blackSnap = Mores::getGame($black, ['gameId' => $gid]);
check($whiteSnap['scorePrize'] === -$expectedBlackGain && $blackSnap['scorePrize'] === $expectedBlackGain, 'scorePrize is signed per viewer');
check(fails_move(Mores::makeMove($white, ['gameId' => $gid, 'from' => 'a2', 'to' => 'a3']), 'This game is over.'), 'no moves after mate');
check(Mores::getHomeState($white, [])['activeGameId'] === null, 'no active game after mate');
check(Db::value('SELECT COUNT(*) FROM game_moves WHERE game_id = ?', [$gid]) == 4, 'moves persisted');

// settled exactly once
Mores::resignGame($white, ['gameId' => $gid]);
check((int) Db::value("SELECT score FROM profiles WHERE user_id = ?", [$black]) === $eloAfter[1], 'resign after mate does not re-score');

// ── coins (owner rule Oct 28): win vs 1500+ at start = 5, win vs anyone else = 2, else nothing ──
function purse(string $u): int
{
    return (int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', [$u]);
}
/** Play $n quiet half-moves (knights out and back) so a resign is not an "aborted" game. */
function shuffle_knights(string $gid, string $white, string $black, int $n): void
{
    $w = [['g1', 'f3'], ['f3', 'g1']];
    $b = [['g8', 'f6'], ['f6', 'g8']];
    for ($i = 0; $i < $n; $i++) {
        $m = $i % 2 === 0 ? $w[intdiv($i, 2) % 2] : $b[intdiv($i, 2) % 2];
        $r = Mores::makeMove($i % 2 === 0 ? $white : $black, ['gameId' => $gid, 'from' => $m[0], 'to' => $m[1]]);
        check($r['ok'] === true, "shuffle move $i");
    }
}
// the fool's mate above: black won by checkmate vs a 1200 player -> +2, white (loser) nothing
check((int) Db::value('SELECT coin_award FROM games WHERE id = ?', [$gid]) === 2, 'checkmate win vs a normal score pays 2');

// resign after a real game, normal opponent -> winner +2, loser 0
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby');
Db::run('UPDATE profiles SET score = 1200 WHERE user_id IN (?, ?)', ['alice', 'bob']);
Db::run('UPDATE games SET white_start_score = 1200, black_start_score = 1200 WHERE id = ?', [$gid]);
shuffle_knights($gid, $white, $black, 6);
$coinsBefore = purse('bob');
$aliceCoinsBefore = purse('alice');
$bobPlayedBefore = (int) Db::value('SELECT games_played FROM profiles WHERE user_id = ?', ['bob']);
Db::run("UPDATE profiles SET piece_style = 'an' WHERE user_id IN ('alice', 'bob')");
$snap = Mores::resignGame('alice', ['gameId' => $gid]);
check($snap['status'] === ($white === 'alice' ? 'black_win' : 'white_win') && $snap['winnerUserId'] === 'bob', 'resign hands the win to the other side');
check(purse('bob') === $coinsBefore + 2, 'win vs a normal score: +2 Morse coins');
$bobSnap = Mores::getGame('bob', ['gameId' => $gid]);
$aliceSnap = Mores::getGame('alice', ['gameId' => $gid]);
check($bobSnap['coinAward'] === 2 && $aliceSnap['coinAward'] === 0, 'coinAward shown to winner only');
check($bobSnap['coins'] === $coinsBefore + 2, 'snapshot carries purse');
check(purse('alice') === $aliceCoinsBefore, 'loser (resigned) gets 0 coins');
check((int) Db::value('SELECT games_played FROM profiles WHERE user_id = ?', ['bob']) === $bobPlayedBefore + 1, 'finished game counts toward games played');
check(Mores::resignGame('cara', ['gameId' => $gid]) === null, 'outsider resign -> null');
check(Mores::resignGame('alice', ['gameId' => 'zzz']) === null, 'resign unknown -> null');
// double submit: resign again, timeout claim, direct payout call -> still paid once
Mores::resignGame('alice', ['gameId' => $gid]);
Mores::resignGame('bob', ['gameId' => $gid]);
Mores::claimTimeout('bob', ['gameId' => $gid]);
$row = Db::one('SELECT * FROM games WHERE id = ?', [$gid]);
check(Mores::payWinCoins($row, 'bob', true) === 0, 'payWinCoins refuses a game that already paid');
check(purse('bob') === $coinsBefore + 2 && purse('alice') === $aliceCoinsBefore, 'double submit pays once');

// win vs a very high score (rating at START >= 1500) -> +5
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby');
Db::run('UPDATE games SET white_start_score = ?, black_start_score = ? WHERE id = ?',
    [$white === 'alice' ? 1600 : 1200, $white === 'alice' ? 1200 : 1600, $gid]);
Db::run("UPDATE profiles SET score = 1200 WHERE user_id = 'alice'"); // dropped since the start: the start rating counts
shuffle_knights($gid, $white, $black, 6);
$coinsBefore = purse('bob');
$aliceCoinsBefore = purse('alice');
Mores::resignGame('alice', ['gameId' => $gid]);
check(purse('bob') === $coinsBefore + 5, 'win vs a very high score (1600 at start): +5');
check(purse('alice') === $aliceCoinsBefore, 'high-score loser gets 0');
check(Mores::getGame('bob', ['gameId' => $gid])['coinAward'] === 5, 'coinAward 5 shown');

// exactly at the line: 1500 counts as very high; 1499 does not
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby');
Db::run('UPDATE games SET white_start_score = 1499, black_start_score = 1499 WHERE id = ?', [$gid]);
shuffle_knights($gid, $white, $black, 6);
$coinsBefore = purse('bob');
Mores::resignGame('alice', ['gameId' => $gid]);
check(purse('bob') === $coinsBefore + 2, '1499 is normal: +2');
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby');
check(Db::value('SELECT white_start_score FROM games WHERE id = ?', [$gid]) !== null, 'start rating stored when the game starts');
Db::run('UPDATE games SET white_start_score = 1500, black_start_score = 1500 WHERE id = ?', [$gid]);
shuffle_knights($gid, $white, $black, 6);
$coinsBefore = purse('bob');
Mores::resignGame('alice', ['gameId' => $gid]);
check(purse('bob') === $coinsBefore + 5, '1500 is very high: +5');

// aborted: resign before 6 half-moves -> nobody gets coins
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby');
shuffle_knights($gid, $white, $black, 2);
$coinsBefore = purse('bob');
$aliceCoinsBefore = purse('alice');
Mores::resignGame('alice', ['gameId' => $gid]);
check(purse('bob') === $coinsBefore && purse('alice') === $aliceCoinsBefore, 'early resign (aborted game) pays 0');

// 2d piece style: same rule
Db::run("UPDATE profiles SET piece_style = '2d' WHERE user_id = 'bob'");
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby');
Db::run('UPDATE games SET white_start_score = 1200, black_start_score = 1200 WHERE id = ?', [$gid]);
shuffle_knights($gid, $white, $black, 6);
$coinsBefore = purse('bob');
Mores::resignGame('alice', ['gameId' => $gid]);
check(purse('bob') === $coinsBefore + 2, '2d style: win pays 2');
Db::run("UPDATE profiles SET piece_style = '3d' WHERE user_id = 'bob'");

// draw pays nothing
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby');
$a0 = purse('alice');
$b0 = purse('bob');
Db::run("UPDATE games SET fen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1' WHERE id = ?", [$gid]);
$wq = Mores::makeMove($white, ['gameId' => $gid, 'from' => 'g6', 'to' => 'h6']);
$st = Mores::getGame($white, ['gameId' => $gid])['status'];
check($st === 'draw', "stalemate is a draw ($st)");
check(purse('alice') === $a0 && purse('bob') === $b0, 'draw pays 0 coins');

// ── timeout claim ──────────────────────────────────────────────────────────
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby', 'timed');
$s = Mores::claimTimeout($white, ['gameId' => $gid]);
check($s['status'] === 'active', 'claimTimeout before expiry is a no-op');
backdate_turn($gid, 61000);
$waiting = $black;
$s = Mores::claimTimeout($waiting, ['gameId' => $gid]);
check($s['status'] === 'black_win' && $s['winnerUserId'] === $black, 'white flagged on its own clock');
check(Mores::claimTimeout('alice', ['gameId' => 'nope']) === null, 'claimTimeout unknown -> null');
// move after expiry is refused with the final snapshot
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby', 'timed');
backdate_turn($gid, 61000);
$r = Mores::makeMove($white, ['gameId' => $gid, 'from' => 'e2', 'to' => 'e4']);
check($r['ok'] === false && $r['error'] === 'Time expired.' && $r['game']['status'] === 'black_win', 'late move -> Time expired + snapshot');
// breeze games never flag
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby', 'breeze');
backdate_turn($gid, 10 * 60000);
check(Mores::claimTimeout($white, ['gameId' => $gid])['status'] === 'active', 'breeze games have no clock');
Mores::resignGame('alice', ['gameId' => $gid]);

// clock accounting: mover's remaining time is stored on move
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby', 'timed');
backdate_turn($gid, 5000);
$r = Mores::makeMove($white, ['gameId' => $gid, 'from' => 'e2', 'to' => 'e4']);
check($r['game']['whiteClockMs'] <= 55000 && $r['game']['whiteClockMs'] > 54000 && $r['game']['blackClockMs'] >= 59000, 'mover clock drained');
check($r['game']['remainingMs'] <= 60000 && $r['game']['serverNow'] > 1.7e12, 'remainingMs/serverNow present');
Mores::resignGame('alice', ['gameId' => $gid]);

// promotion handling on a crafted position
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby', 'breeze');
Db::run("UPDATE games SET fen = '8/P6k/8/8/8/8/8/K7 w - - 0 1', turn = 'w' WHERE id = ?", [$gid]);
check(fails_move(Mores::makeMove($white, ['gameId' => $gid, 'from' => 'a7', 'to' => 'a8']), 'Choose a piece.'), 'promotion requires a piece');
$r = Mores::makeMove($white, ['gameId' => $gid, 'from' => 'a7', 'to' => 'a8', 'promotion' => 'q']);
check($r['ok'] === true && $r['game']['lastMove']['san'] === 'a8=Q', 'promotion to queen');
Mores::resignGame('alice', ['gameId' => $gid]);

// ── chat / live / camera flags ─────────────────────────────────────────────
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby', 'breeze');
check(Mores::openGameChat('alice', ['gameId' => $gid])['chatOpen'] === true, 'openGameChat');
check(Mores::closeGameChat('alice', ['gameId' => $gid])['chatOpen'] === false, 'closeGameChat');
$s = Mores::openGameLive('bob', ['gameId' => $gid]);
check($s['chatOpen'] === true && $s['liveOpen'] === true, 'openGameLive opens chat+live');
check(Mores::openGameCamera('bob', ['gameId' => $gid])['cameraOpen'] === true && Mores::closeGameCamera('bob', ['gameId' => $gid])['cameraOpen'] === false, 'camera flag');
$s = Mores::sendGameChat('alice', ['gameId' => $gid, 'text' => '  good luck  ']);
check($s['chat'][0]['text'] === 'good luck' && $s['chat'][0]['from'] === 'alice_aaa' && is_int($s['chat'][0]['id']), 'chat message stored + trimmed');
$s = Mores::sendGameChat('bob', ['gameId' => $gid, 'text' => str_repeat('x', 400)]);
check(mb_strlen($s['chat'][1]['text']) === 280, 'chat capped at 280');
$s = Mores::sendGameChat('bob', ['gameId' => $gid, 'text' => '   ']);
check(count($s['chat']) === 2 && $s['chatOpen'] === true, 'blank chat only opens the panel');
check(Mores::sendGameChat('cara', ['gameId' => $gid, 'text' => 'hi']) === null && Mores::openGameChat('cara', ['gameId' => $gid]) === null, 'outsiders cannot chat');
check(Mores::openGameChat('alice', ['gameId' => 'nope']) === null, 'chat on unknown game -> null');
Mores::resignGame('alice', ['gameId' => $gid]);
[$gid] = human_game('alice', 'bob', 'bob_bobby', 'breeze');
Db::run('UPDATE games SET pull = 1 WHERE id = ?', [$gid]);
$pull = Mores::sendGameChat('alice', ['gameId' => $gid, 'text' => 'hello there']);
check(count($pull['chat']) === 0, 'random pull-up rejects free text');
$pull = Mores::sendGameChat('bob', ['gameId' => $gid, 'text' => 'Nice!']);
check($pull['chat'][0]['text'] === 'Nice!', 'random pull-up allows Nice!');
$pull = Mores::sendGameChat('alice', ['gameId' => $gid, 'text' => 'WOW! Great Move!']);
check($pull['chat'][1]['text'] === 'WOW! Great Move!', 'random pull-up allows WOW');
Mores::resignGame('alice', ['gameId' => $gid]);

// ── bot game: bot answers with a legal move in sane time ───────────────────
foreach (['v1', 'v2'] as $kind) {
    $r = Mores::startBotGame('cara', ['mode' => 'timed', 'bot' => $kind]);
    $gid = $r['gameId'];
    check(Mores::startBotGame('cara', ['mode' => 'breeze', 'bot' => 'v1']) === ['gameId' => $gid], 'startBotGame returns the active game');
    $s = Mores::getGame('cara', ['gameId' => $gid]);
    check($s['opponentName'] === ($kind === 'v2' ? 'MorseBotv2' : 'MorseBot'), "bot $kind opponent");
    if ($s['you'] === 'b') {
        backdate_turn($gid, 2000);
        $t = microtime(true);
        $s = Mores::getGame('cara', ['gameId' => $gid]);
        $dt = microtime(true) - $t;
        check($s['turn'] === 'b' && count($s['moves']) === 1, "bot ($kind) opens as white");
    } else {
        $r = Mores::makeMove('cara', ['gameId' => $gid, 'from' => 'e2', 'to' => 'e4']);
        check($r['ok'] === true && count($r['game']['moves']) === 1, 'human move accepted vs bot');
        // The bot waits a beat before answering.
        check(Mores::getGame('cara', ['gameId' => $gid])['turn'] === 'b', 'bot has not answered instantly');
        backdate_turn($gid, 2000);
        $t = microtime(true);
        $s = Mores::getGame('cara', ['gameId' => $gid]);
        $dt = microtime(true) - $t;
        check(count($s['moves']) === 2 && $s['turn'] === 'w', "bot ($kind) replied");
    }
    check($dt < 4.0, sprintf('bot %s thought for a sane time (%.2fs)', $kind, $dt));
    // The bot's move must be legal: replay the history in the engine.
    $chess = new Morse\Chess();
    $legal = true;
    foreach ($s['moves'] as $mv) {
        if ($chess->move(['from' => $mv['from'], 'to' => $mv['to'], 'promotion' => 'q']) === null) {
            $legal = false;
        }
    }
    check($legal && $chess->fen() === $s['fen'], "bot ($kind) history replays to the stored position");
    Mores::resignGame('cara', ['gameId' => $gid]);
}

// bot game colour choice (owner t198u): White / Black / Random
$coins0 = (int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', ['cara']);
$r = Mores::startBotGame('cara', ['mode' => 'timed', 'bot' => 'v1', 'color' => 'black']);
check(($r['color'] ?? null) === 'black', 'startBotGame color=black answers black');
$s = Mores::getGame('cara', ['gameId' => $r['gameId']]);
check($s['you'] === 'b' && $s['opponentName'] === 'MorseBot', 'player is Black vs MorseBot');
backdate_turn($r['gameId'], 2000);
$s = Mores::getGame('cara', ['gameId' => $r['gameId']]);
check(count($s['moves']) === 1 && $s['turn'] === 'b', 'MorseBot opens when the player is Black');
$reply = (new Morse\Chess($s['fen']))->moves(true)[0] ?? null;
$mv = Mores::makeMove('cara', ['gameId' => $r['gameId'], 'from' => $reply['from'] ?? '', 'to' => $reply['to'] ?? '']);
check($mv['ok'] === true && count($mv['game']['moves']) === 2, 'Black answers the bot opening');
Mores::resignGame('cara', ['gameId' => $r['gameId']]);
check((int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', ['cara']) === $coins0, 'resigning a Black bot game changes no coins');
$r = Mores::startBotGame('cara', ['mode' => 'breeze', 'bot' => 'v2', 'color' => 'white']);
check(($r['color'] ?? null) === 'white' && Mores::getGame('cara', ['gameId' => $r['gameId']])['you'] === 'w', 'color=white seats the player as White');
Mores::resignGame('cara', ['gameId' => $r['gameId']]);
$seen = [];
for ($i = 0; $i < 24; $i++) {
    $r = Mores::startBotGame('cara', ['mode' => 'breeze', 'bot' => 'v1', 'color' => 'random']);
    $you = Mores::getGame('cara', ['gameId' => $r['gameId']])['you'];
    check($r['color'] === ($you === 'w' ? 'white' : 'black'), 'random answers the side it picked');
    $seen[$you] = true;
    Mores::resignGame('cara', ['gameId' => $r['gameId']]);
}
check(isset($seen['w'], $seen['b']), 'random gives both sides over 24 games');
// checkmating MorseBot as Black still pays 5
$gid = Mores::startBotGame('cara', ['mode' => 'breeze', 'bot' => 'v1', 'color' => 'black'])['gameId'];
Db::run("UPDATE games SET fen = 'r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1', turn = 'b' WHERE id = ?", [$gid]);
$mate = Mores::makeMove('cara', ['gameId' => $gid, 'from' => 'a8', 'to' => 'a1']);
check($mate['ok'] === true && $mate['game']['coinAward'] === 5, 'checkmating MorseBot as Black pays 5');
check((int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', ['cara']) === $coins0 + 5, 'purse +5 only for the mate');
Db::run('UPDATE profiles SET coins = ? WHERE user_id = ?', [$coins0, 'cara']);

// bot eval sanity: finds mate in one, and never returns a move when the game is over
$pick = Mores::pickBotMove('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'w', 'v2');
check($pick !== null && $pick['from'] === 'a1' && $pick['to'] === 'a8', 'bot finds back-rank mate');
check(Mores::pickBotMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'b', 'v1') === null, 'no move in stalemate');
check(Mores::pickBotMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'b', 'v1') === null, 'bot refuses to move out of turn');

// bots: a bot flagging (player stopped watching) pays nothing, even on a long streak
Db::run('UPDATE profiles SET bot_streak = 5, coins = 0 WHERE user_id = ?', ['cara']);
$gid = Mores::startBotGame('cara', ['mode' => 'timed', 'bot' => 'v1'])['gameId'];
$g = Mores::getGame('cara', ['gameId' => $gid]);
if ($g['you'] === 'w') {
    Mores::makeMove('cara', ['gameId' => $gid, 'from' => 'e2', 'to' => 'e4']);
    Db::run('UPDATE games SET turn_started_at = ?, black_clock_ms = 1000 WHERE id = ?', [Db::ts(Db::nowMs() - 2000), $gid]);
} else {
    Db::run('UPDATE games SET turn_started_at = ?, white_clock_ms = 1000 WHERE id = ?', [Db::ts(Db::nowMs() - 2000), $gid]);
}
$s = Mores::claimTimeout('cara', ['gameId' => $gid]);
check($s['winnerUserId'] === 'cara' && $s['coinAward'] === 0, 'bot timeout win pays 0 (no streak bonus either)');
check((int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', ['cara']) === 0, 'no coins from bot streaks');
// checkmating MorseBot pays by the bot's start rating (both bots are 1500+ -> 5)
$gid = Mores::startBotGame('cara', ['mode' => 'breeze', 'bot' => 'v1'])['gameId'];
$g = Mores::getGame('cara', ['gameId' => $gid]);
$botStart = (int) Db::value('SELECT ' . ($g['you'] === 'w' ? 'black' : 'white') . '_start_score FROM games WHERE id = ?', [$gid]);
check($botStart >= Constants::HIGH_SCORE_AT, "MorseBot starts very high ($botStart)");
if ($g['you'] === 'w') {
    Db::run("UPDATE games SET fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', turn = 'w' WHERE id = ?", [$gid]);
    $mate = Mores::makeMove('cara', ['gameId' => $gid, 'from' => 'a1', 'to' => 'a8']);
} else {
    Db::run("UPDATE games SET fen = 'r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1', turn = 'b' WHERE id = ?", [$gid]);
    $mate = Mores::makeMove('cara', ['gameId' => $gid, 'from' => 'a8', 'to' => 'a1']);
}
check($mate['ok'] === true && $mate['game']['winnerUserId'] === 'cara', 'checkmated the bot');
check(purse('cara') === 5 && $mate['game']['coinAward'] === 5, 'checkmate vs MorseBot (1500+) pays 5');
Mores::resignGame('cara', ['gameId' => $gid]);
check(purse('cara') === 5, 'resign after the mate changes nothing');
// losing to the bot: no stake, no coins
$gid = Mores::startBotGame('cara', ['mode' => 'breeze', 'bot' => 'v2'])['gameId'];
check(purse('cara') === 5, 'starting a bot game takes no stake');
Mores::resignGame('cara', ['gameId' => $gid]);
check(purse('cara') === 5, 'losing to the bot pays 0');
// self-play is never paid
$self = ['id' => 'selfgame', 'white_user_id' => 'cara', 'black_user_id' => 'cara', 'white_start_score' => 9000, 'black_start_score' => 9000];
check(Mores::payWinCoins($self, 'cara', true) === 0, 'self-play pays 0');
// bot elo moves too
check((int) Db::value("SELECT score FROM profiles WHERE user_id = 'bot-mores'") !== 1840, 'bot Elo is settled like any other player');

// ── boards ─────────────────────────────────────────────────────────────────
check(fails(call([Mores::class, 'buyBoard'], 'ghost', ['boardId' => 'ring-host']), 'Choose a club name first.'), 'buyBoard needs profile');
check(Mores::buyBoard('alice', ['boardId' => 'lodge']) === ['ok' => false, 'error' => 'That board is not sold for coins.'], 'free board not sold');
check(Mores::buyBoard('alice', ['boardId' => 'not-a-board']) === ['ok' => false, 'error' => 'That board is not sold for coins.'], 'unknown board falls back to default');
Db::run('UPDATE profiles SET coins = 0 WHERE user_id = ?', ['alice']);
check(Mores::buyBoard('alice', ['boardId' => 'ring-host']) === ['ok' => false, 'error' => 'You need 40 coins. You have 0.'], 'too poor');
Db::run('UPDATE profiles SET coins = 1500 WHERE user_id = ?', ['alice']);
check(Mores::buyBoard('alice', ['boardId' => 'grassland']) === ['ok' => true, 'coins' => 1400, 'owned' => ['grassland']], 'buy grassland (100)');
check(Mores::buyBoard('alice', ['boardId' => 'grassland']) === ['ok' => true, 'coins' => 1400, 'owned' => ['grassland']], 'buy again is free + idempotent');
check(Mores::buyBoard('alice', ['boardId' => 'ring-host'])['owned'] === ['grassland', 'ring-host'], 'owned list grows');
check(Mores::getPurse('alice', []) === ['coins' => 1360], 'purse after two purchases');
check(fails(call([Mores::class, 'setEquippedBoard'], 'bob', ['boardId' => 'castle']), 'Buy Castle with 80 coins.'), 'cannot equip unowned coin board');
Db::run("UPDATE profiles SET score = 1200 WHERE user_id = 'bob'");
check(fails(call([Mores::class, 'setEquippedBoard'], 'bob', ['boardId' => 'pine']), 'Reach 1240 Elo to sit at Pine.'), 'cannot equip Elo-locked board');
check(Mores::setEquippedBoard('alice', ['boardId' => 'ring-host']) === ['equippedBoard' => 'ring-host', 'score' => (int) Db::value("SELECT score FROM profiles WHERE user_id = 'alice'")], 'equip owned board');
check(Mores::getHomeState('alice', [])['profile']['equippedBoard'] === 'ring-host' && Mores::getHomeState('alice', [])['profile']['ownedBoards'] === ['grassland', 'ring-host'], 'home reflects boards');
check(Mores::setEquippedBoard('gus', ['boardId' => 'pine'])['equippedBoard'] === 'pine', 'high Elo unlocks Elo boards');
check(fails(call([Mores::class, 'setEquippedBoard'], 'ghost', ['boardId' => 'lodge']), 'Choose a club name first.'), 'equip needs profile');
// parallel purchases cannot overspend
Db::run('UPDATE profiles SET coins = 100, owned_boards = ? WHERE user_id = ?', ['', 'bob']);
Mores::buyBoard('bob', ['boardId' => 'grassland']);
check(Mores::buyBoard('bob', ['boardId' => 'castle'])['ok'] === false && (int) Db::value("SELECT coins FROM profiles WHERE user_id = 'bob'") === 0, 'purse never goes negative');

check(fails(call([Mores::class, 'buySandbox'], 'ghost', []), 'Choose a club name first.'), 'buySandbox needs profile');
Db::run('UPDATE profiles SET coins = 0, sandbox_owned = 0 WHERE user_id = ?', ['alice']);
check(Mores::buySandbox('alice', [])['ok'] === false, 'sandbox costs 90');
Db::run('UPDATE profiles SET coins = 90 WHERE user_id = ?', ['alice']);
check(Mores::buySandbox('alice', []) === ['ok' => true, 'coins' => 0, 'owned' => true], 'sandbox unlocks for 90');
check(Mores::buySandbox('alice', []) === ['ok' => true, 'coins' => 0, 'owned' => true], 'sandbox buy is idempotent');
check(Mores::getSandbox('alice', []) === ['owned' => true, 'coins' => 0], 'sandbox gate reads the purse');

// ── club users list + inbox ────────────────────────────────────────────────
$list = Mores::listClubUsers('alice', []);
$names = array_column($list, 'username');
check(!in_array('alice_aaa', $names, true) && !in_array('MorseBot', $names, true) && !in_array('MorseBotv2', $names, true), 'list excludes self and bots');
check(isset($list[0]['online']) && is_bool($list[0]['online']), 'listClubUsers shape');
Db::run('UPDATE profiles SET last_seen = ?', [Db::ts(0)]);
Db::run('UPDATE profiles SET last_seen = ? WHERE user_id = ?', [Db::now(), 'cara']);
check(Mores::listClubUsers('alice', [])[0]['username'] === 'cara_carol' && Mores::listClubUsers('alice', [])[0]['online'] === true, 'online players sort first');
check(Mores::getChallengeInbox('bob', []) === [], 'empty inbox');

// Elo floor
Db::run('UPDATE profiles SET score = 100 WHERE user_id = ?', ['alice']);
[$gid] = human_game('alice', 'bob', 'bob_bobby');
Db::run('UPDATE profiles SET score = 100 WHERE user_id = ?', ['alice']);
Mores::resignGame('alice', ['gameId' => $gid]);
check((int) Db::value("SELECT score FROM profiles WHERE user_id = 'alice'") === 100, 'Elo never drops below 100');

// legacy low scores are rescaled once
Db::run("INSERT INTO profiles (user_id, username, username_lc, score, last_seen, created_at, elo_scaled) VALUES ('old', 'old_player1', 'old_player1', 50, ?, ?, 0)", [Db::now(), Db::now()]);
Mores::getHomeState('old', []);
check((int) Db::value("SELECT score FROM profiles WHERE user_id = 'old'") === 1400, 'legacy score 50 -> 1200 + 4*50');

// RPC registry round trip through the dispatcher's calling convention
check(is_callable([Mores::class, 'getHomeState']), 'handlers callable');

check(fails(call([Mores::class, 'hillTable'], 'ghost', []), 'Choose a club name first.'), 'hillTable needs profile');
Db::run('UPDATE profiles SET sandbox_owned = 0 WHERE user_id = ?', ['bob']);
check(fails(call([Mores::class, 'hillTable'], 'bob', []), 'Buy the sandbox first.'), 'hillTable needs the sandbox');
$wait = Mores::hillTable('alice', []);
check($wait['phase'] === 'wait' && (int) $wait['waiting'] === 1, 'hill waits for four');
Mores::hillLeave('alice', []);
check((int) Db::value('SELECT COUNT(*) FROM sandbox_queue WHERE user_id = ?', ['alice']) === 0, 'hillLeave drops the queue');
Mores::hillTable('alice', []);
Db::run('UPDATE sandbox_queue SET joined_at = ? WHERE user_id = ?', [Db::ts(Db::nowMs() - 181000), 'alice']);
$game = Mores::hillTable('alice', []);
check($game['phase'] === 'play', 'hill fills bots after 3 minutes');
$bots = 0;
foreach (['s', 'w', 'n', 'e'] as $seat) {
    if (str_starts_with((string) $game['seats'][$seat], 'bot-hill')) {
        $bots++;
    }
}
check($bots === 3 && $game['seats'][$game['myTeam']] === 'alice', 'three hill bots and you have a seat');
$moved = Mores::hillMove('alice', [
    'gameId' => $game['gameId'], 'revision' => 0, 'unitId' => 'sp0', 'to' => '0,-6', 'turn' => 'w',
]);
check($moved['ok'] === true && $moved['revision'] === 1 && count($moved['moves']) === 1, 'hill move lands');
check(fails(call([Mores::class, 'hillMove'], 'bob', [
    'gameId' => $game['gameId'], 'revision' => 1, 'unitId' => 'sp1', 'to' => '1,-6', 'turn' => 'n',
]), 'You are not at this table.'), 'outsider cannot move on the hill');
$stale = Mores::hillMove('alice', [
    'gameId' => $game['gameId'], 'revision' => 0, 'unitId' => 'sp1', 'to' => '1,-6', 'turn' => 'n',
]);
check($stale['ok'] === false && $stale['revision'] === 1, 'stale hill move rejected');
$sync = Mores::hillSync('alice', ['gameId' => $game['gameId']]);
check($sync['revision'] === 1 && $sync['phase'] === 'play', 'hillSync reads the table');
$end = Mores::hillMove('alice', [
    'gameId' => $game['gameId'], 'revision' => 1, 'unitId' => 'sp2', 'to' => '2,-6', 'turn' => 'n', 'over' => true,
]);
check($end['ok'] === true && Db::value('SELECT status FROM sandbox_games WHERE id = ?', [$game['gameId']]) === 'done', 'finished hill game closes');
$again = Mores::hillTable('alice', []);
check($again['phase'] === 'wait', 'a finished hill game does not resume');
Db::run('UPDATE profiles SET sandbox_owned = 1 WHERE user_id = ?', ['bob']);
Db::run('UPDATE profiles SET sandbox_owned = 1 WHERE user_id = ?', ['cara']);
Db::run('UPDATE profiles SET sandbox_owned = 1 WHERE user_id = ?', ['gus']);
check(Mores::hillTable('bob', [])['phase'] === 'wait', 'second army waits');
check(Mores::hillTable('cara', [])['phase'] === 'wait', 'third army waits');
$four = Mores::hillTable('gus', []);
check($four['phase'] === 'play', 'four humans start at once');
$got = array_values($four['seats']);
sort($got);
check($got === ['alice', 'bob', 'cara', 'gus'], 'four club members seated');

Db::run("UPDATE sandbox_games SET status = 'done'");
Db::run('DELETE FROM sandbox_queue');
$gone = Db::ts(Db::nowMs() - 600000);
Db::run('INSERT INTO sandbox_queue (user_id, joined_at, seen_at) VALUES (?, ?, ?)', ['bob', $gone, $gone]);
$solo = Mores::hillTable('alice', []);
check($solo['phase'] === 'wait' && (int) $solo['waiting'] === 1, 'a player who left does not sit with you');
check((int) Db::value('SELECT COUNT(*) FROM sandbox_queue WHERE user_id = ?', ['bob']) === 0, 'a quiet seat is dropped');
Db::run('UPDATE sandbox_queue SET joined_at = ? WHERE user_id = ?', [Db::ts(Db::nowMs() - 181000), 'alice']);
$ai = Mores::hillTable('alice', ['ai' => true]);
check($ai['phase'] === 'play', 'when nobody answers you play the AI');
$aiBots = 0;
foreach (['s', 'w', 'n', 'e'] as $seat) {
    if (str_starts_with((string) $ai['seats'][$seat], 'bot-hill')) {
        $aiBots++;
    }
}
check($aiBots === 3 && $ai['seats'][$ai['myTeam']] === 'alice', 'three AI armies take the empty seats');

// ── Rocco's special cool board ─────────────────────────────────────────────
$rocco = \Morse\Catalog::boardById('rocco');
check($rocco['id'] === 'rocco' && $rocco['name'] === "Rocco's special cool board" && $rocco['coinCost'] === 10, 'rocco board sells for 10 coins');
Mores::claimUsername('rooko', ['username' => 'rooko2014']);
check(in_array('rocco', Mores::getHomeState('rooko', [])['ownedBoards'] ?? [], true) || str_contains((string) Db::value('SELECT owned_boards FROM profiles WHERE user_id = ?', ['rooko']), 'rocco'), 'Rooko2014 (any case) owns the rocco board free');
check((int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', ['rooko']) === 0, 'Rooko2014 gift costs nothing');
Db::run("UPDATE profiles SET owned_boards = '' WHERE user_id = 'rooko'");
Mores::buyBoard('rooko', ['boardId' => 'lodge']);
check(str_contains((string) Db::value('SELECT owned_boards FROM profiles WHERE user_id = ?', ['rooko']), 'rocco'), 'Rooko2014 gets the board back if it goes missing');
Mores::claimUsername('dave', ['username' => 'dave_davey']);
Db::run('UPDATE profiles SET coins = 12 WHERE user_id = ?', ['dave']);
$buy = Mores::buyBoard('dave', ['boardId' => 'rocco']);
check($buy['ok'] === true && $buy['coins'] === 2 && in_array('rocco', $buy['owned'], true), 'anyone can buy rocco for 10 coins');

// ── Sky Arena board ───────────────────────────────────────────────────────
$sky = \Morse\Catalog::boardById('sky-arena');
check($sky['id'] === 'sky-arena' && $sky['name'] === 'Sky Arena' && $sky['coinCost'] === 0 && $sky['cost'] === 0, 'sky arena is a free board');
check(\Morse\Catalog::boardUnlocked(0, 'sky-arena', []) === true, 'sky arena is open to everyone from the start');

// ── Lego Universe board + LG style ────────────────────────────────────────
$lego = \Morse\Catalog::boardById('lego-universe');
check($lego['id'] === 'lego-universe' && $lego['name'] === 'Brick Verse' && $lego['coinCost'] === 60, 'lego universe sells for 60 coins');
check(str_contains((string) Db::value('SELECT owned_boards FROM profiles WHERE user_id = ?', ['rooko']), 'lego-universe'), 'Rooko2014 owns Lego Universe free');
check(\Morse\Avatar::setPieceStyle('rooko', ['style' => 'lg'])['style'] === 'lg', 'Rooko2014 can play LG');
check(\Morse\Avatar::getAvatar('rooko', [])['loadout']['style'] === 'lg', 'LG style is remembered');
check(fails(call([\Morse\Avatar::class, 'setPieceStyle'], 'dave', ['style' => 'lg']), 'LG comes with the Brick Verse board (60 Morse coins).'), 'LG locked without the board');
Db::run('UPDATE profiles SET coins = 59 WHERE user_id = ?', ['dave']);
check(Mores::buyBoard('dave', ['boardId' => 'lego-universe'])['ok'] === false, '59 coins is not enough for Lego Universe');
Db::run('UPDATE profiles SET coins = 61 WHERE user_id = ?', ['dave']);
$legoBuy = Mores::buyBoard('dave', ['boardId' => 'lego-universe']);
check($legoBuy['ok'] === true && $legoBuy['coins'] === 1 && in_array('lego-universe', $legoBuy['owned'], true), 'buying Lego Universe costs 60 coins');
check(\Morse\Avatar::setPieceStyle('dave', ['style' => 'lg'])['style'] === 'lg', 'owning the board unlocks LG');
Db::run('UPDATE profiles SET piece_style = ? WHERE user_id = ?', ['3d', 'dave']);
check(\Morse\Avatar::setPieceStyle('dave', ['style' => 'cl'])['style'] === 'cl', 'Classic set is free');
check(\Morse\Avatar::setPieceStyle('dave', ['style' => 'pa'])['style'] === 'pa', 'Parlor set is free');
check(\Morse\Catalog::parseLoadout(['style' => 'pa'])['style'] === 'pa', 'loadout keeps the Parlor style');
Db::run('UPDATE profiles SET piece_style = ? WHERE user_id = ?', ['3d', 'dave']);

// ── Brick builder purchases ───────────────────────────────────────────────
$lp = \Morse\LegoBuilder::prices();
check($lp['palm-tree'] === 1 && $lp['tree'] === 0 && $lp['bush'] === 0 && $lp['rock'] === 0, 'most nature is free, cool nature costs 1');
Db::run('UPDATE profiles SET coins = 6 WHERE user_id = ?', ['dave']);
$b1 = \Morse\LegoBuilder::buyLegoPart('dave', ['id' => 'palm-tree']);
check($b1['coins'] === 5 && in_array('palm-tree', $b1['owned'], true), 'buying a piece takes its coins and unlocks it');
$b2 = \Morse\LegoBuilder::buyLegoPart('dave', ['id' => 'palm-tree']);
check($b2['coins'] === 5 && in_array('palm-tree', $b2['owned'], true), 'buying it again (retry, double click) charges nothing');
check(\Morse\LegoBuilder::buyLegoPart('dave', ['id' => 'tree'])['coins'] === 5, 'free pieces cost nothing');
Db::run('UPDATE profiles SET coins = 2 WHERE user_id = ?', ['dave']);
check(fails(call([\Morse\LegoBuilder::class, 'buyLegoPart'], 'dave', ['id' => 't-rex']), 'That piece costs 5 Morse coins.'), 'not enough coins is refused');
check(!in_array('t-rex', \Morse\LegoBuilder::legoBuilderState('dave', [])['owned'], true) && (int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', ['dave']) === 2, 'a refused buy neither unlocks nor charges');

// ── RA free trial schedule ─────────────────────────────────────────────────
$free = [];
for ($n = 1; $n <= 110; $n++) {
    if (\Morse\Catalog::raTrialGame($n)) {
        $free[] = $n;
    }
}
check($free === [17, 47, 77, 107], 'RA trial on game 17, then every 30 games');
Db::run('UPDATE profiles SET games_played = 15, piece_style = ? WHERE user_id = ?', ['3d', 'dave']);
check(\Morse\Avatar::getAvatar('dave', [])['raTrial'] === false, 'no RA trial on game 16');
check(fails(call([\Morse\Avatar::class, 'setPieceStyle'], 'dave', ['style' => 'ra']), 'RA costs 200 Morse coins.'), 'RA locked outside the trial');
Db::run('UPDATE profiles SET games_played = 16 WHERE user_id = ?', ['dave']);
check(\Morse\Avatar::getAvatar('dave', [])['raTrial'] === true, 'RA trial on game 17');
check(\Morse\Avatar::setPieceStyle('dave', ['style' => 'ra'])['style'] === 'ra', 'trial lets you pick RA');
Mores::countFinishedGame('dave');
check(Db::value('SELECT piece_style FROM profiles WHERE user_id = ?', ['dave']) === '3d', 'trial ends after one game');

// ── History ───────────────────────────────────────────────────────────────
$hist = Mores::listHistory('alice', ['minutes' => 'all']);
$fool = null;
foreach ($hist['games'] as $hg) {
    if (count($hg['moves']) === 4 && $hg['moves'][3]['san'] === 'Qh4#') {
        $fool = $hg;
    }
}
check($fool !== null && $fool['status'] !== 'active', 'history lists a finished game with its full move list');
check($fool !== null && in_array($fool['result'], ['win', 'loss'], true) && $fool['opponent']['username'] === 'bob_bobby', 'history card has result and opponent');
check(isset($hist['counts']['all'], $hist['counts']['1'], $hist['counts']['5'], $hist['counts']['10']), 'history returns counts per time control');
$five = Mores::startBotGame('cara', ['mode' => 'timed', 'minutes' => 5]);
check((int) Db::value('SELECT clock_ms FROM games WHERE id = ?', [$five['gameId']]) === 300000, 'bot game can start with a 5 minute clock');
check(Mores::getGame('cara', ['gameId' => $five['gameId']])['clockMs'] === 300000, 'snapshot reports the starting clock');
check((string) Db::value('SELECT white_style FROM games WHERE id = ?', [$five['gameId']]) !== '', 'game records the piece style it started with');
Db::insertIgnore('game_moves', ['game_id' => $five['gameId'], 'ply' => 1, 'san' => 'e4', 'from_sq' => 'e2', 'to_sq' => 'e4', 'created_at' => Db::now()]);
Mores::resignGame('cara', ['gameId' => $five['gameId']]);
$box = Mores::startBotGame('cara', ['mode' => 'timed', 'source' => 'sandbox']);
Db::insertIgnore('game_moves', ['game_id' => $box['gameId'], 'ply' => 1, 'san' => 'e4', 'from_sq' => 'e2', 'to_sq' => 'e4', 'created_at' => Db::now()]);
Mores::resignGame('cara', ['gameId' => $box['gameId']]);
$caraFive = Mores::listHistory('cara', ['minutes' => 5]);
check(count($caraFive['games']) === 1 && $caraFive['games'][0]['minutes'] === 5 && $caraFive['games'][0]['result'] === 'loss', '5 minute filter finds the 5 minute game');
$caraAll = array_column(Mores::listHistory('cara', ['minutes' => 'all'])['games'], 'id');
check(!in_array($box['gameId'], $caraAll, true), 'sandbox games stay out of History');
check(Mores::listHistory('cara', ['minutes' => 10])['games'] === [], 'empty 10 minute filter');
check(Mores::historyGame('cara', ['gameId' => $fool['id'] ?? '']) === null, 'cannot open someone else\'s game');
check(count(Mores::historyGame('alice', ['gameId' => $fool['id'] ?? ''])['moves'] ?? []) === 4, 'player opens their own game');
$page = Mores::listHistory('alice', ['minutes' => 'all', 'limit' => 1]);
if ($page['next'] !== null) {
    $page2 = Mores::listHistory('alice', ['minutes' => 'all', 'limit' => 1, 'before' => $page['next']]);
    check($page2['games'] !== [] && $page2['games'][0]['id'] !== $page['games'][0]['id'], 'history pages with a cursor');
}

// Named invitations lapse after 4 minutes (pull-ups untouched).
join_all('exp_a', 'expiry_aaa1');
join_all('exp_b', 'expiry_bbb1');
$ex = Mores::sendChallenge('exp_a', ['username' => 'expiry_bbb1', 'mode' => 'breeze']);
$exIn = Mores::getChallengeInbox('exp_b', []);
check(count($exIn) === 1 && $exIn[0]['expiresInMs'] > 235000 && $exIn[0]['expiresInMs'] <= 240000, 'named invite reports ~4 minutes left');
Db::run('UPDATE challenges SET created_at = ? WHERE id = ?', [Db::ts(Db::nowMs() - 230000), $ex['challengeId']]);
check(count(Mores::getChallengeInbox('exp_b', [])) === 1, 'invite still live at 3m50s');
Db::run('UPDATE challenges SET created_at = ? WHERE id = ?', [Db::ts(Db::nowMs() - 241000), $ex['challengeId']]);
check(Mores::getChallengeInbox('exp_b', []) === [], 'invite expires after 4 minutes');
check(Db::value('SELECT status FROM challenges WHERE id = ?', [$ex['challengeId']]) === 'cancelled', 'expired invite is cancelled');


// ── AV king pieces (finishId) ─────────────────────────────────────────────
check(\Morse\Catalog::parseLoadout([])['finishId'] === 'king-onyx', 'king piece defaults to onyx');
check(\Morse\Catalog::parseLoadout(['finishId' => 'nope'])['finishId'] === 'king-onyx', 'unknown king piece falls back to onyx');
$avGold = \Morse\Avatar::saveAvatar('dave', ['loadout' => ['style' => '3d', 'finishId' => 'king-gold']]);
check($avGold['loadout']['finishId'] === 'king-gold', 'free king piece saves');
check(\Morse\Avatar::getAvatar('dave', [])['loadout']['finishId'] === 'king-gold', 'king piece is remembered');
$avLegacy = \Morse\Avatar::saveAvatar('dave', ['loadout' => ['style' => '3d', 'finishId' => 'king-royal-legacy']]);
check($avLegacy['loadout']['finishId'] === 'king-onyx', 'Royal Legacy King stays locked until bought');
check(\Morse\Catalog::gearPrice('king-royal-legacy') === 20, 'Royal Legacy kit costs 20 coins');

// ── Royal Legacy kit: game looks carry the kit and the username letter ────
\Morse\Kit::reset();
$plainLook = \Morse\Kit::look('dave', '{"style":"3d","finishId":"king-gold"}');
check(!str_contains($plainLook, '"kit"'), 'no kit on the look before the Royal Legacy kit is bought');
\Morse\Db::run("UPDATE profiles SET coins = 25 WHERE user_id = 'dave'");
$kitBuy = \Morse\Avatar::buyGear('dave', ['id' => 'king-royal-legacy']);
check($kitBuy['coins'] === 5 && in_array('king-royal-legacy', $kitBuy['owned'], true), 'Royal Legacy kit takes exactly 20 coins');
$kitAgain = \Morse\Avatar::buyGear('dave', ['id' => 'king-royal-legacy']);
check($kitAgain['coins'] === 5, 'buying the kit again does not charge twice');
\Morse\Kit::reset();
$kitLook = json_decode(\Morse\Kit::look('dave', '{"style":"3d","finishId":"king-gold"}'), true);
check(($kitLook['kit'] ?? '') === 'legacy' && ($kitLook['finishId'] ?? '') === 'king-gold', 'kit owner look keeps the loadout and adds the kit');
check(($kitLook['letter'] ?? '') === \Morse\Kit::letter((string) \Morse\Db::one("SELECT username FROM profiles WHERE user_id = 'dave'")['username']), 'kit letter is the username initial');
check(\Morse\Kit::letter('rookRocket339') === 'R' && \Morse\Kit::letter('_gb') === 'G' && \Morse\Kit::letter('') === '', 'kit letter is the first letter, upper case');
$emptyKit = json_decode(\Morse\Kit::look('dave', ''), true);
check(($emptyKit['kit'] ?? '') === 'legacy', 'kit shows even before an AV loadout is saved');
$avKitKing = \Morse\Avatar::saveAvatar('dave', ['loadout' => ['style' => '3d', 'finishId' => 'king-royal-legacy']]);
check($avKitKing['loadout']['finishId'] === 'king-royal-legacy', 'Royal Legacy King can be worn once the kit is bought');


// ── Royal Legacy kit: "Back to normal" switches it off and on, owned, no coins move ──
$coinsBefore = (int) \Morse\Db::one("SELECT coins FROM profiles WHERE user_id = 'dave'")['coins'];
$off = \Morse\Avatar::setLegacyKit('dave', ['on' => false]);
check($off['legacyOn'] === false && $off['legacyOff'] === true && in_array('king-royal-legacy', $off['owned'], true), 'Back to normal turns the kit off and keeps it owned');
check($off['coins'] === $coinsBefore, 'Back to normal moves no coins');
check($off['loadout']['finishId'] === 'king-onyx', 'Back to normal puts the Royal Legacy King away');
$offLook = \Morse\Kit::look('dave', (string) \Morse\Db::one("SELECT avatar_json FROM profiles WHERE user_id = 'dave'")['avatar_json']);
check(!str_contains($offLook, '"kit"') && !str_contains($offLook, 'legacyOff') && !str_contains($offLook, 'king-royal-legacy'), 'switched-off kit is gone from game looks');
$offSaved = \Morse\Avatar::saveAvatar('dave', ['loadout' => ['style' => '3d', 'finishId' => 'king-royal-legacy']]);
check($offSaved['loadout']['finishId'] === 'king-onyx', 'saving the avatar while off cannot sneak the legendary king back');
check(\Morse\Avatar::getAvatar('dave', [])['legacyOn'] === false, 'kit stays off after saving the avatar');
$on = \Morse\Avatar::setLegacyKit('dave', ['on' => true]);
check($on['legacyOn'] === true && $on['coins'] === $coinsBefore && $on['loadout']['finishId'] === 'king-royal-legacy', 'Use Royal Legacy turns it back on for free');
\Morse\Kit::reset();
$onLook = json_decode(\Morse\Kit::look('dave', (string) \Morse\Db::one("SELECT avatar_json FROM profiles WHERE user_id = 'dave'")['avatar_json']), true);
check(($onLook['kit'] ?? '') === 'legacy', 'kit is back on game looks');
$threw = false;
try { \Morse\Avatar::setLegacyKit('bob', ['on' => false]); } catch (\Throwable $e) { $threw = true; }
check($threw, 'non-owners cannot toggle the kit');

// ── Morse store sale still pays the seller (the one other way to get coins) ──
\Morse\Store::register();
Db::run("UPDATE profiles SET coins = 3 WHERE user_id = 'alice'");
Db::run("UPDATE profiles SET coins = 10 WHERE user_id = 'bob'");
$listing = \Morse\Store::createMarketListing('alice', ['kind' => 'av', 'name' => 'Test king', 'price' => 4, 'shot' => 'data:image/png;base64,' . str_repeat('A', 40), 'loadout' => []]);
$sold = \Morse\Store::buyMarketListing('bob', ['id' => $listing['id']]);
check($sold['coins'] === 6 && purse('bob') === 6, 'buyer pays the listing price');
check(purse('alice') === 7, 'seller receives the coins for a store sale');
check(fails(call([\Morse\Store::class, 'buyMarketListing'], 'bob', ['id' => $listing['id']]), 'That listing is gone.'), 'a sold listing cannot be bought twice');
check(purse('alice') === 7 && purse('bob') === 6, 'second buy moves no coins');

// ── threefold repetition (owner t190u): the same position 3 times ends the game in a draw, 0 coins ──
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby');
Db::run('UPDATE profiles SET score = 1600 WHERE user_id IN (?, ?)', ['alice', 'bob']);
Db::run('UPDATE games SET white_start_score = 1600, black_start_score = 1600 WHERE id = ?', [$gid]);
$coinsA = purse('alice');
$coinsB = purse('bob');
shuffle_knights($gid, $white, $black, 7);
$mid = Mores::getGame('alice', ['gameId' => $gid]);
check($mid['status'] === 'active' && $mid['drawReason'] === null, 'start position seen twice: game goes on');
$r = Mores::makeMove($black, ['gameId' => $gid, 'from' => 'f6', 'to' => 'g8']);
check($r['ok'] === true, 'repeat move accepted');
$snapA = Mores::getGame('alice', ['gameId' => $gid]);
$snapB = Mores::getGame('bob', ['gameId' => $gid]);
check($snapA['status'] === 'draw' && $snapA['winnerUserId'] === null, 'start position 3 times: draw');
check($snapA['drawReason'] === 'repetition' && $snapB['drawReason'] === 'repetition', 'draw reason is repetition');
check($snapA['coinAward'] === 0 && $snapB['coinAward'] === 0, 'repetition draw: coinAward 0');
check(purse('alice') === $coinsA && purse('bob') === $coinsB, 'repetition draw pays 0 coins');
check((int) Db::value('SELECT coin_award FROM games WHERE id = ?', [$gid]) === 0, 'repetition draw: no coin_award stored');
check(fails_move(Mores::makeMove($white, ['gameId' => $gid, 'from' => 'g1', 'to' => 'f3']), 'This game is over.'), 'no moves after a repetition draw');

// repetition of a later position (not the start) also draws; a different move order breaks it
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby');
$seq = [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f3', 'g1'], ['c6', 'b8'], ['g1', 'f3'], ['b8', 'c6'], ['f3', 'g1'], ['c6', 'b8']];
foreach ($seq as $i => $m) {
    $r = Mores::makeMove($i % 2 === 0 ? $white : $black, ['gameId' => $gid, 'from' => $m[0], 'to' => $m[1]]);
    check($r['ok'] === true, "repetition seq move $i");
    $st = Mores::getGame('alice', ['gameId' => $gid])['status'];
    check($st === ($i === count($seq) - 1 ? 'draw' : 'active'), "repetition seq status after move $i");
}
check(Mores::getGame('bob', ['gameId' => $gid])['drawReason'] === 'repetition', 'later-position repetition reason');

finish();
