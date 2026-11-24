/**
 * MB-11 Legendary "Set the board" (owner t371u, setup-ref.png): snowy night lake with lanterns, gold title,
 * a CHOOSE PIECES panel (gold white set, purple black set), a flat 2D board tilted with CSS perspective
 * so it looks 3D, and DONE / CLEAR. No leaderboard. The drag/drop state lives in PieceSetup.
 */
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Color, PieceSymbol, Square } from "chess.js";
import { asset } from "@/lib/base";
import { getHomeState } from "@/lib/server/mores";
import { Coin } from "@/components/legendary/bits";
import { playSfx } from "@/lib/legendary/sfx";

type Spot = { c: Color; t: PieceSymbol };
type Board = Partial<Record<Square, Spot>>;

const GLYPH: Record<PieceSymbol, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const NAME: Record<PieceSymbol, string> = { k: "King", q: "Queen", r: "Rook", b: "Bishop", n: "Knight", p: "Pawn" };
const ORDER: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];
const FILES = "abcdefgh";

export function SetGlyph({ c, t, className = "" }: { c: Color; t: PieceSymbol; className?: string }) {
  return <span className={`mcl-su-glyph ${c === "w" ? "is-gold" : "is-purple"} ${className}`}>{GLYPH[t]}</span>;
}

