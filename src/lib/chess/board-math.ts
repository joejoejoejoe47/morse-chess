import type { Square } from "chess.js";

const FILES = "abcdefgh";

/**
 * Squares per side of the board being drawn (8 for chess, 5 for Minichess / Apocalypse).
 * Small games play in the a1 corner of an 8x8 FEN; the 3D board centres that N×N corner.
 * Only one game board is on screen at a time, so the board component sets this while mounted.
 */
let BOARD_N = 8;

export function setBoardSize(n: number) {
  BOARD_N = n >= 3 && n <= 8 ? Math.round(n) : 8;
}

export function boardSize() {
  return BOARD_N;
}

/** Centre offset for the current board size (3.5 on 8x8, 2 on 5x5). */
export function boardMid() {
  return (BOARD_N - 1) / 2;
}

export function squareToWorld(square: string, pitch = 1): [number, number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const mid = boardMid();
  return [(file - mid) * pitch, 0, (mid - rank) * pitch];
}

/** True when the square is on the current N×N board. */
export function onSizedBoard(square: string, n = BOARD_N) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return file >= 0 && file < n && rank >= 0 && rank < n;
}

export function indexToSquare(file: number, rank: number): Square {
  return `${FILES[file]}${rank + 1}` as Square;
}

export function isLightSquare(square: string) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return (file + rank) % 2 === 1;
}

export { FILES };
