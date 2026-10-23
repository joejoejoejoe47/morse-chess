<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\Db;
use Morse\LegoBuilder;
use Morse\RpcError;

test_db();
$now = Db::now();
$mk = static function (string $id, string $name, int $coins, string $boards) use ($now): void {
    Db::run('INSERT INTO profiles (user_id, username, username_lc, last_seen, created_at, coins, owned_boards) VALUES (?, ?, ?, ?, ?, ?, ?)', [$id, $name, strtolower($name), $now, $now, $coins, $boards]);
};
$mk('u-own', 'Owner', 10, 'lodge,lego-universe');
$mk('u-no', 'Nobody', 50, 'lodge');
$mk('u-gift', 'Rooko2014', 0, '');

$throws = static function (callable $f): bool {
    try {
        $f();
    } catch (RpcError) {
        return true;
    }
    return false;
};

$prices = LegoBuilder::prices();
check(count($prices) > 250, 'palette prices load (big piece box)');
foreach (['brick-2x4', 'plate-4x8', 'tile-2x2', 'slope-45-2x2', 'arch-1x4', 'window-1x2x2', 'window-round', 'bay-window', 'castle-door', 'door-4-panes', 'fence-picket', 'barrel'] as $plain) {
    check(($prices[$plain] ?? -1) === 0, "plain piece $plain is free");
}
foreach (['tree', 'palm-tree', 'lamppost', 'pirate-flag', 'treasure-chest', 'crystal-5', 'statuette', 'tile-map', 'horse', 'car-base', 'portcullis', 'rocket-tail'] as $cool) {
    check(($prices[$cool] ?? 0) >= 1, "cool piece $cool costs coins");
}
$paid = array_keys(array_filter($prices, static fn ($p) => $p > 0));
check(count($paid) >= 80 && count($paid) < count($prices) / 2 && max($prices) <= 5 && min(array_filter($prices)) >= 1, 'cool pieces cost 1-5 coins');

check(LegoBuilder::legoBuilderState('u-own', [])['allowed'] === true, 'board owner may build');
check(LegoBuilder::legoBuilderState('u-gift', [])['allowed'] === true, 'Rooko2014 may build');
check(LegoBuilder::legoBuilderState('u-no', [])['allowed'] === false, 'others may not');
check($throws(static fn () => LegoBuilder::saveLegoBuild('u-no', ['pieces' => []])), 'non-owner cannot save');
check($throws(static fn () => LegoBuilder::buyLegoPart('u-no', ['id' => 'tree'])), 'non-owner cannot buy');

// buying deducts coins once
$r = LegoBuilder::buyLegoPart('u-own', ['id' => 'tree']);
check($r['coins'] === 10 - $prices['tree'] && in_array('tree', $r['owned'], true), 'buying a piece deducts coins');
$r = LegoBuilder::buyLegoPart('u-own', ['id' => 'tree']);
check($r['coins'] === 10 - $prices['tree'], 'buying again is free');
check($throws(static fn () => LegoBuilder::buyLegoPart('u-gift', ['id' => 'gold-bar'])), 'cannot buy without coins');
check($throws(static fn () => LegoBuilder::buyLegoPart('u-own', ['id' => 'nope'])), 'unknown piece rejected');

$pc = static fn (string $p, int $x = 20, int $y = 0, int $z = 0) => ['p' => $p, 'x' => $x, 'y' => $y, 'z' => $z, 'r' => 1, 'c' => '#C91A09'];
$s = LegoBuilder::saveLegoBuild('u-own', ['name' => '  My   castle ', 'pieces' => [$pc('brick-2x4'), $pc('tree', -30, 3, 5)]]);
check(count($s['builds']) === 1 && $s['builds'][0]['name'] === 'My castle' && $s['builds'][0]['count'] === 2, 'build saved');
check($throws(static fn () => LegoBuilder::saveLegoBuild('u-own', ['pieces' => [$pc('gold-bar')]])), 'unbought paid piece rejected');
check($throws(static fn () => LegoBuilder::saveLegoBuild('u-own', ['pieces' => [$pc('brick-2x4', 999)]])), 'out-of-area piece rejected');
check($throws(static fn () => LegoBuilder::saveLegoBuild('u-own', ['pieces' => [['p' => 'brick-2x4', 'x' => 1, 'y' => 0, 'z' => 0, 'r' => 0, 'c' => 'red']]])), 'bad colour rejected');
$g = LegoBuilder::getLegoBuild('u-own', ['id' => $s['id']]);
check($g['pieces'][0]['c'] === '#c91a09' && $g['pieces'][1]['p'] === 'tree', 'build loads back');
check($throws(static fn () => LegoBuilder::getLegoBuild('u-gift', ['id' => $s['id']])), 'cannot read another player\'s build');

// update in place
LegoBuilder::saveLegoBuild('u-own', ['id' => $s['id'], 'name' => 'Castle 2', 'pieces' => [$pc('brick-2x4')]]);
check(LegoBuilder::getLegoBuild('u-own', ['id' => $s['id']])['name'] === 'Castle 2', 'build updated in place');

check(LegoBuilder::activeLegoBuild('u-own', []) === null, 'no build in use yet');
LegoBuilder::useLegoBuild('u-own', ['id' => $s['id']]);
$a = LegoBuilder::activeLegoBuild('u-own', []);
check($a !== null && $a['id'] === $s['id'] && count($a['pieces']) === 1, 'Use puts the build on the board');
$p = Db::one("SELECT equipped_board, piece_style FROM profiles WHERE user_id = 'u-own'");
check($p['equipped_board'] === 'lego-universe' && $p['piece_style'] === 'lg', 'Use equips the Lego board');
LegoBuilder::useLegoBuild('u-own', ['id' => null]);
check(LegoBuilder::activeLegoBuild('u-own', []) === null, 'build can be taken off');
LegoBuilder::deleteLegoBuild('u-own', ['id' => $s['id']]);
check(LegoBuilder::legoBuilderState('u-own', [])['builds'] === [], 'build deleted');

finish();