export function LegendarySetup({
  board, hover, dragging, fall, kings, ready, note, reading,
  onPick, onBoardDown, onClear, onDone, onBack, onPicture,
}: {
  board: Board; hover: Square | null; dragging: boolean; fall: Square | null; kings: { w: number; b: number }; ready: boolean;
  note: string | null; reading: boolean;
  onPick: (e: ReactPointerEvent, color: Color, type: PieceSymbol) => void;
  onBoardDown: (e: ReactPointerEvent) => void;
  onClear: () => void; onDone: () => void; onBack: () => void; onPicture: (f: File) => void;
}) {
  const [coins, setCoins] = useState<number | null>(null);
  useEffect(() => {
    getHomeState().then((h) => setCoins(h?.profile?.coins ?? null)).catch(() => undefined);
  }, []);
  const tray = (side: Color) => (
    <div className="mcl-su-set">
      <p className={`mcl-su-side ${side === "w" ? "is-gold" : "is-purple"}`}>
        <span aria-hidden>♛</span> {side === "w" ? "White" : "Black"}
      </p>
      <div className="mcl-su-tiles">
        {ORDER.map((t) => (
          <button key={t} type="button" className={`mcl-su-tile ${side === "w" ? "is-gold" : "is-purple"}`} onPointerDown={(e) => onPick(e, side, t)} data-setup-piece={`${side}${t}`} title={`${side === "w" ? "White" : "Black"} ${NAME[t]}`} aria-label={`${side === "w" ? "White" : "Black"} ${NAME[t]}`}>
            <SetGlyph c={side} t={t} />
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="mcl-su fixed inset-0 z-[120] text-ivory" data-piece-setup data-legendary-setup style={{ backgroundImage: `url(${asset("/legendary/setup/bg.webp")})` }}>
      <div className="mcl-su-snow" aria-hidden />
      <button type="button" className="mcl-su-back" onClick={() => { playSfx("tap"); onBack(); }} aria-label="Back" data-setup-back>
        <svg viewBox="0 0 64 64" className="size-full" aria-hidden>
          <defs>
            <linearGradient id="mcl-su-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff0b0" /><stop offset=".5" stopColor="#e0b85a" /><stop offset="1" stopColor="#9a6a1a" /></linearGradient>
          </defs>
          <circle cx="32" cy="32" r="17" fill="none" stroke="url(#mcl-su-g)" strokeWidth="2.5" />
          <path d="M32 2 L36 28 L62 32 L36 36 L32 62 L28 36 L2 32 L28 28 Z" fill="url(#mcl-su-g)" stroke="#5a3a0a" strokeWidth="1" />
          <path d="M32 14 L34 30 L50 32 L34 34 L32 50 L30 34 L14 32 L30 30 Z" fill="#2a1840" opacity=".55" transform="rotate(45 32 32)" />
          <circle cx="32" cy="32" r="4" fill="#2a1840" stroke="url(#mcl-su-g)" strokeWidth="1.5" />
        </svg>
        <span className="mcl-su-backlabel">Back</span>
      </button>
      <span className="mcl-su-coins" title="Coins">
        <Coin className="size-7" />
        <b className="tabular-nums">{coins == null ? "…" : coins.toLocaleString()}</b>
        <span className="mcl-su-plus">+</span>
      </span>
      <h1 className="mcl-su-title">Set the Board</h1>
      <div className="mcl-su-rule" aria-hidden><span /></div>

      <aside className="mcl-su-panel">
        <p className="mcl-su-plabel"><i />Choose Pieces<i /></p>
        {tray("w")}
        {tray("b")}
        <p className="mcl-su-hint">Drag pieces to the board</p>
        <label className="mcl-su-photo">
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPicture(f); e.currentTarget.value = ""; }} data-setup-picture />
          {reading ? "Reading the picture…" : "Or set it from a photo"}
        </label>
      </aside>

      <div className="mcl-su-stage" onPointerDown={onBoardDown}>
        <div className="mcl-su-tilt">
          <div className="mcl-su-frame">
            <div className="mcl-su-files is-top" aria-hidden>{[...FILES].map((f) => <span key={f}>{f.toUpperCase()}</span>)}</div>
            <div className="mcl-su-ranks is-left" aria-hidden>{[8, 7, 6, 5, 4, 3, 2, 1].map((r) => <span key={r}>{r}</span>)}</div>
            <div className="mcl-su-board" data-setup-board>
              {Array.from({ length: 8 }, (_, row) =>
                Array.from({ length: 8 }, (_, f) => {
                  const sq = `${FILES[f]}${8 - row}` as Square;
                  const spot = board[sq];
                  const light = (f + row) % 2 === 0;
                  return (
                    <div key={sq} data-setup-sq={sq} className={`mcl-su-sq ${light ? "is-light" : "is-dark"} ${hover === sq && dragging ? "is-hot" : ""}`}>
                      {spot ? (
                        <span className={`mcl-su-stand ${fall === sq ? "is-fall" : ""}`}>
                          <SetGlyph c={spot.c} t={spot.t} />
                        </span>
                      ) : null}
                    </div>
                  );
                }),
              )}
            </div>
            <div className="mcl-su-ranks is-right" aria-hidden>{[8, 7, 6, 5, 4, 3, 2, 1].map((r) => <span key={r}>{r}</span>)}</div>
            <div className="mcl-su-files is-bottom" aria-hidden>{[...FILES].map((f) => <span key={f}>{f.toUpperCase()}</span>)}</div>
          </div>
          <div className="mcl-su-legs" aria-hidden><span /><span /></div>
        </div>
      </div>

      <div className="mcl-su-foot">
        <p className={`mcl-su-note ${note && !note.startsWith("Pieces") ? "is-bad" : ""}`} role="status">
          {note ?? (ready ? "Ready. Press Done to pick your side." : `Put one king on each side (white ${kings.w}, black ${kings.b}), then press Done.`)}
        </p>
        <div className="mcl-su-btns">
          <button type="button" className="mcl-su-btn is-done" disabled={!ready} onClick={() => { playSfx("tap"); onDone(); }} data-setup-done>
            <svg viewBox="0 0 24 24" className="mcl-su-bicon" aria-hidden><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="m8 12 3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Done
          </button>
          <button type="button" className="mcl-su-btn is-clear" onClick={() => { playSfx("tap"); onClear(); }} data-setup-clear>
            <svg viewBox="0 0 24 24" className="mcl-su-bicon" aria-hidden><path d="M20 12a8 8 0 0 1-14.3 4.9M4 12A8 8 0 0 1 18.3 7.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M18.5 2.5v4.8h-4.8M5.5 21.5v-4.8h4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

/** Drag ghost in the Legendary style (gold / purple glyph). */
export function LegendaryGhost({ c, t, x, y }: { c: Color; t: PieceSymbol; x: number; y: number }) {
  return (
    <div className="pointer-events-none fixed z-[130]" style={{ left: x, top: y - 18, transform: "translate(-50%, -100%)" }}>
      <SetGlyph c={c} t={t} className="mcl-su-ghost" />
    </div>
  );
}
