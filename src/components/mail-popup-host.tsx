import { useEffect, useRef, useState } from "react";
import { MessageSquareText, Reply, Send, X } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { gcPops, gcRead, sendMail } from "@/lib/server/mail";

type Slip = { id: string; fromId?: string; name: string; text: string };

/** A GC letter, in the same slip MasterGus uses, once the person it was sent to is here. */
export function MailPopupHost() {
  const { user, isPending } = useCurrentUserState();
  const [shown, setShown] = useState<(Slip & { key: number }) | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const release = useRef<() => void>(() => undefined);
  const userId = user?.id ?? null;
  // Respond: a quick reply box right in the slip (owner t196u).
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [replyError, setReplyError] = useState("");
  const replyBox = useRef<HTMLTextAreaElement | null>(null);

  // A new slip starts with the reply box closed.
  useEffect(() => {
    setReplying(false);
    setDraft("");
    setSending(false);
    setSent(false);
    setReplyError("");
  }, [shown?.key]);

  useEffect(() => {
    if (replying && !sent) replyBox.current?.focus();
  }, [replying, sent]);

  function respond() {
    // Keep the slip up while they write.
    window.clearTimeout(hideTimer.current);
    setReplying(true);
  }

  async function sendReply() {
    if (!shown?.fromId || !draft.trim() || sending) return;
    setSending(true);
    setReplyError("");
    try {
      await sendMail({ data: { userId: shown.fromId, body: draft.trim() } });
      setSent(true);
      setDraft("");
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => release.current(), 1800);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "The reply did not go.");
    } finally {
      setSending(false);
    }
  }

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
      {shown.fromId ? (
        sent ? (
          <p data-mail-reply-sent className="mt-2 text-sm font-semibold text-gold-line">
            Sent to {shown.name}!
          </p>
        ) : replying ? (
          <form
            className="mt-2 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendReply();
            }}
          >
            <textarea
              ref={replyBox}
              data-mail-reply-box
              aria-label={`Reply to ${shown.name}`}
              rows={2}
              maxLength={2000}
              value={draft}
              placeholder={`Reply to ${shown.name}…`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendReply();
                }
              }}
              className="min-h-[44px] flex-1 resize-none border border-line bg-ink/70 px-2 py-1.5 text-sm text-ivory placeholder:text-mist focus:border-gold-line focus:outline-none"
            />
            <button
              type="submit"
              data-mail-reply-send
              disabled={sending || !draft.trim()}
              className="flex h-11 items-center gap-1.5 bg-gold-line px-3 text-sm font-bold text-ink disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden />
              {sending ? "Sending" : "Send"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            data-mail-respond
            onClick={respond}
            className="mt-2 flex h-9 items-center gap-1.5 border border-gold-line/70 px-3 text-sm font-bold text-gold-line hover:bg-gold-line hover:text-ink"
          >
            <Reply className="h-4 w-4" aria-hidden />
            Respond
          </button>
        )
      ) : null}
      {replyError ? <p className="mt-1 text-xs text-danger">{replyError}</p> : null}
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
