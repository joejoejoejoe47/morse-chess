/**
 * MorseBot for Checkers and Xiangqi in the browser: iterative-deepening alpha-beta with a time
 * budget (same idea and weights as BoardGames::botMove in php/src/BoardGames.php).
 */
import { ckColorOf, ckLegalMoves, ckPlay, type CkMove, type CkState } from "./checkers";
import { xqColorOf, xqLegalMoves, xqPlay, type XqMove, type XqState } from "./xiangqi";

export type BoardGameId = "checkers" | "xiangqi";
type S = CkState | XqState;
type M = CkMove | XqMove;

const XQ_VALUE: Record<string, number> = { K: 0, A: 20, E: 20, H: 40, R: 90, C: 45, P: 10 };

function evaluate(v: BoardGameId, s: S, side: "w" | "b"): number {
  let score = 0;
  if (v === "checkers") {
    const b = (s as CkState).board;
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const c = b[r][f];
      if (!c) continue;
      const king = c === "K" || c === "k";
      const col = ckColorOf(c);
      const adv = col === "w" ? r : 7 - r;
      let val = king ? 175 : 100 + adv * 4;
      if (f === 0 || f === 7) val += 3;
      if (!king && adv === 0) val += 6;
      score += col === side ? val : -val;
    }
    return score;
  }
  const b = (s as XqState).board;
  for (let r = 0; r <= 9; r++) for (let f = 0; f <= 8; f++) {
    const c = b[r][f];
    if (!c) continue;
    const k = c.toUpperCase();
    const col = xqColorOf(c);
    let val = XQ_VALUE[k] * 10;
    const crossed = col === "w" ? r >= 5 : r <= 4;
    if (k === "P" && crossed) val += 100 + (4 - Math.abs(4 - f)) * 10;
    if (k === "H" || k === "C" || k === "R") val += (4 - Math.abs(4 - f)) * 4;
    score += col === side ? val : -val;
  }
  return score;
}

const legal = (v: BoardGameId, s: S): M[] => (v === "checkers" ? ckLegalMoves(s as CkState) : xqLegalMoves(s as XqState));
const play = (v: BoardGameId, s: S, m: M): S => (v === "checkers" ? ckPlay(s as CkState, m as CkMove).state : xqPlay(s as XqState, m as XqMove).state);
const loud = (m: M) => ("jump" in m ? m.jump !== null : m.capture);

export function botMove(v: BoardGameId, s: S, budgetMs = 700, level: "easy" | "normal" = "normal"): M | null {
  const moves = legal(v, s);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  const side = s.turn;
  const deadline = performance.now() + budgetMs;
  let timeUp = false;
  const search = (st: S, depth: number, alpha: number, beta: number): number => {
    if (performance.now() > deadline) { timeUp = true; return 0; }
    const ms = legal(v, st);
    const mine = st.turn === side;
    if (!ms.length) return mine ? -100000 - depth : 100000 + depth;
    if (depth <= 0) return evaluate(v, st, side);
    ms.sort((a, b) => Number(loud(b)) - Number(loud(a)));
    let best = mine ? -Infinity : Infinity;
    for (const m of ms) {
      const n = play(v, st, m);
      const d = n.turn === st.turn ? depth : depth - 1;
      const sc = search(n, d, alpha, beta);
      if (mine) { best = Math.max(best, sc); alpha = Math.max(alpha, best); }
      else { best = Math.min(best, sc); beta = Math.min(beta, best); }
      if (alpha >= beta || timeUp) break;
    }
    return best;
  };
  const order = moves.slice().sort(() => Math.random() - 0.5);
  let best = order[0];
  const maxDepth = level === "easy" ? 2 : 8;
  for (let depth = 1; depth <= maxDepth; depth++) {
    timeUp = false;
    let bestHere: M | null = null;
    let bestScore = -Infinity;
    for (const m of order) {
      const n = play(v, s, m);
      const d = n.turn === s.turn ? depth : depth - 1;
      const sc = search(n, d, bestScore, Infinity);
      if (timeUp) break;
      if (sc > bestScore) { bestScore = sc; bestHere = m; }
    }
    if (timeUp) break;
    if (bestHere) { best = bestHere; order.sort((a, b) => Number(b === bestHere) - Number(a === bestHere)); }
    if (bestScore > 90000) break;
  }
  return best;
}
