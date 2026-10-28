/** Breakthrough (Dan Troyka, 2000). */
export type Color = "w" | "b";
export type BBoard = (Color | null)[][]; // [row 0..7 (0 = White home)][col]
export type BMove = { from: [number, number]; to: [number, number]; capture: boolean };
export type BState = { board: BBoard; turn: Color; ply: number };

export function breakStart(): BState {
  const board: BBoard = Array.from({ length: 8 }, (_, r) => Array<Color | null>(8).fill(r < 2 ? "w" : r > 5 ? "b" : null));
  return { board, turn: "w", ply: 0 };
}

export function breakMoves(s: BState, c: Color = s.turn): BMove[] {
  const d = c === "w" ? 1 : -1;
  const out: BMove[] = [];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    if (s.board[r][f] !== c) continue;
    const rr = r + d;
    if (rr < 0 || rr > 7) continue;
    if (!s.board[rr][f]) out.push({ from: [r, f], to: [rr, f], capture: false });
    for (const ff of [f - 1, f + 1]) {
      if (ff < 0 || ff > 7) continue;
      const t = s.board[rr][ff];
      if (t === c) continue;
      out.push({ from: [r, f], to: [rr, ff], capture: t !== null });
    }
  }
  return out;
}

export function breakApply(s: BState, m: BMove): BState {
  const board = s.board.map((row) => row.slice());
  board[m.to[0]][m.to[1]] = board[m.from[0]][m.from[1]];
  board[m.from[0]][m.from[1]] = null;
  return { board, turn: s.turn === "w" ? "b" : "w", ply: s.ply + 1 };
}

export function breakWinner(s: BState): Color | null {
  if (s.board[7].includes("w")) return "w";
  if (s.board[0].includes("b")) return "b";
  let w = 0, b = 0;
  for (const row of s.board) for (const c of row) { if (c === "w") w++; else if (c === "b") b++; }
  if (!b) return "w";
  if (!w) return "b";
  if (!breakMoves(s).length) return s.turn === "w" ? "b" : "w";
  return null;
}

function evaluate(s: BState): number {
  let v = 0;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const c = s.board[r][f];
    if (c === "w") v += 100 + r * r * 3;
    else if (c === "b") v -= 100 + (7 - r) * (7 - r) * 3;
  }
  return v;
}

function search(s: BState, depth: number, alpha: number, beta: number): number {
  const w = breakWinner(s);
  if (w) return w === "w" ? 1e6 - s.ply : -1e6 + s.ply;
  if (depth === 0) return evaluate(s);
  const moves = breakMoves(s).sort((a, b) => Number(b.capture) - Number(a.capture));
  if (s.turn === "w") {
    let best = -Infinity;
    for (const m of moves) {
      best = Math.max(best, search(breakApply(s, m), depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    best = Math.min(best, search(breakApply(s, m), depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

export function breakBot(s: BState): BMove | null {
  const moves = breakMoves(s);
  if (!moves.length) return null;
  let best = moves[0];
  let bestScore = s.turn === "w" ? -Infinity : Infinity;
  for (const m of moves) {
    const sc = search(breakApply(s, m), 2, -Infinity, Infinity) + Math.random() * 10;
    if (s.turn === "w" ? sc > bestScore : sc < bestScore) { bestScore = sc; best = m; }
  }
  return best;
}
