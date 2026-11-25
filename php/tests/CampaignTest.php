<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\Campaign;
use Morse\Db;
use Morse\Rpc;
use Morse\RpcError;

test_db();

function ccall(string $fn, string $uid, array $data = []): mixed
{
    try {
        return Campaign::$fn($uid, $data);
    } catch (RpcError $e) {
        return 'ERR:' . $e->getMessage();
    }
}

foreach (['campaignState', 'startCampaignRun', 'finishCampaignRun', 'setArmyPerk'] as $n) {
    check(in_array($n, Rpc::names(), true), "rpc $n registered");
}
$now = Db::now();
foreach (['u1' => 'Alpha', 'u2' => 'Beta'] as $id => $name) {
    Db::run("INSERT INTO profiles (user_id, username, username_lc, score, last_seen, created_at, equipped_board, coins, owned_boards, owned_gear) VALUES (?, ?, ?, 1200, ?, ?, 'lodge', 10, '', '')", [$id, $name, strtolower($name), $now, $now]);
    Db::run("INSERT INTO legendary_unlocks (user_id, paid, reason, created_at) VALUES (?, 100, 'paid', ?)", [$id, $now]);
}
Db::run("INSERT INTO profiles (user_id, username, username_lc, score, last_seen, created_at, equipped_board, coins, owned_boards, owned_gear) VALUES ('u9', 'Gamma', 'gamma', 1200, ?, ?, 'lodge', 10, '', '')", [$now, $now]);
check(str_contains((string) ccall('startCampaignRun', 'u9', ['chapter' => 1]), 'Unlock'), 'campaign needs the Legendary unlock');

check(Campaign::levelFor(0) === 1 && Campaign::levelFor(39) === 1 && Campaign::levelFor(40) === 2 && Campaign::levelFor(5000) === 10, 'levels');
check(Campaign::xpFor(['alive' => true, 'mate' => true, 'checks' => 2], 'win') === 20 + 8 + 40, 'xp formula');
check(Campaign::xpFor(['alive' => true, 'cap' => 50, 'capUp' => 50, 'checks' => 50, 'mate' => true, 'promo' => true], 'win', true) === 120, 'xp cap');

// state creates 16 slots at level 1
$s = ccall('campaignState', 'u1');
check(count($s['army']) === 16 && $s['army'][0]['level'] === 1, 'army of 16');
check($s['open'] >= 1 && $s['cleared'] === [], 'nothing cleared');

// chapter 2 locked
check(is_string(ccall('startCampaignRun', 'u1', ['chapter' => 2])), 'ch2 locked');
$run = ccall('startCampaignRun', 'u1', ['chapter' => 1]);
check(is_array($run) && $run['chapter'] === 1, 'ch1 starts');

// a too-fast win is downgraded
$pieces = ['q' => ['alive' => true, 'mate' => true, 'checks' => 1], 'pe' => ['alive' => true, 'cap' => 1]];
$r = ccall('finishCampaignRun', 'u1', ['runId' => $run['runId'], 'result' => 'win', 'plies' => 30, 'pieces' => $pieces]);
check($r['result'] === 'draw' && !$r['firstClear'], 'fast win becomes draw');
check(is_string(ccall('finishCampaignRun', 'u1', ['runId' => $run['runId'], 'result' => 'win', 'plies' => 30])), 'run closes once');

// a real (aged) win clears chapter 1 and grants the rewards
$run = ccall('startCampaignRun', 'u1', ['chapter' => 1]);
Db::run('UPDATE campaign_runs SET started_at = ? WHERE id = ?', [Db::ts(Db::nowMs() - 120000), $run['runId']]);
$r = ccall('finishCampaignRun', 'u1', ['runId' => $run['runId'], 'result' => 'win', 'plies' => 40, 'pieces' => $pieces]);
check($r['result'] === 'win' && $r['firstClear'] === true, 'first clear');
check(in_array('board:steampunk-brass', $r['rewards'], true), 'board reward listed');
$p = Db::one("SELECT owned_boards, owned_gear, coins FROM profiles WHERE user_id = 'u1'");
check(str_contains($p['owned_boards'], 'steampunk-brass') && str_contains($p['owned_gear'], 'gear'), 'board + frame granted');
check((int) $p['coins'] === 10 + 25, 'clear coins paid once');
check($r['gains']['q']['xp'] === 20 + 10 + 4 + 40, 'queen xp ' . json_encode($r['gains']['q'] ?? null));
check(!isset($r['gains']['ra']), 'dead rook got nothing');

