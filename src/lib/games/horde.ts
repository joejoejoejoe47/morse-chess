/** Horde chess: White has 36 pawns and no king, Black has the normal army. */
export type Color = "w" | "b";
export type Kind = "k" | "q" | "r" | "b" | "n" | "p";
export type Piece = { c: Color; t: Kind };
export type Sq = [number, number]; // [rank index 0..7 (0 = rank 1), file index 0..7]
export type HBoard = (Piece | null)[][];
export type HMove = { from: Sq; to: Sq; promo?: Kind; ep?: boolean; castle?: "K" | "Q"; double?: boolean };
export type HState = { board: HBoard; turn: Color; castle: { K: boolean; Q: boolean }; ep: Sq | null; ply: number };
export type HStatus = { over: false } | { over: true; winner: Color | null; reason: string };

const on = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;
const other = (c: Color): Color => (c === "w" ? "b" : "w");

export function hordeStart(): HState {
  const board: HBoard = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  for (let r = 0; r < 4; r++) for (let f = 0; f < 8; f++) board[r][f] = { c: "w", t: "p" };
  for (const f of [3, 4, 5, 6]) board[4][f] = { c: "w", t: "p" }; // d5 e5 f5 g5
  const back: Kind[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  for (let f = 0; f < 8; f++) {
    board[7][f] = { c: "b", t: back[f] };
    board[6][f] = { c: "b", t: "p" };
  }
  return { board, turn: "w", castle: { K: true, Q: true }, ep: null, ply: 0 };
}

const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KG = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Is square (r,f) attacked by any piece of colour `by`? */
export function attacked(board: HBoard, r: number, f: number, by: Color): boolean {
  const pr = by === "w" ? r - 1 : r + 1; // where an attacking pawn would stand
  for (const df of [-1, 1]) {
    const p = on(pr, f + df) ? board[pr][f + df] : null;
    if (p && p.c === by && p.t === "p") return true;
  }
  for (const [dr, df] of KN) {
    const p = on(r + dr, f + df) ? board[r + dr][f + df] : null;
    if (p && p.c === by && p.t === "n") return true;
  }
  for (const [dr, df] of KG) {
    const p = on(r + dr, f + df) ? board[r + dr][f + df] : null;
    if (p && p.c === by && p.t === "k") return true;
  }
  for (const [dirs, kinds] of [[DIAG, ["b", "q"]], [ORTH, ["r", "q"]]] as const) {
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (on(rr, ff)) {
        const p = board[rr][ff];
        if (p) {
          if (p.c === by && (kinds as readonly string[]).includes(p.t)) return true;
          break;
        }
        rr += dr; ff += df;
      }
    }
  }
  return false;
}

function kingOf(board: HBoard, c: Color): Sq | null {
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = board[r][f];
    if (p && p.c === c && p.t === "k") return [r, f];
  }
  return null;
}

export function inCheck(s: HState, c: Color = s.turn): boolean {
  const k = kingOf(s.board, c);
  return !!k && attacked(s.board, k[0], k[1], other(c));
}

function pseudo(s: HState): HMove[] {
  const { board, turn } = s;
  const out: HMove[] = [];
  const last = turn === "w" ? 7 : 0;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = board[r][f];
    if (!p || p.c !== turn) continue;
    const from: Sq = [r, f];
    const push = (to: Sq, extra: Partial<HMove> = {}) => {
      if (p.t === "p" && to[0] === last) for (const promo of ["q", "r", "b", "n"] as Kind[]) out.push({ from, to, promo, ...extra });
      else out.push({ from, to, ...extra });
    };
    if (p.t === "p") {
      const d = turn === "w" ? 1 : -1;
      if (on(r + d, f) && !board[r + d][f]) {
        push([r + d, f]);
        // White pawns on ranks 1-2 may double-step; Black only from its start rank.
        const canDouble = turn === "w" ? r <= 1 : r === 6;
        if (canDouble && on(r + 2 * d, f) && !board[r + 2 * d][f]) out.push({ from, to: [r + 2 * d, f], double: true });
      }
      for (const df of [-1, 1]) {
        const rr = r + d, ff = f + df;
        if (!on(rr, ff)) continue;
        const t = board[rr][ff];
        if (t && t.c !== turn) push([rr, ff]);
        else if (!t && s.ep && s.ep[0] === rr && s.ep[1] === ff) {
          const victim = board[r][ff];
          if (victim && victim.c !== turn && victim.t === "p") out.push({ from, to: [rr, ff], ep: true });
        }
      }
      continue;
    }
    if (p.t === "n" || p.t === "k") {
      for (const [dr, df] of p.t === "n" ? KN : KG) {
        const rr = r + dr, ff = f + df;
        if (!on(rr, ff)) continue;
        const t = board[rr][ff];
        if (!t || t.c !== turn) out.push({ from, to: [rr, ff] });
      }
      if (p.t === "k" && turn === "b" && r === 7 && f === 4 && !attacked(board, 7, 4, "w")) {
        const rk = board[7][7], rq = board[7][0];
        if (s.castle.K && rk?.t === "r" && rk.c === "b" && !board[7][5] && !board[7][6] && !attacked(board, 7, 5, "w") && !attacked(board, 7, 6, "w"))
          out.push({ from, to: [7, 6], castle: "K" });
        if (s.castle.Q && rq?.t === "r" && rq.c === "b" && !board[7][1] && !board[7][2] && !board[7][3] && !attacked(board, 7, 3, "w") && !attacked(board, 7, 2, "w"))
          out.push({ from, to: [7, 2], castle: "Q" });
      }
      continue;
    }
    const dirs = p.t === "b" ? DIAG : p.t === "r" ? ORTH : [...DIAG, ...ORTH];
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (on(rr, ff)) {
        const t = board[rr][ff];
        if (t) {
          if (t.c !== turn) out.push({ from, to: [rr, ff] });
          break;
        }
        out.push({ from, to: [rr, ff] });
        rr += dr; ff += df;
      }
    }
  }
  return out;
}

