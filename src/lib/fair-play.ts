import { useEffect, useRef } from "react";
import { isBotUserId } from "@/lib/mores-constants";
import { reportFocus, type GameSnapshot } from "@/lib/server/mores";

/**
 * Fair play (owner t255u / PR fair-play).
 *
 * coachAllowed: any coach / hint / bot-coach / engine feature must check this and stay off when it is false
 * (a rated game in progress). The server sends `coachAllowed` / `rated` with every game snapshot once
 * the fair-play branch is merged; until then we infer from the players and variant.
 */
export type CoachGate = {
  status?: string;
  rated?: boolean;
  coachAllowed?: boolean;
  variant?: string | null;
  white?: { userId?: string };
  black?: { userId?: string };
};

export function coachAllowed(game: CoachGate | null | undefined): boolean {
  if (!game) return true;
  if (typeof game.coachAllowed === "boolean") return game.coachAllowed;
  if (game.rated === false) return true;
  if (game.rated === true) return game.status !== "active";
  // Pre-merge fallback: only block active normal chess vs a human.
  const vsBot = isBotUserId(game.white?.userId) || isBotUserId(game.black?.userId);
  if (vsBot) return true;
  if (game.variant) return true;
  return game.status !== "active";
}

/**
 * While it is your move in a rated game, notes each time the tab is hidden or the window loses focus,
 * and reports how long you were away when you come back. The server only accepts it for your own turn.
 */
export function useFairPlayFocus(game: GameSnapshot | null): void {
  const awayAt = useRef<number | null>(null);
  const live = Boolean(game && game.rated && game.status === "active" && game.turn === game.you);
  const gameId = game?.id ?? "";
  const ply = game?.moves.length ?? 0;

  useEffect(() => {
    if (!live || !gameId) return;
    awayAt.current = null;
    const leave = () => {
      if (awayAt.current === null) awayAt.current = Date.now();
    };
    const back = () => {
      if (awayAt.current === null) return;
      const awayMs = Date.now() - awayAt.current;
      awayAt.current = null;
      if (awayMs >= 200) void reportFocus({ data: { gameId, ply, awayMs } }).catch(() => {});
    };
    const vis = () => (document.visibilityState === "hidden" ? leave() : back());
    if (document.visibilityState === "hidden" || !document.hasFocus()) leave();
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
      back(); // the move was made (or the turn ended) while away: report what we have
    };
  }, [live, gameId, ply]);
}
