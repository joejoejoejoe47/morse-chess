import { lazy, Suspense, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Square } from "chess.js";
import { ChessBoard2D } from "@/components/chess/board-2d";
import { ClubBrand } from "@/components/club-brand";
import { ThemeToggle, useTheme } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { boardById, boardCanPreview, boardUnlocked, rememberEquipped, type BoardSkin } from "@/lib/chess/board-skins";
import { setEquippedBoard } from "@/lib/server/mores";
import { cn } from "@/lib/utils";

const ChessBoard3D = lazy(() =>
  import("@/components/chess/board-3d").then((m) => ({ default: m.ChessBoard3D })),
);

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function BoardLook({
  boardId,
  score,
  username,
  equippedBoard,
  onBack,
  onEquipped,
}: {
  boardId: string;
  score: number;
  username?: string;
  equippedBoard: string;
  onBack?: () => void;
  onEquipped?: (id: string) => void;
}) {
  const theme = useTheme();
  const board: BoardSkin = boardById(boardId);
  const open = boardUnlocked(score, board, username);
  const peek = boardCanPreview(score, board, username);
  const equipped = equippedBoard === board.id;
  const [view, setView] = useState<"2d" | "3d">("3d");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boardProps = {
    fen: START_FEN,
    you: "w" as const,
    lastMove: null,
    myTurn: false,
    onMove: (_from: Square, _to: Square) => {},
    disabled: true,
    appearance: theme,
    skin: board,
  };

  async function sitHere() {
    if (!open || equipped) return;
    setBusy(true);
    setError(null);
    try {
      try {
        await setEquippedBoard({ data: { boardId: board.id } });
      } catch {
        /* still use it locally if this score unlocks it */
      }
      rememberEquipped(board.id);
      onEquipped?.(board.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sit at that table.");
    } finally {
      setBusy(false);
    }
  }

  if (!peek) {
    return (
      <main className="relative flex h-dvh flex-col overflow-hidden bg-ink">
        <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <ClubBrand to="/" />
          {onBack ? (
            <Button size="sm" variant="outline" className="rounded-full" onClick={onBack}>
              Back
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link to="/boards">Back</Link>
            </Button>
          )}
        </header>
        <div className="grid flex-1 place-items-center px-6">
          <div className="max-w-md text-center">
            <p className="font-display text-6xl text-mist">?</p>
            <h1 className="mt-4 font-display text-4xl text-ivory">Mystery</h1>
            <p className="mt-3 text-base text-mist">
              Sealed until 100 score. No peek until it is yours.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-ink">
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <ClubBrand to="/" />
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-[15px] text-mist">
            {board.name}
            {" · "}
            {board.cost === 0 ? "starter" : `${board.cost} score`}
            {" · look only"}
          </span>
          <div className="flex overflow-hidden rounded-full border border-line bg-panel">
            <button
              type="button"
              className={cn(
                "px-3 py-1.5 text-[13px] font-medium",
                view === "2d" ? "bg-ivory text-ink" : "text-mist hover:text-ivory",
              )}
              onClick={() => setView("2d")}
            >
              2D
            </button>
            <button
              type="button"
              className={cn(
                "px-3 py-1.5 text-[13px] font-medium",
                view === "3d" ? "bg-ivory text-ink" : "text-mist hover:text-ivory",
              )}
              onClick={() => setView("3d")}
            >
              3D
            </button>
          </div>
          <ThemeToggle className="rounded-full" />
          {onBack ? (
            <Button size="sm" variant="outline" className="rounded-full" onClick={onBack}>
              Back
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link to="/boards">Back</Link>
            </Button>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          {view === "2d" ? (
            <ChessBoard2D {...boardProps} />
          ) : (
            <Suspense
              fallback={
                <div className="grid h-full place-items-center text-base text-mist">Setting the table…</div>
              }
            >
              <ChessBoard3D {...boardProps} />
            </Suspense>
          )}
        </div>
        {view === "3d" ? (
          <p className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-ink/55 px-3 py-1.5 text-[13px] text-mist">
            Drag to turn the table · scroll to zoom · pieces stay still
          </p>
        ) : null}
        <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex flex-col items-center gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="pointer-events-auto max-w-md rounded-xl border border-line bg-ink/75 px-4 py-3 backdrop-blur-sm">
            <p className="font-display text-2xl text-ivory">{board.name}</p>
            <p className="mt-1 text-[15px] text-mist">{board.blurb}</p>
            {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}
          </div>
          <div className="pointer-events-auto flex gap-2">
            {open ? (
              <Button variant="solid" disabled={busy || equipped} onClick={() => void sitHere()}>
                {equipped ? "Using this board" : busy ? "Saving…" : "Use this board"}
              </Button>
            ) : (
              <Button variant="outline" disabled>
                Look only · reach {board.cost} to sit
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
