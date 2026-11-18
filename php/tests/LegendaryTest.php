<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\Db;
use Morse\Legendary;
use Morse\LegendaryPhoto;
use Morse\Mores;
use Morse\Rpc;
use Morse\RpcError;

test_db();

function lcall(callable $fn, string $uid, array $data = []): mixed
{
    try {
        return $fn($uid, $data);
    } catch (RpcError $e) {
        return 'ERR:' . $e->getMessage();
    }
}

/** A finished (or active) game row with $plies moves, created now. */
function seed_game(string $id, string $w, string $b, string $status, ?string $winner, int $plies, string $mode = 'timed', string $variant = ''): void
{
    $now = Db::now();
    Db::run(
        "INSERT INTO games (id, white_user_id, black_user_id, mode, fen, status, turn, turn_started_at, winner_user_id, created_at, variant, source)
         VALUES (?, ?, ?, ?, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ?, 'w', ?, ?, ?, ?, '')",
        [$id, $w, $b, $mode, $status, $now, $winner, $now, $variant]
    );
    for ($i = 1; $i <= $plies; $i++) {
        Db::run('INSERT INTO game_moves (game_id, ply, san, from_sq, to_sq, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$id, $i, 'e4', 'e2', 'e4', $now]);
    }
}

foreach (['legendaryLobby', 'legendaryDaily', 'claimLegendaryDaily', 'watchGame', 'setLegendaryPhoto', 'skipLegendaryPhoto', 'legendaryPhotos', 'myLegendaryPhoto'] as $n) {
    check(in_array($n, Rpc::names(), true), "rpc $n registered");
}

Mores::claimUsername('ann', ['username' => 'ann_player']);
Mores::claimUsername('ben', ['username' => 'ben_player']);
Mores::claimUsername('cat', ['username' => 'cat_player']);
Mores::claimUsername('dan', ['username' => 'dan_player']);
foreach (['eve', 'fay', 'gil'] as $u) {
    Mores::claimUsername($u, ['username' => $u . '_player']);
    Db::run('UPDATE profiles SET score = 900 WHERE user_id = ?', [$u]);
}
Db::run('UPDATE profiles SET score = 1900 WHERE user_id = ?', ['ann']);
Db::run('UPDATE profiles SET score = 1800 WHERE user_id = ?', ['ben']);
Db::run('UPDATE profiles SET score = 1700 WHERE user_id = ?', ['cat']);
Db::run('UPDATE profiles SET score = 1000 WHERE user_id = ?', ['dan']);

// ── day window (America/Chicago) ───────────────────────────────────────────
$w = Legendary::dayWindow(strtotime('2026-11-19T05:30:00Z') * 1000); // 11:30 PM Nov 18 in Chicago
check($w['day'] === '2026-11-18', 'chicago day before UTC midnight');
check($w['endMs'] === strtotime('2026-11-19T06:00:00Z') * 1000, 'chicago midnight in CST');
$w = Legendary::dayWindow(strtotime('2026-07-04T12:00:00Z') * 1000);
check($w['startMs'] === strtotime('2026-07-04T05:00:00Z') * 1000, 'chicago midnight in CDT');
check(Legendary::challengeFor('2026-11-18') === Legendary::challengeFor('2026-11-18'), 'same challenge all day');

// ── lobby ──────────────────────────────────────────────────────────────────
$l = Legendary::legendaryLobby('dan', []);
check(count($l['leaders']) === 3 && $l['leaders'][0]['username'] === 'ann_player', 'top 3 humans, bots excluded');
check($l['watch'] === null, 'no watch without a top game');
check($l['myRank'] === 4, 'my rank among humans');
check(is_int($l['online']) && $l['online'] >= 0 && is_int($l['liveGames']), 'real counts');
seed_game('g-top', 'ann', 'cat', 'active', null, 4);
$l = Legendary::legendaryLobby('dan', []);
check(($l['watch']['gameId'] ?? null) === 'g-top' && $l['watch']['white'] === 'ann_player', 'watch offered for top-3 game');
$snap = Legendary::watchGame('dan', ['gameId' => 'g-top']);
check($snap['white']['username'] === 'ann_player' && count($snap['moves']) === 4 && !array_key_exists('chat', $snap), 'spectator snapshot, no chat');
seed_game('g-low', 'ann', 'gil', 'active', null, 2);
$x = lcall([Legendary::class, 'watchGame'], 'ben', ['gameId' => 'g-low']);
check(is_string($x) && str_starts_with($x, 'ERR:'), 'cannot watch non-top game');
Db::run("UPDATE games SET status = 'white_win', winner_user_id = 'ann' WHERE id IN ('g-top', 'g-low')");

// ── daily challenge ────────────────────────────────────────────────────────
$d = Legendary::legendaryDaily('dan', []);
check($d['progress'] === 0 && $d['claimed'] === false && $d['reward'] === Legendary::DAILY_REWARD, 'daily starts empty');
check($d['resetsInMs'] > 0 && $d['resetsInMs'] <= 86400000 + 3600000, 'countdown to chicago midnight');
check(str_starts_with((string) lcall([Legendary::class, 'claimLegendaryDaily'], 'dan'), 'ERR:'), 'cannot claim unfinished');
seed_game('d-short', 'dan', 'bot-mores', 'white_win', 'dan', 3);
check(Legendary::legendaryDaily('dan', [])['progress'] === 0, 'short games do not count');
for ($i = 0; $i < 3; $i++) {
    seed_game("d-$i", 'dan', 'bot-mores', 'white_win', 'dan', 12);
}
seed_game('d-var', 'dan', 'bot-mores', 'white_win', 'dan', 12, 'timed', 'horde');
$d = Legendary::legendaryDaily('dan', []);
check($d['progress'] === $d['goal'], 'progress reaches goal');
$before = Mores::getPurse('dan', [])['coins'];
$c1 = Legendary::claimLegendaryDaily('dan', []);
$c2 = Legendary::claimLegendaryDaily('dan', []);
check($c1['paid'] === Legendary::DAILY_REWARD && $c2['paid'] === 0, 'claim pays once (idempotent)');
check(Mores::getPurse('dan', [])['coins'] === $before + Legendary::DAILY_REWARD, 'coins added exactly once');
check(Legendary::legendaryDaily('dan', [])['claimed'] === true, 'claimed flag');

// ── profile photos ─────────────────────────────────────────────────────────
$me = LegendaryPhoto::myLegendaryPhoto('ann', []);
check($me['set'] === false && $me['letter'] === 'A', 'first login: no photo yet, letter from email/username');
$im = imagecreatetruecolor(640, 480);
imagefill($im, 0, 0, imagecolorallocate($im, 200, 40, 160));
ob_start();
imagejpeg($im, null, 90);
$jpg = (string) ob_get_clean();
$r = LegendaryPhoto::setLegendaryPhoto('ann', ['image' => 'data:image/jpeg;base64,' . base64_encode($jpg)]);
check($r['kind'] === 'photo' && $r['v'] === 1, 'photo saved');
$row = Db::one('SELECT mime, data FROM legendary_photos WHERE user_id = ?', ['ann']);
$info = getimagesizefromstring(base64_decode($row['data']));
check($info[0] === 256 && $info[1] === 256, 're-encoded to 256x256 square');
check(in_array($row['mime'], ['image/webp', 'image/jpeg'], true), 'safe output mime');
check(str_starts_with((string) lcall([LegendaryPhoto::class, 'setLegendaryPhoto'], 'ann', ['image' => 'data:image/svg+xml;base64,' . base64_encode('<svg/>')]), 'ERR:'), 'svg rejected');
check(str_starts_with((string) lcall([LegendaryPhoto::class, 'setLegendaryPhoto'], 'ann', ['image' => 'data:image/png;base64,' . base64_encode('<?php echo 1; ?>')]), 'ERR:'), 'fake png rejected');
check(str_starts_with((string) lcall([LegendaryPhoto::class, 'setLegendaryPhoto'], 'ann', ['image' => 'data:image/jpeg;base64,' . str_repeat('A', 9 * 1024 * 1024)]), 'ERR:'), 'oversize rejected');
$s = LegendaryPhoto::skipLegendaryPhoto('ben', []);
check($s['kind'] === 'letter' && $s['letter'] === 'B' && LegendaryPhoto::myLegendaryPhoto('ben', [])['set'] === true, 'skip stores letter avatar');
$p = LegendaryPhoto::legendaryPhotos('dan', ['ids' => ['ann', 'ben', 'cat']]);
check($p['ann']['kind'] === 'photo' && $p['ben']['kind'] === 'letter' && $p['cat']['kind'] === 'none' && $p['cat']['letter'] === 'C', 'photo lookup');
$limited = false;
for ($i = 0; $i < LegendaryPhoto::RATE_LIMIT + 2; $i++) {
    $x = lcall([LegendaryPhoto::class, 'skipLegendaryPhoto'], 'cat');
    if (is_string($x) && str_starts_with($x, 'ERR:Too many')) {
        $limited = true;
    }
}
check($limited, 'rate limited');

finish();
