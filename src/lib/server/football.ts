// Client stubs: the logic lives in the PHP backend (php/src/Football.php).
import { rpc } from "@/lib/rpc";

export type FootballTeam = { name: string; color: string };
export type FootballPrefs = {
  team: FootballTeam | null;
  /** boardId -> start square ("a1".."h2") -> name */
  names: Record<string, Record<string, string>>;
  board: string;
  /** which football field to play on (Boards page) */
  field: FootballField;
};

export type FootballField = "neon" | "park";

export const getFootballPrefs = rpc<FootballPrefs>("getFootballPrefs");
export const saveFootballTeam = rpc<FootballPrefs>("saveFootballTeam");
export const savePieceName = rpc<FootballPrefs>("savePieceName");
export const saveFootballField = rpc<FootballPrefs>("saveFootballField");

/* ── Football vs a player (t234u): the server keeps the game (php/src/FootballMatch.php) ── */

/** Server board square: side "w" (the challenger) runs up the rows, "b" down. */
export type FootballMatchUnit = { side: "w" | "b"; kind: "p" | "n" | "b" | "r" | "q" | "k"; id: string; ball?: boolean; held?: number };
export type FootballMatchBoard = (FootballMatchUnit | null)[][];
export type FootballMatchCue = {
  from: [number, number];
  to: [number, number];
  unit: string;
  side: "w" | "b";
  kind: FootballMatchUnit["kind"];
  thrown?: boolean;
  goal?: boolean;
  capture?: boolean;
  victim?: FootballMatchUnit["kind"] | null;
  victimSide?: "w" | "b" | null;
};
export type FootballMatchEvent = {
  seq: number;
  t: "count" | "snap" | "move" | "pass" | "goal" | "intercept" | "dead" | "lineup" | "td" | "kickoff" | "skip" | "over";
  at: number;
  board: FootballMatchBoard;
  loose: [number, number] | null;
  score: { w: number; b: number };
  turn: "w" | "b";
  cue?: FootballMatchCue;
  text?: string;
  side?: "w" | "b";
  id?: string;
  at2?: [number, number];
  from?: [number, number];
  scorer?: "w" | "b";
  carrier?: string;
  first?: "w" | "b";
  after?: "td" | "goal";
  until?: number;
  fresh?: boolean;
  /** pass: the pick-off chance in % (owner t237u) */
  risk?: number;
  /** intercept: picked off without a jump */
  auto?: boolean;
  why?: string;
  winner?: "w" | "b" | null;
};
export type FootballMatchView = {
  gameId: string;
  now: number;
  side: "w" | "b";
  names: { w: string; b: string };
  teams: { w: FootballTeam | null; b: FootballTeam | null };
  seq: number;
  gap: boolean;
  events: FootballMatchEvent[];
  board: FootballMatchBoard;
  loose: [number, number] | null;
  turn: "w" | "b";
  score: { w: number; b: number };
  phase: "count" | "play" | "dead" | "snap" | "tdpass" | "steal" | "goal" | "celebrate" | "over";
  until: number;
  clockMs: number;
  clockRunning: boolean;
  turnAt: number;
  bonus: number;
  skip: { w: boolean; b: boolean };
  ready: { w: boolean; b: boolean };
  over: "" | "time" | "resign" | "forfeit" | "kings";
  winner: "w" | "b" | null;
};
export type FootballMatchAction =
  | { t: "move" | "pass"; from: [number, number]; to: [number, number] }
  | { t: "goal"; from: [number, number] }
  | { t: "intercept"; id: string }
  | { t: "skip" };

export const sendFootballChallenge = rpc<{ ok: boolean; error?: string; bot?: boolean; username?: string; challengeId?: string; gameId?: string }>("sendFootballChallenge");
/** safe to repeat: it only reads (and says "I am here / ready") */
export const footballSync = rpc<FootballMatchView>("footballSync");
/** a move is sent once (never re-sent on a network error) */
export const sendFootballMove = rpc<FootballMatchView>("sendFootballMove");
export const resignFootball = rpc<FootballMatchView>("resignFootball");
