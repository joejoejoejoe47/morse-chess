/** Apocalypse (simplified): 5x5, simultaneous secret moves. */
export type Color = "w" | "b";
export type AKind = "n" | "p";
export type APiece = { c: Color; t: AKind };
export type ABoard = (APiece | null)[][]; // [row 0..4 (0 = White home)][col]
export type AMove = { from: [number, number]; to: [number, number] };
export type AResult = { board: ABoard; events: string[]; winner: Color | "draw" | null };

const N = 5;
const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const name = (c: Color) => (c === "w" ? "White" : "Black");
const sqName = (r: number, f: number) => "abcde"[f] + String(r + 1);

export function apoStart(): ABoard {
  const b: ABoard = Array.from({ length: N }, () => Array<APiece | null>(N).fill(null));
  const row: AKind[] = ["n", "p", "p", "p", "n"];
  row.forEach((t, f) => {
    b[0][f] = { c: "w", t };
    b[4][f] = { c: "b", t };
  });
  return b;
}

export function apoMoves(b: ABoard, c: Color): AMove[] {
  const out: AMove[] = [];
  const d = c === "w" ? 1 : -1;
  for (let r = 0; r < N; r++) for (let f = 0; f < N; f++) {
    const p = b[r][f];
    if (!p || p.c !== c) continue;
    if (p.t === "p") {
      const rr = r + d;
      if (rr < 0 || rr >= N) continue;
      if (!b[rr][f]) out.push({ from: [r, f], to: [rr, f] });
      for (const ff of [f - 1, f + 1]) {
        if (ff < 0 || ff >= N) continue;
        const t = b[rr][ff];
        if (t && t.c !== c) out.push({ from: [r, f], to: [rr, ff] });
      }
    } else {
      for (const [dr, df] of KN) {
        const rr = r + dr, ff = f + df;
        if (rr < 0 || rr >= N || ff < 0 || ff >= N) continue;
        const t = b[rr][ff];
        if (!t || t.c !== c) out.push({ from: [r, f], to: [rr, ff] });
      }
    }
  }
  return out;
}

export function countKind(b: ABoard, c: Color, t?: AKind): number {
  let n = 0;
  for (const row of b) for (const p of row) if (p && p.c === c && (!t || p.t === t)) n++;
  return n;
}

export function centerCount(b: ABoard, c: Color): number {
  let n = 0;
  for (let r = 1; r <= 3; r++) for (let f = 1; f <= 3; f++) if (b[r][f]?.c === c) n++;
  return n;
}

/** Execute both secret moves at once. Either move may be null (no legal move = pass). */
export function apoResolve(b0: ABoard, wm: AMove | null, bm: AMove | null): AResult {
  const b = b0.map((row) => row.slice());
  const events: string[] = [];
  const moves: [Color, AMove][] = [];
  if (wm) moves.push(["w", wm]);
  if (bm) moves.push(["b", bm]);
  const movers = moves.map(([c, m]) => [c, m, b0[m.from[0]][m.from[1]]!] as const);
  if (wm && bm && wm.to[0] === bm.to[0] && wm.to[1] === bm.to[1]) {
    b[wm.from[0]][wm.from[1]] = null;
    b[bm.from[0]][bm.from[1]] = null;
    events.push(`Both pieces crashed on ${sqName(wm.to[0], wm.to[1])} and were removed!`);
  } else {
    for (const [, m] of movers) b[m.from[0]][m.from[1]] = null;
    for (const [c, m, p] of movers) {
      const t = b[m.to[0]][m.to[1]];
      if (t && t.c !== c) events.push(`${name(c)} captured a ${t.t === "n" ? "knight" : "pawn"} on ${sqName(m.to[0], m.to[1])}.`);
      b[m.to[0]][m.to[1]] = p;
    }
    // Promotion / respawn for pawns that reached the far row.
    for (const [c, m, p] of movers) {
      if (p.t !== "p") continue;
      const far = c === "w" ? N - 1 : 0;
      if (m.to[0] !== far || b[m.to[0]][m.to[1]] !== p) continue;
      if (countKind(b, c, "n") < 2) {
        b[m.to[0]][m.to[1]] = { c, t: "n" };
        events.push(`${name(c)}'s pawn reached the end and became a knight.`);
      } else {
        b[m.to[0]][m.to[1]] = null;
        const home = c === "w" ? 0 : N - 1;
        const step = c === "w" ? 1 : -1;
        const order = [m.to[1], 2, 1, 3, 0, 4];
        let spot: [number, number] | null = null;
        for (let k = 0; k < N && !spot; k++) {
          const rr = home + step * k;
          const ff = order.find((f) => !b[rr][f]);
          if (ff !== undefined) spot = [rr, ff];
        }
        if (spot) {
          b[spot[0]][spot[1]] = p;
          events.push(`${name(c)}'s pawn reached the end and respawned on ${sqName(spot[0], spot[1])}.`);
        } else events.push(`${name(c)}'s pawn reached the end but had nowhere to respawn.`);
      }
    }
  }
  return { board: b, events, winner: apoWinner(b) };
}

export function apoWinner(b: ABoard): Color | "draw" | null {
  const wp = countKind(b, "w", "p"), bp = countKind(b, "b", "p");
  if (!wp && !bp) return "draw";
  if (!bp) return "w";
  if (!wp) return "b";
  const wc = centerCount(b, "w") >= 3, bc = centerCount(b, "b") >= 3;
  if (wc && bc) return "draw";
  if (wc) return "w";
  if (bc) return "b";
  if (!apoMoves(b, "w").length && !apoMoves(b, "b").length) return "draw";
  return null;
}

function score(r: AResult, c: Color): number {
  const o: Color = c === "w" ? "b" : "w";
  if (r.winner === c) return 1e4;
  if (r.winner === o) return -1e4;
  if (r.winner === "draw") return 0;
  return (
    (countKind(r.board, c, "p") - countKind(r.board, o, "p")) * 30 +
    (countKind(r.board, c, "n") - countKind(r.board, o, "n")) * 25 +
    (centerCount(r.board, c) - centerCount(r.board, o)) * 12
  );
}

/** Bot: pick the move with the best mix of average and worst-case outcome over every reply. */
export function apoBot(b: ABoard, c: Color): AMove | null {
  const mine = apoMoves(b, c);
  if (!mine.length) return null;
  const theirs = apoMoves(b, c === "w" ? "b" : "w");
  let best = mine[0], bestScore = -Infinity;
  for (const m of mine) {
    const outs = (theirs.length ? theirs : [null]).map((t) => score(c === "w" ? apoResolve(b, m, t) : apoResolve(b, t, m), c));
    const avg = outs.reduce((a, x) => a + x, 0) / outs.length;
    const sc = avg * 0.6 + Math.min(...outs) * 0.4 + Math.random() * 3;
    if (sc > bestScore) { bestScore = sc; best = m; }
  }
  return best;
}
