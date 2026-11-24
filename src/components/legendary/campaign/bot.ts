/**
 * Boss brains: a small alpha-beta search over the campaign engine (so gears, walls, glass pawns
 * and the rim collapse are all "seen" by the boss). Strength = search depth + a little noise.
 */
import { apply, attacked, inCheck, kingSq, legalMoves, VALUE, type Color, type Move, type State } from "./engine";

const MATE = 100000;

// centre bonus by square (same for both colours, mirrored by rank where it matters)
const CENTER = Array.from({ length: 64 }, (_, i) => {
  const f = i & 7;
  const r = i >> 3;
  return 6 - (Math.abs(3.5 - f) + Math.abs(3.5 - r)) * 1.6;
});

function evaluate(s: State, me: Color): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (!p) continue;
    let v = p.glass ? 30 : VALUE[p.k] * 100;
    if (p.k === "n" || p.k === "b") v += CENTER[i] * 2;
    if (p.k === "q") v += CENTER[i];
    if (p.k === "p") {
      const adv = p.c === "w" ? i >> 3 : 7 - (i >> 3);
      v += adv * adv * 2 + CENTER[i];
    }
    if (p.k === "k") {
      // early on the king hides at the back
      const back = p.c === "w" ? i >> 3 : 7 - (i >> 3);
      v -= back * 12;
    }
    score += p.c === me ? v : -v;
  }
  return score;
}

function order(s: State, moves: Move[]): Move[] {
  const key = (m: Move) => {
    const v = s.board[m.to];
    let k = 0;
    if (v) k += 10 * VALUE[v.k] - VALUE[s.board[m.from]!.k] + 50;
    if (m.kind === "promo") k += m.promo === "q" ? 80 : 0;
    if (m.kind === "wall") k += 5;
    return -k;
  };
  return moves.slice().sort((a, b) => key(a) - key(b));
}

function quiesce(s: State, alpha: number, beta: number, depth: number, clock: { n: number; stop: number }): number {
  const stand = evaluate(s, s.turn);
  if (depth <= 0) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  const caps = order(s, legalMoves(s).filter((m) => s.board[m.to] || m.kind === "ep" || m.kind === "promo"));
  for (const m of caps) {
    if (++clock.n % 512 === 0 && Date.now() > clock.stop) break;
    const v = -quiesce(apply(s, m, false).s, -beta, -alpha, depth - 1, clock);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(s: State, depth: number, alpha: number, beta: number, ply: number, clock: { n: number; stop: number }): number {
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? -MATE + ply : 0;
  if (s.quiet >= 100) return 0;
  if (depth <= 0) return quiesce(s, alpha, beta, 4, clock);
  for (const m of order(s, moves)) {
    if (++clock.n % 256 === 0 && Date.now() > clock.stop) break;
    const v = -search(apply(s, m, false).s, depth - 1, -beta, -alpha, ply + 1, clock);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

export type BotLevel = { depth: number; noise: number; ms: number };

/** The boss's move for the side to move (iterative deepening within a time budget). */
export function bossMove(s: State, level: BotLevel, rand: () => number = Math.random): Move | null {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  const clock = { n: 0, stop: Date.now() + level.ms };
  let best: { m: Move; v: number }[] = moves.map((m) => ({ m, v: 0 }));
  for (let d = 1; d <= level.depth; d++) {
    const scored: { m: Move; v: number }[] = [];
    let alpha = -MATE * 2;
    let timedOut = false;
    for (const { m } of best) {
      if (Date.now() > clock.stop && d > 1) { timedOut = true; break; }
      const v = -search(apply(s, m, false).s, d - 1, -MATE * 2, -alpha + level.noise + 1, 1, clock);
      scored.push({ m, v });
      if (v > alpha) alpha = v;
    }
    if (timedOut && scored.length < best.length) {
      // keep the finished part on top, the rest in the old order
      const done = new Set(scored.map((x) => x.m));
      scored.push(...best.filter((x) => !done.has(x.m)).map((x) => ({ m: x.m, v: -MATE * 3 })));
    }
    best = scored.sort((a, b) => b.v - a.v);
    if (timedOut) break;
    if (best[0].v > MATE / 2) break;
  }
  // pick among moves within `noise` centipawns of the best (bosses are strong, not perfect)
  const top = best[0].v;
  const near = best.filter((x) => x.v >= top - level.noise);
  return near[Math.floor(rand() * near.length)].m;
}

/** Simple threat finder for companion callouts: is any of `c`'s pieces worth >= 3 hanging? */
export function hanging(s: State, c: Color): number[] {
  const out: number[] = [];
  const them = c === "w" ? "b" : "w";
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (!p || p.c !== c || p.k === "k" || VALUE[p.k] < 3) continue;
    if (attacked(s, i, them) && !attacked(s, i, c)) out.push(i);
  }
  return out;
}

export { kingSq };
