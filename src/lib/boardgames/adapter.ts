/**
 * Checkers and Chinese Chess inside the normal game screen (owner t377u): one small facade so
 * game-view and the boards can treat them like any other variant game row (games.fen holds the
 * state string, moves are from/to squares, a checkers jump chain is several moves by one side).
 */
import { CHECKERS_START, ckColorOf, ckFind, ckLegalMoves, ckParse, ckPlay, ckPos, ckSq, ckStatus, ckString, type CkState } from "./checkers";
import { XIANGQI_START, xqColorOf, xqFind, xqGeneral, xqInCheck, xqLegalMoves, xqParse, xqPlay, xqPos, xqSq, xqStatus, xqString, type XqState } from "./xiangqi";

export type BoardGameId = "checkers" | "xiangqi";
export const isBoardGame = (v: unknown): v is BoardGameId => v === "checkers" || v === "xiangqi";
export const BG_START: Record<BoardGameId, string> = { checkers: CHECKERS_START, xiangqi: XIANGQI_START };

/** Files x ranks of the playing grid (checkers squares; xiangqi points). */
export const bgDims = (v: BoardGameId) => (v === "checkers" ? { files: 8, ranks: 8 } : { files: 9, ranks: 10 });
export const bgSq = (v: BoardGameId, r: number, f: number) => (v === "checkers" ? ckSq(r, f) : xqSq(r, f));
export const bgPos = (v: BoardGameId, sq: string): [number, number] => (v === "checkers" ? ckPos(sq) : xqPos(sq));

/** One piece on the board, for drawing. kind: checkers "man"/"king"; xiangqi K A E H R C P. */
export type BgPiece = { sq: string; r: number; f: number; c: "w" | "b"; kind: string; king: boolean };

export function bgPieces(v: BoardGameId, fen: string): BgPiece[] {
  const out: BgPiece[] = [];
  if (v === "checkers") {
    const s = ckParse(fen);
    if (!s) return out;
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const c = s.board[r][f];
        if (c) out.push({ sq: ckSq(r, f), r, f, c: ckColorOf(c)!, kind: c === "K" || c === "k" ? "king" : "man", king: c === "K" || c === "k" });
      }
    return out;
  }
  const s = xqParse(fen);
  if (!s) return out;
  for (let r = 0; r < 10; r++)
    for (let f = 0; f < 9; f++) {
      const c = s.board[r][f];
      if (c) out.push({ sq: xqSq(r, f), r, f, c: xqColorOf(c)!, kind: c.toUpperCase(), king: c.toUpperCase() === "K" });
    }
  return out;
}

export function bgTurn(v: BoardGameId, fen: string): "w" | "b" {
  const s = v === "checkers" ? ckParse(fen) : xqParse(fen);
  return s?.turn ?? "w";
}

export function bgTargets(v: BoardGameId, fen: string, from: string): string[] {
  if (v === "checkers") {
    const s = ckParse(fen);
    return s ? ckLegalMoves(s).filter((m) => m.from === from).map((m) => m.to) : [];
  }
  const s = xqParse(fen);
  return s ? xqLegalMoves(s).filter((m) => m.from === from).map((m) => m.to) : [];
}

/** Squares whose piece must move now (checkers forced jump or a jump chain). */
export function bgMust(v: BoardGameId, fen: string): string[] {
  if (v !== "checkers") return [];
  const s = ckParse(fen);
  if (!s) return [];
  const legal = ckLegalMoves(s);
  return legal.some((m) => m.jump) ? [...new Set(legal.map((m) => m.from))] : [];
}

export type BgResult = { fen: string; turn: "w" | "b"; san: string; captured: string | null; crowned: boolean };

export function bgTry(v: BoardGameId, fen: string, from: string, to: string): BgResult | null {
  if (v === "checkers") {
    const s = ckParse(fen);
    const m = s && ckFind(s, from, to);
    if (!s || !m) return null;
    const r = ckPlay(s, m);
    return { fen: ckString(r.state), turn: r.state.turn, san: r.san, captured: m.jump, crowned: r.crowned };
  }
  const s = xqParse(fen);
  const m = s && xqFind(s, from, to);
  if (!s || !m) return null;
  const r = xqPlay(s, m);
  return { fen: xqString(r.state), turn: r.state.turn, san: r.san, captured: m.capture ? to : null, crowned: false };
}

export function bgStatus(v: BoardGameId, fen: string): { over: false } | { over: true; winner: "w" | "b" | null; reason: string } {
  if (v === "checkers") {
    const s = ckParse(fen);
    return s ? ckStatus(s) : { over: false };
  }
  const s = xqParse(fen);
  return s ? xqStatus(s) : { over: false };
}

export function bgReason(v: BoardGameId, reason: string, winnerIsYou: boolean | null): string {
  const map: Record<string, string> = {
    "no-moves": winnerIsYou ? "Your opponent has no moves left." : "You have no moves left.",
    "forty-moves": "40 moves with no capture. Draw.",
    checkmate: winnerIsYou ? "The enemy general is trapped. Checkmate!" : "Your general is trapped. Checkmate.",
    stalemate: winnerIsYou ? "Your opponent has no legal move." : "You have no legal move.",
    "sixty-moves": "60 moves with no capture. Draw.",
  };
  return map[reason] ?? reason;
}

/** The xiangqi general's point when it is in check (for the red glow), else null. */
export function bgCheckSq(v: BoardGameId, fen: string): string | null {
  if (v !== "xiangqi") return null;
  const s: XqState | null = xqParse(fen);
  if (!s || !xqInCheck(s.board, s.turn)) return null;
  const g = xqGeneral(s.board, s.turn);
  return g ? xqSq(g[0], g[1]) : null;
}

export const XQ_CHAR: Record<string, { w: string; b: string }> = {
  K: { w: "帥", b: "將" },
  A: { w: "仕", b: "士" },
  E: { w: "相", b: "象" },
  H: { w: "傌", b: "馬" },
  R: { w: "俥", b: "車" },
  C: { w: "炮", b: "砲" },
  P: { w: "兵", b: "卒" },
};
export const XQ_NAME: Record<string, string> = { K: "General", A: "Advisor", E: "Elephant", H: "Horse", R: "Chariot", C: "Cannon", P: "Soldier" };
export type { CkState, XqState };
