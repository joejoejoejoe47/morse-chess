<?php

declare(strict_types=1);

define('MORSE_TESTING', true);
require __DIR__ . '/bootstrap.php';

use Morse\Chess;
use Morse\Constants;
use Morse\Db;
use Morse\Engine;
use Morse\FairPlay;
use Morse\Mores;
use Morse\Rpc;
use Morse\RpcError;

test_db();

/**
 * Fake engine. 'cheat': the move the player really played is always the engine's #1.
 * 'human': the engine prefers other moves; the played move loses $loss centipawns.
 */
final class FakeEngine implements Engine
{
    /** @var array<string,string> fen => lan actually played there */
    public array $played = [];
    /** @var array<string,string> fen => 'cheat'|'human' */
    public array $style = [];
    public function __construct(public int $loss = 60) {}
    public function analyse(string $fen, int $multiPv): array
    {
        $c = new Chess($fen);
        $legal = array_map(static fn (array $m): string => $m['from'] . $m['to'] . ($m['promotion'] ?? ''), $c->moves(true));
        if ($multiPv === 1 && !isset($this->played[$fen])) {
            return [['move' => $legal[0] ?? '0000', 'cp' => $this->loss, 'mate' => null]]; // "after" eval
        }
        $p = $this->played[$fen] ?? $legal[0];
        $others = array_values(array_diff($legal, [$p]));
        if (($this->style[$fen] ?? 'human') === 'cheat') {
            $order = [$p, $others[0] ?? $p, $others[1] ?? $p];
        } else {
            $order = [$others[0] ?? $p, $others[1] ?? $p, $others[2] ?? $p];
        }
        return [
            ['move' => $order[0], 'cp' => 20, 'mate' => null],
            ['move' => $order[1], 'cp' => -40, 'mate' => null],
            ['move' => $order[2], 'cp' => -100, 'mate' => null],
        ];
    }
}

function profile(string $uid, string $name, int $score = 1200): void
{
    Mores::claimUsername($uid, ['username' => $name]);
    Db::run('UPDATE profiles SET score = ?, coins = 50 WHERE user_id = ?', [$score, $uid]);
}

