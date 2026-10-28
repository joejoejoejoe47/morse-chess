<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\Db;
use Morse\Football;
use Morse\RpcError;

test_db();
$now = Db::now();
Db::run('INSERT INTO profiles (user_id, username, username_lc, last_seen, created_at) VALUES (?, ?, ?, ?, ?)', ['u1', 'Gus', 'gus', $now, $now]);
$throws = static function (callable $f): bool {
    try {
        $f();
    } catch (RpcError) {
        return true;
    }
    return false;
};

$p = Football::getFootballPrefs('u1', []);
check($p['team'] === null, 'no team before the first game');
check($p['board'] === 'lodge', 'equipped board reported');
check($throws(static fn () => Football::saveFootballTeam('u1', ['name' => '  ', 'color' => '#ff0000'])), 'empty team name rejected');
check($throws(static fn () => Football::saveFootballTeam('u1', ['name' => 'Bolts', 'color' => 'red'])), 'bad colour rejected');
$p = Football::saveFootballTeam('u1', ['name' => '  Thunder   <b>Bolts</b> ', 'color' => '#FFD000']);
check($p['team'] === ['name' => 'Thunder Bolts', 'color' => '#ffd000'], 'team saved and cleaned');
check(Football::getFootballPrefs('u1', [])['team']['name'] === 'Thunder Bolts', 'team loads back');
$p = Football::savePieceName('u1', ['boardId' => 'lego-universe', 'slot' => 'e1', 'name' => 'Big Rex']);
check($p['names']['lego-universe']['e1'] === 'Big Rex', 'piece named');
check($p['team']['color'] === '#ffd000', 'naming keeps the team');
$p = Football::savePieceName('u1', ['boardId' => 'lego-universe', 'slot' => 'e1', 'name' => '']);
check(!isset(((array) $p['names'])['lego-universe']), 'clearing the name removes it');
check($throws(static fn () => Football::savePieceName('u1', ['boardId' => 'lego-universe', 'slot' => 'e7', 'name' => 'x'])), 'only own back pieces');
check($throws(static fn () => Football::savePieceName('u1', ['boardId' => '../x', 'slot' => 'e1', 'name' => 'x'])), 'bad board id rejected');
check($throws(static fn () => Football::getFootballPrefs('nobody', [])), 'needs a profile');
finish();
