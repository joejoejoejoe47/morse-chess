<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\Avatar;
use Morse\Catalog;
use Morse\Db;
use Morse\RpcError;

/** AN king attacks and the LG Shield Block: priced, bought atomically, kept per account. */
test_db();
$now = Db::now();
Db::run('INSERT INTO profiles (user_id, username, username_lc, last_seen, created_at, coins) VALUES (?, ?, ?, ?, ?, ?)', ['u1', 'Tester', 'tester', $now, $now, 12]);

check(Catalog::gearPrice('stab') === 0 && Catalog::gearPrice('thunder') === 10, 'attack prices');
check(Catalog::gearPrice('shield-block') === 8 && Catalog::isKnownGear('shield-block'), 'shield block is gear');
check(Catalog::parseLoadout(['attackId' => 'flip'])['attackId'] === 'chop', 'old attack ids still map to chop');
check(Catalog::parseLoadout([])['lgAttackId'] === 'lg-none', 'lg attack default');
check(Catalog::parseLoadout(['lgAttackId' => 'nope'])['lgAttackId'] === 'lg-none', 'unknown lg attack');
check(Catalog::parseLoadout([])['fbCelebrate'] === 'fireworks', 'fireworks is the celebration you own');
check(Catalog::parseLoadout([])['fbSong'] === 'song-none', 'replay song defaults to the crowd');
check(Catalog::gearPrice('song-walking') === 10, 'walking down the street costs 10 coins');

// Free attacks can be worn without buying; paid ones fall back until bought.
$row = Avatar::saveAvatar('u1', ['loadout' => ['attackId' => 'kick', 'lgAttackId' => 'shield-block']]);
check($row['loadout']['attackId'] === 'kick', 'free attack kept');
check($row['loadout']['lgAttackId'] === 'lg-none', 'unbought shield block falls back');
$row = Avatar::saveAvatar('u1', ['loadout' => ['attackId' => 'fireball']]);
check($row['loadout']['attackId'] === 'march', 'unbought fireball falls back');

$row = Avatar::buyGear('u1', ['id' => 'shield-block']);
check($row['coins'] === 4 && in_array('shield-block', $row['owned'], true), 'shield block bought for 8');
try {
    Avatar::buyGear('u1', ['id' => 'thunder']);
    check(false, 'thunder should be too dear');
} catch (RpcError) {
    check((int) Db::value("SELECT coins FROM profiles WHERE user_id = 'u1'") === 4, 'no coins spent when short');
}
$row = Avatar::saveAvatar('u1', ['loadout' => ['attackId' => 'kick', 'lgAttackId' => 'shield-block']]);
check($row['loadout']['lgAttackId'] === 'shield-block', 'bought shield block kept');
$row = Avatar::getAvatar('u1', []);
check($row['loadout']['lgAttackId'] === 'shield-block' && $row['loadout']['attackId'] === 'kick', 'persisted per account');
check($row['lgOk'] === false, 'lgOk false without the board');
$look = json_decode((string) Db::value("SELECT avatar_json FROM profiles WHERE user_id = 'u1'"), true);
check(($look['lgAttackId'] ?? '') === 'shield-block', 'stored in avatar_json (what opponents see)');

finish();
