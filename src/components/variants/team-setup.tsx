import { useState } from "react";
import type { FootballTeam } from "@/lib/server/football";

/* The football team card: the player picks a team name and a colour once (first football game,
   or "Change team!" in the lounge). It is saved per user on the server (saveFootballTeam). */

export const TEAM_SWATCHES = ["#2ee6ff", "#ff2d7a", "#ffe14a", "#39ff88", "#ff8a1f", "#a05cff", "#1f4bff", "#ffffff", "#c8102e", "#0d8a3e"];
export const DEFAULT_TEAM: FootballTeam = { name: "Knights", color: "#2ee6ff" };

/** Dark text on light colours, white text on dark ones. */
export function inkOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#111111" : "#ffffff";
}

/** The Phantoms are pink, unless the player picked something close to pink: then cyan. */
export function awayColor(home: string) {
  const parse = (h: string) => {
    const n = parseInt(h.replace("#", ""), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [a, b, c] = parse(home);
  const [x, y, z] = parse("#ff2d7a");
  return Math.hypot(a - x, b - y, c - z) < 150 ? "#2ee6ff" : "#ff2d7a";
}

export function TeamSetup({
  initial,
  title = "Pick your team",
  onSave,
  onClose,
}: {
  initial?: FootballTeam | null;
  title?: string;
  onSave: (team: FootballTeam) => Promise<void> | void;
  onClose?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? DEFAULT_TEAM.name);
  const [color, setColor] = useState(initial?.color ?? DEFAULT_TEAM.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = name.trim().slice(0, 18);
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" data-fb-setup>
      <form
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b0e14]/95 p-5 text-ivory shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!clean) {
            setError("Give your team a name.");
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await onSave({ name: clean, color });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save the team.");
            setBusy(false);
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl uppercase tracking-[0.08em]">{title}</h2>
          {onClose ? (
            <button type="button" aria-label="Close" className="-mr-1 -mt-1 grid size-9 place-items-center rounded-md text-xl text-mist hover:text-ivory" onClick={onClose}>
              ×
            </button>
          ) : null}
        </div>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.16em] text-mist" htmlFor="fb-team-name">
          Team name
        </label>
        <input
          id="fb-team-name"
          value={name}
          maxLength={18}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line bg-panel px-3 py-3 text-base text-ivory outline-none placeholder:text-mist focus:border-gold-line"
          placeholder="Knights"
        />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-mist">Team colour</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TEAM_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              className={`size-10 rounded-full border-2 ${color.toLowerCase() === c ? "border-white ring-2 ring-[#ffe14a]" : "border-white/20"}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <label className="relative grid size-10 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-white/40 text-lg" title="Any colour">
            +
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <div className="grid h-16 w-20 shrink-0 place-items-center rounded-xl text-4xl font-black" style={{ backgroundColor: color, color: inkOn(color) }}>
            0
          </div>
          <p className="min-w-0 truncate text-lg font-bold uppercase tracking-[0.12em]" style={{ color }}>
            {clean || "…"}
          </p>
        </div>
        {error ? <p className="mt-3 text-sm text-[#ff6b6b]">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-5 min-h-12 w-full rounded-full bg-ivory px-5 text-base font-bold uppercase tracking-[0.14em] text-ink disabled:opacity-60"
        >
          {busy ? "Saving…" : "That's my team!"}
        </button>
      </form>
    </div>
  );
}
