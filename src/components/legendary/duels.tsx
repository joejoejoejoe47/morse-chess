/**
 * Legendary home (t354u): live game challenges sit ON TOP of the Daily Challenge box and stay
 * until their countdown runs out (or they are accepted, declined or cancelled). Incoming ones
 * get Accept / Decline, the ones you sent get Cancel. More than one: arrows cycle through them.
 * Unread GC letters (t365u) join the same stack with the same look: Open (to that chat) / Dismiss.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Mail, Swords } from "lucide-react";
import type { GcPop } from "@/lib/server/mail";
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

function ago(at: number | undefined, now: number) {
  if (!at) return "now";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function snippet(l: GcPop) {
  const t = l.text.replace(/\s+/g, " ").trim();
  if (t) return t;
  return l.kind === "image" ? "📷 Sent a photo" : l.kind === "video" ? "🎬 Sent a video" : "New message";
}

type Item = { type: "duel"; id: string; d: Duel } | { type: "mail"; id: string; m: GcPop };

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
  mails = [],
  now,
  onAccept,
  onDecline,
  onCancel,
  onOpenMail,
  onDismissMail,
}: {
  duels: Duel[];
  mails?: GcPop[];
  now: number;
  onAccept: (c: Duel) => Promise<void> | void;
  onDecline: (c: Duel) => Promise<void> | void;
  onCancel: (c: Duel) => Promise<void> | void;
  onOpenMail?: (m: GcPop) => Promise<void> | void;
  onDismissMail?: (m: GcPop) => Promise<void> | void;
}) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState("");
  // incoming challenges first (they expire), then letters, then the challenges you sent
  const items: Item[] = [
    ...duels.filter((d) => d.dir === "in").map((d) => ({ type: "duel" as const, id: d.id, d })),
    ...mails.map((m) => ({ type: "mail" as const, id: `m:${m.id}`, m })),
    ...duels.filter((d) => d.dir !== "in").map((d) => ({ type: "duel" as const, id: d.id, d })),
  ];
  const count = items.length;
  const idx = count ? Math.min(i, count - 1) : 0;
  const item = items[idx];
  const key = items.map((d) => d.id).join(".");
  // a new challenge or letter arriving plays the menu sound once (softly)
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => {
    if (seen !== null) {
      const old = seen.split(".");
      const fresh = items.some((it) => (it.type === "mail" || it.d.dir === "in") && !old.includes(it.id));
      if (fresh) playSfx("menu", 0.45);
    }
    setSeen(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!item) return null;
  const nav =
    count > 1 ? (
      <span className="mcl-duel-nav ml-auto flex items-center">
        <button type="button" aria-label="Previous" onClick={() => setI((idx - 1 + count) % count)}>
          <ChevronLeft />
        </button>
        <span className="tabular-nums" data-duel-page>
          {idx + 1}/{count}
        </span>
        <button type="button" aria-label="Next" onClick={() => setI((idx + 1) % count)}>
          <ChevronRight />
        </button>
      </span>
    ) : null;
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
  if (item.type === "mail") {
    const m = item.m;
    return (
      <div className="mcl-duel is-mail" data-duel={item.id} data-duel-dir="mail" data-mail-card={m.id}>
        <div className="mcl-duel-head flex items-center">
          <Mail className="mcl-duel-ico" />
          <h3 className="mcl-duel-title">New message</h3>
          {nav}
          <span className={cn("mcl-duel-time tabular-nums", nav ? "" : "ml-auto")} data-mail-ago>{ago(m.at, now)}</span>
        </div>
        <div className="mcl-duel-body flex items-center">
          <span className="mcl-duel-medal" style={{ ["--enamel" as string]: enamel(m.name) }}>
            {letterOf(m.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="mcl-duel-name truncate">{m.name}</p>
            <p className="mcl-duel-mode mcl-mail-snip" title={snippet(m)}>{snippet(m)}</p>
          </div>
          <div className="mcl-duel-acts flex flex-col">
            <button type="button" className="mcl-duel-yes" disabled={!!busy} onClick={() => void run("open", () => onOpenMail?.(m))} data-mail-open>
              Open
            </button>
            <button type="button" className="mcl-duel-no" disabled={!!busy} onClick={() => void run("dismiss", () => onDismissMail?.(m))} data-mail-dismiss>
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }
  const c = item.d;
  const who = c.dir === "in" ? c.fromUsername : c.toUsername;
  const left = c.deadline != null ? Math.max(0, c.deadline - now) : null;
  const pct = left != null ? Math.min(100, (left / NAMED_CHALLENGE_MS) * 100) : 100;
  return (
    <div className="mcl-duel" data-duel={c.id} data-duel-dir={c.dir}>
      <div className="mcl-duel-head flex items-center">
        <Swords className="mcl-duel-ico" />
        <h3 className="mcl-duel-title">{c.dir === "in" ? "Challenge!" : "Challenge sent"}</h3>
        {nav}
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
