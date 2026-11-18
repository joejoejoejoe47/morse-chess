// node scripts/legendary_season_test.mjs — seasonal background switching (America/Chicago, holidays first).
import assert from "node:assert/strict";
import { seasonFor, easterSunday, thanksgivingDay } from "../src/lib/legendary/season.ts";

// Noon Chicago time on a given date (UTC-6/-5 never moves noon across a day boundary).
const at = (y, m, d, h = 12) => new Date(Date.UTC(y, m - 1, d, h + 6));
const cases = [
  [[2026, 11, 18], "fall"],
  [[2026, 11, 23], "thanksgiving"],
  [[2026, 11, 26], "thanksgiving"],
  [[2026, 11, 29], "thanksgiving"],
  [[2026, 11, 30], "fall"],
  [[2026, 12, 1], "christmas"],
  [[2026, 12, 25], "christmas"],
  [[2026, 12, 26], "christmas"],
  [[2026, 12, 27], "winter"],
  [[2026, 12, 31], "newyear"],
  [[2027, 1, 1], "newyear"],
  [[2027, 1, 2], "winter"],
  [[2027, 2, 14], "winter"],
  [[2027, 3, 21], "easter"], // Easter 2027 = Mar 28; window is -7..+1 days
  [[2027, 3, 29], "easter"],
  [[2027, 3, 30], "spring"],
  [[2027, 6, 20], "summer"],
  [[2027, 9, 10], "fall"],
  [[2027, 10, 24], "fall"],
  [[2027, 10, 25], "halloween"],
  [[2027, 10, 31], "halloween"],
];
for (const [[y, m, d], want] of cases) assert.equal(seasonFor(at(y, m, d)), want, `${y}-${m}-${d}`);

// Chicago, not UTC: 11:30 PM Nov 30 in Chicago is already Dec 1 in UTC, but still not Christmas there.
assert.equal(seasonFor(new Date(Date.UTC(2026, 11, 1, 5, 30))), "fall");
assert.equal(seasonFor(new Date(Date.UTC(2026, 11, 1, 6, 30))), "christmas");

assert.deepEqual(easterSunday(2026), { m: 4, d: 5 });
assert.deepEqual(easterSunday(2027), { m: 3, d: 28 });
assert.equal(thanksgivingDay(2026), 26);
assert.equal(thanksgivingDay(2027), 25);
console.log(`legendary_season_test: ${cases.length + 6} checks PASS`);
