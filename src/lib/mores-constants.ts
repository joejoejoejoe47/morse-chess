export const BOT_USER_ID = "bot-mores";
export const BOT_USERNAME = "MorseBot";
export const BOT_V2_USER_ID = "bot-mores-v2";
export const BOT_V2_USERNAME = "MorseBotv2";
export const START_SCORE = 0;
export const SCORE_DELTA = 8;
export const TURN_MS = 60_000;
export const USERNAME_RE = /^[a-zA-Z0-9_]{8,20}$/;

export type GameMode = "timed" | "breeze";
export type GameStatus = "active" | "white_win" | "black_win" | "draw";
export type Side = "w" | "b";
export type BotKind = "v1" | "v2";

export function isBotUserId(id: string) {
  return id === BOT_USER_ID || id === BOT_V2_USER_ID;
}

export function botKindOf(id: string): BotKind | null {
  if (id === BOT_V2_USER_ID) return "v2";
  if (id === BOT_USER_ID) return "v1";
  return null;
}

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@players.moreschess.app`;
}

export function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function modeLabel(mode: GameMode) {
  return mode === "timed" ? "timed" : "breeze";
}

export function suggestClubName(raw: string | null | undefined) {
  const cleaned = (raw ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
  return cleaned.length >= 8 ? cleaned : "";
}
