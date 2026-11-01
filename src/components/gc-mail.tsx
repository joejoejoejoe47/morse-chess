import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { isChatImage, shrinkChatImage } from "@/lib/chat-image";
import { gcThread, listGc, sendMail, type GcLetter, type GcPerson } from "@/lib/server/mail";

const INK = ["#6b4a2a", "#3d5c45", "#7a3d3d", "#3e4d6b", "#6b5a2a", "#4a3d5c"];
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
  let n = 0;
  for (const ch of name) n = (n + ch.charCodeAt(0)) % INK.length;
  return INK[n];
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
    <div className="fixed inset-0 z-[100] flex flex-col bg-ink text-ivory" data-gc-open={open?.userId ?? ""}>
      <div className="check-wash pointer-events-none absolute inset-0" />
      <header className="relative z-10 flex items-center gap-3 border-b border-line bg-ink/88 px-4 py-3 backdrop-blur-md">
        <button type="button" aria-label="Close" className="grid size-11 place-items-center text-mist hover:text-ivory" onClick={onClose}>
          <X className="size-5" />
        </button>
        <h1 className="font-display text-3xl tracking-[0.18em] text-ivory">GC</h1>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            void load(e.target.value).catch(() => undefined);
          }}
          placeholder="Search people"
          className="ml-auto w-full max-w-md rounded-full border border-line bg-ink-soft px-4 py-2 text-sm text-ivory outline-none placeholder:text-mist"
        />
      </header>

      {error ? <p className="relative px-4 pt-3 text-sm text-[#e07a7a]">{error}</p> : null}

      {open ? (
        <section
          className="relative flex min-h-0 flex-1 flex-col"
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
          <button type="button" className="flex items-center gap-3 border-b border-line px-4 py-3 text-left" onClick={() => setOpen(null)}>
            <span className="text-mist">‹</span>
            <Letter name={open.username} letter={open.letter} />
            <span className="font-display text-2xl text-ivory">{open.username}</span>
          </button>
          <div
            ref={scroller}
            className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4"
            onScroll={() => {
              const el = scroller.current;
              if (!el) return;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
          >
            {letters.length === 0 ? <p className="text-sm text-mist">No letters yet. Write the first one.</p> : null}
            {letters.map((letter) => (
              <article key={letter.id} className="rounded-md border border-line bg-panel/80 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Letter name={letter.mine ? "Me" : open.username} letter={letter.mine ? "M" : open.letter} />
                  <div className="min-w-0">
                    <p className="font-medium text-ivory">{letter.mine ? "Me" : open.username}</p>
                    <p className="text-xs text-mist">{when(letter.at)}</p>
                  </div>
                </div>
                <LetterMedia letter={letter} play={letter.id === playId} />
                {letter.body ? <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ivory">{letter.body}</p> : null}
              </article>
            ))}
          </div>
          <form
            className="relative border-t border-line bg-ink/90 px-4 py-3"
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
                className="min-w-0 flex-1 rounded-full border border-line bg-ink-soft px-4 py-3 text-sm text-ivory outline-none placeholder:text-mist"
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
              <button type="button" aria-label="Add a picture or a video" className="grid size-11 place-items-center rounded-full border border-line text-ivory" onClick={() => picker.current?.click()}>
                <ImagePlus className="size-4" />
              </button>
              <button type="submit" disabled={busy || (!draft.trim() && !file)} className="rounded-full border border-gold-line bg-walnut px-5 py-3 text-sm font-medium text-cream disabled:opacity-50">
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <ul className="relative min-h-0 flex-1 overflow-auto">
          {people.length === 0 ? <li className="px-4 py-8 text-sm text-mist">No one else is at the club yet.</li> : null}
          {people.map((person) => (
            <li key={person.userId}>
              <button type="button" onClick={() => void choose(person)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left hover:bg-panel">
                <Letter name={person.username} letter={person.letter} />
                <span className="min-w-0 flex-1">
                  <span className={"block truncate text-[15px] " + (person.unread ? "font-semibold text-ivory" : "text-ivory")}>{person.username}</span>
                  <span className="block truncate text-sm text-mist">{person.preview || "No letters yet"}</span>
                </span>
                <span className="shrink-0 text-xs text-mist">{when(person.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
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
    <span className="grid size-10 shrink-0 place-items-center rounded-full font-display text-xl text-ivory" style={{ background: tint(name) }}>
      {letter}
    </span>
  );
}
