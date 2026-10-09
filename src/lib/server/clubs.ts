// Client stub: the logic lives in the PHP backend (php/src). Generated from the original server module.
import { rpc } from "@/lib/rpc";

export type ClubSeat = {
  userId: string;
  username: string;
  score: number;
  ready: boolean;
  online: boolean;
  look: string;
  host: boolean;
};

export type ClubMessage = {
  id: string;
  fromId: string;
  fromName: string;
  toId: string | null;
  body: string;
  image: string | null;
  at: string;
};

export type ClubEvent = {
  id: string;
  kind: "internal" | "enemy";
  phase: "live" | "crowned" | "series";
  boardId: string;
  gameIds: string[];
  deadline: number;
  champId: string | null;
  queue: { userId: string; username: string; score: number }[];
  cursor: number;
  home: { clubId: string; name: string; roster: { userId: string; username: string }[]; lost: string[] };
  foe: { clubId: string; name: string; roster: { userId: string; username: string }[]; lost: string[] } | null;
  series: { homeId: string; foeId: string; homeWins: number; foeWins: number; played: number } | null;
  winnerId: string | null;
  winnerName: string | null;
  winnerClubId: string | null;
  pairKey: string | null;
  settled: string[];
};

export const createChessClub = rpc("createChessClub");
export const joinChessClub = rpc("joinChessClub");
export const enterChessClub = rpc("enterChessClub");
export const loadChessClub = rpc("loadChessClub");
export const listJoinRequests = rpc("listJoinRequests");
export const respondJoin = rpc("respondJoin");
export const sendClubMail = rpc("sendClubMail");
export const setClubReady = rpc("setClubReady");
export const setClubBoard = rpc("setClubBoard");
export const placeClubCall = rpc("placeClubCall");
export const pollClubCalls = rpc("pollClubCalls");
export const startOwnTournament = rpc("startOwnTournament");
export const startEnemyBattle = rpc("startEnemyBattle");
export const watchClubGame = rpc("watchClubGame");
export const getBracket = rpc("getBracket");
export const seatBracket = rpc("seatBracket");
export const crownBracket = rpc("crownBracket");
