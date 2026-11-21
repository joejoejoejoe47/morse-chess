/**
 * Legendary home (t354u): live game challenges sit ON TOP of the Daily Challenge box and stay
 * until their countdown runs out (or they are accepted, declined or cancelled). Incoming ones
 * get Accept / Decline, the ones you sent get Cancel. More than one: arrows cycle through them.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Swords } from "lucide-react";
import type { ChallengeCard } from "@/lib/server/mores";
import { NAMED_CHALLENGE_MS } from "@/lib/server/mores";
import { VARIANT_INFO } from "@/lib/variants/engine";
import { playSfx } from "@/lib/legendary/sfx";
import { cn } from "@/lib/utils";

export type Duel = ChallengeCard & { dir: "in" | "out" };

function letterOf(name: string) {
  const m = name.match(/\p{Lu}/u);
  return m ? m[0] : (name.trim()[0] ?? "?").toUpperCase();
}

const ENAMEL = ["#2f6a2c", "#2b4590", "#7a4a1e", "#4f6e26", "#857224", "#3f3c94", "#8a2424", "#76601c"];
function enamel(name: string) {
  let n = 0;
  for (const ch of name) n = (n + ch.charCodeAt(0)) % ENAMEL.length;
  return ENAMEL[n];
}

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function duelLabel(c: ChallengeCard) {
  if (c.kind === "football") return "Football 1V1";
  const pace = c.mode === "timed" ? "Timed" : "Breeze";
  if (c.setupFen) return `${pace} · Setup game`;
  if (c.kind === "pull") return `${pace} · Random pull-up`;
  const v = c.variant ? VARIANT_INFO[c.variant]?.name : null;
  return v ? `${pace} · ${v}` : `${pace} 1V1`;
}

export function DuelStack({
  duels,
  now,
  onAccept,
  onDecline,
  onCancel,
}: {
  duels: Duel[];
  now: number;
  onAccept: (c: Duel) => Promise<void> | void;
  onDecline: (c: Duel) => Promise<void> | void;
  onCancel: (c: Duel) => Promise<void> | void;
}) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState("");
  const count = duels.length;
  const idx = count ? Math.min(i, count - 1) : 0;
  const c = duels[idx];
  const key = duels.map((d) => d.id).join(".");
  // a new challenge arriving plays the menu sound once
  const [seen, setSeen] = useState("");
  useEffect(() => {
    const fresh = duels.some((d) => d.dir === "in" && !seen.split(".").includes(d.id));
    if (fresh) playSfx("menu", 0.45);
    setSeen(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!c) return null;
  const who = c.dir === "in" ? c.fromUsername : c.toUsername;
  const left = c.deadline != null ? Math.max(0, c.deadline - now) : null;
  const pct = left != null ? Math.min(100, (left / NAMED_CHALLENGE_MS) * 100) : 100;
  const run = async (tag: string, fn: () => Promise<void> | void) => {
    if (busy) return;
    setBusy(tag);
    playSfx("tap");
    try {
      await fn();
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="mcl-duel" data-duel={c.id} data-duel-dir={c.dir}>
      <div className="mcl-duel-head flex items-center">
        <Swords className="mcl-duel-ico" />
        <h3 className="mcl-duel-title">{c.dir === "in" ? "Challenge!" : "Challenge sent"}</h3>
        {count > 1 ? (
          <span className="mcl-duel-nav ml-auto flex items-center">
            <button type="button" aria-label="Previous challenge" onClick={() => setI((idx - 1 + count) % count)}>
              <ChevronLeft />
            </button>
            <span className="tabular-nums">
              {idx + 1}/{count}
            </span>
            <button type="button" aria-label="Next challenge" onClick={() => setI((idx + 1) % count)}>
              <ChevronRight />
            </button>
          </span>
        ) : null}
        {left != null ? (
          <span className={cn("mcl-duel-time tabular-nums", count > 1 ? "" : "ml-auto", left < 30_000 && "is-low")} data-duel-left>
            {fmt(left)}
          </span>
        ) : null}
      </div>
      <div className="mcl-duel-body flex items-center">
        <span className="mcl-duel-medal" style={{ ["--enamel" as string]: enamel(who) }}>
          {letterOf(who)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="mcl-duel-name truncate">{c.dir === "in" ? who : `To ${who}`}</p>
          <p className="mcl-duel-mode truncate">{duelLabel(c)}</p>
          <span className="mcl-duel-bar">
            <span style={{ width: `${pct}%` }} />
          </span>
        </div>
        <div className="mcl-duel-acts flex flex-col">
          {c.dir === "in" ? (
            <>
              <button type="button" className="mcl-duel-yes" disabled={!!busy} onClick={() => void run("yes", () => onAccept(c))} data-duel-accept>
                {c.setupFen ? "View" : busy === "yes" ? "…" : "Accept"}
              </button>
              <button type="button" className="mcl-duel-no" disabled={!!busy} onClick={() => void run("no", () => onDecline(c))} data-duel-decline>
                Decline
              </button>
            </>
          ) : (
            <button type="button" className="mcl-duel-no is-cancel" disabled={!!busy} onClick={() => void run("cancel", () => onCancel(c))} data-duel-cancel>
              {busy === "cancel" ? "…" : "Cancel"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
