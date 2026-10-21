import { SKY_ARENA_BOARD_ID } from "@/components/chess/sky-arena-board";

/**
 * Games started from the Sandbox (goblin "End" -> /play-now) are played on the
 * Sky Arena, whatever board the player has equipped. The game ids are kept in
 * localStorage so a reload of /play/<id> stays on the same board.
 */
export const SANDBOX_BOARD_ID = SKY_ARENA_BOARD_ID;

const KEY = "morse-sandbox-games";
const KEEP = 30;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function markSandboxGame(gameId: string) {
  if (typeof window === "undefined" || !gameId) return;
  try {
    const list = [gameId, ...read().filter((id) => id !== gameId)].slice(0, KEEP);
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function isSandboxGame(gameId: string | null | undefined) {
  return Boolean(gameId) && read().includes(gameId as string);
}
