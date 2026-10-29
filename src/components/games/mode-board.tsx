import { useEffect, useState } from "react";
import type { Square } from "chess.js";
import { ChessBoard2D } from "@/components/chess/board-2d";
import { ChessBoard3D } from "@/components/chess/board-3d";
import { LEGO_BOARD_ID } from "@/components/chess/lego-board";
import { RaBuy } from "@/components/avatar/ra-buy";
import { useTheme } from "@/components/theme";
import { boardUnlocked, equippedSkin, type BoardSkin } from "@/lib/chess/board-skins";
import { useLookPrefs } from "@/lib/chess/look-prefs";
import { getHomeState } from "@/lib/server/mores";
import { cn } from "@/lib/utils";

/**
 * The local "Other games" (Apocalypse, Knight's Tour, ...) on the real club boards (owner t220u):
 * the same 2D / 3D / AN / RA / LG piece styles as normal chess, with the game's own buttons around it.
 * The game keeps its own rules: it hands in the pieces, the selected square and the legal targets,
 * and gets every square tap back.
 */
export type LocalView = "2d" | "3d" | "an" | "ra" | "lg";
export type LocalPiece = { c: "w" | "b"; t: "p" | "n" | "b" | "r" | "q" | "k" };

const FILES = "abcdefgh";
export const sqOf = (r: number, f: number) => `${FILES[f]}${r + 1}`;
export const rfOf = (sq: string): [number, number] => [Number(sq[1]) - 1, FILES.indexOf(sq[0])];

/** An 8x8 FEN with the game's N×N board in the a1 corner. */
export function cornerFen(size: number, at: (r: number, f: number) => LocalPiece | null | undefined, turn: "w" | "b" = "w") {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = "";
    let gap = 0;
    for (let f = 0; f < 8; f++) {
      const p = r < size && f < size ? at(r, f) : null;
      if (!p) {
        gap++;
        continue;
      }
      if (gap) row += String(gap);
      gap = 0;
      row += p.c === "w" ? p.t.toUpperCase() : p.t;
    }
    rows.push(row + (gap ? String(gap) : ""));
  }
  return `${rows.join("/")} ${turn} - - 0 1`;
}

function readView(): LocalView {
  try {
    const v = localStorage.getItem("morse-board-view");
    if (v === "2d" || v === "an" || v === "ra" || v === "lg") return v;
  } catch {
    /* ignore */
  }
  return "3d";
}

export function ModeBoard({
  size,
  fen,
  you = "w",
  selected,
  legal,
  onSquare,
  labels,
  tints,
  lastMove = null,
  disabled = false,
}: {
  size: number;
  fen: string;
  you?: "w" | "b";
  selected: string | null;
  legal: readonly string[];
  onSquare: (sq: string) => void;
  labels?: Readonly<Record<string, string>>;
  tints?: Readonly<Record<string, string>>;
  lastMove?: { from: string; to: string } | null;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const prefs = useLookPrefs();
  const [view, setView] = useState<LocalView>(readView);
  const [me, setMe] = useState<{ username: string; score: number; equippedBoard: string; ownedBoards: string[] } | null>(null);
  useEffect(() => {
    let live = true;
    getHomeState()
      .then((h: { profile?: { username: string; score: number; equippedBoard: string; ownedBoards: string[] } | null }) => {
        if (live) setMe(h.profile ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const skin: BoardSkin | undefined = me ? equippedSkin(me.score, me.equippedBoard, me.username, me.ownedBoards) : undefined;
  const ownsLego = me ? boardUnlocked(me.score, LEGO_BOARD_ID, me.username, me.ownedBoards) : false;
  const lgOn = view === "lg" && ownsLego;
  function pickView(v: LocalView) {
    setView(v);
    try {
      localStorage.setItem("morse-board-view", v);
    } catch {
      /* ignore */
    }
  }
  const props = {
    fen,
    you,
    lastMove,
    myTurn: !disabled,
    onMove: (_f: Square, _t: Square) => undefined,
    disabled,
    appearance: theme,
    skin,
    outlineOn: prefs.outline,
    size,
    pick: { selected, legal, onSquare },
    labels,
    tints,
  };
  const btn = (on: boolean) =>
    cn("min-h-10 min-w-11 px-3 py-1.5 text-[13px] font-medium", on ? "bg-ivory text-ink" : "text-mist hover:text-ivory");
  return (
    <div data-mode-board data-view={lgOn ? "lg" : view === "lg" ? "3d" : view} data-board-n={size}>
      <div className="mb-2 flex justify-center">
        <div data-view-switch className="flex overflow-hidden rounded-full border border-line bg-panel">
          <button type="button" data-view-btn="2d" className={btn(view === "2d")} onClick={() => pickView("2d")}>2D</button>
          <button type="button" data-view-btn="3d" className={btn(view === "3d" || (view === "lg" && !ownsLego))} onClick={() => pickView("3d")}>3D</button>
          <button type="button" data-view-btn="an" className={btn(view === "an")} onClick={() => pickView("an")}>AN</button>
          {ownsLego ? (
            <button type="button" data-view-btn="lg" title="Brick hero figures (Brick Verse)" className={btn(lgOn)} onClick={() => pickView("lg")}>LG</button>
          ) : null}
          <RaBuy
            active={view === "ra"}
            onView={() => pickView("ra")}
            onLocked={() => pickView("3d")}
            className="min-h-10 min-w-11 px-3 py-1.5 text-[13px] font-medium text-mist hover:text-ivory"
          />
        </div>
      </div>
      <div
        className={cn(
          "relative mx-auto",
          view === "2d" ? "aspect-square w-[min(92vw,calc(100dvh-260px),560px)]" : "h-[min(70dvh,640px)] w-full max-w-4xl",
        )}
      >
        {view === "2d" ? (
          <ChessBoard2D {...props} />
        ) : (
          <ChessBoard3D
            {...props}
            roomColor="#110d09"
            people={view === "an"}
            real={view === "ra"}
            lego={lgOn}
            heirloom={skin?.id === "classic" ? "cl" : skin?.id === "parlor" ? "pa" : null}
            heirloomPieces={view === "3d"}
            showTip={false}
            fightZoom={(view === "an" || view === "ra") && prefs.fightZoom}
          />
        )}
      </div>
    </div>
  );
}
