import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { gcThread, listGc, sendMail, type GcLetter, type GcPerson } from "@/lib/server/mail";

const INK = ["#6b4a2a", "#3d5c45", "#7a3d3d", "#3e4d6b", "#6b5a2a", "#4a3d5c"];

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

export function GcMail({ onClose }: { onClose: () => void }) {
  const [people, setPeople] = useState<GcPerson[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<GcPerson | null>(null);
  const [letters, setLetters] = useState<GcLetter[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(query = q) {
    const row = await listGc({ data: { q: query } });
    setPeople(row.people ?? []);
  }

  useEffect(() => {
    void load("").catch((err) => setError(err instanceof Error ? err.message : "The post did not open."));
    // first open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(person: GcPerson) {
    setOpen(person);
    setError("");
    setDraft("");
    try {
      const row = await gcThread({ data: { userId: person.userId } });
      setLetters(row.letters ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That letter did not open.");
    }
  }

  async function send() {
    if (!open || !draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      await sendMail({ data: { userId: open.userId, body: draft.trim() } });
      setDraft("");
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
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-ivory">
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
        <section className="relative flex min-h-0 flex-1 flex-col">
          <button type="button" className="flex items-center gap-3 border-b border-line px-4 py-3 text-left" onClick={() => setOpen(null)}>
            <span className="text-mist">‹</span>
            <Letter name={open.username} letter={open.letter} />
            <span className="font-display text-2xl text-ivory">{open.username}</span>
          </button>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
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
                <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ivory">{letter.body}</p>
              </article>
            ))}
          </div>
          <form
            className="relative flex items-center gap-2 border-t border-line bg-ink/90 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Write to ${open.username}`}
              className="min-w-0 flex-1 rounded-full border border-line bg-ink-soft px-4 py-3 text-sm text-ivory outline-none placeholder:text-mist"
            />
            <button type="submit" disabled={busy || !draft.trim()} className="rounded-full border border-gold-line bg-walnut px-5 py-3 text-sm font-medium text-cream disabled:opacity-50">
              {busy ? "Sending…" : "Send"}
            </button>
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

function Letter({ name, letter }: { name: string; letter: string }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full font-display text-xl text-ivory" style={{ background: tint(name) }}>
      {letter}
    </span>
  );
}
