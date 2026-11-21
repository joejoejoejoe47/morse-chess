/**
 * Xiangqi (Chinese chess) for Morse Chess (owner t363u/t364u).
 * php/src/BoardGames.php is a line-by-line copy of these rules; keep the two in step.
 *
 * State string: "xq|<ranks 9..0, '/' between, digits = empty run>|<turn w|b>|<quiet plies>"
 * Files a-i (left to right for Red), ranks 0-9 (Red's back rank is 0). Red = "w" = upper case and moves first.
 *   K general · A advisor · E elephant · H horse · R chariot · C cannon · P soldier
 * Rules: generals and advisors stay in the palace (d-f, ranks 0-2 / 7-9); elephants move two
 * diagonally, never across the river, and are blocked by a piece on the "eye"; horses step one
 * straight then one diagonal and are blocked by a piece on the "leg"; cannons slide like chariots
 * but capture by jumping exactly one piece; soldiers step forward, and also sideways once across
 * the river; the two generals may never face each other on an open file (flying general).
 * No legal move (checkmate OR stalemate) = you lose. 120 plies with no capture = draw.
 */
export type XqColor = "w" | "b";
export type XqKind = "K" | "A" | "E" | "H" | "R" | "C" | "P";
export type XqCell = string | null; // "K".."P" red, "k".."p" black
export type XqState = { board: XqCell[][]; turn: XqColor; quiet: number }; // board[rank 0..9][file 0..8]
export type XqMove = { from: string; to: string; capture: boolean };

const FILES = "abcdefghi";
export const xqSq = (r: number, f: number) => FILES[f] + r;
export const xqPos = (s: string): [number, number] => [Number(s.slice(1)), FILES.indexOf(s[0])];
const on = (r: number, f: number) => r >= 0 && r <= 9 && f >= 0 && f <= 8;
export const xqColorOf = (c: XqCell): XqColor | null => (c === null ? null : c === c.toUpperCase() ? "w" : "b");
const kindOf = (c: string) => c.toUpperCase() as XqKind;
const inPalace = (r: number, f: number, c: XqColor) => f >= 3 && f <= 5 && (c === "w" ? r <= 2 : r >= 7);
const ownSide = (r: number, c: XqColor) => (c === "w" ? r <= 4 : r >= 5);

export const XIANGQI_START = "xq|rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR|w|0";

export function xqParse(s: string): XqState | null {
  const p = s.split("|");
  if (p.length !== 4 || p[0] !== "xq") return null;
  const rows = p[1].split("/");
  if (rows.length !== 10) return null;
  const board: XqCell[][] = Array.from({ length: 10 }, () => Array<XqCell>(9).fill(null));
  for (let i = 0; i < 10; i++) {
    const r = 9 - i;
    let f = 0;
    for (const ch of rows[i]) {
      if (/[1-9]/.test(ch)) f += Number(ch);
      else if ("KAEHRCPkaehrcp".includes(ch)) { if (f > 8) return null; board[r][f++] = ch; }
      else return null;
    }
    if (f !== 9) return null;
  }
  const turn = p[2] === "b" ? "b" : p[2] === "w" ? "w" : null;
  if (!turn) return null;
  return { board, turn, quiet: Math.max(0, Number(p[3]) || 0) };
}

export function xqString(s: XqState): string {
  const rows: string[] = [];
  for (let r = 9; r >= 0; r--) {
    let row = "";
    let run = 0;
    for (let f = 0; f < 9; f++) {
      const c = s.board[r][f];
      if (c === null) run++;
      else { if (run) row += run; run = 0; row += c; }
    }
    if (run) row += run;
    rows.push(row);
  }
  return `xq|${rows.join("/")}|${s.turn}|${s.quiet}`;
}

export function xqGeneral(b: XqCell[][], c: XqColor): [number, number] | null {
  const g = c === "w" ? "K" : "k";
  for (let r = 0; r <= 9; r++) for (let f = 3; f <= 5; f++) if (b[r][f] === g) return [r, f];
  return null;
}

/** Is square (r, f) attacked by side `by`? (Includes the flying-general rule.) */
export function xqAttacked(b: XqCell[][], r: number, f: number, by: XqColor): boolean {
  const up = (k: XqKind) => (by === "w" ? k : k.toLowerCase());
  // chariots, cannons and the flying general along the four lines
  for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    let rr = r + dr, ff = f + df, screens = 0;
    while (on(rr, ff)) {
      const c = b[rr][ff];
      if (c !== null) {
        if (screens === 0) {
          if (c === up("R")) return true;
          if (c === up("K") && df === 0) return true; // generals facing
        } else if (screens === 1 && c === up("C")) return true;
        screens++;
        if (screens > 1) break;
      }
      rr += dr; ff += df;
    }
  }
  // horses: a horse at (r+dr, f+df) attacks us if its leg (next to the horse, toward us) is empty
  for (const [dr, df, lr, lf] of [
    [2, 1, 1, 1], [2, -1, 1, -1], [-2, 1, -1, 1], [-2, -1, -1, -1],
    [1, 2, 1, 1], [-1, 2, -1, 1], [1, -2, 1, -1], [-1, -2, -1, -1],
  ] as const) {
    const hr = r + dr, hf = f + df;
    if (on(hr, hf) && b[hr][hf] === up("H") && b[r + lr][f + lf] === null) return true;
  }
  // soldiers: from below (red) / above (black), and from the sides once across the river
  const fwd = by === "w" ? -1 : 1; // where an attacking soldier stands relative to us
  if (on(r + fwd, f) && b[r + fwd][f] === up("P")) return true;
  for (const df of [1, -1]) {
    if (on(r, f + df) && b[r][f + df] === up("P") && !ownSide(r, by)) return true;
  }
  // the general itself, one step in the palace
  for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (on(r + dr, f + df) && b[r + dr][f + df] === up("K")) return true;
  }
  // advisors (diagonal one step)
  for (const [dr, df] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    if (on(r + dr, f + df) && b[r + dr][f + df] === up("A")) return true;
  }
  // elephants (two diagonally, eye empty)
  for (const [dr, df] of [[2, 2], [2, -2], [-2, 2], [-2, -2]] as const) {
    if (on(r + dr, f + df) && b[r + dr][f + df] === up("E") && b[r + dr / 2][f + df / 2] === null) return true;
  }
  return false;
}

