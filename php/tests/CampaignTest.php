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
}

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

finish();
