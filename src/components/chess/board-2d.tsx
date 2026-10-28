import { useEffect, useMemo, useState } from "react";
import type { Square } from "chess.js";
import { FILES } from "@/lib/chess/board-math";
import { chessOf, type BoardRules } from "@/lib/chess/fen-board";
import type { Side } from "@/lib/mores-constants";
import { boardById, mysteryPair, type BoardSkin } from "@/lib/chess/board-skins";
import { cn } from "@/lib/utils";

/** The capture square and its 8 neighbours (Atomic explosion). */
export function blastZone(sq: string): Set<string> {
  const f = sq.charCodeAt(0) - 97;
  const r = Number(sq[1]) - 1;
  const out = new Set<string>();
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      const nf = f + df;
      const nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) out.add(`${String.fromCharCode(97 + nf)}${nr + 1}`);
    }
  return out;
}

const GLYPH: Record<string, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

export function ChessBoard2D({
  fen,
  you,
  lastMove,
  myTurn,
  onMove,
  disabled,
  appearance = "dark",
  skin,
  outlineOn = true,
  legalFor,
  checkSq,
  dimmed,
  blast,
}: BoardRules & {
  fen: string;
  you: Side;
  lastMove: { from: string; to: string } | null;
  myTurn: boolean;
  onMove: (from: Square, to: Square) => void;
  disabled?: boolean;
  appearance?: "light" | "dark";
  skin?: BoardSkin;
  outlineOn?: boolean;
}) {
  const [selected, setSelected] = useState<Square | null>(null);
  const chess = useMemo(() => chessOf(fen), [fen]);
  const legal = useMemo(() => {
    if (!selected) return new Set<string>();
    if (legalFor) return new Set(legalFor(selected));
    return new Set(chess.moves({ square: selected, verbose: true }).map((m) => m.to));
  }, [chess, selected, legalFor]);
  const checkSquare = useMemo(() => {
    if (checkSq !== undefined) return checkSq as Square | null;
    if (!chess.isCheck()) return null;
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p?.type === "k" && p.color === chess.turn()) {
          return `${FILES[f]}${8 - r}` as Square;
        }
      }
    }
    return null;
  }, [chess, checkSq]);

  useEffect(() => {
    setSelected(null);
  }, [fen]);

  const ranks = you === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = you === "w" ? [...FILES] : [...FILES].reverse();
  const lightRoom = appearance === "light";
  const look = skin ?? boardById("lodge");
  const lodge = boardById("lodge");
  const [fade, setFade] = useState<[string, string] | null>(null);
  useEffect(() => {
    if (look.id !== "mystery") {
      setFade(null);
      return;
    }
    const id = window.setInterval(() => setFade(mysteryPair()), 80);
    setFade(mysteryPair());
    return () => window.clearInterval(id);
  }, [look.id]);
  const lightSq = fade?.[0] ?? look.lightSq;
  const darkSq = fade?.[1] ?? look.darkSq;

  function onSquare(sq: Square) {
    if (disabled || !myTurn) {
      setSelected(null);
      return;
    }
    const piece = chess.get(sq);
    if (selected && legal.has(sq)) {
      onMove(selected, sq);
      setSelected(null);
      return;
    }
    if (piece && piece.color === you && you === chess.turn()) {
      setSelected(sq);
      return;
    }
    setSelected(null);
  }

  return (
    <div className="grid h-full w-full place-items-center p-2 sm:p-4 md:p-8">
      <div
        className="aspect-square w-full max-w-[min(96vmin,720px)] overflow-hidden rounded-xl border shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
        style={{
          borderColor: look.ring ?? (lightRoom ? "#c9b48a" : "#3a2a1c"),
          background: look.table,
          boxShadow: look.ring ? `0 0 40px ${look.fillLight}55, 0 24px 60px rgba(0,0,0,0.45)` : undefined,
        }}
      >
        <div className="grid h-full w-full grid-cols-8 grid-rows-8">
          {ranks.map((rank, ri) =>
            files.map((file, fi) => {
              const sq = `${file}${rank}` as Square;
              const light = (fi + ri) % 2 === 0;
              const piece = chess.get(sq);
              const isSel = selected === sq;
              const isLast = lastMove?.from === sq || lastMove?.to === sq;
              const isCheck = checkSquare === sq;
              const occLegal = legal.has(sq) && Boolean(piece);
              return (
                <button
                  key={sq}
                  type="button"
                  onClick={() => onSquare(sq)}
                  className="relative grid aspect-square min-h-0 place-items-center [container-type:size]"
                  style={{
                    background: isCheck
                      ? look.check
                      : isSel
                        ? look.select
                        : isLast
                          ? look.last
                          : light
                            ? lightSq
                            : darkSq,
                  }}
                  aria-label={sq}
                >
                  {piece ? (
                    <span
                      className="pointer-events-none select-none font-display leading-none"
                      style={{
                        fontSize: "90cqmin",
                        color: piece.color === "w" ? lodge.whitePiece : lodge.blackPiece,
                        WebkitTextStroke: outlineOn
                          ? piece.color === "w"
                            ? `1.6px ${lodge.whiteStroke}`
                            : `2px ${lodge.blackStroke}`
                          : "0",
                        textShadow: outlineOn
                          ? piece.color === "w"
                            ? `0 2px 0 ${lodge.whiteStroke}, 0 0 0 1px ${lodge.whiteStroke}, 0 6px 14px rgba(0,0,0,0.35)`
                            : `0 1px 0 ${lodge.blackStroke}, 0 0 0 1px ${lodge.blackStroke}, 0 10px 16px rgba(0,0,0,0.55)`
                          : "0 6px 12px rgba(0,0,0,0.28)",
                      }}
                    >
                      {GLYPH[piece.type]}
                    </span>
                  ) : null}
                  {dimmed?.has(sq) ? (
                    <span data-dimmed-square className="pointer-events-none absolute inset-0 bg-black/70" />
                  ) : null}
                  {blast && blastZone(blast.sq).has(sq) ? (
                    <span
                      key={blast.id}
                      data-blast-square
                      className="morse-blast pointer-events-none absolute inset-[-20%] rounded-full"
                      style={{ animationDelay: sq === blast.sq ? "0ms" : "90ms" }}
                    />
                  ) : null}
                  {legal.has(sq) && !piece ? (
                    <span className="pointer-events-none absolute left-1/2 top-1/2 size-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_14px_rgba(255,255,255,0.9)]" />
                  ) : null}
                  {occLegal ? (
                    <span className="pointer-events-none absolute inset-[10%] rounded-full border-[4px] border-white shadow-[0_0_12px_rgba(255,255,255,0.75)]" />
                  ) : null}
                  {fi === 0 ? (
                    <span
                      className={cn(
                        "pointer-events-none absolute left-1 top-0.5 text-[10px] font-medium",
                        light ? "text-ink/45" : "text-ivory/70",
                      )}
                    >
                      {rank}
                    </span>
                  ) : null}
                  {ri === 7 ? (
                    <span
                      className={cn(
                        "pointer-events-none absolute bottom-0.5 right-1 text-[10px] font-medium",
                        light ? "text-ink/45" : "text-ivory/70",
                      )}
                    >
                      {file}
                    </span>
                  ) : null}
                </button>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
