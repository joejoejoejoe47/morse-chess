import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getFootballPrefs, saveFootballField, type FootballField } from "@/lib/server/football";
import { cn } from "@/lib/utils";

/** A little drawn picture of each football field (no 3D on the Boards page). */
function FieldPicture({ field }: { field: FootballField }) {
  const park = field === "park";
  return (
    <svg viewBox="0 0 200 130" className="aspect-[20/13] w-full overflow-hidden rounded-lg border border-black/30" role="img" aria-label={park ? "Park Field picture" : "Neon Stadium picture"}>
      <defs>
        <linearGradient id={`sky-${field}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={park ? "#4f8fe0" : "#04050d"} />
          <stop offset="1" stopColor={park ? "#cfe6fb" : "#160a2a"} />
        </linearGradient>
      </defs>
      <rect width="200" height="130" fill={`url(#sky-${field})`} />
      {park ? (
        <>
          {/* town and trees */}
          {[8, 30, 150, 172].map((x, i) => (
            <g key={x}>
              <rect x={x} y={30 + (i % 2) * 4} width="16" height="14" fill={["#efe3c8", "#b55d45", "#d9e2e8", "#e6c07a"][i]} />
              <path d={`M${x - 2} ${30 + (i % 2) * 4} l10 -8 l10 8 z`} fill="#8c3b2c" />
            </g>
          ))}
          {[0, 22, 46, 60, 128, 142, 166, 190].map((x, i) => (
            <circle key={x} cx={x + 6} cy={46 - (i % 3) * 3} r={9 + (i % 2) * 3} fill={i % 2 ? "#3f7f2e" : "#4c8f34"} />
          ))}
          {/* jumbotron */}
          <rect x="74" y="10" width="52" height="26" rx="2" fill="#0b1030" stroke="#2ee6ff" strokeWidth="1.5" />
          <text x="100" y="21" textAnchor="middle" fontSize="8" fontWeight="900" fill="#ffd36a">GFL</text>
          <text x="100" y="31" textAnchor="middle" fontSize="5.5" fontWeight="900" fill="#fff">CHAMPIONSHIP</text>
          <rect x="84" y="36" width="2" height="10" fill="#5b6670" />
          <rect x="114" y="36" width="2" height="10" fill="#5b6670" />
          {/* wooden bleachers with fans */}
          {[0, 1, 2].map((k) => (
            <rect key={k} x={36 - k * 4} y={56 - k * 5} width={128 + k * 8} height="3" fill={k % 2 ? "#b07a4a" : "#8f6038"} />
          ))}
          {Array.from({ length: 30 }, (_, i) => (
            <circle key={i} cx={34 + i * 4.4} cy={52 - (i % 3) * 5} r="1.6" fill={["#2ee6ff", "#a04bff", "#ff8a1e", "#fff", "#f2d13a"][i % 5]} />
          ))}
        </>
      ) : (
        <>
          {/* city skyline and the neon bowl */}
          {Array.from({ length: 16 }, (_, i) => (
            <rect key={i} x={i * 13} y={22 + ((i * 7) % 13)} width="11" height="40" fill="#0c0f22" />
          ))}
          {Array.from({ length: 22 }, (_, i) => (
            <rect key={i} x={4 + i * 9} y={26 + ((i * 5) % 17)} width="2" height="2" fill={i % 3 ? "#ffd98a" : "#7fe8ff"} opacity="0.8" />
          ))}
          <path d="M0 62 Q100 34 200 62 L200 70 L0 70 z" fill="#140b26" />
          <path d="M0 62 Q100 34 200 62" stroke="#ff2d7a" strokeWidth="1.5" fill="none" />
          <path d="M0 66 Q100 40 200 66" stroke="#2ee6ff" strokeWidth="1" fill="none" />
        </>
      )}
      {/* the field */}
      <path d="M22 128 L52 64 L148 64 L178 128 z" fill={park ? "#55a243" : "#0b2620"} />
      <path d="M22 128 L32 107 L168 107 L178 128 z" fill={park ? "#1f97d8" : "#0a5f93"} opacity="0.9" />
      <path d="M52 64 L49 70 L151 70 L148 64 z" fill={park ? "#8a3bd8" : "#a0145a"} opacity="0.9" />
      {[0.2, 0.4, 0.6, 0.8].map((t) => {
        const y = 70 + (107 - 70) * t;
        const half = 49 + (32 - 49) * t;
        return <line key={t} x1={half} y1={y} x2={200 - half} y2={y} stroke={park ? "#ffffff" : "#a8f3ff"} strokeWidth="1" opacity="0.85" />;
      })}
      <path d="M22 128 L52 64 L148 64 L178 128" stroke="#2ee6ff" strokeWidth="1.6" fill="none" />
      <ellipse cx="100" cy="88" rx="12" ry="5" fill="none" stroke="#ffb02e" strokeWidth="1.4" />
    </svg>
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
