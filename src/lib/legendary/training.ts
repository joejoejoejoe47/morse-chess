/**
 * MB-20 Training Grounds: practice against the computer, Legendary only. Purely client side —
 * no Elo, no coins, nothing stored on the server. Standard chess runs on chess.js + the bundled
 * Stockfish (public/stockfish); the Morse variants run on our own engine (lib/variants/engine).
 */
import { Chess, type Square } from "chess.js";
import { asset } from "@/lib/base";
import {
  START_FEN,
  botMove,
  evaluate,
  inCheck as vInCheck,
  kingOf,
  legalMoves as vLegalMoves,
  legalTargets as vTargets,
  needsPromotion as vNeedsPromo,
  parseFen,
  sqName,
  status as vStatus,
  toFen,
  tryMove as vTry,
  type VariantId,
} from "@/lib/variants/engine";

export type TVariant = "standard" | "koth" | "atomic" | "horde" | "cavalry";
export type TMode = "unlimited" | "realtime" | "corr";
export type TSide = "white" | "random" | "black";
export type TColor = "w" | "b";

export const T_VARIANTS: { id: TVariant; name: string; desc: string; icon: string }[] = [
  { id: "standard", name: "Standard", desc: "Standard rules of chess (FIDE)", icon: "♛" },
  { id: "koth", name: "King of the Hill", desc: "Bring your king to the center to win the game", icon: "⛰" },
  { id: "atomic", name: "Atomic", desc: "Nuke your opponent's king to win", icon: "☢" },
  { id: "horde", name: "Horde", desc: "Destroy the horde to win!", icon: "♟" },
  { id: "cavalry", name: "Cavalry Charge", desc: "Every pawn is a knight", icon: "♞" },
];

export type TSetup = {
  variant: TVariant;
  mode: TMode;
  minutes: number; // real time, per side
  inc: number; // real time, seconds added per move
  days: number; // correspondence, per move
  level: number; // 1..8
  side: TSide;
};

export const DEFAULT_SETUP: TSetup = { variant: "standard", mode: "unlimited", minutes: 10, inc: 0, days: 2, level: 1, side: "random" };

export const MINUTE_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 45, 60, 90, 120, 180];
export const INC_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 45, 60];
export const DAY_STEPS = [1, 2, 3, 5, 7, 10, 14];

export type TResult = { winner: TColor | null; reason: string };

export type TGame = {
  id: string;
  setup: TSetup;
  you: TColor;
  startFen: string;
  fens: string[]; // fens[0] = start, fens[i] = after ply i
  sans: string[];
  last: [string, string][]; // from/to of each ply
  clock: { w: number; b: number }; // ms left (real time) or ms left on this move (corr)
  tickAt: number; // when the running clock last updated (epoch ms); 0 = not started
  result: TResult | null;
  createdAt: number;
};

const vid = (v: TVariant): VariantId | null => (v === "standard" ? null : v);

export function startFenOf(v: TVariant): string {
  return v === "standard" ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" : START_FEN[v];
}

export const turnOf = (fen: string): TColor => (fen.split(" ")[1] === "b" ? "b" : "w");

export function newGame(setup: TSetup): TGame {
  const you: TColor = setup.side === "white" ? "w" : setup.side === "black" ? "b" : Math.random() < 0.5 ? "w" : "b";
  const fen = startFenOf(setup.variant);
  const per = setup.mode === "realtime" ? setup.minutes * 60_000 : setup.mode === "corr" ? setup.days * 86_400_000 : 0;
  return {
    id: Math.random().toString(36).slice(2, 10).toUpperCase(),
    setup,
    you,
    startFen: fen,
    fens: [fen],
    sans: [],
    last: [],
    clock: { w: per, b: per },
    tickAt: 0,
    result: null,
    createdAt: Date.now(),
  };
}

/** Pieces on a fen for drawing: square → "wK" style code. */
export function piecesOf(fen: string): Record<string, string> {
  const out: Record<string, string> = {};
  const rows = fen.split(" ")[0].split("/");
  rows.forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        out["abcdefgh"[f] + (8 - i)] = (ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase();
        f++;
      }
    }
  });
  return out;
}

