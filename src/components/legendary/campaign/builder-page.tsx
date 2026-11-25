/** Arena builder (phase D): paint walls, gears and boss reinforcements, pick a look, save, share by code, play it. */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Box, Copy, Eraser, Play, Save, Settings2, Square, Swords } from "lucide-react";
import { playSfx } from "@/lib/legendary/sfx";
import { cn } from "@/lib/utils";
import { PieceMark } from "@/components/chess/marks";
import type { Kind } from "./engine";
import { CHAPTERS, PERK_LEVEL } from "./data";
import { CampaignDoor, CampaignHeader, LoadingCampaign, useCampaign } from "./shell";
import { Arena3D } from "./arena3d";
import { Board2D } from "./board2d";
import { useNarrow } from "./map-page";
import { Battle } from "./battle-page";
import { arenaChapter, arenaStart, EMPTY_LAYOUT, getArena, hazardOk, LEVELS, LIMITS, myArenas, reinforceOk, saveArena, type Arena, type ArenaLayout } from "./arena-data";

type Tool = "wall" | "gear" | "q" | "r" | "b" | "n" | "p" | "erase";
const PIECES: Kind[] = ["q", "r", "b", "n", "p"];
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

export function BuilderPage() {
  return (
    <CampaignDoor>
      <Builder />
    </CampaignDoor>
  );
}

