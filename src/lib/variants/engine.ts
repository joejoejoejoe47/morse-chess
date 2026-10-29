/**
 * Morse Chess variants (owner t205u): Horde, Atomic, King of the Hill and Breakthrough.
 * One small chess engine that reads and writes normal FEN strings, so the games can use the
 * same boards (2D / 3D / AN / LG) and the same server game rows as normal chess.
 * php/src/Variants.php is a line-by-line copy of this file; keep the two in step.
 */
// heist, parade and cavalry are Morse originals (owner t209u: "make up 2-3 of your own games").
// mini = Gardner minichess on 5x5 (owner t220u). It plays in the a1-e5 corner of a normal 8x8 FEN.
export type VariantId = "horde" | "atomic" | "koth" | "breakthrough" | "heist" | "parade" | "cavalry" | "mini";
export const VARIANTS: VariantId[] = ["horde", "atomic", "koth", "breakthrough", "heist", "parade", "cavalry", "mini"];

/** Squares per side of the variant's board (8, or 5 for Minichess). */
export const sizeOf = (v: VariantId): number => (v === "mini" ? 5 : 8);
export type Color = "w" | "b";
export type Kind = "k" | "q" | "r" | "b" | "n" | "p";
export type Piece = { c: Color; t: Kind };
export type Board = (Piece | null)[][]; // [rank index 0..7 (0 = rank 1)][file index 0..7]
export type VState = {
  board: Board;
  turn: Color;
  castle: string; // "KQkq" subset or ""
  ep: string | null; // en-passant target square, e.g. "e3"
  half: number; // half-move clock (fifty-move rule)
  full: number; // full-move number
};
export type VMove = { from: string; to: string; promo?: Kind; castle?: "K" | "Q"; ep?: boolean; double?: boolean; capture?: boolean };
export type VStatus = { over: false } | { over: true; winner: Color | null; reason: string };
export type VResult = { state: VState; san: string; exploded: string[]; captured: boolean };

export const isVariant = (v: unknown): v is VariantId => typeof v === "string" && (VARIANTS as string[]).includes(v);

const FILES = "abcdefgh";
export const sqName = (r: number, f: number) => FILES[f] + (r + 1);
export const sqPos = (s: string): [number, number] => [Number(s[1]) - 1, FILES.indexOf(s[0])];
const on = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;
export const other = (c: Color): Color => (c === "w" ? "b" : "w");

export const START_FEN: Record<VariantId, string> = {
  horde: "rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq - 0 1",
  atomic: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  koth: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  breakthrough: "pppppppp/pppppppp/8/8/8/8/PPPPPPPP/PPPPPPPP w - - 0 1",
  heist: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  parade: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  cavalry: "rnbqkbnr/nnnnnnnn/8/8/8/8/NNNNNNNN/RNBQKBNR w KQkq - 0 1",
  mini: "8/8/8/rnbqk3/ppppp3/8/PPPPP3/RNBQK3 w - - 0 1",
};

export const VARIANT_INFO: Record<VariantId, { name: string; short: string; rules: string[] }> = {
  horde: {
    name: "Horde",
    short: "36 pawns vs an army",
    rules: [
      "White is the Horde: 36 pawns and no king. Black has the normal army.",
      "Pawns on White's first two ranks may move two squares.",
      "Black wins by capturing every White pawn and piece.",
      "White wins by checkmating the Black king.",
    ],
  },
  atomic: {
    name: "Atomic",
    short: "Every capture explodes",
    rules: [
      "Normal chess moves, but every capture is an explosion.",
      "The explosion removes the captured piece, the capturing piece and every non-pawn piece next to it.",
      "Blow up the enemy king to win (or checkmate it). Kings can't capture.",
      "You may never blow up your own king. Kings standing side by side are never in check.",
    ],
  },
  koth: {
    name: "King of the Hill",
    short: "Get your king to the middle",
    rules: [
      "Normal chess, plus a second way to win:",
      "Walk your king onto one of the 4 centre squares (d4, e4, d5, e5) and you win at once.",
      "Checkmate still wins too.",
    ],
  },
  breakthrough: {
    name: "Breakthrough",
    short: "Race a pawn home",
    rules: [
      "Each side has 16 pawns on its first two rows.",
      "A pawn moves one square forward, straight or diagonally, onto an empty square.",
      "A pawn captures only diagonally forward.",
      "First pawn to reach the far row wins. Lose all your pawns and you lose.",
    ],
  },
  heist: {
    name: "Queen Heist",
    short: "Steal the queen, win the game",
    rules: [
      "A Morse original. Normal chess moves and the normal army.",
      "Capture the enemy queen and you win on the spot.",
      "Checkmate still wins too, so guard your king AND your queen.",
      "Pawns that reach the far row may promote, but only the starting queen is the prize while she lives.",
    ],
  },
  parade: {
    name: "Pawn Parade",
    short: "First pawn home wins",
    rules: [
      "A Morse original. Normal chess, but pawns never promote.",
      "The first pawn to reach the far row wins the game at once.",
      "Checkmate still wins too.",
    ],
  },
  cavalry: {
    name: "Cavalry Charge",
    short: "Every pawn is a knight",
    rules: [
      "A Morse original. Your 8 pawns are replaced by 8 more knights: 10 knights a side!",
      "Everything else is normal chess: checkmate wins, castling works once the knights get out of the way.",
    ],
  },
  mini: {
    name: "Minichess 5×5",
    short: "Chess on a 5×5 board",
    rules: [
      "Gardner minichess: a 5×5 board, files a–e and ranks 1–5.",
      "Each side has one rook, knight, bishop, queen and king on its back row, and five pawns in front.",
      "Pieces move like normal chess. Pawns move one square only (no double step, so no en passant).",
      "A pawn that reaches the far row promotes to a queen, rook, bishop or knight. There is no castling.",
      "Checkmate wins. Stalemate is a draw.",
    ],
  },
};