export function targets(v: TVariant, fen: string, from: string): string[] {
  const id = vid(v);
  if (!id) {
    try {
      return new Chess(fen).moves({ square: from as Square, verbose: true }).map((m) => m.to);
    } catch {
      return [];
    }
  }
  return vTargets(id, parseFen(fen), from);
}

export function needsPromo(v: TVariant, fen: string, from: string, to: string): boolean {
  const id = vid(v);
  if (!id) {
    try {
      return new Chess(fen).moves({ square: from as Square, verbose: true }).some((m) => m.to === to && !!m.promotion);
    } catch {
      return false;
    }
  }
  return vNeedsPromo(id, fen, from, to);
}

export type Played = { fen: string; san: string; capture: boolean };

export function applyMove(v: TVariant, fen: string, from: string, to: string, promo?: string | null): Played | null {
  const id = vid(v);
  if (!id) {
    try {
      const c = new Chess(fen);
      const m = c.move({ from, to, promotion: promo ?? undefined });
      return m ? { fen: c.fen(), san: m.san, capture: !!m.captured } : null;
    } catch {
      return null;
    }
  }
  const r = vTry(id, fen, from, to, promo ?? null);
  return r ? { fen: toFen(r.state), san: r.san, capture: r.captured } : null;
}

export function checkSquare(v: TVariant, fen: string): string | null {
  const id = vid(v);
  if (!id) {
    const c = new Chess(fen);
    if (!c.inCheck()) return null;
    const t = c.turn();
    for (const row of c.board()) for (const p of row) if (p && p.type === "k" && p.color === t) return p.square;
    return null;
  }
  const s = parseFen(fen);
  if (!vInCheck(id, s)) return null;
  const k = kingOf(s.board, s.turn);
  return k ? sqName(k[0], k[1]) : null;
}

/** Game over from the board alone (mate, stalemate, variant wins, draws). */
export function boardResult(v: TVariant, fens: string[]): TResult | null {
  const fen = fens[fens.length - 1];
  const id = vid(v);
  if (!id) {
    const c = new Chess(fen);
    if (c.isCheckmate()) return { winner: c.turn() === "w" ? "b" : "w", reason: "Checkmate" };
    if (c.isStalemate()) return { winner: null, reason: "Stalemate" };
    if (c.isInsufficientMaterial()) return { winner: null, reason: "Insufficient material" };
    if (c.isDraw()) return { winner: null, reason: "Fifty-move rule" };
    const key = (f: string) => f.split(" ").slice(0, 4).join(" ");
    if (fens.filter((f) => key(f) === key(fen)).length >= 3) return { winner: null, reason: "Threefold repetition" };
    return null;
  }
  const st = vStatus(id, parseFen(fen));
  if (!st.over) return null;
  return { winner: st.winner, reason: st.reason.charAt(0).toUpperCase() + st.reason.slice(1) };
}

/** Rough score for White in centipawns (draw offers). */
export function scoreForWhite(v: TVariant, fen: string): number {
  const id: VariantId = vid(v) ?? "koth";
  try {
    return evaluate(id, parseFen(fen));
  } catch {
    return 0;
  }
}

// ── the computer ─────────────────────────────────────────────────────────

const SKILL = [0, 1, 3, 6, 9, 12, 16, 20];
const DEPTH = [1, 1, 2, 3, 5, 8, 13, 18];
const MOVETIME = [60, 100, 150, 220, 320, 450, 650, 1000];
const RANDOM = [0.45, 0.25, 0.12, 0.05, 0, 0, 0, 0];
const BUDGET = [80, 150, 250, 400, 600, 900, 1300, 1800];

let worker: Worker | null = null;
let queue: Promise<unknown> = Promise.resolve();

