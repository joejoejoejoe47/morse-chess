<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\Db;

test_db();
$tables = array_column(Db::all("SELECT name FROM sqlite_master WHERE type='table'"), 'name');
foreach (['user', 'session', 'account', 'profiles', 'games', 'game_moves', 'game_chat', 'challenges', 'match_queue',
          'chess_clubs', 'chess_club_members', 'chess_club_requests', 'chess_club_messages', 'chess_club_events',
          'chess_club_calls', 'club_bracket', 'webrtc_peers', 'webrtc_signals', 'auth_throttle'] as $t) {
    check(in_array($t, $tables, true), "table $t exists");
}
check(Db::value("SELECT COUNT(*) FROM profiles WHERE user_id IN ('bot-mores','bot-mores-v2')") == 2, 'bot profiles seeded');

// Re-running the schema must be a no-op.
Db::runSchema((string) file_get_contents(__DIR__ . '/../sql/schema.sql'));
check(Db::value('SELECT COUNT(*) FROM profiles') == 2, 'schema is idempotent');

// time helpers round-trip
$ms = 1767225600123; // 2026-01-01T00:00:00.123Z
check(Db::ts($ms) === '2026-01-01 00:00:00.123', 'ts()');
check(Db::toMs('2026-01-01 00:00:00.123') === $ms, 'toMs() round trip');
check(Db::iso('2026-01-01 00:00:00.123') === '2026-01-01T00:00:00.123Z', 'iso()');

// upsert + insertIgnore
Db::upsert('auth_throttle', ['bucket' => 'a', 'hits' => 1, 'window_start' => Db::now()], ['bucket'], ['hits']);
Db::upsert('auth_throttle', ['bucket' => 'a', 'hits' => 5, 'window_start' => Db::now()], ['bucket'], ['hits']);
check((int) Db::value("SELECT hits FROM auth_throttle WHERE bucket='a'") === 5, 'upsert updates');
check(Db::insertIgnore('auth_throttle', ['bucket' => 'a', 'hits' => 9, 'window_start' => Db::now()]) === 0, 'insertIgnore skips duplicate');

finish();