function Builder() {
  const narrow = useNarrow();
  const navigate = useNavigate();
  const { state: camp } = useCampaign();
  const [layout, setLayout] = useState<ArenaLayout>(EMPTY_LAYOUT);
  const [name, setName] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("wall");
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [saved, setSaved] = useState<Arena | null>(null);
  const [mine, setMine] = useState<Arena[]>([]);
  const [load, setLoad] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; warn?: boolean } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = () => void myArenas({ data: {} }).then((r) => setMine(r.arenas)).catch(() => {});
  useEffect(() => {
    refresh();
    const q = new URLSearchParams(window.location.search).get("code");
    if (q) void open(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = useMemo(() => arenaStart(layout), [layout]);
  const ch = useMemo(() => arenaChapter({ name: name || "Your Arena", layout }), [name, layout]);
  const levels = useMemo(() => Object.fromEntries((camp?.army ?? []).map((a) => [a.slot, a.level])), [camp]);
  const dirty = !saved || JSON.stringify(saved.layout) !== JSON.stringify(layout) || saved.name !== (name.trim() || "Untitled Arena");

  function say(text: string, warn = false) {
    setMsg({ text, warn });
    window.setTimeout(() => setMsg((m) => (m && m.text === text ? null : m)), 2600);
  }

  function tap(i: number) {
    const l: ArenaLayout = { ...layout, walls: [...layout.walls], gears: [...layout.gears], extra: [...layout.extra] };
    const had = l.walls.includes(i) ? "wall" : l.gears.includes(i) ? "gear" : l.extra.find((e) => e.sq === i)?.k ?? null;
    const clear = () => {
      l.walls = l.walls.filter((w) => w !== i);
      l.gears = l.gears.filter((g) => g !== i);
      l.extra = l.extra.filter((e) => e.sq !== i);
    };
    if (tool === "erase" || had === tool) {
      if (!had) return;
      clear();
      playSfx("tap", 0.5);
      return setLayout(l);
    }
    if (tool === "wall" || tool === "gear") {
      if (!hazardOk(i)) return say("Walls and gears go on the middle ranks (3 to 6).", true);
      clear();
      if (tool === "wall") {
        if (l.walls.length >= LIMITS.walls) return say(`At most ${LIMITS.walls} walls.`, true);
        l.walls.push(i);
      } else {
        if (l.gears.length >= LIMITS.gears) return say(`At most ${LIMITS.gears} gears.`, true);
        l.gears.push(i);
      }
    } else {
      if (!reinforceOk(i)) return say("Boss reinforcements stand on ranks 5 and 6.", true);
      clear();
      if (l.extra.length >= LIMITS.extra) return say(`At most ${LIMITS.extra} reinforcements.`, true);
      if (tool === "q" && l.extra.some((e) => e.k === "q")) return say("Only one extra queen.", true);
      l.extra.push({ sq: i, k: tool });
    }
    playSfx(tool === "wall" ? "boom" : "tap", 0.5);
    setLayout(l);
  }

  async function open(c: string) {
    setBusy(true);
    try {
      const a = await getArena({ data: { code: cleanCode(c) } });
      setLayout({ ...EMPTY_LAYOUT, ...a.layout });
      setName(a.name);
      setCode(a.mine ? a.code : null);
      setSaved(a.mine ? a : null);
      setLoad("");
      say(a.mine ? `Loaded ${a.name}.` : `Loaded ${a.owner}'s ${a.name}. Saving makes your own copy.`);
    } catch (e) {
      say(errText(e), true);
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<Arena | null> {
    setBusy(true);
    try {
      const a = await saveArena({ data: { code, name, layout } });
      setSaved(a);
      setCode(a.code);
      setName(a.name);
      setLayout({ ...EMPTY_LAYOUT, ...a.layout });
      playSfx("coin");
      refresh();
      return a;
    } catch (e) {
      say(errText(e), true);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const link = saved && typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname.replace(/\/campaign\/builder.*$/, "")}/campaign/arena/${saved.code}` : "";

  async function play() {
    const a = dirty ? await save() : saved;
    if (a) void navigate({ to: "/campaign/arena/$code", params: { code: a.code } });
  }

  const TOOLS: { id: Tool; label: string; icon: React.ReactNode; count?: string }[] = [
    { id: "wall", label: "Wall", icon: <span className="mcc-tool-wall" />, count: `${layout.walls.length}/${LIMITS.walls}` },
    { id: "gear", label: "Gear", icon: <span className="mcc-tool-gear">⚙</span>, count: `${layout.gears.length}/${LIMITS.gears}` },
    ...PIECES.map((k) => ({ id: k as Tool, label: ({ q: "Queen", r: "Rook", b: "Bishop", n: "Knight", p: "Pawn" } as Record<string, string>)[k], icon: <PieceMark kind={k} tone="b" /> })),
    { id: "erase", label: "Erase", icon: <Eraser className="size-5" /> },
  ];

  const settings = (
    <>
      <label className="mcc-field">
        <span className="mcc-label">Arena name</span>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Untitled Arena" maxLength={40} data-arena-name />
      </label>
      <div className="mcc-field">
        <span className="mcc-label">Look</span>
        <div className="mcc-chips">
          {CHAPTERS.map((c) => (
            <button key={c.n} type="button" className={cn(layout.theme === c.n && "is-on")} style={{ ["--chip" as string]: c.glow }} onClick={() => setLayout({ ...layout, theme: c.n })} data-theme={c.n}>{c.arena}</button>
          ))}
        </div>
      </div>
      <div className="mcc-field">
        <span className="mcc-label">Boss strength</span>
        <div className="mcc-chips">
          {LEVELS.map((lv) => (
            <button key={lv.id} type="button" className={cn(layout.level === lv.id && "is-on")} onClick={() => setLayout({ ...layout, level: lv.id })} data-level={lv.id}>{lv.name}</button>
          ))}
        </div>
      </div>
      <div className="mcc-field">
        <span className="mcc-label">Fog</span>
        <div className="mcc-chips">
          {[[0, "Clear"], [3, "Light"], [2, "Dense"]].map(([v, t]) => (
            <button key={v} type="button" className={cn(layout.fog === v && "is-on")} onClick={() => setLayout({ ...layout, fog: v as number })} data-fog={v}>{t}</button>
          ))}
        </div>
      </div>
      <div className="mcc-field">
        <span className="mcc-label">Glass Pawns</span>
        <div className="mcc-chips">
          {[[0, "Off"], [5, "Every 5"], [3, "Every 3"]].map(([v, t]) => (
            <button key={v} type="button" className={cn(layout.glass === v && "is-on")} onClick={() => setLayout({ ...layout, glass: v as number })} data-glass={v}>{t}</button>
          ))}
        </div>
      </div>
      {layout.gears.length >= 2 ? (
        <div className="mcc-field">
          <span className="mcc-label">Gears turn</span>
          <div className="mcc-chips">
            {[[8, "Every 4 turns"], [6, "Every 3"], [4, "Every 2"]].map(([v, t]) => (
              <button key={v} type="button" className={cn(layout.gearEvery === v && "is-on")} onClick={() => setLayout({ ...layout, gearEvery: v as number })} data-gear-every={v}>{t}</button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mcc-builder-actions">
        <button type="button" className="mcc-btn" disabled={busy} onClick={() => void save()} data-save-arena><Save className="size-4" />{saved && !dirty ? "Saved" : "Save & share"}</button>
        <button type="button" className="mcc-btn is-purple" disabled={busy} onClick={() => void play()} data-play-arena><Play className="size-4" />Play it</button>
      </div>
      {saved ? (
        <div className="mcc-share" data-arena-share>
          <span className="mcc-label">Share code</span>
          <div className="mcc-raid-code is-small" data-arena-code>{saved.code}</div>
          <button type="button" className="mcc-btn is-ghost" onClick={() => { void navigator.clipboard?.writeText(link).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }); }} data-copy-arena-link>
            <Copy className="size-4" />{copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <main className={cn("mcc mcc-battle mcc-builder", narrow && "is-narrow")} data-arena-builder>
      <div className="mcc-builder-board">
        {view === "3d" ? (
          <Arena3D s={s} chapter={ch} sel={null} targets={[]} last={null} checkSq={-1} fog={new Set()} levels={levels} veterans={new Set()} rewards={camp?.rewards ?? []} bursts={[]} onBurstDone={() => {}} onTap={tap} narrow={narrow} />
        ) : (
          <Board2D s={s} chapter={ch} sel={null} targets={[]} last={null} checkSq={-1} fog={new Set()} levels={levels} onTap={tap} />
        )}
      </div>
      <CampaignHeader on="builder" coins={camp?.coins} frame={camp?.rewards.includes("gear-frame") ? "gear" : undefined} />

      <aside className="mcc-panel mcc-tools" aria-label="Builder tools">
        {!narrow ? <div className="mcc-label mb-1">Paint</div> : null}
        <div className="mcc-tool-grid">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" className={cn("mcc-tool", tool === t.id && "is-on")} onClick={() => setTool(t.id)} aria-pressed={tool === t.id} data-tool={t.id}>
              <span className="ic">{t.icon}</span>
              <span className="nm">{t.label}</span>
              {t.count ? <small>{t.count}</small> : null}
            </button>
          ))}
        </div>
        {!narrow ? (
          <p className="mt-2 text-xs leading-snug text-[#b9a9c8]">
            Walls and gears: ranks 3 to 6. Boss pieces: ranks 5 and 6 ({layout.extra.length}/{LIMITS.extra}). Gears turn pieces in the order you place them.
          </p>
        ) : null}
        {!narrow ? (
          <div className="mcc-load">
            <span className="mcc-label">Load a code</span>
            <div className="mcc-raid-join">
              <input value={load} onChange={(e) => setLoad(cleanCode(e.target.value))} placeholder="CODE" aria-label="Arena code" data-arena-code-input />
              <button type="button" className="mcc-btn is-purple" disabled={busy || load.length !== 6} onClick={() => void open(load)} data-load-arena>Load</button>
            </div>
          </div>
        ) : null}
        {!narrow && mine.length ? (
          <div className="mcc-mine" data-my-arenas>
            <span className="mcc-label">My arenas</span>
            {mine.slice(0, 6).map((a) => (
              <div key={a.code} className="row">
                <button type="button" onClick={() => void open(a.code)} title="Edit">{a.name}</button>
                <small>{a.code} · {a.plays} {a.plays === 1 ? "play" : "plays"}</small>
                <Link to="/campaign/arena/$code" params={{ code: a.code }} aria-label={`Play ${a.name}`}><Swords className="size-4" /></Link>
              </div>
            ))}
          </div>
        ) : null}
      </aside>

      {narrow ? (
        sheet ? (
          <div className="mcc-overlay" onClick={() => setSheet(false)}>
            <section className="mcc-panel mcc-builder-sheet" onClick={(e) => e.stopPropagation()} data-builder-sheet>
              {settings}
              <div className="mcc-load">
                <span className="mcc-label">Load a code</span>
                <div className="mcc-raid-join">
                  <input value={load} onChange={(e) => setLoad(cleanCode(e.target.value))} placeholder="CODE" aria-label="Arena code" data-arena-code-input />
                  <button type="button" className="mcc-btn is-purple" disabled={busy || load.length !== 6} onClick={() => void open(load).then(() => setSheet(false))} data-load-arena>Load</button>
                </div>
              </div>
            </section>
          </div>
        ) : null
      ) : (
        <aside className="mcc-panel mcc-builder-side" aria-label="Arena settings">{settings}</aside>
      )}

      <nav className="mcc-panel mcc-dock" aria-label="Builder">
        <button type="button" className={cn(view === "3d" && "is-on")} onClick={() => setView("3d")} data-view="3d"><Box />3D</button>
        <button type="button" className={cn(view === "2d" && "is-on")} onClick={() => setView("2d")} data-view="2d"><Square />2D</button>
        {narrow ? <button type="button" onClick={() => setSheet(true)} data-open-sheet><Settings2 />Setup</button> : null}
        {narrow ? <button type="button" onClick={() => void play()} disabled={busy} data-play-arena-dock><Play />Play</button> : null}
      </nav>

      {msg ? <div className={cn("mcc-callout", msg.warn && "is-warn")} role="status" data-callout>{msg.text}</div> : null}
    </main>
  );
}

// ── playing a shared arena: /campaign/arena/$code ─────────────────────────

export function ArenaBattlePage({ code }: { code: string }) {
  return (
    <CampaignDoor>
      <ArenaBattle code={code} />
    </CampaignDoor>
  );
}

function ArenaBattle({ code }: { code: string }) {
  const { state: camp, error, reload } = useCampaign();
  const [arena, setArena] = useState<Arena | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getArena({ data: { code } }).then(setArena).catch((e) => setErr(errText(e)));
  }, [code]);
  if (err) {
    return (
      <main className="mcc grid place-items-center">
        <div className="mcc-panel p-6 text-center">
          <p className="mb-4 text-[#ffb08a]">{err}</p>
          <Link to="/campaign/builder" className="mcc-btn">Arena Builder</Link>
        </div>
      </main>
    );
  }
  if (!camp || !arena) return <main className="mcc"><LoadingCampaign error={error} onRetry={reload} /></main>;
  const ch = arenaChapter(arena);
  const perks = camp.army.filter((a) => a.perkOn && a.level >= PERK_LEVEL).map((a) => a.slot);
  return (
    <Battle
      key={arena.code}
      ch={ch}
      army={camp.army}
      coins={camp.coins}
      rewards={camp.rewards}
      frame={camp.rewards.includes("gear-frame") ? "gear" : undefined}
      arena={{ code: arena.code, extra: arena.layout.extra, perks }}
    />
  );
}