function stockfish(fen: string, level: number): Promise<string | null> {
  const i = Math.max(0, Math.min(7, level - 1));
  const job = queue.then(
    () =>
      new Promise<string | null>((resolve) => {
        try {
          if (!worker) {
            worker = new Worker(asset("/stockfish/stockfish-19-lite-single.js"));
            worker.postMessage("uci");
          }
        } catch {
          return resolve(null);
        }
        const w = worker;
        const timer = window.setTimeout(() => {
          w.removeEventListener("message", on);
          resolve(null);
        }, 8000);
        const on = (e: MessageEvent) => {
          const line = String(e.data);
          if (line.startsWith("bestmove")) {
            w.removeEventListener("message", on);
            window.clearTimeout(timer);
            const bm = line.split(" ")[1];
            resolve(bm && bm !== "(none)" ? bm : null);
          }
        };
        w.addEventListener("message", on);
        w.postMessage(`setoption name Skill Level value ${SKILL[i]}`);
        w.postMessage("ucinewgame");
        w.postMessage(`position fen ${fen}`);
        w.postMessage(`go depth ${DEPTH[i]} movetime ${MOVETIME[i]}`);
      }),
  );
  queue = job.catch(() => undefined);
  return job;
}

function randomMove(v: TVariant, fen: string): { from: string; to: string; promo?: string } | null {
  const id = vid(v);
  if (!id) {
    const ms = new Chess(fen).moves({ verbose: true });
    if (!ms.length) return null;
    const m = ms[Math.floor(Math.random() * ms.length)];
    return { from: m.from, to: m.to, promo: m.promotion };
  }
  const ms = vLegalMoves(id, parseFen(fen));
  if (!ms.length) return null;
  const m = ms[Math.floor(Math.random() * ms.length)];
  return { from: m.from, to: m.to, promo: m.promo };
}

/** The computer's move at strength 1..8. */
export async function computerMove(v: TVariant, fen: string, level: number): Promise<{ from: string; to: string; promo?: string } | null> {
  const i = Math.max(0, Math.min(7, level - 1));
  if (Math.random() < RANDOM[i]) return randomMove(v, fen);
  const id = vid(v);
  if (!id) {
    const uci = await stockfish(fen, level);
    if (uci) return { from: uci.slice(0, 2), to: uci.slice(2, 4), promo: uci[4] || undefined };
    const m = botMove("koth", fen, BUDGET[i]);
    return m ? { from: m.from, to: m.to, promo: m.promo } : randomMove(v, fen);
  }
  // Give the browser a beat to paint the player's move before our engine thinks.
  await new Promise((r) => setTimeout(r, 30));
  const m = botMove(id, fen, BUDGET[i]);
  return m ? { from: m.from, to: m.to, promo: m.promo } : null;
}

// ── saving ───────────────────────────────────────────────────────────────

const KEY = "mcl-training-v1";
export function loadSaved(): { setup: TSetup; game: TGame | null } {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as { setup?: TSetup; game?: TGame | null };
      return { setup: { ...DEFAULT_SETUP, ...(j.setup ?? {}) }, game: j.game ?? null };
    }
  } catch {
    /* fresh */
  }
  return { setup: DEFAULT_SETUP, game: null };
}
export function save(setup: TSetup, game: TGame | null) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ setup, game }));
  } catch {
    /* full */
  }
}

/** Lichess-style clock text: "4:59", "0:09.3", "2 days", "One day 23 hours", "5 hours". */
export function clockText(ms: number, mode: TMode): string {
  const t = Math.max(0, ms);
  if (mode === "corr") {
    const h = Math.floor(t / 3_600_000);
    const d = Math.floor(h / 24);
    const rh = h % 24;
    if (d >= 2 && rh === 0) return `${d} days`;
    if (d >= 2) return `${d} days ${rh} hours`;
    if (d === 1) return rh ? `One day ${rh} hour${rh === 1 ? "" : "s"}` : "One day";
    if (h >= 1) return `${h} hour${h === 1 ? "" : "s"}`;
    const m = Math.ceil(t / 60_000);
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  const s = t / 1000;
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  if (s < 10) return `${mm}:${String(ss).padStart(2, "0")}.${Math.floor((s * 10) % 10)}`;
  if (mm >= 60) return `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export const minutesLabel = (m: number) => (m === 0.25 ? "¼" : m === 0.5 ? "½" : m === 0.75 ? "¾" : m === 1.5 ? "1½" : String(m));
