/**
 * Checkers (American / English draughts) for Morse Chess (owner t363u/t364u).
 * php/src/BoardGames.php is a line-by-line copy of these rules; keep the two in step.
 *
 * State string: "ck|<ranks 8..1, '/' between, digits = empty run>|<turn w|b>|<continue square or ->|<quiet plies>"
 *   M / K = the first player's man / king (moves first, starts on ranks 1-3, moves up the board)
 *   m / k = the second player's man / king (starts on ranks 6-8, moves down)
 * Rules: dark squares only (a1 is dark); men step diagonally forward, kings both ways (one square);
 * captures are forced; a jump that can keep jumping must (each hop is its own move, same turn);
 * a man reaching the far row is crowned and his move ends; no moves left = you lose;
 * 80 plies with no capture and no man move = draw.
 */
export type CkColor = "w" | "b";
export type CkCell = "M" | "K" | "m" | "k" | null;
export type CkState = { board: CkCell[][]; turn: CkColor; cont: string | null; quiet: number };
export type CkMove = { from: string; to: string; jump: string | null };

const FILES = "abcdefgh";
export const ckSq = (r: number, f: number) => FILES[f] + (r + 1);
export const ckPos = (s: string): [number, number] => [Number(s.slice(1)) - 1, FILES.indexOf(s[0])];
const on = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;
export const ckColorOf = (c: CkCell): CkColor | null => (c === null ? null : c === "M" || c === "K" ? "w" : "b");
const isKing = (c: CkCell) => c === "K" || c === "k";

export const CHECKERS_START = "ck|1m1m1m1m/m1m1m1m1/1m1m1m1m/8/8/M1M1M1M1/1M1M1M1M/M1M1M1M1|w|-|0";

export function ckParse(s: string): CkState | null {
  const p = s.split("|");
  if (p.length !== 5 || p[0] !== "ck") return null;
  const rows = p[1].split("/");
  if (rows.length !== 8) return null;
  const board: CkCell[][] = Array.from({ length: 8 }, () => Array<CkCell>(8).fill(null));
  for (let i = 0; i < 8; i++) {
    const r = 7 - i;
    let f = 0;
    for (const ch of rows[i]) {
      if (/[1-8]/.test(ch)) f += Number(ch);
      else if ("MKmk".includes(ch)) { if (f > 7) return null; board[r][f++] = ch as CkCell; }
      else return null;
    }
    if (f !== 8) return null;
  }
  const turn = p[2] === "b" ? "b" : p[2] === "w" ? "w" : null;
  if (!turn) return null;
  const cont = p[3] === "-" ? null : /^[a-h][1-8]$/.test(p[3]) ? p[3] : null;
  return { board, turn, cont, quiet: Math.max(0, Number(p[4]) || 0) };
}

export function ckString(s: CkState): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = "";
    let run = 0;
    for (let f = 0; f < 8; f++) {
      const c = s.board[r][f];
      if (c === null) run++;
      else { if (run) row += run; run = 0; row += c; }
    }
    if (run) row += run;
    rows.push(row);
  }
  return `ck|${rows.join("/")}|${s.turn}|${s.cont ?? "-"}|${s.quiet}`;
}

function dirsOf(c: CkCell): [number, number][] {
  if (isKing(c)) return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  return ckColorOf(c) === "w" ? [[1, 1], [1, -1]] : [[-1, 1], [-1, -1]];
}

function jumpsFrom(s: CkState, r: number, f: number): CkMove[] {
  const c = s.board[r][f];
  const me = ckColorOf(c);
  const out: CkMove[] = [];
  if (!me) return out;
  for (const [dr, df] of dirsOf(c)) {
    const mr = r + dr, mf = f + df, tr = r + 2 * dr, tf = f + 2 * df;
    if (!on(tr, tf)) continue;
    const mid = s.board[mr][mf];
    if (mid !== null && ckColorOf(mid) !== me && s.board[tr][tf] === null) out.push({ from: ckSq(r, f), to: ckSq(tr, tf), jump: ckSq(mr, mf) });
  }
  return out;
}

export function ckLegalMoves(s: CkState): CkMove[] {
  if (s.cont) {
    const [r, f] = ckPos(s.cont);
    return jumpsFrom(s, r, f);
  }
  const jumps: CkMove[] = [];
  const steps: CkMove[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const c = s.board[r][f];
      if (ckColorOf(c) !== s.turn) continue;
      jumps.push(...jumpsFrom(s, r, f));
      for (const [dr, df] of dirsOf(c)) {
        const tr = r + dr, tf = f + df;
        if (on(tr, tf) && s.board[tr][tf] === null) steps.push({ from: ckSq(r, f), to: ckSq(tr, tf), jump: null });
      }
    }
  }
  return jumps.length ? jumps : steps;
}

/** Apply a legal move (no check). Returns the new state and its notation. */
export function ckPlay(s: CkState, m: CkMove): { state: CkState; san: string; crowned: boolean } {
  const board = s.board.map((row) => row.slice());
  const [fr, ff] = ckPos(m.from);
  const [tr, tf] = ckPos(m.to);
  let c = board[fr][ff];
  board[fr][ff] = null;
  if (m.jump) { const [jr, jf] = ckPos(m.jump); board[jr][jf] = null; }
  let crowned = false;
  if (c === "M" && tr === 7) { c = "K"; crowned = true; }
  if (c === "m" && tr === 0) { c = "k"; crowned = true; }
  board[tr][tf] = c;
  const manMove = c === "M" || c === "m" || crowned;
  const quiet = m.jump || manMove ? 0 : s.quiet + 1;
  let next: CkState = { board, turn: s.turn, cont: null, quiet };
  if (m.jump && !crowned && jumpsFrom(next, tr, tf).length > 0) next = { ...next, cont: m.to };
  else next = { ...next, turn: s.turn === "w" ? "b" : "w" };
  return { state: next, san: `${m.from}${m.jump ? "x" : "-"}${m.to}`, crowned };
}

export type CkStatus = { over: false } | { over: true; winner: CkColor | null; reason: string };
export function ckStatus(s: CkState): CkStatus {
  if (ckLegalMoves(s).length === 0) return { over: true, winner: s.turn === "w" ? "b" : "w", reason: "no-moves" };
  if (s.quiet >= 80) return { over: true, winner: null, reason: "forty-moves" };
  return { over: false };
}

/** The move from -> to if it is legal now, else null. */
export function ckFind(s: CkState, from: string, to: string): CkMove | null {
  return ckLegalMoves(s).find((m) => m.from === from && m.to === to) ?? null;
}
