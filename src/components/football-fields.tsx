import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { asset } from "@/lib/base";
import { getFootballPrefs, saveFootballField, type FootballField } from "@/lib/server/football";
import { cn } from "@/lib/utils";

const PICTURES: Record<FootballField, { src: string; alt: string }> = {
  park: { src: "/football/park-field.jpg", alt: "Park Field" },
  neon: { src: "/football/neon-stadium.jpg", alt: "Neon Stadium" },
};

/** The real field, the same picture as the game, on the Boards page. */
function FieldPicture({ field }: { field: FootballField }) {
  const pic = PICTURES[field];
  return (
    <img
      src={asset(pic.src)}
      alt={pic.alt}
      className="aspect-[20/13] w-full rounded-lg border border-black/30 object-cover"
    />
  );
}

const FIELDS: { id: FootballField; name: string; blurb: string }[] = [
  { id: "neon", name: "Neon Stadium", blurb: "Night game under the neon lights, city skyline behind." },
  { id: "park", name: "Park Field", blurb: "Daytime grass in the town park, wooden bleachers and a jumbotron." },
];

/** Boards page: pick the field the football game is played on. Both are free. */
export function FootballFields() {
  const [using, setUsing] = useState<FootballField | null>(null);
  const [busy, setBusy] = useState<FootballField | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getFootballPrefs()
      .then((p) => live && setUsing(p.field ?? "neon"))
      .catch(() => live && setUsing("neon"));
    return () => {
      live = false;
    };
  }, []);
  const pick = async (id: FootballField) => {
    if (busy || id === using) return;
    setBusy(id);
    setErr(null);
    try {
      const p = await saveFootballField({ data: { field: id } });
      setUsing(p.field ?? id);
    } catch {
      setErr("Could not save that. Try again.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="relative mt-12" data-football-fields>
      <p className="text-xs uppercase tracking-[0.2em] text-mist">Football</p>
      <h2 className="mt-2 font-display text-3xl text-ivory">Football fields</h2>
      <p className="mt-2 max-w-xl text-base text-mist">Pick where your football games are played. Both fields are free.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => {
          const on = using === f.id;
          return (
            <button
              key={f.id}
              type="button"
              data-field={f.id}
              onClick={() => void pick(f.id)}
              className={cn(
                "rounded-xl border p-3 text-left transition-[border-color,transform] hover:-translate-y-0.5 hover:border-line-strong",
                on ? "border-gold-line bg-panel" : "border-line bg-panel/80",
              )}
            >
              <FieldPicture field={f.id} />
              <div className="mt-3 flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xl text-ivory">{f.name}</p>
                  <p className="mt-0.5 text-[13px] text-mist">{f.blurb}</p>
                  <p className="mt-0.5 text-[13px] text-mist">Free</p>
                </div>
                <span className="shrink-0 rounded-full border border-line px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-ivory">
                  {busy === f.id ? "Saving…" : on ? "Using" : "Use"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {err ? <p className="mt-3 text-sm text-[#ff8a8a]">{err}</p> : null}
      <div className="mt-4">
        <Link to="/variant/$mode" params={{ mode: "football" }} className="text-sm text-gold-line underline-offset-4 hover:underline">
          Play football
        </Link>
      </div>
    </section>
  );
}
