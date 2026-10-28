import { isMasterUsername } from "@/lib/chess/board-skins";

/**
 * Which of the new games regular players may play (owner t209u).
 *
 * Every game except normal 1v1 chess starts as "COMING SOON". MasterGus (the owner) can open and
 * play all of them anyway, marked "Owner preview", so he can try them first.
 *
 * To approve a game for everyone: add its id here AND to Variants::RELEASED in
 * php/src/Variants.php (the server refuses unreleased variants), then build + deploy.
 * Football keeps its own MasterGus-only rule in club-home.tsx.
 */
export const RELEASED_GAMES: ReadonlySet<string> = new Set<string>([]);

export type GameId =
  | "horde"
  | "atomic"
  | "koth"
  | "apocalypse"
  | "breakthrough"
  | "knights-tour"
  | "checkmate"
  | "strategy"
  | "heist"
  | "parade"
  | "cavalry";

export function isReleased(id: string): boolean {
  return RELEASED_GAMES.has(id);
}

/** Released for everyone, or the owner previewing it. */
export function canPlayGame(id: string, username: string | null | undefined): boolean {
  return isReleased(id) || isMasterUsername(username ?? "");
}

/** True when the owner is playing a game nobody else can open yet. */
export function isOwnerPreview(id: string, username: string | null | undefined): boolean {
  return !isReleased(id) && isMasterUsername(username ?? "");
}