function pseudo(s: XqState): XqMove[] {
  const b = s.board;
  const me = s.turn;
  const out: XqMove[] = [];
  const add = (r: number, f: number, tr: number, tf: number) => {
    if (!on(tr, tf)) return;
    const t = b[tr][tf];
    if (t !== null && xqColorOf(t) === me) return;
    out.push({ from: xqSq(r, f), to: xqSq(tr, tf), capture: t !== null });
  };
  for (let r = 0; r <= 9; r++) {
    for (let f = 0; f <= 8; f++) {
      const c = b[r][f];
      if (c === null || xqColorOf(c) !== me) continue;
      const k = kindOf(c);
      if (k === "K") {
        for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inPalace(r + dr, f + df, me)) add(r, f, r + dr, f + df);
      } else if (k === "A") {
        for (const [dr, df] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (inPalace(r + dr, f + df, me)) add(r, f, r + dr, f + df);
      } else if (k === "E") {
        for (const [dr, df] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
          const tr = r + dr, tf = f + df;
          if (on(tr, tf) && ownSide(tr, me) && b[r + dr / 2][f + df / 2] === null) add(r, f, tr, tf);
        }
      } else if (k === "H") {
        for (const [lr, lf, a, c2] of [[1, 0, 2, 1], [1, 0, 2, -1], [-1, 0, -2, 1], [-1, 0, -2, -1], [0, 1, 1, 2], [0, 1, -1, 2], [0, -1, 1, -2], [0, -1, -1, -2]]) {
          if (on(r + lr, f + lf) && b[r + lr][f + lf] === null) add(r, f, r + a, f + c2);
        }
      } else if (k === "R" || k === "C") {
        for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          let tr = r + dr, tf = f + df, jumped = false;
          while (on(tr, tf)) {
            const t = b[tr][tf];
            if (k === "R") {
              if (t === null) add(r, f, tr, tf);
              else { add(r, f, tr, tf); break; }
            } else if (!jumped) {
              if (t === null) add(r, f, tr, tf);
              else jumped = true;
            } else if (t !== null) {
              if (xqColorOf(t) !== me) add(r, f, tr, tf);
              break;
            }
            tr += dr; tf += df;
          }
        }
      } else if (k === "P") {
        const fwd = me === "w" ? 1 : -1;
        add(r, f, r + fwd, f);
        if (!ownSide(r, me)) { add(r, f, r, f + 1); add(r, f, r, f - 1); }
      }
    }
  }
  return out;
}

function applyRaw(b: XqCell[][], m: XqMove): XqCell[][] {
  const nb = b.map((row) => row.slice());
  const [fr, ff] = xqPos(m.from);
  const [tr, tf] = xqPos(m.to);
  nb[tr][tf] = nb[fr][ff];
  nb[fr][ff] = null;
  return nb;
}

export function xqInCheck(b: XqCell[][], c: XqColor): boolean {
  const g = xqGeneral(b, c);
  if (!g) return true;
  return xqAttacked(b, g[0], g[1], c === "w" ? "b" : "w");
}

export function xqLegalMoves(s: XqState): XqMove[] {
  return pseudo(s).filter((m) => !xqInCheck(applyRaw(s.board, m), s.turn));
}

export function xqPlay(s: XqState, m: XqMove): { state: XqState; san: string } {
  const [fr, ff] = xqPos(m.from);
  const piece = kindOf(s.board[fr][ff] as string);
  const board = applyRaw(s.board, m);
  const turn: XqColor = s.turn === "w" ? "b" : "w";
  const next: XqState = { board, turn, quiet: m.capture ? 0 : s.quiet + 1 };
  const check = xqInCheck(board, turn) ? "+" : "";
  return { state: next, san: `${piece}${m.from}${m.capture ? "x" : "-"}${m.to}${check}` };
}

export type XqStatus = { over: false } | { over: true; winner: XqColor | null; reason: string };
export function xqStatus(s: XqState): XqStatus {
  if (xqLegalMoves(s).length === 0) {
    return { over: true, winner: s.turn === "w" ? "b" : "w", reason: xqInCheck(s.board, s.turn) ? "checkmate" : "stalemate" };
  }
  if (s.quiet >= 120) return { over: true, winner: null, reason: "sixty-moves" };
  return { over: false };
}

export function xqFind(s: XqState, from: string, to: string): XqMove | null {
  return xqLegalMoves(s).find((m) => m.from === from && m.to === to) ?? null;
}
