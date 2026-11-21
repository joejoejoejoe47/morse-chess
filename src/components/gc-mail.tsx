import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { isChatImage, shrinkChatImage } from "@/lib/chat-image";
import { gcThread, giveCoins, listGc, sendMail, type GcLetter, type GcPerson } from "@/lib/server/mail";
import { getPurse } from "@/lib/server/mores";
import { playSfx } from "@/lib/legendary/sfx";
import { asset } from "@/lib/base";
import { activeSeason, LEGENDARY } from "@/lib/legendary/theme";
import { SeasonBackdrop } from "@/components/legendary/bits";
import { cn } from "@/lib/utils";

const INK = ["#6b4a2a", "#3d5c45", "#7a3d3d", "#3e4d6b", "#6b5a2a", "#4a3d5c"];
/** Legendary medallion enamel: green, blue, bronze, olive, gold, indigo, crimson, amber. */
const ENAMEL = ["#2f6a2c", "#2b4590", "#7a4a1e", "#4f6e26", "#857224", "#3f3c94", "#8a2424", "#76601c"];
const VIDEO_MAX = 3_200_000;
const VIDEO_URL_MAX = 4_800_000;

export type GcOpen = { userId?: string; playId?: string };

/** Open GC from anywhere. Play on a letter opens that person's chat. */
export function openGc(detail: GcOpen = {}) {
  window.dispatchEvent(new CustomEvent("morse-open-gc", { detail }));
}

export function GcHost() {
  const [open, setOpen] = useState<(GcOpen & { nonce: number }) | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const detail = ((e as CustomEvent<GcOpen>).detail ?? {}) as GcOpen;
      setOpen({ ...detail, nonce: Date.now() });
    };
    window.addEventListener("morse-open-gc", on);
    return () => window.removeEventListener("morse-open-gc", on);
  }, []);
  if (!open) return null;
  return <GcMail key={open.nonce} userId={open.userId} playId={open.playId} onClose={() => setOpen(null)} />;
}

function tint(name: string) {
  const pal = LEGENDARY ? ENAMEL : INK;
  let n = 0;
  for (const ch of name) n = (n + ch.charCodeAt(0)) % pal.length;
  return pal[n];
}

function when(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

type Attach = { kind: "image" | "video"; media: string };

function fileKind(file: File): "image" | "video" | "" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  const name = file.name.toLowerCase();
  if (/\.(png|jpe?g|webp|gif)$/.test(name)) return "image";
  if (/\.(mp4|webm|mov|ogg)$/.test(name)) return "video";
  return "";
}

function pastedFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  const direct = [...data.files].find((item) => fileKind(item) !== "");
  if (direct) return direct;
  for (const item of data.items) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file && fileKind(file) !== "") return file;
  }
  return null;
}

function readVideo(file: File): Promise<string> {
  const type = file.type.startsWith("video/") ? file.type.split(";")[0] : file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : file.name.toLowerCase().endsWith(".webm") ? "video/webm" : file.name.toLowerCase().endsWith(".ogg") ? "video/ogg" : "video/mp4";
  if (!["video/mp4", "video/webm", "video/ogg", "video/quicktime"].includes(type)) {
    return Promise.reject(new Error("That video is not a kind this chat can play."));
  }
  if (file.size > VIDEO_MAX) return Promise.reject(new Error("That video is too big."));
  const named = file.type === type ? file : new File([file], file.name || "video", { type });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that video."));
    reader.onload = () => {
      const media = String(reader.result || "");
      if (!media.startsWith(`data:${type};base64,`) || media.length > VIDEO_URL_MAX) {
        reject(new Error("That video is too big, or it is not a video."));
        return;
      }
      resolve(media);
    };
    reader.readAsDataURL(named);
  });
}

