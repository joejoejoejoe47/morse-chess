import { isBotUserId } from "@/lib/mores-constants";

/**
 * Fair play (owner t255u / PR fair-play).
 *
 * coachAllowed: any coach / hint / bot-coach / engine feature must check this and stay off when it is false
 * (a rated game in progress). The server will send `coachAllowed` / `rated` with every game snapshot once
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