// second clear: no new rewards
$run = ccall('startCampaignRun', 'u1', ['chapter' => 1]);
Db::run('UPDATE campaign_runs SET started_at = ? WHERE id = ?', [Db::ts(Db::nowMs() - 120000), $run['runId']]);
$r = ccall('finishCampaignRun', 'u1', ['runId' => $run['runId'], 'result' => 'win', 'plies' => 40, 'pieces' => $pieces, 'batter' => 9]);
check($r['firstClear'] === false && $r['coins'] === 0, 'no repeat rewards, no batter without perk');

// perk slot needs level 3
check(is_string(ccall('setArmyPerk', 'u1', ['slot' => 'ra', 'on' => true])), 'perk locked at lv1');
Db::run("UPDATE campaign_army SET xp = 200 WHERE user_id = 'u1' AND slot IN ('ra','rh')");
$r = ccall('setArmyPerk', 'u1', ['slot' => 'ra', 'on' => false]);
check(is_array($r), 'perk toggle at lv4');
$run = ccall('startCampaignRun', 'u1', ['chapter' => 1]);
check(in_array('rh', $run['perks'], true) && !in_array('ra', $run['perks'], true), 'perks list follows toggle');
Db::run('UPDATE campaign_runs SET started_at = ? WHERE id = ?', [Db::ts(Db::nowMs() - 120000), $run['runId']]);
$r = ccall('finishCampaignRun', 'u1', ['runId' => $run['runId'], 'result' => 'loss', 'plies' => 40, 'pieces' => $pieces, 'batter' => 9]);
check($r['coins'] === 45, 'batter capped at 3x15: ' . $r['coins']);

