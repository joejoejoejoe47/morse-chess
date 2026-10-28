import { useEffect, useState } from "react";
import { getFootballPrefs, savePieceName } from "@/lib/server/football";

/* Board collection: tap a piece to give it a name. Names are saved per board on the server and
   the football game uses them for the replay caption ("<name> scored"). */

const FILES = "abcdefgh";
const BACK = ["r", "n", "b", "q", "k", "b", "n", "r"] as const;
const GLYPH: Record<string, string> = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" };
const KIND: Record<string, string> = { k: "King", q: "Queen", r: "Rook", b: "Bishop", n: "Knight", p: "Pawn" };
const SLOTS = [
  ...BACK.map((k, f) => ({ slot: `${FILES[f]}1`, kind: k as string })),
  ...Array.from({ length: 8 }, (_, f) => ({ slot: `${FILES[f]}2`, kind: "p" })),
];

export function PieceNames({ boardId, boardName, onClose }: { boardId: string; boardName: string; onClose: () => void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getFootballPrefs()
      .then((p) => live && setNames(p.names?.[boardId] ?? {}))
      .catch(() => live && setError("Sign in to name your pieces."))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [boardId]);

  const picked = SLOTS.find((s) => s.slot === pick) ?? null;

  async function save(slot: string, name: string) {
    setBusy(true);
    setError(null);
    try {
      const p = await savePieceName({ data: { boardId, slot, name: name.trim() } });
      setNames(p.names?.[boardId] ?? {});
      setPick(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that name.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-auto w-full max-w-md rounded-xl border border-line bg-ink/90 p-4 text-ivory shadow-2xl backdrop-blur-md" data-piece-names>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-xl">{boardName} pieces</p>
          <p className="text-[13px] text-mist">Tap a piece to name it. Football shouts its name when it scores.</p>
        </div>
        <button type="button" aria-label="Close" className="-mr-1 -mt-1 grid size-9 place-items-center rounded-md text-xl text-mist hover:text-ivory" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="mt-3 grid grid-cols-8 gap-1.5">
        {SLOTS.map(({ slot, kind }) => (
          <button
            key={slot}
            type="button"
            disabled={!loaded}
            title={names[slot] ?? KIND[kind]}
            data-slot={slot}
            onClick={() => {
              setPick(slot);
              setDraft(names[slot] ?? "");
              setError(null);
            }}
            className={`flex aspect-[3/4] min-w-0 flex-col items-center justify-center rounded-lg border px-0.5 ${pick === slot ? "border-[#ffe14a] bg-[#ffe14a]/15" : names[slot] ? "border-gold-line/70 bg-panel" : "border-line bg-panel/60"}`}
          >
            <span className="text-2xl leading-none">{GLYPH[kind]}</span>
            <span className="mt-1 w-full truncate text-center text-[9px] leading-tight text-mist">{names[slot] ?? ""}</span>
          </button>
        ))}
      </div>
      {picked ? (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save(picked.slot, draft);
          }}
        >
          <span className="shrink-0 text-sm text-mist">{GLYPH[picked.kind]} {KIND[picked.kind]}</span>
          <input
            autoFocus
            value={draft}
            maxLength={16}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Name this ${KIND[picked.kind].toLowerCase()}`}
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-base text-ivory outline-none placeholder:text-mist focus:border-gold-line"
          />
          <button type="submit" disabled={busy} className="min-h-10 shrink-0 rounded-full bg-ivory px-4 text-sm font-bold text-ink disabled:opacity-60">
            {busy ? "…" : "Save"}
          </button>
        </form>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
