/** /campaign/play/$chapter: one boss battle. Normal chess rules, plus the chapter's twist. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Flag, Map as MapIcon, RotateCcw, Shield, Volume2, Box, Square } from "lucide-react";
import * as THREE from "three";
import { playSfx } from "@/lib/legendary/sfx";
import { cn } from "@/lib/utils";
import { PieceMark } from "@/components/chess/marks";
import type { Burst } from "@/components/games/bg-board-3d";
import { apply, inCheck, kingSq, legalMoves, material, moveText, newGame, sqName, status, summonGlass, VALUE, type Event, type Kind, type Move, type PerkId, type State } from "./engine";
import { bossMove, hanging } from "./bot";
import { chapterBy, finishCampaignRun, kindOfSlot, PERKS, slotName, startCampaignRun, VETERAN_PROMOS, type Chapter, type FinishResult, type PieceStats } from "./data";
import { CampaignDoor, CampaignHeader, LoadingCampaign, useCampaign } from "./shell";
import { Arena3D, world } from "./arena3d";
import { Board2D } from "./board2d";
import { useNarrow } from "./map-page";

const ROMAN = ["I", "II", "III", "IV", "V"];
const BLITZ_MS = 90_000;
const BLITZ_BONUS = 2_000;

type Callout = { id: number; text: string; tone: "info" | "warn" | "gold" };
type LogRow = { w: string; b?: string };

function fogFor(s: State, radius: number | undefined): Set<number> {
  const out = new Set<number>();
  if (!radius) return out;
  const mine: number[] = [];
  s.board.forEach((p, i) => { if (p && p.c === "w") mine.push(i); });
  for (let i = 0; i < 64; i++) {
    const near = mine.some((j) => Math.max(Math.abs((i & 7) - (j & 7)), Math.abs((i >> 3) - (j >> 3))) <= radius);
    if (!near) out.add(i);
  }
  return out;
}

const emptyStats = (): Record<string, PieceStats> =>
  Object.fromEntries(["ra", "nb", "bc", "q", "k", "bf", "ng", "rh", "pa", "pb", "pc", "pd", "pe", "pf", "pg", "ph"].map((s) => [s, { alive: true, checks: 0, cap: 0, capUp: 0, mate: false, promo: false }]));

export function BattlePage({ chapter }: { chapter: string }) {
  return (
    <CampaignDoor>
      <BattleInner n={Number(chapter)} />
    </CampaignDoor>
  );
}

function BattleInner({ n }: { n: number }) {
  const ch = chapterBy(n);
  const { state: camp, error, reload } = useCampaign();
  if (!ch) {
    return (
      <main className="mcc grid place-items-center">
        <Link to="/campaign" className="mcc-btn">Back to the map</Link>
      </main>
    );
  }
  if (!camp) return <main className="mcc"><LoadingCampaign error={error} onRetry={reload} /></main>;
  return <Battle key={n} ch={ch} army={camp.army} coins={camp.coins} frame={camp.rewards.includes("gear-frame") ? "gear" : undefined} />;
}

function Battle({ ch, army, coins, frame }: { ch: Chapter; army: { slot: string; level: number; promos: number }[]; coins: number; frame?: string }) {
  const narrow = useNarrow();
  const navigate = useNavigate();
  const [run, setRun] = useState<{ runId: string; perks: string[] } | null>(null);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<"intro" | "play" | "end">("intro");
  const [s, setS] = useState<State>(() => newGame(ch.rules));
  const [sel, setSel] = useState<number | null>(null);
  const [last, setLast] = useState<{ from: number; to: number } | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [promo, setPromo] = useState<Move[] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [view, setView] = useState<"3d" | "2d">(() => (typeof window !== "undefined" && localStorage.getItem("mcc-view") === "2d" ? "2d" : "3d"));
  const [callout, setCallout] = useState<Callout | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [end, setEnd] = useState<{ winner: "w" | "b" | null; reason: string } | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [clock, setClock] = useState<number | null>(null);
  const stats = useRef<Record<string, PieceStats>>(emptyStats());
  const batter = useRef(0);
  const streak = useRef(0);
  const burstId = useRef(1);
  const calloutId = useRef(1);

  const levels = useMemo(() => Object.fromEntries(army.map((a) => [a.slot, a.level])), [army]);
  const veterans = useMemo(() => new Set(army.filter((a) => kindOfSlot(a.slot) === "p" && a.promos >= VETERAN_PROMOS).map((a) => a.slot)), [army]);

  // start the run (server checks the chapter is unlocked)
  useEffect(() => {
    let live = true;
    startCampaignRun({ data: { chapter: ch.n } })
      .then((r) => {
        if (!live) return;
        setRun(r);
        const perks: Record<string, PerkId> = {};
        for (const slot of r.perks) {
          const p = PERKS[kindOfSlot(slot)];
          if (p) perks[slot] = p.id;
        }
        setS(newGame(ch.rules, perks));
      })
      .catch((e: Error) => live && setStartErr(e.message));
    return () => { live = false; };
  }, [ch]);

  const say = useCallback((text: string, tone: Callout["tone"] = "info") => {
    const id = calloutId.current++;
    setCallout({ id, text, tone });
    window.setTimeout(() => setCallout((c) => (c && c.id === id ? null : c)), 2600);
  }, []);

  const boom = (sq: number, color: string) => {
    const [x, , z] = world(sq);
    setBursts((b) => [...b, { id: burstId.current++, at: new THREE.Vector3(x, 0.3, z), color }]);
  };

  /** Book-keeping for XP, sounds and the companion's lines. */
  const digest = (before: State, m: Move | null, ev: Event[], mover: "w" | "b") => {
    const piece = m ? before.board[m.from] : null;
    let captured = false;
    for (const e of ev) {
      if (e.t === "capture") {
        captured = true;
        boom(e.at, e.victim.c === "w" ? "#ffd86b" : ch.glow);
        if (e.by.c === "w" && stats.current[e.by.id]) {
          stats.current[e.by.id].cap++;
          if (VALUE[e.victim.k] > (e.by.k === "k" ? 4 : VALUE[e.by.k])) stats.current[e.by.id].capUp++;
          if (e.by.k === "r" && before.perks[e.by.id] === "batter") {
            batter.current++;
            if (batter.current <= 3) say("Batter! +15 coins", "gold");
          }
        }
        if (e.victim.c === "w" && stats.current[e.victim.id]) stats.current[e.victim.id].alive = false;
      }
      if (e.t === "promote" && e.piece.c === "w" && stats.current[e.piece.id]) stats.current[e.piece.id].promo = true;
      if (e.t === "check" && e.by === "w" && piece && stats.current[piece.id]) stats.current[piece.id].checks++;
      if (e.t === "gears") { playSfx("whoosh", 0.8); say("The gears turn! Pieces on the gears shift clockwise.", "warn"); }
      if (e.t === "gears-jammed") say("The gears grind and jam: they will not leave a king in check.");
      if (e.t === "wall-hit") { playSfx("boom", 0.7); boom(e.at, "#9a9098"); say(e.hp > 0 ? `The wall cracks! ${e.hp} hit left.` : "The wall crumbles!", "gold"); }
      if (e.t === "glass-shatter") { boom(e.at, "#bfe4ff"); say("A Glass Pawn shatters. It was a fake!", "gold"); }
      if (e.t === "glass-summon") say(`Queen Aurelia summons a Glass Pawn on ${sqName(e.at)}. Look closer…`, "warn");
      if (e.t === "perk") say(`${PERKS[e.piece.k]?.name ?? "Perk"}!`, "gold");
      if (e.t === "phase2") { say("PHASE 2: the rim collapses. Sudden-death Blitz!", "warn"); setClock(BLITZ_MS); }
    }
    if (captured) playSfx("boom", 0.6);
    else playSfx("tap");
    if (mover === "w") {
      streak.current = captured ? streak.current + 1 : 0;
      if (streak.current >= 2) say(`Combo x${streak.current}!`, "gold");
    }
  };

  const finish = useCallback(
    async (winner: "w" | "b" | null, reason: string, final: State, matingSlot?: string) => {
      setEnd({ winner, reason });
      setPhase("end");
      playSfx(winner === "w" ? "rankup" : "boom");
      for (const [slot, st] of Object.entries(stats.current)) {
        st.alive = final.board.some((p) => p && p.c === "w" && p.id === slot);
      }
      if (winner === "w" && matingSlot && stats.current[matingSlot]) stats.current[matingSlot].mate = true;
      if (!run) return;
      setSaving(true);
      try {
        const r = await finishCampaignRun({ data: { runId: run.runId, result: winner === "w" ? "win" : winner === "b" ? "loss" : "draw", plies: final.ply, pieces: stats.current, batter: batter.current } });
        setResult(r);
        if (r.coins > 0) {
          playSfx("coin");
          window.dispatchEvent(new CustomEvent("morse-coins", { detail: {} }));
        }
      } catch (e) {
        say((e as Error).message, "warn");
      } finally {
        setSaving(false);
      }
    },
    [run, say],
  );

  const play = (m: Move) => {
    if (phase !== "play" || s.turn !== "w") return;
    const text = moveText(s, m);
    const { s: next, ev } = apply(s, m);
    digest(s, m, ev, "w");
    setS(next);
    setLast({ from: m.from, to: m.to });
    setSel(null);
    setPromo(null);
    setLog((l) => [...l, { w: text }]);
    if (clock != null) setClock((c) => (c == null ? c : c + BLITZ_BONUS));
    const st = status(next);
    if (st.over) void finish(st.winner, st.reason, next, next.board[m.to]?.id ?? s.board[m.from]?.id);
  };

  // the boss moves
  useEffect(() => {
    if (phase !== "play" || s.turn !== "b" || end) return;
    setThinking(true);
    const t = window.setTimeout(() => {
      const m = bossMove(s, s.phase === 2 ? { ...ch.level, depth: ch.level.depth + 1, noise: 0 } : ch.level);
      if (!m) { setThinking(false); return; }
      const text = moveText(s, m);
      let { s: next, ev } = apply(s, m);
      const g = summonGlass(next);
      if (g.ev.length) { next = g.s; ev = [...ev, ...g.ev]; }
      digest(s, m, ev, "b");
      setS(next);
      setLast({ from: m.from, to: m.to });
      setLog((l) => (l.length && !l[l.length - 1].b ? [...l.slice(0, -1), { ...l[l.length - 1], b: text }] : [...l, { w: "…", b: text }]));
      setThinking(false);
      const st = status(next);
      if (st.over) { void finish(st.winner, st.reason, next); return; }
      // companion warnings
      if (inCheck(next, "w")) say("Check! Protect your king.", "warn");
      else {
        const hang = hanging(next, "w");
        if (hang.length) {
          const p = next.board[hang[0]]!;
          say(`Careful: your ${({ q: "queen", r: "rook", b: "bishop", n: "knight" } as Record<string, string>)[p.k] ?? "piece"} on ${sqName(hang[0])} is under attack!`, "warn");
        } else if (ch.rules.gears && (ch.rules.gearEvery ?? 8) - (next.ply % (ch.rules.gearEvery ?? 8)) === 1) say("The gears turn after your move!", "warn");
      }
    }, 380);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, phase, end]);

  // blitz clock (Morse-Zero phase 2)
  useEffect(() => {
    if (clock == null || phase !== "play" || s.turn !== "w") return;
    if (clock <= 0) { void finish("b", "Your Blitz clock ran out", s); return; }
    const t = window.setTimeout(() => setClock((c) => (c == null ? c : c - 250)), 250);
    return () => window.clearTimeout(t);
  }, [clock, phase, s, finish]);

  // local test hook only (127.0.0.1 previews): lets the screenshot script read the position
  useEffect(() => {
    if (window.location.hostname === "127.0.0.1") (window as unknown as { __mcc?: State }).__mcc = s;
  }, [s]);

  const moves = useMemo(() => (phase === "play" && s.turn === "w" && !end ? legalMoves(s) : []), [s, phase, end]);
  const targets = sel != null ? moves.filter((m) => m.from === sel) : [];
  const fog = useMemo(() => (phase === "play" || phase === "end" ? fogFor(s, ch.rules.fog) : new Set<number>()), [s, ch, phase]);
  const checkSq = inCheck(s, s.turn) ? kingSq(s, s.turn) : -1;

  function tap(i: number) {
    if (phase !== "play" || s.turn !== "w" || thinking) return;
    const hit = targets.filter((m) => m.to === i);
    if (hit.length > 1) return setPromo(hit);
    if (hit.length === 1) return play(hit[0]);
    const p = s.board[i];
    if (p && p.c === "w" && moves.some((m) => m.from === i)) {
      setSel(sel === i ? null : i);
      playSfx("tap", 0.5);
    } else setSel(null);
  }

  const bossHp = s.bossStart ? material(s, "b") / s.bossStart : 1;
  const myHp = material(s, "w") / 39;
  const every = ch.rules.gearEvery ?? 8;
  const gearIn = Math.ceil((every - (s.ply % every)) / 2);
  const perkRows = Object.entries(s.perks);

  return (
    <main className="mcc mcc-battle" data-campaign-battle={ch.n} data-battle-phase={phase} data-turn={s.turn}>
      <div className="absolute inset-0">
        {view === "3d" ? (
          <Arena3D s={s} chapter={ch} sel={sel} targets={targets} last={last} checkSq={checkSq} fog={fog} levels={levels} veterans={veterans} bursts={bursts} onBurstDone={(id) => setBursts((b) => b.filter((x) => x.id !== id))} onTap={tap} narrow={narrow} />
        ) : (
          <Board2D s={s} chapter={ch} sel={sel} targets={targets} last={last} checkSq={checkSq} fog={fog} levels={levels} onTap={tap} />
        )}
      </div>

      {phase !== "intro" ? (
        <>
          <div className="mcc-panel mcc-hud-top">
            <div className="mcc-side-card">
              <span className="mcc-portrait">♔</span>
              <div className="min-w-0 flex-1">
                <div className="nm">Your Army</div>
                <div className="sub">{s.turn === "w" && !end ? "Your move" : "Waiting"}{clock != null ? ` · ⏱ ${Math.max(0, Math.ceil(clock / 1000))}s` : ""}</div>
                <div className="mcc-bar"><span style={{ width: `${Math.round(Math.min(1, myHp) * 100)}%` }} /></div>
              </div>
            </div>
            <div className="mcc-vs">
              <b>VS</b>
              Ch. {ROMAN[ch.n - 1]}
            </div>
            <div className="mcc-side-card is-boss">
              <span className="mcc-portrait is-boss">{["⚙", "♛", "🛡", "👁", "◉"][ch.n - 1]}</span>
              <div className="min-w-0 flex-1">
                <div className="nm">{ch.boss}</div>
                <div className="sub">{thinking ? "Thinking…" : s.phase === 2 ? "PHASE 2 · Blitz" : ch.arena}</div>
                <div className="mcc-bar is-boss"><span style={{ width: `${Math.round(Math.min(1, bossHp) * 100)}%`, marginLeft: "auto", right: 0, left: "auto" }} /></div>
              </div>
            </div>
          </div>

          <aside className="mcc-panel mcc-twist" data-twist>
            <div className="k">{ch.arena}</div>
            <div className="txt mt-1 text-[#e6dcf0]">{ch.twist}</div>
            {ch.rules.gears ? <div className="count" data-gear-count={gearIn}><i>{gearIn}</i> {gearIn === 1 ? "turn" : "turns"} until the gears turn</div> : null}
            {ch.rules.walls ? <div className="count"><i>{Object.keys(s.walls).length}</i> walls standing</div> : null}
            {ch.rules.glassEvery ? <div className="count"><i>{ch.rules.glassEvery - (s.bossMoves % ch.rules.glassEvery)}</i> boss moves to the next Glass Pawn</div> : null}
            <div className="mcc-perks">
              {perkRows.length ? (
                perkRows.map(([slot, perk]) => {
                  const P = PERKS[kindOfSlot(slot)]!;
                  const once = perk !== "batter" && perk !== "inspire";
                  return (
                    <span key={slot} className={cn(once && s.spent[slot] && "is-spent")} title={P.text}>
                      ✦ {P.name} · {slotName(slot)}
                    </span>
                  );
                })
              ) : (
                <span className="text-[#a99ab8]">No perks yet: level a piece to 3 to open its perk slot.</span>
              )}
            </div>
          </aside>

          <aside className="mcc-panel mcc-log" aria-label="Moves">
            <div className="mcc-label mb-1">Battle log</div>
            <ol>
              {log.map((r, i) => (
                <li key={i}>
                  <span className="n">{i + 1}.</span>
                  <span>{r.w}</span>
                  <span className="b">{r.b ?? ""}</span>
                </li>
              ))}
            </ol>
          </aside>

          <nav className="mcc-panel mcc-dock" aria-label="Battle">
            <button type="button" onClick={() => { if (phase === "play" && window.confirm("Surrender this battle?")) void finish("b", "You surrendered", s); }} data-resign>
              <Flag />Resign
            </button>
            <button type="button" className={cn(view === "3d" && "is-on")} onClick={() => { setView("3d"); localStorage.setItem("mcc-view", "3d"); }} data-view="3d">
              <Box />3D
            </button>
            <button type="button" className={cn(view === "2d" && "is-on")} onClick={() => { setView("2d"); localStorage.setItem("mcc-view", "2d"); }} data-view="2d">
              <Square />2D
            </button>
            <button type="button" onClick={() => void navigate({ to: "/campaign/army" })}>
              <Shield />Army
            </button>
            <button type="button" onClick={() => void navigate({ to: "/campaign" })}>
              <MapIcon />Map
            </button>
          </nav>
        </>
      ) : null}

      {callout ? <div key={callout.id} className={cn("mcc-callout", callout.tone === "warn" && "is-warn", callout.tone === "gold" && "is-gold")} role="status" data-callout>
        <Volume2 className="size-4 shrink-0" />{callout.text}
      </div> : null}

      {promo ? (
        <div className="mcc-overlay" onClick={() => setPromo(null)}>
          <div className="mcc-panel mcc-promo" onClick={(e) => e.stopPropagation()}>
            {promo.map((m) => (
              <button key={m.promo} type="button" onClick={() => play(m)} aria-label={`Promote to ${m.promo}`}>
                <PieceMark kind={m.promo as Kind} tone="w" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {phase === "intro" ? (
        <div className="mcc-overlay">
          <CampaignHeader on="battle" coins={coins} frame={frame} />
          <section className="mcc-panel mcc-intro" data-battle-intro>
            <div className="chap">Chapter {ROMAN[ch.n - 1]} · {ch.arena}</div>
            <div className="boss mcc-goldtext" role="heading" aria-level={1}>{ch.boss}</div>
            <div className="ep">{ch.epithet}</div>
            <div className="q">“{ch.quote}”</div>
            <div className="rule">
              <span className="mcc-label">The twist</span>
              <div className="mt-1">{ch.twist}</div>
              <div className="mt-2 text-xs text-[#b9a9c8]">Checkmate works exactly like normal chess. You play White and move first.</div>
            </div>
            {startErr ? <p className="mt-3 text-sm text-[#ffb08a]">{startErr}</p> : null}
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button type="button" className="mcc-btn" disabled={!run} onClick={() => { setPhase("play"); playSfx("menu"); }} data-begin-battle>
                {run ? "Begin battle" : startErr ? "Locked" : "Preparing…"}
              </button>
              <Link to="/campaign" className="mcc-btn is-ghost">Back to map</Link>
            </div>
          </section>
        </div>
      ) : null}

      {phase === "end" && end ? (
        <div className="mcc-overlay">
          <section className="mcc-panel mcc-end" data-battle-end={end.winner ?? "draw"}>
            <div className="big mcc-goldtext" role="heading" aria-level={1}>{end.winner === "w" ? "Victory" : end.winner === "b" ? "Defeat" : "Stalemate"}</div>
            <div className="why">{end.reason}{result && result.result !== (end.winner === "w" ? "win" : end.winner === "b" ? "loss" : "draw") ? " · counted as a draw (too quick)" : ""}</div>
            {saving ? <p className="mt-4 text-sm text-[#c7b7a0]">Recording the battle…</p> : null}
            {result ? (
              <>
                {result.firstClear ? (
                  <div className="mcc-rewards mt-4 text-left">
                    <span className="mcc-label">Chapter cleared · rewards unlocked</span>
                    {ch.rewards.map((r) => (
                      <div key={r.id} className="mcc-reward is-won" data-reward={r.id}>
                        <span className="ic">★</span>
                        <span>{r.name}</span>
                        <span className="won">Unlocked</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 text-sm text-[#e6dcf0]">
                  Your army earned <b className="text-[#f2d27a]">{result.xp} XP</b>
                  {result.coins > 0 ? <> and <b className="text-[#f2d27a]">{result.coins} coins</b></> : null}.
                </div>
                <div className="mcc-gains" data-gains>
                  {Object.entries(result.gains)
                    .sort((a, b) => b[1].xp - a[1].xp)
                    .map(([slot, g]) => (
                      <div key={slot} className={cn("mcc-gain", g.after > g.before && "is-up")}>
                        <b>{slotName(slot)}</b>
                        <div>+{g.xp} XP{g.after > g.before ? ` · LEVEL ${g.after}!` : ""}</div>
                      </div>
                    ))}
                </div>
              </>
            ) : null}
            <div className="row">
              <Link to="/campaign" className="mcc-btn">World map</Link>
              <Link to="/campaign/army" className="mcc-btn is-purple">Army</Link>
              <button type="button" className="mcc-btn is-ghost" onClick={() => window.location.reload()}>
                <RotateCcw className="size-4" />Fight again
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
