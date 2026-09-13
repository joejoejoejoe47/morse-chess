import type { Square } from "chess.js";

const FILES = "abcdefgh";

export function squareToWorld(square: string): [number, number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return [file - 3.5, 0, 3.5 - rank];
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
