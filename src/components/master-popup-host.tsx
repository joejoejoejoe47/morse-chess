import { useEffect, useRef, useState } from "react";
import { MessageSquareText, X } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getHomeState } from "@/lib/server/mores";
import { isMasterUsername } from "@/lib/chess/board-skins";
import { fetchMasterPopups, randomDelayMs } from "@/lib/master-popups";

type Shown = { name: string; text: string; key: number };

/**
 * "MasterGus says: ..." — every minSec..maxSec seconds (1-3 min by default) a random
 * message from MasterGus's goblin Pop-ups list appears for signed-in players on every
 * page and game. Never while a pointer is held or right after a click (so it can't
 * steal a move), auto-closes, closeable. Any fetch problem = silently nothing.
 */
export function MasterPopupHost() {
  const { user, isPending } = useCurrentUserState();
  const [shown, setShown] = useState<Shown | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (isPending || !user) return;
    let live = true;
    let timer: number | undefined;
    let pointerDown = false;
    let lastPointer = 0;
    let lastText: string | null = null;
    const down = () => { pointerDown = true; lastPointer = Date.now(); };
    const up = () => { pointerDown = false; lastPointer = Date.now(); };
    const downEvents = ["pointerdown", "touchstart", "keydown"] as const;
    const upEvents = ["pointerup", "pointercancel", "touchend", "keyup"] as const;
    downEvents.forEach((e) => window.addEventListener(e, down, true));
    upEvents.forEach((e) => window.addEventListener(e, up, true));

    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      if (!live) return;
      // Never mid-click / mid-drag / right after one, and not into a hidden tab.
      if (pointerDown || Date.now() - lastPointer < 1500 || document.hidden) return schedule(2500);
      const data = await fetchMasterPopups();
      if (!live) return;
      if (!data) return schedule(5 * 60_000); // fetch failed: stay quiet, try much later
      const { settings, messages } = data;
      if (settings.enabled && messages.length) {
        if (pointerDown || Date.now() - lastPointer < 1500) return schedule(2500);
        const pool = messages.length > 1 ? messages.filter((m) => m !== lastText) : messages;
        const text = pool[Math.floor(Math.random() * pool.length)];
        lastText = text;
        setShown({ name: settings.name, text, key: Date.now() });
        window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => live && setShown(null), settings.showSec * 1000);
      }
      schedule(randomDelayMs(settings));
    };

    const start = async () => {
      // MasterGus doesn't get his own messages.
      try {
        const home = await getHomeState();
        const name = (home as { profile?: { username?: string | null } | null })?.profile?.username;
        if (name && isMasterUsername(name)) return;
      } catch {
        /* unknown -> treat as a regular player */
      }
      if (!live) return;
      const demo = /[?&]mgpopup=now\b/.test(window.location.search); // quick live check
      if (demo) return schedule(2500);
      const first = await fetchMasterPopups();
      if (!live || !first) return;
      schedule(randomDelayMs(first.settings));
    };
    void start();

    return () => {
      live = false;
      window.clearTimeout(timer);
      window.clearTimeout(hideTimer.current);
      downEvents.forEach((e) => window.removeEventListener(e, down, true));
      upEvents.forEach((e) => window.removeEventListener(e, up, true));
      setShown(null);
    };
  }, [user, isPending]);

  if (!shown) return null;
  return (
    <div
      key={shown.key}
      role="status"
      aria-live="polite"
      data-master-popup
      className="fixed top-3 inset-x-3 z-[90] sm:inset-x-auto sm:right-4 sm:w-[380px] border border-gold-line/55 bg-panel/95 text-ivory shadow-2xl backdrop-blur px-4 py-3 pr-10 font-[Outfit,sans-serif]"
    >
      <div className="flex items-center gap-1.5 text-xs font-bold text-gold-line">
        <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
        {shown.name} says:
      </div>
      <p className="mt-1 text-sm leading-snug break-words">{shown.text}</p>
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          window.clearTimeout(hideTimer.current);
          setShown(null);
        }}
        className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center text-ivory/60 hover:text-ivory hover:bg-ink-soft"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
