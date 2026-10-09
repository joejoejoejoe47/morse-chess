// Client stub: the logic lives in the PHP backend (php/src). Generated from the original server module.
import { rpc } from "@/lib/rpc";
import type { GameMode, GameStatus, Side } from "@/lib/mores-constants";

export type PlayerInfo = { userId: string; username: string; score: number };

export type GameSnapshot = {
  id: string;
  fen: string;
  mode: GameMode;
  status: GameStatus;
  turn: Side;
  you: Side;
  white: PlayerInfo;
  black: PlayerInfo;
  lastMove: { from: string; to: string; san: string } | null;
  remainingMs: number;
  whiteClockMs: number;
  blackClockMs: number;
  serverNow: number;
  moves: { san: string; from: string; to: string }[];
  winnerUserId: string | null;
  myScore: number;
  opponentName: string;
  myBoard: string;
  chatOpen: boolean;
  liveOpen: boolean;
  cameraOpen: boolean;
  chat: { id: number; from: string; text: string; image: string | null }[];
  scorePrize: number | null;
  pull: boolean;
  coins: number;
  coinAward: number;
  ownedBoards: string[];
  whiteLook: string;
  blackLook: string;
};

export type ChallengeCard = {
  id: string;
  fromUsername: string;
  toUsername: string;
  mode: GameMode;
  status: string;
  createdAt: string;
  kind: "named" | "pull";
};

export type HomeState = {
  profile: { username: string; score: number; equippedBoard: string; coins: number; ownedBoards: string[] } | null;
  inbox: ChallengeCard[];
  outgoing: ChallengeCard[];
  activeGameId: string | null;
  queued: boolean;
  queueMode: GameMode | null;
  queueMiss: boolean;
  online: { username: string; score: number }[];
  leaders: { username: string; score: number }[];
};

export type ClubUserRow = { username: string; score: number; online: boolean };

export const usernameAvailable = rpc("usernameAvailable");
export const claimUsername = rpc("claimUsername");
export const getPurse = rpc("getPurse");
export const getHomeState = rpc("getHomeState");
export const joinQueue = rpc("joinQueue");
export const leaveQueue = rpc("leaveQueue");
export const sendChallenge = rpc("sendChallenge");
export const respondChallenge = rpc("respondChallenge");
export const cancelChallenge = rpc("cancelChallenge");
export const openGameLive = rpc("openGameLive");
export const openGameChat = rpc("openGameChat");
export const closeGameChat = rpc("closeGameChat");
export const openGameCamera = rpc("openGameCamera");
export const closeGameCamera = rpc("closeGameCamera");
export const sendGameChat = rpc("sendGameChat");
export const getGame = rpc("getGame");
export const makeMove = rpc("makeMove");
export const claimTimeout = rpc("claimTimeout");
export const resignGame = rpc("resignGame");
export const startBotGame = rpc("startBotGame");
export const buyBoard = rpc("buyBoard");
export const setEquippedBoard = rpc("setEquippedBoard");
export const listClubUsers = rpc("listClubUsers");
export const getChallengeInbox = rpc("getChallengeInbox");
export const getSandbox = rpc<{ owned: boolean; coins: number }>("getSandbox");
export const buySandbox = rpc<{ ok: boolean; error?: string; coins: number; owned: boolean }>("buySandbox");
