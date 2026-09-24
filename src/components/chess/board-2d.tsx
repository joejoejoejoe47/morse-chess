import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { FILES } from "@/lib/chess/board-math";
import type { Side } from "@/lib/mores-constants";
import { boardById, mysteryPair, type BoardSkin } from "@/lib/chess/board-skins";
import { cn } from "@/lib/utils";

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
}: {
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
  const chess = useMemo(() => new Chess(fen), [fen]);
  const legal = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(chess.moves({ square: selected, verbose: true }).map((m) => m.to));
  }, [chess, selected]);
  const checkSquare = useMemo(() => {
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
  }, [chess]);

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
                  className="relative aspect-square min-h-0"
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
                        fontSize: "clamp(1.6rem, 8vmin, 4.2rem)",
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
                  {legal.has(sq) && !piece ? (
                    <span className="pointer-events-none absolute left-1/2 top-1/2 size-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/35" />
                  ) : null}
                  {occLegal ? (
                    <span className="pointer-events-none absolute inset-[12%] rounded-full border-[3px] border-ink/40" />
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