export function GcMail({ onClose, userId, playId }: { onClose: () => void; userId?: string; playId?: string }) {
  const [people, setPeople] = useState<GcPerson[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<GcPerson | null>(null);
  const [letters, setLetters] = useState<GcLetter[]>([]);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<Attach | null>(null);
  const [dropOver, setDropOver] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [gift, setGift] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  async function load(query = q) {
    const row = await listGc({ data: { q: query } });
    setPeople(row.people ?? []);
  }

  useEffect(() => {
    void load("").catch((err) => setError(err instanceof Error ? err.message : "The post did not open."));
    // first open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onMail = () => void load(q).catch(() => undefined);
    window.addEventListener("morse-gc-mail", onMail);
    const timer = window.setInterval(() => void load(q).catch(() => undefined), 1000);
    return () => {
      window.removeEventListener("morse-gc-mail", onMail);
      window.clearInterval(timer);
    };
  }, [q]);

  async function choose(person: GcPerson) {
    stick.current = true;
    setOpen(person);
    setError("");
    setDraft("");
    setFile(null);
    try {
      const row = await gcThread({ data: { userId: person.userId } });
      setOpen({ ...person, userId: row.userId, username: row.username, letter: row.letter });
      setLetters(row.letters ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That letter did not open.");
    }
  }

  useEffect(() => {
    if (!userId) return;
    void choose({ userId, username: "…", letter: "?", preview: "", at: "", unread: false });
    // open the thread the play button asked for
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const who = open?.userId;
    if (!who) return;
    let live = true;
    let generation = 0;
    let lastKey = "";
    const pull = async () => {
      if (!live) return;
      try {
        const row = await gcThread({ data: { userId: who, lite: true } });
        if (!live) return;
        const next = row.letters ?? [];
        const key = next.map((letter) => letter.id).join(".");
        if (key === lastKey) return;
        const gen = ++generation;
        const full = await gcThread({ data: { userId: who } });
        if (!live || gen !== generation) return;
        lastKey = key;
        const arrived = full.letters ?? [];
        setLetters(arrived);
        const last = arrived[arrived.length - 1];
        if (last && !last.mine) stick.current = true;
      } catch {
        /* keep the letters already on screen */
      }
    };
    const timer = window.setInterval(() => void pull(), 800);
    const onMail = () => void pull();
    window.addEventListener("morse-gc-mail", onMail);
    void pull();
    return () => {
      live = false;
      generation += 1;
      window.clearInterval(timer);
      window.removeEventListener("morse-gc-mail", onMail);
    };
  }, [open?.userId]);

  useEffect(() => {
    if (!stick.current) return;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [letters.length, open?.userId]);

  async function take(dropped: File | null | undefined) {
    if (!dropped) return;
    setError("");
    const kind = fileKind(dropped);
    try {
      if (kind === "image") {
        const named = dropped.type.startsWith("image/") ? dropped : new File([dropped], dropped.name || "picture", { type: "image/jpeg" });
        setFile({ kind: "image", media: await shrinkChatImage(named) });
      } else if (kind === "video") {
        setFile({ kind: "video", media: await readVideo(dropped) });
      } else {
        setError("Drop a picture or a video.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That file did not open.");
    }
  }

  async function send() {
    if (!open || busy || (!draft.trim() && !file)) return;
    setBusy(true);
    setError("");
    try {
      await sendMail({ data: { userId: open.userId, body: draft.trim(), media: file?.media ?? "", kind: file?.kind ?? "" } });
      setDraft("");
      setFile(null);
      const row = await gcThread({ data: { userId: open.userId } });
      setLetters(row.letters ?? []);
      void load(q).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The letter did not go.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("fixed inset-0 z-[100] flex flex-col bg-ink text-ivory", LEGENDARY && "mcg", open && "is-thread")} data-gc-open={open?.userId ?? ""}>
      {LEGENDARY ? (
        <>
          <SeasonBackdrop season={activeSeason()} />
          <div className="mcg-tint pointer-events-none fixed inset-0 z-0" />
        </>
      ) : (
        <div className="check-wash pointer-events-none absolute inset-0" />
      )}
      <header className="mcg-top relative z-10 flex items-center gap-3 border-b border-line bg-ink/88 px-4 py-3 backdrop-blur-md">
        {LEGENDARY ? <i className="mcg-corner is-l" aria-hidden /> : null}
        {LEGENDARY ? <i className="mcg-corner is-r" aria-hidden /> : null}
        {LEGENDARY ? <i className="mcg-gem is-l" aria-hidden /> : null}
        {LEGENDARY ? <i className="mcg-gem is-r" aria-hidden /> : null}
        <button type="button" aria-label="Close" className="mcg-x grid size-11 place-items-center text-mist hover:text-ivory" onClick={onClose}>
          <X className="size-5" />
        </button>
        <h1 className="mcg-title font-display text-3xl tracking-[0.18em] text-ivory" data-text="GC">GC</h1>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            void load(e.target.value).catch(() => undefined);
          }}
          placeholder="Search people"
          aria-label="Search people"
          className="mcg-search ml-auto w-full max-w-md rounded-full border border-line bg-ink-soft px-4 py-2 text-sm text-ivory outline-none placeholder:text-mist"
        />
      </header>

      {error ? <p className="mcg-error relative px-4 pt-3 text-sm text-[#e07a7a]">{error}</p> : null}

      {open ? (
        <section
          className="mcg-thread relative flex min-h-0 flex-1 flex-col"
          onDragEnter={(e) => {
            if (![...e.dataTransfer.types].includes("Files")) return;
            e.preventDefault();
            setDropOver(true);
          }}
          onDragOver={(e) => {
            if (![...e.dataTransfer.types].includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDropOver(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDropOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDropOver(false);
            void take(e.dataTransfer.files?.[0]);
          }}
        >
          {dropOver ? (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/55 text-sm text-ivory">
              Drop the picture or video
            </div>
          ) : null}
          <button type="button" className="mcg-who flex items-center gap-3 border-b border-line px-4 py-3 text-left" onClick={() => setOpen(null)}>
            <span className="mcg-back text-mist">‹</span>
            <Letter name={open.username} letter={open.letter} />
            <span className="mcg-name font-display text-2xl text-ivory">{open.username}</span>
          </button>
          <div
            ref={scroller}
            className="mcg-letters mcg-scroll min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4"
            onScroll={() => {
              const el = scroller.current;
              if (!el) return;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
          >
            {letters.length === 0 ? <p className="text-sm text-mist">No letters yet. Write the first one.</p> : null}
            {letters.map((letter) =>
              letter.kind === "coins" ? (
                <GiftCard key={letter.id} letter={letter} other={open.username} />
              ) : (
              <article key={letter.id} className={cn("mcg-letter rounded-md border border-line bg-panel/80 px-4 py-3", letter.mine && "is-mine")}>
                <div className="flex items-center gap-3">
                  <Letter name={letter.mine ? "Me" : open.username} letter={letter.mine ? "M" : open.letter} />
                  <div className="min-w-0">
                    <p className="mcg-lname font-medium text-ivory">{letter.mine ? "Me" : open.username}</p>
                    <p className="mcg-time text-xs text-mist">{when(letter.at)}</p>
                  </div>
                </div>
                <LetterMedia letter={letter} play={letter.id === playId} />
                {letter.body ? <p className="mcg-body mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ivory">{letter.body}</p> : null}
              </article>
              ),
            )}
          </div>
          <form
            className="mcg-compose relative border-t border-line bg-ink/90 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {file ? (
              <div className="mb-2 flex items-center gap-2">
                {file.kind === "image" ? <img src={file.media} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-line">Video ready</span>}
                <button type="button" className="text-xs text-mist hover:text-ivory" onClick={() => setFile(null)}>
                  Remove
                </button>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onPaste={(e) => {
                  const next = pastedFile(e.clipboardData);
                  if (!next) return;
                  e.preventDefault();
                  void take(next);
                }}
                placeholder={`Write to ${open.username}, or drop a picture or video`}
                className="mcg-draft min-w-0 flex-1 rounded-full border border-line bg-ink-soft px-4 py-3 text-sm text-ivory outline-none placeholder:text-mist"
              />
              <input
                ref={picker}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const next = e.target.files?.[0];
                  e.target.value = "";
                  void take(next);
                }}
              />
              {LEGENDARY ? (
                <button type="button" aria-label={`Give Morse Coins to ${open.username}`} title="Give Morse Coins" className="mcg-coinbtn" data-give-coins onClick={() => setGift(true)}>
                  <img src={asset("/morse-coin.png")} alt="" draggable={false} />
                </button>
              ) : null}
              <button type="button" aria-label="Add a picture or a video" className="mcg-pick grid size-11 place-items-center rounded-full border border-line text-ivory" onClick={() => picker.current?.click()}>
                <ImagePlus className="size-4" />
              </button>
              <button type="submit" disabled={busy || (!draft.trim() && !file)} className="mcg-send rounded-full border border-gold-line bg-walnut px-5 py-3 text-sm font-medium text-cream disabled:opacity-50">
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
          {gift ? (
            <GiveCoins
              to={open}
              onClose={() => setGift(false)}
              onGiven={async (coins) => {
                window.dispatchEvent(new CustomEvent("morse-coins", { detail: { coins } }));
                stick.current = true;
                try {
                  const row = await gcThread({ data: { userId: open.userId } });
                  setLetters(row.letters ?? []);
                } catch {
                  /* the poll brings the gift letter in */
                }
                void load(q).catch(() => undefined);
              }}
            />
          ) : null}
        </section>
      ) : (
        <ul className="mcg-list mcg-scroll relative min-h-0 flex-1 overflow-auto">
          {people.length === 0 ? <li className="px-4 py-8 text-sm text-mist">No one else is at the club yet.</li> : null}
          {people.map((person) => (
            <li key={person.userId}>
              <button type="button" onClick={() => void choose(person)} className={cn("mcg-row flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left hover:bg-panel", person.unread && "is-unread")}>
                <Letter name={person.username} letter={person.letter} />
                <span className="min-w-0 flex-1">
                  <span className={"mcg-name block truncate text-[15px] " + (person.unread ? "font-semibold text-ivory" : "text-ivory")}>{person.username}</span>
                  <span className="mcg-prev block truncate text-sm text-mist">{person.preview || "No letters yet"}</span>
                </span>
                <span className="mcg-time shrink-0 text-xs text-mist">{when(person.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {LEGENDARY ? <p className="mcg-copy">© {new Date().getFullYear()} Morse Chess Legendary. Same club, same coins.</p> : null}
    </div>
  );
}

function LetterMedia({ letter, play }: { letter: GcLetter; play: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [big, setBig] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (!play || letter.kind !== "video" || started.current) return;
    started.current = true;
    video.current?.scrollIntoView({ block: "center" });
    void video.current?.play().catch(() => undefined);
  }, [play, letter.kind]);
  if (letter.kind === "image" && isChatImage(letter.media)) {
    return (
      <>
        <button type="button" className="mt-3 block" onClick={() => setBig(true)} aria-label="Open picture">
          <img src={letter.media} alt="" className="max-h-44 rounded-md object-contain" />
        </button>
        {big ? (
          <button type="button" className="fixed inset-0 z-[120] grid place-items-center bg-black/85 p-3" onClick={() => setBig(false)} aria-label="Close picture">
            <img src={letter.media} alt="" className="max-h-[94vh] max-w-[96vw] object-contain" />
          </button>
        ) : null}
      </>
    );
  }
  if (letter.kind === "video" && letter.media) {
    return <video ref={video} src={letter.media} controls playsInline className="mt-3 max-h-72 w-full rounded-md bg-black" />;
  }
  return null;
}

function Letter({ name, letter }: { name: string; letter: string }) {
  return (
    <span className="mcg-medal grid size-10 shrink-0 place-items-center rounded-full font-display text-xl text-ivory" style={{ background: tint(name), ["--enamel" as string]: tint(name) }}>
      {letter}
    </span>
  );
}

function plural(n: number) {
  return `${n.toLocaleString()} Morse ${n === 1 ? "Coin" : "Coins"}`;
}

/** The gold coin card a gift leaves in the chat. Worded for whoever is reading it. */
function GiftCard({ letter, other }: { letter: GcLetter; other: string }) {
  const n = letter.amount ?? 0;
  const text = letter.mine ? `You gave ${other} ${plural(n)}!` : `${other} gave you ${plural(n)}!`;
  return (
    <article data-gift={n} className={cn("mcg-gift flex items-center gap-3 rounded-md border border-[#c9a24a] bg-[#2a2010] px-4 py-3", letter.mine && "is-mine ml-auto")}>
      <img src={asset("/morse-coin.png")} alt="" className="mcg-gift-coin size-10 shrink-0 rounded-full" draggable={false} />
      <div className="min-w-0">
        <p className="mcg-gift-eyebrow text-[11px] uppercase tracking-[0.16em] text-[#d9b65e]">Morse Coin gift</p>
        <p className="mcg-gift-text text-[15px] font-medium text-ivory">{text}</p>
        <p className="mcg-time text-xs text-mist">{when(letter.at)}</p>
      </div>
      <span className="mcg-gift-amt ml-auto shrink-0 font-display text-2xl text-[#f2cf6b]">{letter.mine ? "−" : "+"}{n.toLocaleString()}</span>
    </article>
  );
}

const QUICK = [5, 10, 25, 50];

/** Give Morse Coins popup: pick an amount, confirm, the server moves the coins. */
function GiveCoins({ to, onClose, onGiven }: { to: GcPerson; onClose: () => void; onGiven: (coins: number) => void | Promise<void> }) {
  const [purse, setPurse] = useState<number | null>(null);
  const [amount, setAmount] = useState("10");
  const [step, setStep] = useState<"pick" | "confirm" | "done">("pick");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getPurse()
      .then((p) => setPurse((p as { coins?: number } | null)?.coins ?? 0))
      .catch(() => setPurse(null));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const n = /^\d+$/.test(amount.trim()) ? Number(amount.trim()) : 0;
  const tooMuch = purse !== null && n > purse;
  const bad = n < 1 ? "Pick at least 1 coin." : n > 10000 ? "Up to 10,000 coins at a time." : tooMuch ? "You don't have that many coins." : "";

  async function give() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await giveCoins({ data: { userId: to.userId, amount: n } });
      setPurse(r.coins);
      setStep("done");
      playSfx("coin");
      await onGiven(r.coins);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The coins did not go.");
      setStep("pick");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mcg-give-wrap fixed inset-0 z-[130] grid place-items-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Give Morse Coins to ${to.username}`} className="mcg-give relative w-full max-w-sm rounded-xl border border-[#c9a24a] bg-[#1b1424] p-5 text-ivory">
        <button type="button" aria-label="Close" className="mcg-give-x absolute right-3 top-3 grid size-9 place-items-center text-mist hover:text-ivory" onClick={onClose}>
          <X className="size-4" />
        </button>
        <img src={asset("/morse-coin.png")} alt="" className="mcg-give-coin mx-auto size-16 rounded-full" draggable={false} />
        <h2 className="mcg-give-title mt-2 text-center font-display text-2xl">
          Give Morse Coins to <span className="mcg-give-name">{to.username}</span>
        </h2>
        <p className="mcg-give-bal mt-1 text-center text-sm text-mist">
          Your balance: <b>{purse === null ? "…" : purse.toLocaleString()}</b> coins
        </p>
        {step === "done" ? (
          <div className="mcg-give-done mt-5 text-center">
            <p className="text-lg">Sent {plural(n)} to {to.username}!</p>
            <button type="button" className="mcg-give-btn mt-4 w-full rounded-full px-5 py-3" onClick={onClose}>
              Done
            </button>
          </div>
        ) : step === "confirm" ? (
          <div className="mcg-give-confirm mt-5 text-center">
            <p className="text-base">
              Give <b>{plural(n)}</b> to <b>{to.username}</b>? This can&apos;t be undone.
            </p>
            {err ? <p className="mcg-give-err mt-2 text-sm text-[#ff8f8f]">{err}</p> : null}
            <div className="mt-4 flex gap-2">
              <button type="button" className="mcg-give-back flex-1 rounded-full border border-line px-4 py-3" onClick={() => setStep("pick")} disabled={busy}>
                Back
              </button>
              <button type="button" className="mcg-give-btn flex-1 rounded-full px-4 py-3" data-give-confirm onClick={() => void give()} disabled={busy}>
                {busy ? "Giving…" : "Yes, give"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mcg-give-pick mt-4">
            <div className="grid grid-cols-4 gap-2">
              {QUICK.map((q) => (
                <button key={q} type="button" className={cn("mcg-give-quick rounded-full border border-line py-2 text-sm", n === q && "is-on")} onClick={() => setAmount(String(q))}>
                  {q}
                </button>
              ))}
            </div>
            <label className="mt-3 block">
              <span className="sr-only">Amount</span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                aria-label="Amount of Morse Coins"
                className="mcg-give-amt w-full rounded-full border border-line bg-ink-soft px-4 py-3 text-center text-lg text-ivory outline-none"
                data-give-amount
              />
            </label>
            {bad || err ? <p className="mcg-give-err mt-2 text-center text-sm text-[#ff8f8f]">{err || bad}</p> : null}
            <button type="button" className="mcg-give-btn mt-4 w-full rounded-full px-5 py-3" data-give-next disabled={!!bad} onClick={() => { setErr(""); setStep("confirm"); }}>
              Give {n > 0 ? plural(n) : "coins"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
