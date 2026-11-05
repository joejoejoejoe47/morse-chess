/**
 * Coach mode: looks at the live position with the Stockfish build that already ships in
 * public/stockfish (same one History uses), falls back to the in-house engine, and explains
 * the best move in plain kid-friendly words. Arrows: green = play this, red = their threat.
 */
import { Chess, type Square } from "chess.js";
import { asset } from "@/lib/base";
import { botMove } from "@/lib/variants/engine";

export type CoachArrow = { from: string; to: string; color: "good" | "threat" };
export type CoachTip = { arrows: CoachArrow[]; text: string; eval: number | null };

let worker: Worker | null = null;
let busy: Promise<unknown> = Promise.resolve();

function sf(fen: string, movetime = 900): Promise<{ best: string | null; pv: string[]; cp: number | null }> {
  const job = busy.then(
    () =>
      new Promise<{ best: string | null; pv: string[]; cp: number | null }>((resolve, reject) => {
        try {
          if (!worker) {
            worker = new Worker(asset("/stockfish/stockfish-19-lite-single.js"));
            worker.postMessage("uci");
          }
        } catch (e) {
          return reject(e);
        }
        const w = worker;
        let pv: string[] = [];
        let cp: number | null = null;
        const timer = window.setTimeout(() => {
          w.removeEventListener("message", on);
          reject(new Error("engine timed out"));
        }, 7000);
        const on = (e: MessageEvent) => {
          const line = String(e.data);
          if (line.startsWith("info") && line.includes(" pv ")) {
            pv = (/ pv (.+)$/.exec(line)?.[1] ?? "").split(" ");
            const c = /score cp (-?\d+)/.exec(line);
            const m = /score mate (-?\d+)/.exec(line);
            cp = m ? Math.sign(Number(m[1])) * 10000 : c ? Number(c[1]) : cp;
          } else if (line.startsWith("bestmove")) {
            w.removeEventListener("message", on);
            window.clearTimeout(timer);
            const bm = line.split(" ")[1];
            resolve({ best: bm && bm !== "(none)" ? bm : pv[0] ?? null, pv, cp });
          }
        };
        w.addEventListener("message", on);
        w.addEventListener("error", () => reject(new Error("engine failed")), { once: true });
        w.postMessage(`position fen ${fen}`);
        w.postMessage(`go movetime ${movetime}`);
      }),
  );
  busy = job.catch(() => undefined);
  return job;
}

async function bestLine(fen: string): Promise<{ moves: string[]; cp: number | null }> {
  try {
    const r = await sf(fen);
    if (r.best) return { moves: [r.best, ...r.pv.slice(1)], cp: r.cp };
  } catch {
    /* fall through to our own engine */
  }
  const m = botMove("koth", fen, 600);
  if (!m) return { moves: [], cp: null };
  const c = new Chess(fen);
  try {
    if (!c.move({ from: m.from, to: m.to, promotion: m.promo ?? "q" })) return { moves: [], cp: null };
  } catch {
    return { moves: [], cp: null };
  }
  return { moves: [m.from + m.to + (m.promo ?? "")], cp: null };
}

const NAMES: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const CENTER = new Set(["d4", "d5", "e4", "e5", "c4", "c5", "f4", "f5"]);

function explain(fen: string, uci: string): string {
  const c = new Chess(fen);
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const piece = c.get(from);
  let mv;
  try {
    mv = c.move({ from, to, promotion: (uci[4] as "q") || "q" });
  } catch {
    return `Try ${from} to ${to}.`;
  }
  const who = piece ? NAMES[piece.type] : "piece";
  const bits: string[] = [];
  if (c.isCheckmate()) return `${mv.san}! That's checkmate! Move your ${who} from ${from} to ${to} and you win!`;
  if (mv.captured) bits.push(`it grabs their ${NAMES[mv.captured]}`);
  if (mv.san.startsWith("O-O")) bits.push("castling tucks your king safe and wakes up your rook");
  if (mv.promotion) bits.push("your pawn turns into a queen");
  if (c.inCheck()) bits.push("it puts their king in check");
  if (!mv.captured && CENTER.has(to) && piece?.type === "p") bits.push("it grabs the center");
  const homeRank = piece?.color === "w" ? "1" : "8";
  if (!mv.captured && (piece?.type === "n" || piece?.type === "b") && from[1] === homeRank) bits.push(`it brings a sleepy ${who} into the game`);
  // Is the piece safe where it lands?
  const attackers = c.moves({ verbose: true }).filter((m) => m.to === to && m.captured);
  if (!bits.length) bits.push(attackers.length ? "it's the strongest move here, even if it looks scary" : "it keeps your pieces working together and safe");
  return `Play ${mv.san}: your ${who} from ${from} to ${to}, because ${bits.join(" and ")}.`;
}

export async function coachPosition(fen: string, you: "w" | "b"): Promise<CoachTip> {
  const c = new Chess(fen);
  if (c.isGameOver()) return { arrows: [], text: "This game is over! Start a new one and I'll coach you move by move.", eval: null };
  if (c.turn() === you) {
    const { moves, cp } = await bestLine(fen);
    if (!moves.length) return { arrows: [], text: "Hmm, I couldn't find a move here. That's rare!", eval: null };
    const best = moves[0];
    const arrows: CoachArrow[] = [{ from: best.slice(0, 2), to: best.slice(2, 4), color: "good" }];
    if (moves[1]) arrows.push({ from: moves[1].slice(0, 2), to: moves[1].slice(2, 4), color: "threat" });
    const score = cp == null ? "" : cp > 150 ? " You're doing great, you're ahead!" : cp < -150 ? " It's tough, but we can fight back!" : " The game is pretty even.";
    const reply = moves[1] ? ` The red arrow shows what they will probably answer.` : "";
    return { arrows, text: explain(fen, best) + reply + score, eval: cp };
  }
  // Their move: show what they are threatening so you can get ready.
  const { moves } = await bestLine(fen);
  if (!moves.length) return { arrows: [], text: "Waiting for their move!", eval: null };
  const t = moves[0];
  const c2 = new Chess(fen);
  let san = t;
  try {
    san = c2.move({ from: t.slice(0, 2) as Square, to: t.slice(2, 4) as Square, promotion: "q" }).san;
  } catch {
    /* keep uci */
  }
  return {
    arrows: [{ from: t.slice(0, 2), to: t.slice(2, 4), color: "threat" }],
    text: `It's their turn. Watch out: their best idea is ${san} (red arrow). Think about how you'd answer it!`,
    eval: null,
  };
}
