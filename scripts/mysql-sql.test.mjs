import assert from "node:assert/strict";
import test from "node:test";
import { prepareMysql, splitSql } from "./mysql-sql.mjs";

test("auth table and types become mysql", () => {
  const prepared = prepareMysql(`
    create table if not exists "user" (
      "id" text not null primary key,
      "email" text not null unique,
      "emailVerified" boolean not null,
      "image" text,
      "createdAt" timestamptz default CURRENT_TIMESTAMP not null
    )
  `);
  assert.match(prepared.sql, /`user`/);
  assert.match(prepared.sql, /`email` varchar\(255\) not null unique/);
  assert.match(prepared.sql, /`emailVerified` tinyint\(1\) not null/);
  assert.match(prepared.sql, /`image` mediumtext/);
  assert.match(prepared.sql, /datetime\(3\)/);
  assert.doesNotMatch(prepared.sql, /timestamptz|boolean|"user"/);
});

test("upsert and insert ignore", () => {
  const update = prepareMysql(
    `insert into profiles (user_id, username) values ($1, $2)
     on conflict (user_id) do update set username = excluded.username`,
    ["bot", "MorseBot"],
  );
  assert.match(update.sql, /on duplicate key update username = values\(username\)/);
  assert.deepEqual(update.params, ["bot", "MorseBot"]);

  const ignore = prepareMysql(
    `insert into profiles (user_id, username, username_lc, score) values ('bot-mores', 'MorseBot', 'morsebot', 0) on conflict (user_id) do nothing`,
  );
  assert.match(ignore.sql, /^insert ignore into/i);
  assert.doesNotMatch(ignore.sql, /on conflict/i);
});

test("returning uses the matching where parameter", () => {
  const updated = prepareMysql(
    `update games set fen = $1, turn = $2 where id = $3 and fen = $4 and status = 'active' returning id`,
    ["fen", "w", "game-1", "old"],
  );
  assert.equal(updated.returning, "id");
  assert.equal(updated.returningValue, "game-1");
  assert.doesNotMatch(updated.sql, /returning/i);

  const deleted = prepareMysql(`delete from match_queue where user_id = $1 returning user_id`, ["seat"]);
  assert.equal(deleted.returning, "user_id");
  assert.equal(deleted.returningValue, "seat");
});

test("intervals, casts, and the bot score update", () => {
  const seen = prepareMysql(`select user_id from profiles where last_seen > now() - interval '20 seconds'`);
  assert.match(seen.sql, /date_sub\(now\(\), interval 20 second\)/);

  const count = prepareMysql(`select count(*)::int as c from game_moves where game_id = $1`, ["g"]);
  assert.match(count.sql, /cast\(count\(\*\) as signed\) as c/);

  const bot = prepareMysql(`update profiles as bot
    set score = greatest(100, player.score - 1)
    from profiles as player
    where player.username_lc = 'jsmorse47'
      and bot.user_id = 'bot-mores'
      and bot.score >= player.score`);
  assert.match(bot.sql, /join profiles as player on player\.username_lc = 'jsmorse47'/);
  assert.match(bot.sql, /set bot\.score = greatest/);
  assert.doesNotMatch(bot.sql, /\bfrom profiles\b/i);
});

test("dates and booleans in parameters", () => {
  const prepared = prepareMysql(`update games set turn_started_at = $1, scored = $2 where id = $3`, [
    "2026-09-27T23:00:00.000Z",
    false,
    "g1",
  ]);
  assert.deepEqual(prepared.params, ["2026-09-27 23:00:00.000", 0, "g1"]);
});

test("split keeps quoted semicolons together", () => {
  const parts = splitSql("update profiles set username = 'a;b'; update profiles set score = 1;");
  assert.equal(parts.length, 2);
  assert.match(parts[0], /'a;b'/);
});
