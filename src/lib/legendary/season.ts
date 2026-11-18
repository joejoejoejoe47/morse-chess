/** Morse Chess Legendary seasonal backgrounds: pure date logic (no DOM), tested by scripts/legendary_season_test.mjs. */

// ── seasons (America/Chicago; holidays first) ─────────────────────────────

export type Season = "fall" | "winter" | "spring" | "summer" | "christmas" | "newyear" | "halloween" | "thanksgiving" | "easter";

export const SEASONS: { id: Season; name: string }[] = [
  { id: "fall", name: "Fall" },
  { id: "winter", name: "Winter" },
  { id: "spring", name: "Spring" },
  { id: "summer", name: "Summer" },
  { id: "christmas", name: "Christmas" },
  { id: "newyear", name: "New Year" },
  { id: "halloween", name: "Halloween" },
  { id: "thanksgiving", name: "Thanksgiving" },
  { id: "easter", name: "Easter" },
];

/** Year / month (1-12) / day in Chicago. */
export function chicagoDate(now = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Easter Sunday (Gregorian, anonymous algorithm). */
export function easterSunday(y: number): { m: number; d: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month, d: day };
}

/** 4th Thursday of November. */
export function thanksgivingDay(y: number): number {
  const first = new Date(Date.UTC(y, 10, 1)).getUTCDay(); // 0 Sun
  const firstThu = 1 + ((4 - first + 7) % 7);
  return firstThu + 21;
}

const dayNum = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);

export function seasonFor(now = new Date()): Season {
  const { y, m, d } = chicagoDate(now);
  if (m === 12 && d >= 1 && d <= 26) return "christmas";
  if ((m === 12 && d >= 31) || (m === 1 && d === 1)) return "newyear";
  if (m === 10 && d >= 25) return "halloween";
  const tg = thanksgivingDay(y);
  if (m === 11 && d >= tg - 3 && d <= tg + 3) return "thanksgiving";
  const e = easterSunday(y);
  const diff = dayNum(y, m, d) - dayNum(y, e.m, e.d);
  if (diff >= -7 && diff <= 1) return "easter";
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "fall";
}

