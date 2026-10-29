import { Chess } from "chess.js";

/**
 * A chess.js position for drawing a board. Variant positions (Horde has no White king,
 * Breakthrough has no kings at all) are not legal normal-chess FENs, so they load unvalidated.
 */
export function chessOf(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch {
    return new Chess(fen, { skipValidation: true });
  }
}

/** Rule overrides a variant game passes to the 2D / 3D boards (owner t205u). */
export type BoardRules = {
  /** Legal target squares for the piece on `from` (replaces chess.js move generation). */
  legalFor?: (from: string) => string[];
  /** The square to flash red as "in check" (null = none); undefined = normal chess rule. */
  checkSq?: string | null;
  /** Squares drawn dimmed / out of play (Apocalypse plays on 5x5). */
  dimmed?: ReadonlySet<string>;
  /** Atomic: an explosion centred on this square (id changes per blast). */
  blast?: { sq: string; id: string } | null;
  /** Squares per side (default 8). Small games (5x5) live in the a1 corner of the FEN. */
  size?: number;
  /**
   * Local games that run their own click logic (Apocalypse, Knight's Tour): the board just
   * reports every square click and shows the given selection / targets.
   */
  pick?: { selected: string | null; legal: readonly string[]; onSquare: (sq: string) => void } | null;
  /** Small text drawn on a square (Knight's Tour move numbers, Apocalypse centre marks). */
  labels?: Readonly<Record<string, string>>;
  /** Square colour overrides (Apocalypse: gold = White's move, red = Black's, crash). */
  tints?: Readonly<Record<string, string>>;
};
