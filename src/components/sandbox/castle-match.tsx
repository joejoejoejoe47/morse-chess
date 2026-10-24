"use client";
import { useMemo, useState } from "react";
import { CastleScene, VIEWS, type Piece } from "@/components/sandbox/castle-scene";

const ORDER = ["r", "n", "b", "q", "k", "b", "n", "r"] as const;

function start(): Piece[] {
  const out: Piece[] = [];
  for (let f = 0; f < 8; f++) {
    out.push({ id: `w-b-${f}`, side: "w", kind: ORDER[f], file: f, rank: 0, alive: true });
    out.push({ id: `w-p-${f}`, side: "w", kind: "p", file: f, rank: 1, alive: true });
    out.push({ id: `b-p-${f}`, side: "b", kind: "p", file: f, rank: 6, alive: true });
    out.push({ id: `b-b-${f}`, side: "b", kind: ORDER[f], file: f, rank: 7, alive: true });
  }
  return out;
}

function onBoard(file: number, rank: number) {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function legal(pieces: Piece[], p: Piece): { file: number; rank: number }[] {
  if (!p.alive) return [];
  const dir = p.side === "w" ? 1 : -1;
  const occ = (file: number, rank: number) => pieces.find((u) => u.alive && u.file === file && u.rank === rank);
  const out: { file: number; rank: number }[] = [];
  const ray = (df: number, dr: number) => {
    for (let s = 1; s < 8; s++) {
      const f = p.file + df * s;
      const r = p.rank + dr * s;
      if (!onBoard(f, r)) break;
      const foe = occ(f, r);
      if (foe) {
        if (foe.side !== p.side) out.push({ file: f, rank: r });
        break;
      }
      out.push({ file: f, rank: r });
    }
  };
  if (p.kind === "p") {
    const nf = p.file;
    const nr = p.rank + dir;
    if (onBoard(nf, nr) && !occ(nf, nr)) out.push({ file: nf, rank: nr });
    for (const df of [-1, 1]) {
      const cf = p.file + df;
      const cr = p.rank + dir;
      const foe = onBoard(cf, cr) ? occ(cf, cr) : undefined;
      if (foe && foe.side !== p.side) out.push({ file: cf, rank: cr });
    }
  } else if (p.kind === "n") {
    for (const [df, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
      const f = p.file + df;
      const r = p.rank + dr;
      if (!onBoard(f, r)) continue;
      const foe = occ(f, r);
      if (!foe || foe.side !== p.side) out.push({ file: f, rank: r });
    }
  } else if (p.kind === "k") {
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (!df && !dr) continue;
        const f = p.file + df;
        const r = p.rank + dr;
        if (!onBoard(f, r)) continue;
        const foe = occ(f, r);
        if (!foe || foe.side !== p.side) out.push({ file: f, rank: r });
      }
    }
  } else if (p.kind === "r") {
    ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1);
  } else if (p.kind === "b") {
    ray(1, 1); ray(1, -1); ray(-1, 1); ray(-1, -1);
  } else {
    ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1);
    ray(1, 1); ray(1, -1); ray(-1, 1); ray(-1, -1);
  }
  return out;
}

export function CastleMatch({ onExit }: { onExit: () => void }) {
  const [pieces, setPieces] = useState<Piece[]>(() => start());
  const [turn, setTurn] = useState<"w" | "b">("w");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<keyof typeof VIEWS>("table");
  const [note, setNote] = useState("Princess Aurora's court. White moves.");

  const moves = useMemo(() => {
    const p = pieces.find((u) => u.id === selected);
    if (!p || p.side !== turn) return [];
    return legal(pieces, p);
  }, [pieces, selected, turn]);

  function play(file: number, rank: number) {
    const p = pieces.find((u) => u.id === selected && u.side === turn);
    if (!p) return;
    if (!moves.some((m) => m.file === file && m.rank === rank)) return;
    const next = pieces.map((u) => {
      if (u.id === p.id) return { ...u, file, rank };
      if (u.alive && u.file === file && u.rank === rank && u.side !== p.side) return { ...u, alive: false };
      return u;
    });
    setPieces(next);
    const nextTurn = turn === "w" ? "b" : "w";
    setTurn(nextTurn);
    setSelected(null);
    setNote(nextTurn === "w" ? "White to move." : "Black to move.");
  }

  return (
    <main className="relative h-dvh bg-[#0e0c0a] text-[#f6efe2]">
      <div className="absolute inset-0">
        <CastleScene pieces={pieces} view={view} />
      </div>
      <header className="pointer-events-none absolute left-4 top-4 z-10">
        <p className="font-display text-3xl">Princess Aurora's Court</p>
        <p className="mt-1 text-sm text-[#f0e6d4]">{note}</p>
      </header>
      <aside className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        <div className="rounded-lg bg-black/55 p-2 text-xs">
          <p className="mb-1 uppercase tracking-[0.16em] text-[#e7c98a]">Views</p>
          {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((id) => (
            <button
              key={id}
              type="button"
              className="mr-1 mt-1 rounded-full border border-[#c9a46a] px-2 py-1"
              onClick={() => setView(id)}
            >
              {id}
            </button>
          ))}
        </div>
        <button type="button" className="rounded-full border border-[#e7dccb] px-3 py-1 text-xs" onClick={onExit}>
          Leave court
        </button>
      </aside>
      <div className="absolute bottom-4 left-4 z-10 grid grid-cols-8 gap-px rounded-xl bg-black/50 p-2">
        {Array.from({ length: 64 }, (_, i) => {
          const file = i % 8;
          const rank = Math.floor(i / 8);
          const here = pieces.find((u) => u.alive && u.file === file && u.rank === rank);
          const hot = moves.some((m) => m.file === file && m.rank === rank);
          return (
            <button
              key={`${file}${rank}`}
              type="button"
              className="h-7 w-7 text-[9px]"
              style={{
                background: (file + rank) % 2 ? "#6d5340" : "#cbb98a",
                outline: hot ? "2px solid #f2e2b0" : selected && here?.id === selected ? "2px solid #fff" : "none",
                color: "#1a120c",
              }}
              onClick={() => {
                if (here?.side === turn) setSelected(here.id);
                else if (hot) play(file, rank);
              }}
            >
              {here ? here.kind.toUpperCase() : ""}
            </button>
          );
        })}
      </div>
    </main>
  );
}
