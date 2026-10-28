import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export type StartOption = { id: string; label: string; note?: string };

/** Rules panel first, then the game. These games are just for fun — no coins. */
export function GameFrame({
  title,
  tagline,
  rules,
  options,
  onStart,
  started,
  onRules,
  onReset,
  children,
}: {
  title: string;
  tagline: string;
  rules: ReactNode[];
  options: StartOption[];
  onStart: (id: string) => void;
  started: boolean;
  onRules: () => void;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[#110d09] text-ivory">
      <header className="flex items-center justify-between gap-3 border-b border-[#e7c56a]/20 px-4 py-3">
        <Link to="/" className="rounded-md border border-[#e7c56a]/50 bg-[#1a140e]/85 px-4 py-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#e7c56a]">
          Back
        </Link>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#e7c56a]/80">Other games</p>
          <h1 className="font-display text-2xl leading-tight">{title}</h1>
        </div>
        <span className="w-24" />
      </header>
      {started ? (
        <>
          {children}
          <div className="flex justify-center gap-2 pb-8">
            <button type="button" data-game-rules-open className="flex items-center gap-2 rounded-md border border-[#e7c56a]/40 px-4 py-2 text-sm font-semibold text-[#e7c56a]" onClick={onRules}>
              <BookOpen className="size-4" /> Rules
            </button>
            <button type="button" data-game-reset className="flex items-center gap-2 rounded-md border border-[#e7c56a]/40 px-4 py-2 text-sm font-semibold text-[#e7c56a]" onClick={onReset}>
              <RotateCcw className="size-4" /> New game
            </button>
          </div>
        </>
      ) : (
        <section data-game-rules className="mx-auto max-w-xl px-4 py-8">
          <div className="rounded-xl border border-[#e7c56a]/35 bg-[#1a140e] p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e7c56a]">How to play</p>
            <p className="mt-2 font-display text-xl text-ivory">{tagline}</p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-cream">
              {rules.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-mist">Just for fun — these games don't award coins.</p>
            <div className="mt-5 grid gap-2">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  data-game-start={o.id}
                  className="rounded-md border border-[#e7c56a]/60 bg-[#2a1f14] px-4 py-3 text-left font-semibold text-[#f3e2b6] hover:bg-[#3a2a1a]"
                  onClick={() => onStart(o.id)}
                >
                  {o.label}
                  {o.note ? <span className="block text-xs font-normal text-mist">{o.note}</span> : null}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

const FILES = "abcdefgh";

export type Cell = { content?: ReactNode; dot?: boolean; ring?: boolean; mark?: "sel" | "last" | "hint" | "white" | "black" | "crash"; label?: string };

/** A plain wooden board. Row 0 is White's home row (shown at the bottom unless flipped). */
export function SquareBoard({
  size,
  cell,
  onClick,
  flipped = false,
  snow = false,
}: {
  size: number;
  cell: (r: number, f: number) => Cell;
  onClick?: (r: number, f: number) => void;
  flipped?: boolean;
  snow?: boolean;
}) {
  const rows = Array.from({ length: size }, (_, i) => (flipped ? i : size - 1 - i));
  const cols = Array.from({ length: size }, (_, i) => (flipped ? size - 1 - i : i));
  return (
    <div
      data-game-board
      className="mx-auto grid aspect-square w-[min(92vw,calc(100dvh-230px),560px)] overflow-hidden rounded-lg border-4 border-[#3a2a1a] shadow-2xl"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${size}, minmax(0, 1fr))` }}
    >
      {rows.map((r) =>
        cols.map((f) => {
          const c = cell(r, f);
          const dark = (r + f) % 2 === 0;
          return (
            <button
              key={`${r}-${f}`}
              type="button"
              data-sq={`${r}-${f}`}
              aria-label={`${FILES[f]}${r + 1}`}
              className={cn(
                "relative grid min-h-0 min-w-0 place-items-center overflow-hidden",
                snow ? (dark ? "bg-[#8fa7bf]" : "bg-[#e9f0f6]") : dark ? "bg-[#8a6446]" : "bg-[#e8d6b4]",
                c.mark === "sel" && "outline outline-4 -outline-offset-4 outline-[#e7c56a]",
                c.mark === "last" && "after:absolute after:inset-0 after:bg-[#e7c56a]/30",
                c.mark === "hint" && "after:absolute after:inset-0 after:animate-pulse after:bg-sky-400/40",
                c.mark === "white" && "after:absolute after:inset-0 after:bg-amber-300/40",
                c.mark === "black" && "after:absolute after:inset-0 after:bg-rose-500/35",
                c.mark === "crash" && "after:absolute after:inset-0 after:bg-red-600/50",
              )}
              onClick={() => onClick?.(r, f)}
            >
              {c.content ? <span className="relative z-10 grid size-full place-items-center">{c.content}</span> : null}
              {c.dot ? <span className="pointer-events-none absolute z-20 size-[28%] rounded-full bg-[#1d4d3a]/60" /> : null}
              {c.ring ? <span className="pointer-events-none absolute inset-[6%] z-20 rounded-full border-4 border-[#1d4d3a]/70" /> : null}
              {c.label ? <span className="pointer-events-none absolute left-0.5 top-0 z-20 text-[9px] font-semibold text-black/45">{c.label}</span> : null}
            </button>
          );
        }),
      )}
    </div>
  );
}

export function StatusBar({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "win" | "lose" }) {
  return (
    <p
      data-game-status
      className={cn(
        "mx-auto mt-4 max-w-xl rounded-md border px-4 py-2 text-center text-sm font-semibold",
        tone === "info" && "border-[#e7c56a]/30 bg-[#1a140e] text-cream",
        tone === "win" && "border-emerald-400/50 bg-emerald-900/40 text-emerald-100",
        tone === "lose" && "border-rose-400/50 bg-rose-900/40 text-rose-100",
      )}
    >
      {children}
    </p>
  );
}

export function RulesModal({ open, onClose, rules, title }: { open: boolean; onClose: () => void; rules: ReactNode[]; title: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-w-lg rounded-xl border border-[#e7c56a]/35 bg-[#1a140e] p-6" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-xl">{title} rules</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-cream">
          {rules.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ol>
        <button type="button" className="mt-4 rounded-md border border-[#e7c56a]/60 px-4 py-2 text-sm font-semibold text-[#e7c56a]" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