// ── FEN ───────────────────────────────────────────────────────────────────

export function parseFen(fen: string): VState {
  const [place = "8/8/8/8/8/8/8/8", turn = "w", castle = "-", ep = "-", half = "0", full = "1"] = fen.trim().split(/\s+/);
  const board: Board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  const rows = place.split("/");
  for (let i = 0; i < 8; i++) {
    const r = 7 - i;
    let f = 0;
    for (const ch of rows[i] ?? "") {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        const t = ch.toLowerCase() as Kind;
        if (f < 8 && "kqrbnp".includes(t)) board[r][f] = { c: ch === t ? "b" : "w", t };
        f++;
      }
    }
  }
  return {
    board,
    turn: turn === "b" ? "b" : "w",
    castle: castle === "-" ? "" : castle.replace(/[^KQkq]/g, ""),
    ep: /^[a-h][36]$/.test(ep) ? ep : null,
    half: Math.max(0, Number(half) || 0),
    full: Math.max(1, Number(full) || 1),
  };
}

export function toFen(s: VState): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = s.board[r][f];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p.c === "w" ? p.t.toUpperCase() : p.t;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join("/")} ${s.turn} ${s.castle || "-"} ${s.ep ?? "-"} ${s.half} ${s.full}`;
}

// ── attacks ───────────────────────────────────────────────────────────────

const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KG = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Is square (r,f) attacked by any piece of colour `by`? */
export function attacked(board: Board, r: number, f: number, by: Color): boolean {
  const pr = by === "w" ? r - 1 : r + 1;
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
  for (const [dirs, a, b] of [[DIAG, "b", "q"], [ORTH, "r", "q"]] as const) {
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (on(rr, ff)) {
        const p = board[rr][ff];
        if (p) {
          if (p.c === by && (p.t === a || p.t === b)) return true;
          break;
        }
        rr += dr; ff += df;
      }
    }
  }
  return false;
}

export function kingOf(board: Board, c: Color): [number, number] | null {
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = board[r][f];
    if (p && p.c === c && p.t === "k") return [r, f];
  }
  return null;
}

function kingsTouch(board: Board): boolean {
  const a = kingOf(board, "w");
  const b = kingOf(board, "b");
  return !!a && !!b && Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;
}

/** Is `c`'s king in check? (Atomic: kings side by side are never in check.) */
export function inCheck(v: VariantId, s: VState, c: Color = s.turn): boolean {
  if (v === "breakthrough") return false;
  const k = kingOf(s.board, c);
  if (!k) return false;
  if (v === "atomic" && kingsTouch(s.board)) return false;
  return attacked(s.board, k[0], k[1], other(c));
}

// ── move generation ───────────────────────────────────────────────────────

function pseudo(v: VariantId, s: VState): VMove[] {
  const { board, turn } = s;
  const out: VMove[] = [];
  const n = sizeOf(v);
  // Moves stay on the variant's N×N board (Minichess: a1-e5).
  const on = (r: number, f: number) => r >= 0 && r < n && f >= 0 && f < n;
  if (v === "breakthrough") {
    const d = turn === "w" ? 1 : -1;
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p || p.c !== turn) continue;
      const rr = r + d;
      if (rr < 0 || rr > 7) continue;
      if (!board[rr][f]) out.push({ from: sqName(r, f), to: sqName(rr, f) });
      for (const ff of [f - 1, f + 1]) {
        if (ff < 0 || ff > 7) continue;
        const t = board[rr][ff];
        if (t && t.c === turn) continue;
        out.push({ from: sqName(r, f), to: sqName(rr, ff), capture: !!t });
      }
    }
    return out;
  }
  const last = turn === "w" ? n - 1 : 0;
  const ep = s.ep ? sqPos(s.ep) : null;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = board[r][f];
    if (!p || p.c !== turn) continue;
    const from = sqName(r, f);
    const add = (rr: number, ff: number, extra: Partial<VMove> = {}) => {
      const to = sqName(rr, ff);
      if (p.t === "p" && rr === last && v !== "parade") for (const promo of ["q", "r", "b", "n"] as Kind[]) out.push({ from, to, promo, ...extra });
      else out.push({ from, to, ...extra });
    };
    if (p.t === "p") {
      const d = turn === "w" ? 1 : -1;
      if (on(r + d, f) && !board[r + d][f]) {
        add(r + d, f);
        // Horde: White pawns on ranks 1 and 2 may double-step.
        // Minichess pawns never double-step.
        const canDouble = v === "mini" ? false : turn === "w" ? r === 1 || (v === "horde" && r === 0) : r === 6;
        if (canDouble && on(r + 2 * d, f) && !board[r + 2 * d][f]) out.push({ from, to: sqName(r + 2 * d, f), double: true });
      }
      for (const df of [-1, 1]) {
        const rr = r + d, ff = f + df;
        if (!on(rr, ff)) continue;
        const t = board[rr][ff];
        if (t && t.c !== turn) add(rr, ff, { capture: true });
        else if (!t && ep && ep[0] === rr && ep[1] === ff) {
          const victim = board[r][ff];
          if (victim && victim.c !== turn && victim.t === "p") out.push({ from, to: sqName(rr, ff), ep: true, capture: true });
        }
      }
      continue;
    }
    if (p.t === "n" || p.t === "k") {
      for (const [dr, df] of p.t === "n" ? KN : KG) {
        const rr = r + dr, ff = f + df;
        if (!on(rr, ff)) continue;
        const t = board[rr][ff];
        if (!t) out.push({ from, to: sqName(rr, ff) });
        else if (t.c !== turn && !(v === "atomic" && p.t === "k")) out.push({ from, to: sqName(rr, ff), capture: true });
      }
      if (p.t === "k") {
        const home = turn === "w" ? 0 : 7;
        const [ks, qs] = turn === "w" ? ["K", "Q"] : ["k", "q"];
        if (v !== "mini" && r === home && f === 4 && !inCheck(v, s, turn)) {
          const safe = (ff: number) => {
            if (v !== "atomic") return !attacked(board, home, ff, other(turn));
            const b2 = board.map((row) => row.slice());
            b2[home][ff] = b2[home][4];
            b2[home][4] = null;
            return !inCheck(v, { ...s, board: b2 }, turn);
          };
          const rk = board[home][7], rq = board[home][0];
          if (s.castle.includes(ks) && rk?.t === "r" && rk.c === turn && !board[home][5] && !board[home][6] && safe(5) && safe(6))
            out.push({ from, to: sqName(home, 6), castle: "K" });
          if (s.castle.includes(qs) && rq?.t === "r" && rq.c === turn && !board[home][1] && !board[home][2] && !board[home][3] && safe(3) && safe(2))
            out.push({ from, to: sqName(home, 2), castle: "Q" });
        }
      }
      continue;
    }
    const dirs = p.t === "b" ? DIAG : p.t === "r" ? ORTH : [...DIAG, ...ORTH];
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (on(rr, ff)) {
        const t = board[rr][ff];
        if (t) {
          if (t.c !== turn) out.push({ from, to: sqName(rr, ff), capture: true });
          break;
        }
        out.push({ from, to: sqName(rr, ff) });
        rr += dr; ff += df;
      }
    }
  }
  return out;
}

/** Plays a move (no legality check). Returns the new state, the squares that exploded (Atomic) and whether it captured. */
export function play(v: VariantId, s: VState, m: VMove): { state: VState; exploded: string[]; captured: boolean } {
  const board = s.board.map((row) => row.slice());
  const [fr, ff] = sqPos(m.from);
  const [tr, tf] = sqPos(m.to);
  const p = board[fr][ff];
  if (!p) return { state: s, exploded: [], captured: false };
  let castle = s.castle;
  const victim = m.ep ? board[fr][tf] : board[tr][tf];
  const captured = !!victim && victim.c !== p.c;
  board[fr][ff] = null;
  if (m.ep) board[fr][tf] = null;
  board[tr][tf] = m.promo ? { c: p.c, t: m.promo } : p;
  if (m.castle) {
    const home = p.c === "w" ? 0 : 7;
    if (m.castle === "K") { board[home][5] = board[home][7]; board[home][7] = null; }
    else { board[home][3] = board[home][0]; board[home][0] = null; }
  }
  const exploded: string[] = [];
  if (v === "atomic" && captured) {
    board[tr][tf] = null;
    exploded.push(m.to);
    for (const [dr, df] of KG) {
      const rr = tr + dr, f2 = tf + df;
      if (!on(rr, f2)) continue;
      const q = board[rr][f2];
      if (q && q.t !== "p") { board[rr][f2] = null; exploded.push(sqName(rr, f2)); }
    }
  }
  if (p.t === "k") castle = castle.replace(p.c === "w" ? /[KQ]/g : /[kq]/g, "");
  const strip = (sq: string, ch: string) => {
    if (m.from === sq || m.to === sq || exploded.includes(sq)) castle = castle.replace(ch, "");
  };
  strip("h1", "K"); strip("a1", "Q"); strip("h8", "k"); strip("a8", "q");
  if (v === "atomic") {
    if (!kingOf(board, "w")) castle = castle.replace(/[KQ]/g, "");
    if (!kingOf(board, "b")) castle = castle.replace(/[kq]/g, "");
  }
  // A Horde pawn's double step from rank 1 leaves no en-passant square (FEN only has ranks 3 and 6).
  const ep = m.double && (fr === 1 || fr === 6) ? sqName((fr + tr) / 2, ff) : null;
  const half = p.t === "p" || captured ? 0 : s.half + 1;
  const full = s.turn === "b" ? s.full + 1 : s.full;
  return { state: { board, turn: other(s.turn), castle, ep, half, full }, exploded, captured };
}

/** Is the move legal for the side that made it, judged on the position after it? */
function keepsKing(v: VariantId, after: VState, mover: Color): boolean {
  if (v === "breakthrough") return true;
  if (v === "horde" && mover === "w") return true; // the Horde has no king
  if (v === "atomic") {
    if (!kingOf(after.board, mover)) return false; // never blow up your own king
    if (!kingOf(after.board, other(mover))) return true; // blowing up theirs wins at once
  }
  return !inCheck(v, after, mover);
}

export function legalMoves(v: VariantId, s: VState): VMove[] {
  if (statusOf(v, s, false).over) return [];
  return pseudo(v, s).filter((m) => keepsKing(v, play(v, s, m).state, s.turn));
}

export function legalTargets(v: VariantId, s: VState, from: string): string[] {
  return [...new Set(legalMoves(v, s).filter((m) => m.from === from).map((m) => m.to))];
}

function count(board: Board, c: Color): number {
  let n = 0;
  for (const row of board) for (const p of row) if (p?.c === c) n++;
  return n;
}

const HILL = new Set(["d4", "e4", "d5", "e5"]);

/** Game over? `deep` = also check for no legal moves (mate / stalemate). */
function statusOf(v: VariantId, s: VState, deep: boolean): VStatus {
  const prev = other(s.turn);
  if (v === "breakthrough") {
    for (let f = 0; f < 8; f++) {
      if (s.board[7][f]?.c === "w") return { over: true, winner: "w", reason: "A White pawn broke through!" };
      if (s.board[0][f]?.c === "b") return { over: true, winner: "b", reason: "A Black pawn broke through!" };
    }
    if (count(s.board, "w") === 0) return { over: true, winner: "b", reason: "Black captured every White pawn." };
    if (count(s.board, "b") === 0) return { over: true, winner: "w", reason: "White captured every Black pawn." };
  }
  if (v === "horde") {
    if (count(s.board, "w") === 0) return { over: true, winner: "b", reason: "Black wiped out the Horde!" };
  }
  if (v === "atomic") {
    const wk = kingOf(s.board, "w"), bk = kingOf(s.board, "b");
    if (!wk && !bk) return { over: true, winner: prev, reason: "Both kings blew up — the mover wins." };
    if (!wk) return { over: true, winner: "b", reason: "BOOM! The White king exploded." };
    if (!bk) return { over: true, winner: "w", reason: "BOOM! The Black king exploded." };
  }
  if (v === "heist") {
    const queens = (c: Color) => s.board.reduce((n, row) => n + row.filter((p) => p && p.c === c && p.t === "q").length, 0);
    if (queens("w") === 0 && queens("b") > 0) return { over: true, winner: "b", reason: "Black stole the White queen!" };
    if (queens("b") === 0 && queens("w") > 0) return { over: true, winner: "w", reason: "White stole the Black queen!" };
  }
  if (v === "parade") {
    for (let f = 0; f < 8; f++) {
      if (s.board[7][f]?.c === "w" && s.board[7][f]?.t === "p") return { over: true, winner: "w", reason: "A White pawn finished the parade!" };
      if (s.board[0][f]?.c === "b" && s.board[0][f]?.t === "p") return { over: true, winner: "b", reason: "A Black pawn finished the parade!" };
    }
  }
  if (v === "koth") {
    for (const c of ["w", "b"] as Color[]) {
      const k = kingOf(s.board, c);
      if (k && HILL.has(sqName(k[0], k[1]))) return { over: true, winner: c, reason: `The ${c === "w" ? "White" : "Black"} king took the hill!` };
    }
  }
  if (deep) {
    const any = pseudo(v, s).some((m) => keepsKing(v, play(v, s, m).state, s.turn));
    if (!any) {
      if (v === "breakthrough") return { over: true, winner: prev, reason: `${s.turn === "w" ? "White" : "Black"} has no moves left.` };
      if (inCheck(v, s, s.turn)) return { over: true, winner: prev, reason: "Checkmate!" };
      return { over: true, winner: null, reason: "Stalemate — nobody can move. Draw." };
    }
  }
  if (s.half >= 100) return { over: true, winner: null, reason: "50 moves with no capture or pawn move. Draw." };
  if (s.full > 200) return { over: true, winner: null, reason: "200 moves played. Draw." };
  return { over: false };
}

export function status(v: VariantId, s: VState): VStatus {
  return statusOf(v, s, true);
}

// ── SAN ───────────────────────────────────────────────────────────────────

export function sanOf(v: VariantId, s: VState, m: VMove, legal: VMove[] = legalMoves(v, s)): string {
  const [fr, ff] = sqPos(m.from);
  const p = s.board[fr][ff];
  if (!p) return m.to;
  let san: string;
  if (m.castle) san = m.castle === "K" ? "O-O" : "O-O-O";
  else if (p.t === "p" && v !== "breakthrough") {
    san = (m.capture ? m.from[0] + "x" : "") + m.to + (m.promo ? "=" + m.promo.toUpperCase() : "");
  } else if (v === "breakthrough") {
    san = m.from + (m.capture ? "x" : "-") + m.to;
  } else {
    const twins = legal.filter((o) => o.to === m.to && o.from !== m.from && s.board[sqPos(o.from)[0]][sqPos(o.from)[1]]?.t === p.t);
    let dis = "";
    if (twins.length) {
      const sameFile = twins.some((o) => o.from[0] === m.from[0]);
      const sameRank = twins.some((o) => o.from[1] === m.from[1]);
      dis = !sameFile ? m.from[0] : !sameRank ? m.from[1] : m.from;
    }
    san = p.t.toUpperCase() + dis + (m.capture ? "x" : "") + m.to;
  }
  const after = play(v, s, m).state;
  const st = status(v, after);
  if (st.over && st.winner === s.turn && v !== "breakthrough") san += "#";
  else if (inCheck(v, after, after.turn)) san += "+";
  return san;
}

/** Find the legal move from→to (with promotion) and play it. Null if illegal. */
export function tryMove(v: VariantId, fen: string, from: string, to: string, promo?: string | null): VResult | null {
  const s = parseFen(fen);
  const legal = legalMoves(v, s);
  const cands = legal.filter((m) => m.from === from && m.to === to);
  if (!cands.length) return null;
  const m = cands.find((c) => (c.promo ?? null) === (promo ?? null)) ?? (cands.length === 1 && !cands[0].promo ? cands[0] : null);
  if (!m) return null;
  const san = sanOf(v, s, m, legal);
  const res = play(v, s, m);
  return { state: res.state, san, exploded: res.exploded, captured: res.captured };
}

export function needsPromotion(v: VariantId, fen: string, from: string, to: string): boolean {
  const s = parseFen(fen);
  return legalMoves(v, s).some((m) => m.from === from && m.to === to && !!m.promo);
}

/** Squares that blew up on a move (for the explosion effect), worked out from the position before it. */
export function explosionOf(fenBefore: string, from: string, to: string, promo?: string | null): string[] {
  const r = tryMove("atomic", fenBefore, from, to, promo ?? "q");
  return r?.exploded ?? [];
}

// ── bot ───────────────────────────────────────────────────────────────────

const VAL: Record<Kind, number> = { p: 100, n: 310, b: 330, r: 500, q: 950, k: 0 };

/** Score for White (positive = good for White). */
export function evaluate(v: VariantId, s: VState): number {
  let score = 0;
  const n = sizeOf(v);
  const mid = (n - 1) / 2;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = s.board[r][f];
    if (!p) continue;
    const adv = p.c === "w" ? r : n - 1 - r;
    const centre = mid - Math.max(Math.abs(mid - r), Math.abs(mid - f));
    let val = VAL[p.t];
    if (v === "breakthrough") val = 100 + adv * adv * 6 + (f === 0 || f === 7 ? 0 : 4);
    else if (p.t === "p") val += v === "parade" ? adv * adv * 9 : adv * (v === "horde" && p.c === "w" ? 5 : 8);
    else if (p.t === "q" && v === "heist") val += 2500;
    else if (p.t === "n" || p.t === "b") val += centre * 8;
    if (p.t === "k" && v === "koth") val += centre * 60;
    if (p.t === "k" && v !== "koth") val -= centre * 6;
    score += p.c === "w" ? val : -val;
  }
  if (v === "atomic") {
    // Pieces next to your king are bombs waiting to go off.
    for (const c of ["w", "b"] as Color[]) {
      const k = kingOf(s.board, c);
      if (!k) continue;
      let near = 0;
      for (const [dr, df] of KG) {
        const q = on(k[0] + dr, k[1] + df) ? s.board[k[0] + dr][k[1] + df] : null;
        if (q && q.c === c && q.t !== "p") near++;
      }
      score += (c === "w" ? -1 : 1) * near * 25;
    }
  }
  return score;
}

const WIN = 1_000_000;

function ordered(v: VariantId, s: VState, moves: VMove[]): VMove[] {
  const val = (m: VMove) => {
    let k = 0;
    if (m.capture) {
      const [r, f] = sqPos(m.to);
      const t = s.board[r][f];
      k += 10 + (t ? VAL[t.t] / 100 : 1);
    }
    if (m.promo === "q") k += 9;
    if (v === "koth" && HILL.has(m.to)) k += 20;
    return -k;
  };
  return moves.slice().sort((a, b) => val(a) - val(b));
}

function negamax(v: VariantId, s: VState, depth: number, alpha: number, beta: number, ply: number, deadline: number): number {
  const st = status(v, s);
  if (st.over) {
    if (!st.winner) return 0;
    return st.winner === s.turn ? WIN - ply : -WIN + ply;
  }
  if (depth <= 0 || Date.now() > deadline) {
    const e = evaluate(v, s);
    return s.turn === "w" ? e : -e;
  }
  let best = -Infinity;
  for (const m of ordered(v, s, legalMoves(v, s))) {
    const sc = -negamax(v, play(v, s, m).state, depth - 1, -beta, -alpha, ply + 1, deadline);
    if (sc > best) best = sc;
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  return best;
}

/** MorseBot for the variants: iterative deepening alpha-beta with a time budget. */
export function botMove(v: VariantId, fen: string, budgetMs = 700): VMove | null {
  const s = parseFen(fen);
  const moves = ordered(v, s, legalMoves(v, s));
  if (!moves.length) return null;
  const deadline = Date.now() + budgetMs;
  let pick = moves[0];
  for (let depth = 1; depth <= 4; depth++) {
    let best = -Infinity;
    let bestMoves: VMove[] = [];
    for (const m of moves) {
      const sc = -negamax(v, play(v, s, m).state, depth - 1, -Infinity, -best + 6, 1, deadline);
      if (sc > best + 5) { best = sc; bestMoves = [m]; }
      else if (sc >= best - 5) bestMoves.push(m);
      if (Date.now() > deadline) break;
    }
    if (Date.now() > deadline && depth > 1) break;
    pick = bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? pick;
    if (best >= WIN - 100) break;
  }
  return pick;
}
