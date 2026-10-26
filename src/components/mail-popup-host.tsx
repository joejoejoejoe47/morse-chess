import { useEffect, useRef, useState } from "react";
import { MessageSquareText, X } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { gcPops, gcRead } from "@/lib/server/mail";

type Slip = { id: string; name: string; text: string };

/** A GC letter, in the same slip MasterGus uses, once the person it was sent to is here. */
export function MailPopupHost() {
  const { user, isPending } = useCurrentUserState();
  const [shown, setShown] = useState<(Slip & { key: number }) | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const release = useRef<() => void>(() => undefined);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (isPending || !userId) return;
    let live = true;
    let pointerDown = false;
    let lastPointer = 0;
    let showing = false;
    const queue: Slip[] = [];
    const held = new Set<string>();
    const down = () => { pointerDown = true; lastPointer = Date.now(); };
    const up = () => { pointerDown = false; lastPointer = Date.now(); };
    const downEvents = ["pointerdown", "touchstart", "keydown"] as const;
    const upEvents = ["pointerup", "pointercancel", "touchend", "keyup"] as const;
    downEvents.forEach((e) => window.addEventListener(e, down, true));
    upEvents.forEach((e) => window.addEventListener(e, up, true));

    const showNext = () => {
      if (!live || showing) return;
      const next = queue.shift();
      if (!next) return;
      showing = true;
      setShown({ ...next, key: Date.now() });
      void gcRead({ data: { ids: [next.id] } }).catch(() => undefined);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        if (!live) return;
        showing = false;
        setShown(null);
        window.setTimeout(showNext, 700);
      }, 8000);
    };
    release.current = () => {
      window.clearTimeout(hideTimer.current);
      showing = false;
      setShown(null);
      window.setTimeout(showNext, 700);
    };

    const poll = async () => {
      if (!live) return;
      if (pointerDown || Date.now() - lastPointer < 1500 || document.hidden) return;
      try {
        const row = await gcPops();
        for (const letter of row.letters ?? []) {
          if (held.has(letter.id)) continue;
          held.add(letter.id);
          queue.push(letter);
        }
        showNext();
      } catch {
        /* the post can wait */
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 12000);

    return () => {
      live = false;
      window.clearInterval(timer);
      window.clearTimeout(hideTimer.current);
      downEvents.forEach((e) => window.removeEventListener(e, down, true));
      upEvents.forEach((e) => window.removeEventListener(e, up, true));
      setShown(null);
    };
  }, [userId, isPending]);

  if (!shown) return null;
  return (
    <div
      key={shown.key}
      role="status"
      aria-live="polite"
      data-master-popup
      className="fixed top-14 inset-x-3 z-[91] sm:inset-x-auto sm:right-3 sm:w-[380px] border border-gold-line/55 bg-panel/95 text-ivory shadow-2xl backdrop-blur px-4 py-3 pr-10 font-[Outfit,sans-serif]"
    >
      <div className="flex items-center gap-1.5 text-xs font-bold text-gold-line">
        <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
        {shown.name} says:
      </div>
      <p className="mt-1 text-sm leading-snug break-words">{shown.text}</p>
      <button
        type="button"
        aria-label="Close"
        onClick={() => release.current()}
        className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center text-ivory/60 hover:text-ivory hover:bg-ink-soft"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
