import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BOARD_CATALOG, boardCanPreview, boardUnlocked } from "@/lib/chess/board-skins";
import { ClubBrand, ClubHeaderActions } from "@/components/club-brand";
import { Button } from "@/components/ui/button";
import { BoardLook } from "@/components/board-look";
import { cn } from "@/lib/utils";

function MiniBoard({ light, dark }: { light: string; dark: string }) {
  return (
    <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-lg border border-black/20 shadow-inner">
      {Array.from({ length: 64 }, (_, i) => {
        const r = Math.floor(i / 8);
        const c = i % 8;
        const isLight = (r + c) % 2 === 0;
        return <div key={i} style={{ background: isLight ? light : dark }} />;
      })}
    </div>
  );
}

export function BoardGallery({
  score,
  username,
  equippedBoard,
}: {
  score: number;
  username: string;
  equippedBoard: string;
}) {
  const [looking, setLooking] = useState<string | null>(null);
  const [equipped, setEquipped] = useState(equippedBoard);
  const [tune, setTune] = useState(false);
  if (looking) {
    return (
      <BoardLook
        boardId={looking}
        score={score}
        username={username}
        equippedBoard={equipped}
        startTuning={tune}
        onBack={() => {
          setLooking(null);
          setTune(false);
        }}
        onEquipped={setEquipped}
      />
    );
  }
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-6xl px-5 py-6 sm:px-8">
      <div className="check-wash pointer-events-none absolute inset-0" />
      <header className="relative flex flex-wrap items-center justify-between gap-4">
        <ClubBrand to="/" />
        <ClubHeaderActions username={username} score={score} />
      </header>

      <section className="relative mt-10">
        <p className="text-xs uppercase tracking-[0.2em] text-mist">The cabinet</p>
        <h1 className="mt-2 font-display text-4xl text-ivory">Boards</h1>
        <p className="mt-3 max-w-xl text-base text-mist">
          Click a picture to walk around it. Click Use, then the look buttons open so you can set outline, background, and light before you enter it for your games.
        </p>
      </section>

      <div className="relative mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {BOARD_CATALOG.map((board) => {
          const open = boardUnlocked(score, board, username);
          const peek = boardCanPreview(score, board, username);
          const inUse = equipped === board.id;
          return (
            <button
              key={board.id}
              type="button"
              onClick={() => {
                if (!peek) return;
                setLooking(board.id);
              }}
              className={cn(
                "rounded-xl border p-3 text-left transition-[border-color,transform] hover:-translate-y-0.5 hover:border-line-strong",
                inUse ? "border-gold-line bg-panel" : "border-line bg-panel/80",
                !peek ? "cursor-not-allowed hover:translate-y-0 hover:border-line" : "",
              )}
            >
              {peek ? (
                <MiniBoard light={board.lightSq} dark={board.darkSq} />
              ) : (
                <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg border border-black/40 bg-[#0a0a0c] text-mist">
                  <span className="font-display text-3xl">?</span>
                </div>
              )}
              <div className="mt-3 flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xl text-ivory">{board.name}</p>
                  <p className="mt-0.5 text-[13px] text-mist">
                    {board.cost === 0 ? "Yours" : `${board.cost} Elo`}
                  </p>
                </div>
                {open ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded-full border border-line px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-ivory hover:border-line-strong"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTune(true);
                      setLooking(board.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.click();
                    }}
                  >
                    {inUse ? "Using" : "Use"}
                  </span>
                ) : (
                  <span className="text-[11px] uppercase tracking-[0.14em] text-mist">
                    {peek ? "Look" : "Sealed"}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="relative mt-10 flex justify-center pb-10">
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/">Back</Link>
        </Button>
      </div>
    </main>
  );
}
