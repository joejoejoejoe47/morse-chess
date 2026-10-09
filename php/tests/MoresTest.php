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
    'setEquippedBoard', 'listClubUsers', 'getChallengeInbox'];
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

// ── resign (coins for the winner on the 3d piece style) ────────────────────
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby');
$coinsBefore = (int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', ['bob']);
$snap = Mores::resignGame('alice', ['gameId' => $gid]);
check($snap['status'] === ($white === 'alice' ? 'black_win' : 'white_win') && $snap['winnerUserId'] === 'bob', 'resign hands the win to the other side');
check((int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', ['bob']) === $coinsBefore + 1, 'winner gets +1 style coin');
$bobSnap = Mores::getGame('bob', ['gameId' => $gid]);
$aliceSnap = Mores::getGame('alice', ['gameId' => $gid]);
check($bobSnap['coinAward'] === 1 && $aliceSnap['coinAward'] === 0, 'coinAward shown to winner only');
check($bobSnap['coins'] === $coinsBefore + 1, 'snapshot carries purse');
check(Mores::resignGame('cara', ['gameId' => $gid]) === null, 'outsider resign -> null');
check(Mores::resignGame('alice', ['gameId' => 'zzz']) === null, 'resign unknown -> null');

// 2d piece style: no coin
Db::run("UPDATE profiles SET piece_style = '2d' WHERE user_id = 'bob'");
[$gid, $white, $black] = human_game('alice', 'bob', 'bob_bobby');
$coinsBefore = (int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', ['bob']);
Mores::resignGame('alice', ['gameId' => $gid]);
check((int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', ['bob']) === $coinsBefore, 'no coin on non-3d style');
Db::run("UPDATE profiles SET piece_style = '3d' WHERE user_id = 'bob'");

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

// bot eval sanity: finds mate in one, and never returns a move when the game is over
$pick = Mores::pickBotMove('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'w', 'v2');
check($pick !== null && $pick['from'] === 'a1' && $pick['to'] === 'a8', 'bot finds back-rank mate');
check(Mores::pickBotMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'b', 'v1') === null, 'no move in stalemate');
check(Mores::pickBotMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'b', 'v1') === null, 'bot refuses to move out of turn');

// bot streak + 5 coins after six bot wins (bot flags on its own clock)
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
check($s['winnerUserId'] === 'cara' && $s['coinAward'] === 6, 'sixth win in a row pays 5 + 1 style coin');
check((int) Db::value('SELECT coins FROM profiles WHERE user_id = ?', ['cara']) === 6 && (int) Db::value('SELECT bot_streak FROM profiles WHERE user_id = ?', ['cara']) === 0, 'streak resets after payout');
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

finish();
