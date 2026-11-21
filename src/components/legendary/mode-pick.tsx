/**
 * Legendary "How do you want to play?" (t355u/t356u, matches mcl-art/howplay-ref.png).
 * Timed is a gold card; its clock chips stay hidden until Timed is tapped, then slide open
 * inside the card. Tapping a chip starts the timed game. Breeze and Setup are purple cards.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
import { ui } from "@/components/legendary/bits";
import { playSfx } from "@/lib/legendary/sfx";
import { cn } from "@/lib/utils";

export function LegendaryModePick({
  clockChoice,
  minutes,
  busy,
  note,
  error,
  showSetup,
  onBack,
  onClose,
  onTimed,
  onBreeze,
  onSetup,
}: {
  /** Bot games (and variant pull-ups) let you pick 1, 5 or 10 minutes; others are 5 minutes. */
  clockChoice: boolean;
  minutes: 1 | 5 | 10;
  busy: boolean;
  note?: ReactNode;
  error?: string | null;
  showSetup: boolean;
  onBack?: () => void;
  onClose: () => void;
  onTimed: (minutes: 1 | 5 | 10) => void;
  onBreeze: () => void;
  onSetup: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mins, setMins] = useState<1 | 5 | 10>(clockChoice ? minutes : 5);
  useEffect(() => {
    playSfx("menu");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const shown = clockChoice ? mins : 5;
  const hover = () => playSfx("tap");
  return (
    <div className="mcl-hp-wrap fixed inset-0 z-40 grid place-items-center p-3" onClick={(e) => e.target === e.currentTarget && onClose()} data-mode-pick>
      <div role="dialog" aria-modal="true" aria-label="How do you want to play?" className="mcl-hp">
        {onBack ? (
          <button type="button" className="mcl-hp-back" onClick={onBack} aria-label="Back">
            <ChevronLeft /> Back
          </button>
        ) : null}
        <button type="button" className="mcl-hp-x" onClick={onClose} aria-label="Close">
          <X />
        </button>
        <h2 className="mcl-hp-title">How do you want to play?</h2>
        {note ? <div className="mcl-hp-note">{note}</div> : null}

        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          className={cn("mcl-hp-card is-gold", open && "is-open")}
          data-mode="timed"
          onMouseEnter={hover}
          onClick={() => {
            if (busy) return;
            if (!open) playSfx("menu");
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          <div className="mcl-hp-row">
            <img src={ui("hp-clock.webp")} alt="" className="mcl-hp-medal" draggable={false} />
            <div className="min-w-0">
              <p className="mcl-hp-name">Timed</p>
              <p className="mcl-hp-desc">{shown === 1 ? "One minute" : `${shown} minutes`} each. Clock pauses when you move.</p>
            </div>
          </div>
          <div className="mcl-hp-chips-wrap" aria-hidden={!open}>
            <div className="mcl-hp-chips" role="radiogroup" aria-label="Clock">
              {(clockChoice ? ([1, 5, 10] as const) : ([5] as const)).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  tabIndex={open ? 0 : -1}
                  aria-checked={shown === m}
                  className={cn("mcl-hp-chip", shown === m && "is-on")}
                  disabled={busy || !open}
                  data-clock={m}
                  onMouseEnter={hover}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMins(m);
                    playSfx("menu");
                    onTimed(m);
                  }}
                >
                  {clockChoice ? `${m} min` : "Play · 5 min"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button type="button" className="mcl-hp-card is-purple" data-mode="breeze" disabled={busy} onMouseEnter={hover} onClick={() => { playSfx("menu"); onBreeze(); }}>
          <span className="mcl-hp-row">
            <img src={ui("hp-wind.webp")} alt="" className="mcl-hp-medal" draggable={false} />
            <span className="min-w-0 text-left">
              <span className="mcl-hp-name block">Breeze</span>
              <span className="mcl-hp-desc block">No clock. Think as long as you like.</span>
            </span>
          </span>
        </button>

        {showSetup ? (
          <button type="button" className="mcl-hp-card is-purple" data-setup disabled={busy} onMouseEnter={hover} onClick={() => { playSfx("menu"); onSetup(); }}>
            <span className="mcl-hp-row">
              <img src={ui("hp-rook.webp")} alt="" className="mcl-hp-medal" draggable={false} />
              <span className="min-w-0 text-left">
                <span className="mcl-hp-name block">Setup</span>
                <span className="mcl-hp-desc block">Put the pieces where you want, then pick who you play.</span>
              </span>
            </span>
          </button>
        ) : null}
        {error ? <p className="mcl-hp-err">{error}</p> : null}
      </div>
    </div>
  );
}