/** A finished rated game inserted directly, with $plies random legal moves. Returns game id. */
function fake_game(FakeEngine $eng, string $white, string $black, array $styles, array $thinkMs, int $whiteDelta, ?string $winner, int $seed, int $coinAward = 0): string
{
    mt_srand($seed);
    $id = 'g' . $seed;
    $t0 = 1767225600000 + $seed * 10000000;
    Db::run(
        "INSERT INTO games (id, white_user_id, black_user_id, mode, fen, status, turn, turn_started_at, created_at, white_clock_ms, black_clock_ms, last_prize, winner_user_id, coin_award, scored, source, variant)
         VALUES (?, ?, ?, 'timed', 'x', ?, 'w', ?, ?, 600000, 600000, ?, ?, ?, 1, '', '')",
        [$id, $white, $black, $winner === null ? 'draw' : ($winner === $white ? 'white_win' : 'black_win'), Db::ts($t0), Db::ts($t0), $whiteDelta, $winner, $coinAward]
    );
    $c = new Chess();
    $t = $t0;
    for ($ply = 0; $ply < 60 && !$c->isGameOver(); $ply++) {
        $side = $c->turn();
        $ms = $c->moves(true);
        $m = $ms[mt_rand(0, count($ms) - 1)];
        $fen = $c->fen();
        $mv = $c->move(['from' => $m['from'], 'to' => $m['to'], 'promotion' => $m['promotion'] ?? null]);
        $eng->played[$fen] = $mv['lan'];
        $eng->style[$fen] = $styles[$side];
        $t += $thinkMs[$side]($ply);
        Db::run('INSERT INTO game_moves (game_id, ply, san, from_sq, to_sq, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$id, $ply + 1, $mv['san'], $mv['from'], $mv['to'], Db::ts($t)]);
    }
    $g = Db::one('SELECT * FROM games WHERE id = ?', [$id]);
    FairPlay::onRatedGameEnd($g, $whiteDelta);
    Db::run('UPDATE fairplay_games SET created_at = ? WHERE game_id = ?', [Db::ts($t0), $id]);
    return $id;
}

$uniform = static fn (int $ply): int => 5000 + ($ply % 3) * 100;
$human = static fn (int $ply): int => [800, 1500, 9000, 3000, 22000, 1200, 4000, 600, 14000, 2500][$ply % 10] + $ply * 37;

// ── registration + rated rules ─────────────────────────────────────────────
check(in_array('reportFocus', Rpc::names(), true), 'reportFocus registered');
check(FairPlay::isRated(['white_user_id' => 'a', 'black_user_id' => 'b', 'variant' => '', 'source' => '']), 'human game is rated');
check(!FairPlay::isRated(['white_user_id' => 'a', 'black_user_id' => Constants::BOT_USER_ID, 'variant' => '', 'source' => '']), 'bot game not rated');
check(!FairPlay::isRated(['white_user_id' => 'a', 'black_user_id' => 'b', 'variant' => 'atomic', 'source' => '']), 'variant not rated');
check(!FairPlay::isRated(['white_user_id' => 'a', 'black_user_id' => 'b', 'variant' => '', 'source' => 'sandbox']), 'sandbox not rated');

// ── a real online game through Mores ───────────────────────────────────────
profile('ann', 'ann_player');
profile('ben', 'ben_player');
$c = Mores::sendChallenge('ann', ['username' => 'ben_player', 'mode' => 'timed']);
$r = Mores::respondChallenge('ben', ['id' => $c['challengeId'], 'accept' => true]);
$gid = $r['gameId'];
$snap = Mores::getGame('ann', ['gameId' => $gid]);
check($snap['rated'] === true && $snap['coachAllowed'] === false, 'rated game: coach off while playing');
check(Mores::historyGame('ann', ['gameId' => $gid]) === null, 'no History/engine review of an active game');
$white = $snap['white']['userId'];
$blackU = $snap['black']['userId'];
check(FairPlay::reportFocus($blackU, ['gameId' => $gid, 'ply' => 0, 'awayMs' => 5000]) === ['ok' => false], 'focus report refused on the opponent turn');
check(FairPlay::reportFocus($white, ['gameId' => $gid, 'ply' => 3, 'awayMs' => 5000]) === ['ok' => false], 'focus report refused for a stale ply');
Db::run('UPDATE games SET turn_started_at = ? WHERE id = ?', [Db::ts(Db::nowMs() - 8000), $gid]);
check(FairPlay::reportFocus($white, ['gameId' => $gid, 'ply' => 0, 'awayMs' => 999999]) === ['ok' => true], 'focus report on own turn');
$away = (int) Db::value('SELECT away_ms FROM fairplay_focus WHERE game_id = ?', [$gid]);
check($away <= 10100 && $away >= 8000, 'away time capped at the turn length');
Mores::makeMove($white, ['gameId' => $gid, 'from' => 'e2', 'to' => 'e4']);
Mores::resignGame('ann', ['gameId' => $gid]);
check((int) Db::value('SELECT COUNT(*) FROM fairplay_games WHERE game_id = ?', [$gid]) === 2, 'finished rated game queued for both players');
check(Mores::getGame('ann', ['gameId' => $gid])['coachAllowed'] === true, 'coach allowed again after the game');
$b = Mores::startBotGame('ann', ['mode' => 'timed']);
Mores::resignGame('ann', ['gameId' => $b['gameId']]);
check((int) Db::value('SELECT COUNT(*) FROM fairplay_games WHERE game_id = ?', [$b['gameId']]) === 0, 'bot games are never checked');
check(FairPlay::reportFocus('ann', ['gameId' => 'nope', 'ply' => 0, 'awayMs' => 5000]) === ['ok' => false], 'unknown game');

// ── timing statistics ──────────────────────────────────────────────────────
$u = FairPlay::timingStats(array_map($uniform, range(0, 29)));
$h = FairPlay::timingStats(array_map($human, range(0, 29)));
check($u['cv'] < FairPlay::TIMING_MAX_CV, 'uniform timing has a low CV');
check($h['cv'] > 0.6, 'human-like timing has a high CV');

// ── engine statistics ──────────────────────────────────────────────────────
$eng = new FakeEngine(60);
profile('cheat_u', 'cheater_one', 1300);
profile('hon_u', 'honest_one', 1300);
profile('fast_u', 'steady_guy', 1300);
for ($i = 0; $i < 3; $i++) {
    profile("opp$i", "opponent_$i", 1300);
}
$id = fake_game($eng, 'cheat_u', 'opp0', ['w' => 'cheat', 'b' => 'human'], ['w' => $uniform, 'b' => $human], 10, 'cheat_u', 1, 2);
$moves = Db::all('SELECT * FROM game_moves WHERE game_id = ? ORDER BY ply', [$id]);
$st = FairPlay::engineStats($moves, $eng);
check($st['w']['top1'] > 0.99 && $st['w']['acpl'] < 1, 'engine-perfect side: top1 100%, ~0 ACPL');
check($st['b']['top1'] < 0.01 && $st['b']['acpl'] > 30, 'human side: low match, real centipawn loss');
check($st['w']['moves'] <= 24, 'book moves (first ' . FairPlay::BOOK_PLIES . ' plies) are excluded');

// ── account score: the cheater is flagged, the others are not ──────────────
$seed = 2;
for ($i = 0; $i < 7; $i++) {
    fake_game($eng, 'cheat_u', 'opp' . ($i % 3), ['w' => 'cheat', 'b' => 'human'], ['w' => $uniform, 'b' => $human], 10, 'cheat_u', $seed++, 2);
    fake_game($eng, 'hon_u', 'opp' . ($i % 3), ['w' => 'human', 'b' => 'human'], ['w' => $human, 'b' => $human], 10, 'hon_u', $seed++, 2);
    // Uniform timing + lots of focus-away, but human accuracy: must NOT be flagged (engine signal required).
    $fid = fake_game($eng, 'fast_u', 'opp' . ($i % 3), ['w' => 'human', 'b' => 'human'], ['w' => $uniform, 'b' => $human], 10, null, $seed++);
    for ($p = 0; $p < 60; $p += 2) {
        Db::run('INSERT INTO fairplay_focus (game_id, user_id, ply, away_ms, created_at) VALUES (?, ?, ?, 6000, ?)', [$fid, 'fast_u', $p, Db::now()]);
    }
}
check(FairPlay::runPending(null, 100) === 0, 'no engine: nothing finished on the first pass');
check((int) Db::value("SELECT COUNT(*) FROM fairplay_games WHERE status='pending'") > 0, 'rows wait for the engine');
FairPlay::runPending($eng, 100);
check((int) Db::value("SELECT COUNT(*) FROM fairplay_games WHERE status='pending'") === 0, 'worker finishes the queue');
$acct = static fn (string $u): array => Db::one('SELECT * FROM fairplay_accounts WHERE user_id = ?', [$u]) ?? ['status' => 'none', 'score' => 0];
check($acct('cheat_u')['status'] === 'flagged', 'engine-perfect account goes to the review queue (score ' . $acct('cheat_u')['score'] . ')');
check($acct('hon_u')['status'] === 'ok', 'honest account not flagged (score ' . $acct('hon_u')['score'] . ')');
check($acct('fast_u')['status'] === 'ok', 'timing + focus alone never flag (score ' . $acct('fast_u')['score'] . ')');
check(count(FairPlay::queue()) === 1, 'queue has exactly one account');
check(!FairPlay::isBanned('cheat_u'), 'flagging never bans by itself');

// Too few games: a perfect player with 3 games is not flagged.
profile('new_u', 'new_player', 1200);
for ($i = 0; $i < 3; $i++) {
    fake_game($eng, 'new_u', 'opp0', ['w' => 'cheat', 'b' => 'human'], ['w' => $uniform, 'b' => $human], 10, 'new_u', 100 + $i);
}
FairPlay::runPending($eng, 100);
check($acct('new_u')['status'] === 'ok', 'below the minimum game count nobody is flagged');

// ── human review ───────────────────────────────────────────────────────────
$oppBefore = (int) Db::value("SELECT score FROM profiles WHERE user_id = 'opp0'");
$coinsBefore = (int) Db::value("SELECT coins FROM profiles WHERE user_id = 'cheat_u'");
$scoreBefore = (int) Db::value("SELECT score FROM profiles WHERE user_id = 'cheat_u'");
$done = FairPlay::review('cheat_u', 'action', 'joe', 'engine use', ['ban' => true, 'forfeitRating' => true, 'forfeitCoins' => true, 'refundOpponents' => true]);
check(FairPlay::isBanned('cheat_u'), 'review action bans');
check($done['ratingRemoved'] === 80 && (int) Db::value("SELECT score FROM profiles WHERE user_id = 'cheat_u'") === $scoreBefore - 80, 'rating gains forfeited');
check($done['coinsRemoved'] === 16 && (int) Db::value("SELECT coins FROM profiles WHERE user_id = 'cheat_u'") === max(0, $coinsBefore - 16), 'win coins forfeited');
check((int) Db::value("SELECT score FROM profiles WHERE user_id = 'opp0'") === $oppBefore + 40, 'opponent rating refunded');
$again = FairPlay::review('cheat_u', 'action', 'joe', '', ['refundOpponents' => true]);
check($again['refunds'] === [], 'refunds never paid twice');
check($acct('cheat_u')['status'] === 'actioned', 'account marked actioned');
check((int) Db::value("SELECT COUNT(*) FROM fairplay_actions WHERE user_id = 'cheat_u'") === 2, 'actions logged');
try {
    Mores::joinQueue('cheat_u', ['mode' => 'timed']);
    check(false, 'banned player blocked from the queue');
} catch (RpcError $e) {
    check($e->getMessage() === Mores::FAIR_PLAY_BAN_MSG, 'banned player blocked from the queue');
}
$sc = Mores::sendChallenge('cheat_u', ['username' => 'ann_player', 'mode' => 'timed']);
check($sc['ok'] === false, 'banned player cannot challenge');
$bot = Mores::startBotGame('cheat_u', ['mode' => 'timed']);
check(is_string($bot['gameId']), 'banned player can still play the bots');
try {
    FairPlay::review('cheat_u', 'action', '', '');
    check(false, 'review needs a reviewer');
} catch (InvalidArgumentException) {
    check(true, 'review needs a reviewer');
}

// Clear: stays cleared until 10 more games.
Db::run("UPDATE fairplay_accounts SET status = 'flagged' WHERE user_id = 'hon_u'");
FairPlay::review('hon_u', 'clear', 'joe', 'looked fine');
FairPlay::rescoreAccount('hon_u');
check($acct('hon_u')['status'] === 'cleared', 'cleared account stays cleared');

finish();