export function applyMove(s: HState, m: HMove): HState {
  const board = s.board.map((row) => row.slice());
  const p = board[m.from[0]][m.from[1]]!;
  const castle = { ...s.castle };
  board[m.from[0]][m.from[1]] = null;
  if (m.ep) board[m.from[0]][m.to[1]] = null;
  board[m.to[0]][m.to[1]] = m.promo ? { c: p.c, t: m.promo } : p;
  if (m.castle === "K") { board[7][5] = board[7][7]; board[7][7] = null; }
  if (m.castle === "Q") { board[7][3] = board[7][0]; board[7][0] = null; }
  if (p.c === "b" && p.t === "k") { castle.K = false; castle.Q = false; }
  if ((m.from[0] === 7 && m.from[1] === 7) || (m.to[0] === 7 && m.to[1] === 7)) castle.K = false;
  if ((m.from[0] === 7 && m.from[1] === 0) || (m.to[0] === 7 && m.to[1] === 0)) castle.Q = false;
  const ep: Sq | null = m.double ? [(m.from[0] + m.to[0]) / 2, m.from[1]] : null;
  return { board, turn: other(s.turn), castle, ep, ply: s.ply + 1 };
}

/** Legal moves: Black may never leave its king attacked; White has no king to protect. */
export function legalMoves(s: HState): HMove[] {
  const ps = pseudo(s);
  if (s.turn === "w") return ps;
  return ps.filter((m) => !inCheck(applyMove(s, m), "b"));
}

export function count(board: HBoard, c: Color): number {
  let n = 0;
  for (const row of board) for (const p of row) if (p?.c === c) n++;
  return n;
}

export function status(s: HState): HStatus {
  if (count(s.board, "w") === 0) return { over: true, winner: "b", reason: "Black captured every White pawn." };
  if (count(s.board, "b") === 0) return { over: true, winner: "w", reason: "White captured every Black piece." };
  if (legalMoves(s).length === 0) {
    if (s.turn === "b" && inCheck(s, "b")) return { over: true, winner: "w", reason: "Checkmate! The horde trapped the king." };
    return { over: true, winner: null, reason: "Stalemate — nobody can move. Draw." };
  }
  if (s.ply >= 400) return { over: true, winner: null, reason: "200 moves played. Draw." };
  return { over: false };
}

const VAL: Record<Kind, number> = { p: 100, n: 300, b: 320, r: 500, q: 900, k: 0 };

function evaluate(s: HState): number {
  // Positive = good for White.
  let v = 0;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = s.board[r][f];
    if (!p) continue;
    const base = VAL[p.t] + (p.t === "p" ? (p.c === "w" ? r * 6 : (7 - r) * 4) : 0);
    v += p.c === "w" ? base : -base;
  }
  return v;
}

function search(s: HState, depth: number, alpha: number, beta: number): number {
  const st = status(s);
  if (st.over) return st.winner === "w" ? 1e6 - s.ply : st.winner === "b" ? -1e6 + s.ply : 0;
  if (depth === 0) return evaluate(s);
  const moves = legalMoves(s);
  if (s.turn === "w") {
    let best = -Infinity;
    for (const m of moves) {
      best = Math.max(best, search(applyMove(s, m), depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    best = Math.min(best, search(applyMove(s, m), depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

/** Simple 2-ply bot. */
export function botMove(s: HState): HMove | null {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  let best: HMove[] = [];
  let bestScore = s.turn === "w" ? -Infinity : Infinity;
  for (const m of moves) {
    const sc = search(applyMove(s, m), 1, -Infinity, Infinity) + Math.random() * 8;
    if (s.turn === "w" ? sc > bestScore : sc < bestScore) { bestScore = sc; best = [m]; }
  }
  return best[0] ?? moves[0];
}
