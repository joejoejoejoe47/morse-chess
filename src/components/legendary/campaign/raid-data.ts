/** Co-op raids (phase C): the raid boss, the server calls and the shared-move replay. */
import { rpc } from "@/lib/rpc";
import { apply, legalMoves, moveText, newGame, status, VALUE, type Kind, type Move, type State } from "./engine";
import { sq } from "./engine";
import type { Chapter, PieceStats } from "./data";

/** The raid boss: a stronger engine with an extra queen in place of the b8 knight. */
export const RAID: Chapter = {
  n: 6,
  boss: "The Iron Colossus",
  arena: "The Titan's Anvil",
  epithet: "Raid Boss · Two Queens, No Mercy",
  twist: "Two players share White and take turns. The Colossus starts with a second queen and never blunders on purpose.",
  quote: "Bring a friend. Bring ten. I was built to break armies.",
  rewards: [],
  rules: { raid: true },
  level: { depth: 3, noise: 6, ms: 1500 },
  sky: "#0d0507",
  glow: "#ff6a3a",
  accent: "#ffb36b",
  board: "obsidian-fortress",
  bossInk: "#2a0c0a",
  at: [0, 0],
};
export const RAID_EXTRA: { sq: number; k: Kind }[] = [{ sq: sq("b8"), k: "q" }];

export type RaidMove = { from: number; to: number; promo: string; by: "A" | "B" | "boss" };
export type RaidSeat = "A" | "B";
export type Raid = {
  raidId: string;
  code: string;
  status: "lobby" | "active" | "won" | "lost" | "draw" | "left";
  reason: string;
  seed: number;
  moves: RaidMove[];
  version: number;
  seat: RaidSeat;
  turn: RaidSeat;
  host: { id: string; name: string };
  guest: { id: string; name: string } | null;
  turnSince: number;
  now: number;
  idle: number;
  claimed: { result: string; xp: number; coins: number } | null;
};
export type RaidClaim = { result: "win" | "loss" | "draw"; xp: number; coins: number; gains: Record<string, { xp: number; before: number; after: number }>; already: boolean; capped: boolean };

export const createRaid = rpc<Raid>("createRaid");
export const joinRaid = rpc<Raid>("joinRaid");
export const getRaid = rpc<Raid>("getRaid");
export const raidMove = rpc<Raid>("raidMove");
export const leaveRaid = rpc<Raid>("leaveRaid");
export const claimRaid = rpc<RaidClaim>("claimRaid");

/** Deterministic noise for the boss so both screens agree (mulberry32). */
export function seeded(seed: number, ply: number): () => number {
  let a = (seed ^ Math.imul(ply + 1, 2654435761)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const raidStart = () => newGame(RAID.rules, {}, RAID_EXTRA);

export function matchMove(s: State, m: { from: number; to: number; promo?: string }): Move | null {
  const opts = legalMoves(s, m.from).filter((x) => x.to === m.to);
  if (!opts.length) return null;
  return opts.find((x) => (x.promo ?? "") === (m.promo ?? "")) ?? opts[0];
}

export type Replay = {
  s: State;
  last: { from: number; to: number } | null;
  log: { text: string; by: RaidMove["by"]; cap: boolean }[];
  stats: Record<string, PieceStats>;
  bad: boolean;
};

const blankStats = (): Record<string, PieceStats> =>
  Object.fromEntries(["ra", "nb", "bc", "q", "k", "bf", "ng", "rh", "pa", "pb", "pc", "pd", "pe", "pf", "pg", "ph"].map((x) => [x, { alive: true, checks: 0, cap: 0, capUp: 0, mate: false, promo: false }]));

/** Rebuild the shared game from the move list (both players replay the same moves). */
export function replay(moves: RaidMove[]): Replay {
  let s = raidStart();
  const log: Replay["log"] = [];
  const stats = blankStats();
  let last: Replay["last"] = null;
  let lastMover = "";
  for (const rm of moves) {
    const m = matchMove(s, rm);
    if (!m) return { s, last, log, stats, bad: true };
    const piece = s.board[m.from]!;
    const text = moveText(s, m);
    const r = apply(s, m);
    let cap = false;
    for (const e of r.ev) {
      if (e.t === "capture") {
        cap = true;
        if (e.by.c === "w" && stats[e.by.id]) {
          stats[e.by.id].cap++;
          if (VALUE[e.victim.k] > (e.by.k === "k" ? 4 : VALUE[e.by.k])) stats[e.by.id].capUp++;
        }
      }
      if (e.t === "promote" && e.piece.c === "w" && stats[e.piece.id]) stats[e.piece.id].promo = true;
      if (e.t === "check" && e.by === "w" && stats[piece.id]) stats[piece.id].checks++;
    }
    s = r.s;
    last = { from: m.from, to: m.to };
    log.push({ text, by: rm.by, cap });
    lastMover = piece.c === "w" ? piece.id : "";
  }
  for (const id of Object.keys(stats)) stats[id].alive = s.board.some((p) => p && p.c === "w" && p.id === id);
  const st = status(s);
  if (st.over && st.winner === "w" && lastMover && stats[lastMover]) stats[lastMover].mate = true;
  return { s, last, log, stats, bad: false };
}
