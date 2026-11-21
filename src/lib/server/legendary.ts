// Client stubs for php/src/Legendary.php and php/src/LegendaryPhoto.php.
import { rpc } from "@/lib/rpc";
import { apiUrl } from "@/lib/base";

export type LobbyLeader = { place: number; userId: string; username: string; score: number; tier?: string | null; look: string; you: boolean };
export type Lobby = {
  online: number;
  liveGames: number;
  leaders: LobbyLeader[];
  watch: { gameId: string; white: string; black: string } | null;
  myRank: number | null;
};
export type Daily = {
  day: string;
  id: string;
  title: string;
  goal: number;
  progress: number;
  reward: number;
  claimed: boolean;
  resetsInMs: number;
};
export type PhotoInfo = { kind: "photo" | "letter" | "none"; letter: string; v: number };
export type MyPhoto = PhotoInfo & { set: boolean };
export type WatchSnap = {
  id: string;
  fen: string;
  mode: string;
  status: string;
  turn: "w" | "b";
  white: { username: string; score: number; look: string };
  black: { username: string; score: number; look: string };
  lastMove: { from: string; to: string; san: string } | null;
  moves: { san: string; from: string; to: string }[];
  whiteClockMs: number;
  blackClockMs: number;
  winner: "w" | "b" | null;
  serverNow: number;
};

export const legendaryLobby = rpc<Lobby>("legendaryLobby");
export const legendaryDaily = rpc<Daily>("legendaryDaily");
export const claimLegendaryDaily = rpc<{ ok: boolean; paid: number; coins: number; claimed: boolean }>("claimLegendaryDaily");
export const watchGame = rpc<WatchSnap | null>("watchGame");
export const myLegendaryPhoto = rpc<MyPhoto>("myLegendaryPhoto");
export const setLegendaryPhoto = rpc<MyPhoto>("setLegendaryPhoto");
export const skipLegendaryPhoto = rpc<MyPhoto>("skipLegendaryPhoto");
export const legendaryPhotos = rpc<Record<string, PhotoInfo>>("legendaryPhotos");

export function photoUrl(userId: string, v: number) {
  return apiUrl(`/api/photo?u=${encodeURIComponent(userId)}&v=${v}`);
}

/** Ranks (php/src/Ranks.php, owner t370u). */
export type MyRank = {
  username?: string;
  ranked: boolean;
  tier: string | null;
  place: number | null;
  score: number;
  earned?: string | null;
  grandfathered?: boolean;
  pinned?: boolean;
  games: number;
  wins: number;
  placementLeft: number;
  decayInDays: number | null;
};
export const myRank = rpc<MyRank>("myRank");
export const rankTable = rpc<MyRank[]>("rankTable");