// real games replay into the army (Scholar's mate for u2 as white)
$gid = 'g-sync-1';
Db::run("INSERT INTO games (id, white_user_id, black_user_id, mode, fen, status, turn, turn_started_at, winner_user_id, created_at, variant, source) VALUES (?, 'u2', 'u1', 'timed', '', 'white_win', 'b', ?, 'u2', ?, '', '')", [$gid, $now, Db::ts(Db::nowMs() + 1000)]);
$moves = [['e2', 'e4', 'e4'], ['e7', 'e5', 'e5'], ['f1', 'c4', 'Bc4'], ['b8', 'c6', 'Nc6'], ['d1', 'h5', 'Qh5'], ['g8', 'f6', 'Nf6'], ['a2', 'a3', 'a3'], ['a7', 'a6', 'a6'], ['b2', 'b3', 'b3'], ['b7', 'b6', 'b6'], ['h5', 'f7', 'Qxf7#']];
foreach ($moves as $i => [$f, $t, $san]) {
    Db::run('INSERT INTO game_moves (game_id, ply, san, from_sq, to_sq, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$gid, $i + 1, $san, $f, $t, $now]);
}
$st = Campaign::statsFromMoves(Db::all('SELECT san, from_sq, to_sq FROM game_moves WHERE game_id = ? ORDER BY ply', [$gid]), 'w');
check($st['q']['mate'] && $st['q']['cap'] === 1 && $st['q']['checks'] === 1, 'queen mated');
$st2 = Campaign::statsFromMoves(Db::all('SELECT san, from_sq, to_sq FROM game_moves WHERE game_id = ? ORDER BY ply', [$gid]), 'b');
check($st2['pf']['alive'] === false && $st2['pa']['alive'] === true, 'black f-pawn died');
Db::run("UPDATE campaign_meta SET synced_until = ? WHERE user_id = 'u2'", [Db::ts(Db::nowMs() - 60000)]);
$s = ccall('campaignState', 'u2');
check(($s['synced']['q'] ?? 0) > 0, 'sync gained queen xp');
$q = array_values(array_filter($s['army'], fn ($a) => $a['slot'] === 'q'))[0];
check($q['mates'] === 1, 'army queen has a mate');
$s = ccall('campaignState', 'u2');
check($s['synced'] === [], 'sync is once');

// phase B: chapters 2..5 open in order and grant their rewards
$rw = [2 => ['crystal-palace', 'crowned-pawn'], 3 => ['obsidian-fortress', 'siege-aura'], 4 => ['ghostfire', 'spectral-trail'], 5 => ['legendary-core', 'golden-bot']];
check(is_string(ccall('startCampaignRun', 'u1', ['chapter' => 3])), 'ch3 locked before ch2');
foreach ($rw as $ch => [$board, $item]) {
    $run = ccall('startCampaignRun', 'u1', ['chapter' => $ch]);
    check(is_array($run) && $run['chapter'] === $ch, "ch$ch starts");
    Db::run('UPDATE campaign_runs SET started_at = ? WHERE id = ?', [Db::ts(Db::nowMs() - 120000), $run['runId']]);
    $r = ccall('finishCampaignRun', 'u1', ['runId' => $run['runId'], 'result' => 'win', 'plies' => 50, 'pieces' => $pieces]);
    check($r['firstClear'] === true && in_array('board:' . $board, $r['rewards'], true), "ch$ch first clear + board");
    $p = Db::one("SELECT owned_boards FROM profiles WHERE user_id = 'u1'");
    check(str_contains($p['owned_boards'], $board), "ch$ch board owned");
}
$s = ccall('campaignState', 'u1');
check($s['open'] === 5 && count($s['cleared']) === 5, 'all five cleared');
foreach (['crowned-pawn', 'siege-aura', 'spectral-trail', 'golden-bot'] as $it) {
    check(in_array($it, $s['rewards'], true), "reward $it listed");
}

// owner t394u: the owner (MasterGus, local test row only) can open every chapter; others cannot skip ahead
Db::run("INSERT INTO profiles (user_id, username, username_lc, score, last_seen, created_at, equipped_board, coins, owned_boards, owned_gear) VALUES ('u8', ?, ?, 1200, ?, ?, 'lodge', 10, '', '')", [(string) \Morse\Util::catalog()['boards']['masterUsername'], strtolower((string) \Morse\Util::catalog()['boards']['masterUsername']), $now, $now]);
$os = ccall('campaignState', 'u8');
check($os['allOpen'] === true, 'owner state says all chapters open');
$or = ccall('startCampaignRun', 'u8', ['chapter' => 5]);
check(is_array($or) && $or['chapter'] === 5, 'owner can start chapter 5 directly');
check(ccall('campaignState', 'u1')['allOpen'] === false, 'players still unlock in order');
// phase C: co-op raids
$raid = ccall('createRaid', 'u1');
check(is_array($raid) && strlen($raid['code']) === 6 && $raid['status'] === 'lobby' && $raid['seat'] === 'A', 'raid created');
check(str_contains((string) ccall('joinRaid', 'u9', ['code' => $raid['code']]), 'Unlock'), 'raid needs the unlock');
check(is_string(ccall('joinRaid', 'u2', ['code' => 'NOPE00'])), 'bad code');
$j = ccall('joinRaid', 'u2', ['code' => strtolower($raid['code'])]);
check($j['status'] === 'active' && $j['seat'] === 'B' && $j['guest']['name'] === 'Beta', 'guest joined');
$rid = $raid['raidId'];
$v = $j['version'];
check(str_contains((string) ccall('raidMove', 'u2', ['raidId' => $rid, 'version' => $v, 'move' => ['from' => 12, 'to' => 28], 'boss' => ['from' => 52, 'to' => 36]]), 'partner'), 'B waits for A');
$m = ccall('raidMove', 'u1', ['raidId' => $rid, 'version' => $v, 'move' => ['from' => 12, 'to' => 28], 'boss' => ['from' => 52, 'to' => 36]]);
check(count($m['moves']) === 2 && $m['moves'][0]['by'] === 'A' && $m['moves'][1]['by'] === 'boss', 'A moved + boss reply');
check(is_string(ccall('raidMove', 'u2', ['raidId' => $rid, 'version' => $v, 'move' => ['from' => 6, 'to' => 21]])), 'stale version refused');
check(is_string(ccall('raidMove', 'u1', ['raidId' => $rid, 'version' => $m['version'], 'move' => ['from' => 6, 'to' => 21]])), 'A cannot play B turn');
// idle takeover
Db::run('UPDATE campaign_raids SET turn_since = ? WHERE id = ?', [Db::ts(Db::nowMs() - 61000), $rid]);
$m = ccall('raidMove', 'u1', ['raidId' => $rid, 'version' => $m['version'], 'move' => ['from' => 6, 'to' => 21], 'boss' => ['from' => 57, 'to' => 42]]);
check(is_array($m) && $m['moves'][2]['by'] === 'A', 'idle turn taken over');
check(is_string(ccall('raidMove', 'u1', ['raidId' => $rid, 'version' => $m['version'], 'move' => ['from' => 99, 'to' => 1]])), 'bad square refused');
// a too-quick win becomes a draw
$m = ccall('raidMove', 'u2', ['raidId' => $rid, 'version' => $m['version'], 'move' => ['from' => 5, 'to' => 26], 'end' => ['result' => 'win', 'reason' => 'Checkmate']]);
check($m['status'] === 'draw', 'quick raid win is a draw');
$c = ccall('claimRaid', 'u1', ['raidId' => $rid, 'pieces' => ['q' => ['alive' => true]]]);
check($c['result'] === 'draw' && $c['coins'] === 0, 'too-short raid pays nothing');
$c2 = ccall('claimRaid', 'u1', ['raidId' => $rid]);
check($c2['already'] === true, 'claim once');
// a real win, then the daily cap
for ($k = 0; $k < 4; $k++) {
    $raid = ccall('createRaid', 'u1');
    ccall('joinRaid', 'u2', ['code' => $raid['code']]);
    Db::run('UPDATE campaign_raids SET started_at = ?, moves = ? WHERE id = ?', [Db::ts(Db::nowMs() - 300000), json_encode(array_fill(0, 20, ['from' => 1, 'to' => 2, 'promo' => '', 'by' => 'B'])), $raid['raidId']]);
    $g = ccall('getRaid', 'u1', ['raidId' => $raid['raidId']]);
    $m = ccall('raidMove', 'u1', ['raidId' => $raid['raidId'], 'version' => $g['version'], 'move' => ['from' => 3, 'to' => 39], 'end' => ['result' => 'win', 'reason' => 'Checkmate']]);
    check($m['status'] === 'won', "raid $k won");
    $c = ccall('claimRaid', 'u1', ['raidId' => $raid['raidId'], 'pieces' => ['q' => ['alive' => true, 'mate' => true]]]);
    check($k < 3 ? ($c['coins'] === 40 && $c['xp'] > 0) : ($c['capped'] === true && $c['coins'] === 0), "raid $k reward/cap");
}
$raid = ccall('createRaid', 'u2');
$l = ccall('leaveRaid', 'u2', ['raidId' => $raid['raidId']]);
check($l['status'] === 'left', 'leave lobby');
check(is_string(ccall('getRaid', 'u9', ['raidId' => $raid['raidId']])), 'outsiders cannot read a raid');

// ── arena builder ──
$lay = ['theme' => 3, 'walls' => [27, 28], 'gears' => [18, 19, 20], 'gearEvery' => 6, 'fog' => 2, 'glass' => 3, 'extra' => [['sq' => 41, 'k' => 'q'], ['sq' => 44, 'k' => 'n']], 'level' => 3];
$a = ccall('saveArena', 'u1', ['name' => '  Gear   Pit ', 'layout' => $lay]);
check(is_array($a) && strlen($a['code']) === 6 && $a['name'] === 'Gear Pit' && $a['mine'] === true, 'save arena');
check($a['layout']['walls'] === [27, 28] && $a['layout']['extra'][0]['k'] === 'q' && $a['layout']['gearEvery'] === 6, 'layout kept');
$g = ccall('getArena', 'u2', ['code' => strtolower($a['code'])]);
check($g['mine'] === false && $g['owner'] !== '' && $g['layout']['fog'] === 2, 'load arena by code');
check(is_string(ccall('saveArena', 'u1', ['layout' => ['walls' => [3]]])), 'wall on rank 1 refused');
check(is_string(ccall('saveArena', 'u1', ['layout' => ['walls' => [27], 'extra' => [['sq' => 27, 'k' => 'r']]]])), 'overlap refused');
check(is_string(ccall('saveArena', 'u1', ['layout' => ['extra' => [['sq' => 40, 'k' => 'q'], ['sq' => 41, 'k' => 'q']]]])), 'two extra queens refused');
check(is_string(ccall('saveArena', 'u1', ['layout' => ['extra' => [['sq' => 40, 'k' => 'k']]]])), 'extra king refused');
check(is_string(ccall('saveArena', 'u1', ['layout' => ['gears' => [20]]])), 'single gear refused');
$e = ccall('saveArena', 'u2', ['code' => $a['code'], 'name' => 'Stolen', 'layout' => $lay]);
check($e['code'] !== $a['code'] && $e['mine'] === true, 'others cannot overwrite (they get a copy)');
$u = ccall('saveArena', 'u1', ['code' => $a['code'], 'name' => 'Gear Pit II', 'layout' => ['walls' => [30]]]);
check($u['code'] === $a['code'] && $u['name'] === 'Gear Pit II' && $u['layout']['walls'] === [30], 'owner edits in place');
$r = ccall('arenaResult', 'u2', ['code' => $a['code'], 'result' => 'win']);
check($r['plays'] === 1 && $r['wins'] === 1, 'arena play counted');
$mine = ccall('myArenas', 'u1');
check(count($mine['arenas']) === 1 && $mine['arenas'][0]['code'] === $a['code'], 'my arenas');
check(is_string(ccall('getArena', 'u1', ['code' => 'ZZZZZZ'])), 'unknown arena code');

finish();
