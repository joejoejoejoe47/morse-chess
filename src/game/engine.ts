import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";

export type Side = "w" | "b";

const VALUE: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

export function evaluate(chess: Chess) {
  if (chess.isCheckmate()) return chess.turn() === "w" ? -200000 : 200000;
  if (chess.isDraw()) return 0;
  const board = chess.board();
  let score = 0;
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece || piece.type === "k") continue;
      const center = 3.5 - Math.abs(file - 3.5) + (3.5 - Math.abs(rank - 3.5));
      let bonus = center * (piece.type === "p" ? 4 : 2);
      if (piece.type === "n" || piece.type === "b") bonus += 6;
      const value = VALUE[piece.type] + bonus;
      score += piece.color === "w" ? value : -value;
    }
  }
  if (chess.inCheck()) score += chess.turn() === "w" ? -35 : 35;
  return score;
}

function ordered(chess: Chess) {
  return chess.moves({ verbose: true }).sort((a, b) => {
    const av = a.captured ? VALUE[a.captured] - VALUE[a.piece] / 10 : 0;
    const bv = b.captured ? VALUE[b.captured] - VALUE[b.piece] / 10 : 0;
    return bv - av;
  });
}

function minimax(chess: Chess, depth: number, alpha: number, beta: number) {
  if (depth === 0 || chess.isGameOver()) return evaluate(chess);
  const moves = ordered(chess);
  if (chess.turn() === "w") {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.max(best, minimax(chess, depth - 1, alpha, beta));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const move of moves) {
    chess.move(move);
    best = Math.min(best, minimax(chess, depth - 1, alpha, beta));
    chess.undo();
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

export function pickMove(chess: Chess) {
  const moves = ordered(chess);
  if (moves.length === 0) return null;
  const depth = moves.length > 24 ? 2 : 3;
  const sign = chess.turn() === "w" ? 1 : -1;
  let best = -Infinity;
  const bag: Move[] = [];
  for (const move of moves) {
    chess.move(move);
    const score = sign * minimax(chess, depth - 1, -Infinity, Infinity);
    chess.undo();
    if (score > best + 12) {
      best = score;
      bag.length = 0;
      bag.push(move);
    } else if (score >= best - 12) {
      if (score > best) best = score;
      bag.push(move);
    }
  }
  return bag[Math.floor(Math.random() * bag.length)] ?? moves[0];
}

export type Placed = { square: Square; type: PieceSymbol; color: Side };

export function piecesFromFen(fen: string): Placed[] {
  const rows = fen.split(" ")[0]?.split("/") ?? [];
  const out: Placed[] = [];
  rows.forEach((row, rankIndex) => {
    let file = 0;
    for (const ch of row) {
      const n = Number(ch);
      if (Number.isFinite(n) && n > 0) {
        file += n;
        continue;
      }
      const color: Side = ch === ch.toUpperCase() ? "w" : "b";
      const type = ch.toLowerCase() as PieceSymbol;
      const square = `${"abcdefgh"[file]}${8 - rankIndex}` as Square;
      out.push({ square, type, color });
      file += 1;
    }
  });
  return out;
}

export function rookSlide(move: Move): { from: Square; to: Square } | null {
  if (move.flags.includes("k")) {
    return move.color === "w"
      ? { from: "h1", to: "f1" }
      : { from: "h8", to: "f8" };
  }
  if (move.flags.includes("q")) {
    return move.color === "w"
      ? { from: "a1", to: "d1" }
      : { from: "a8", to: "d8" };
  }
  return null;
}

export function victimSquare(move: Move): Square | null {
  if (!move.captured) return null;
  if (move.flags.includes("e")) {
    return `${move.to[0]}${move.from[1]}` as Square;
  }
  return move.to;
}

export type Trial = {
  id: string;
  title: string;
  hint: string;
  fen: string;
  ok: (move: Move) => boolean;
};

export const TRIALS: Trial[] = [
  {
    id: "scholar",
    title: "Scholar's Blow",
    hint: "The light queen and the bishop already share the fatal square.",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    ok: (move) => move.piece === "q" && move.to === "f7" && move.captured === "p",
  },
  {
    id: "rank",
    title: "The Open Rank",
    hint: "The queen wants the back rank. The pawns have sealed the king's door.",
    fen: "6k1/5ppp/8/8/8/8/8/4Q1K1 w - - 0 1",
    ok: (move) => move.from === "e1" && move.to === "e8",
  },
  {
    id: "king",
    title: "The King's Blow",
    hint: "Only the king can take her, and he must.",
    fen: "8/8/8/3k4/8/8/4q3/3K4 w - - 0 1",
    ok: (move) => move.piece === "k" && move.captured === "q",
  },
];
