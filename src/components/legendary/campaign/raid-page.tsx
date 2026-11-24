/** Co-op tag-team raids: two players share White and alternate turns against the Iron Colossus. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Box, Copy, DoorOpen, Hand, Map as MapIcon, Square, Swords, Users } from "lucide-react";
import * as THREE from "three";
import { playSfx } from "@/lib/legendary/sfx";
import { cn } from "@/lib/utils";
import { PieceMark } from "@/components/chess/marks";
import type { Burst } from "@/components/games/bg-board-3d";
import { apply, inCheck, kingSq, legalMoves, material, sqName, status, type Kind, type Move } from "./engine";
import { bossMove, hanging } from "./bot";
import { kindOfSlot, slotName, VETERAN_PROMOS } from "./data";
import { CampaignDoor, CampaignHeader, LoadingCampaign, useCampaign } from "./shell";
import { Arena3D, world } from "./arena3d";
import { Board2D } from "./board2d";
import { useNarrow } from "./map-page";
import { claimRaid, createRaid, getRaid, joinRaid, leaveRaid, RAID, raidMove, raidStart, replay, seeded, type Raid, type RaidClaim, type RaidMove } from "./raid-data";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── lobby: /campaign/raids ────────────────────────────────────────────────

export function RaidsPage() {
  return (
    <CampaignDoor>
      <RaidLobby />
    </CampaignDoor>
  );
}

function RaidLobby() {
  const narrow = useNarrow();
  const navigate = useNavigate();
  const { state: camp } = useCampaign();
  const [code, setCode] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("code") ?? "" : ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const preview = useMemo(() => raidStart(), []);
  const levels = useMemo(() => Object.fromEntries((camp?.army ?? []).map((a) => [a.slot, a.level])), [camp]);
  const auto = useRef(false);

  const go = (r: Raid) => void navigate({ to: "/campaign/raid/$raidId", params: { raidId: r.raidId } });
  const host = async () => {
    setBusy(true); setErr(null);
    try { playSfx("menu"); go(await createRaid({ data: {} })); } catch (e) { setErr(errText(e)); setBusy(false); }
  };
  const join = useCallback(async (c: string) => {
    setBusy(true); setErr(null);
    try { playSfx("menu"); go(await joinRaid({ data: { code: c } })); } catch (e) { setErr(errText(e)); setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!auto.current && code.trim().length === 6) { auto.current = true; void join(code); }
  }, [code, join]);

  return (
    <main className="mcc mcc-raids" data-raid-lobby>
      <div className="absolute inset-0 opacity-70">
        <Arena3D s={preview} chapter={RAID} sel={null} targets={[]} last={null} checkSq={-1} fog={new Set()} levels={levels} veterans={new Set()} rewards={camp?.rewards ?? []} bursts={[]} onBurstDone={() => {}} onTap={() => {}} narrow={narrow} />
      </div>
      <CampaignHeader on="raids" coins={camp?.coins} frame={camp?.rewards.includes("gear-frame") ? "gear" : undefined} />
      <section className="mcc-panel mcc-raid-card" data-raid-card>
        <div className="chap">Co-op Raid</div>
        <div className="boss mcc-goldtext" role="heading" aria-level={1}>{RAID.boss}</div>
        <div className="ep">{RAID.epithet}</div>
        <div className="q">“{RAID.quote}”</div>
        <ol className="mcc-raid-rules">
          <li><Users className="size-4" />Two players share your army and <b>take turns</b> as White.</li>
          <li><Swords className="size-4" />The Colossus starts with a <b>second queen</b>. Checkmate it together.</li>
          <li><Hand className="size-4" />If your partner goes quiet for 60s, you can <b>take over</b> their turn.</li>
          <li>★ Win: <b>+40 coins</b> and army XP for each of you (3 rewarded raids a day).</li>
        </ol>
        <div className="mcc-raid-actions">
          <button type="button" className="mcc-btn" onClick={() => void host()} disabled={busy} data-host-raid>Host a raid</button>
          <div className="mcc-raid-join">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="CODE" aria-label="Raid code" maxLength={6} data-raid-code-input />
            <button type="button" className="mcc-btn is-purple" onClick={() => void join(code)} disabled={busy || code.length !== 6} data-join-raid>Join</button>
          </div>
        </div>
        {err ? <p className="mt-3 text-sm text-[#ffb08a]" data-raid-error>{err}</p> : null}
      </section>
    </main>
  );
}

// ── the raid itself: /campaign/raid/$raidId ──────────────────────────────

export function RaidBattlePage({ raidId }: { raidId: string }) {
  return (
    <CampaignDoor>
      <RaidBattle raidId={raidId} />
    </CampaignDoor>
  );
}

type Callout = { id: number; text: string; tone: "info" | "warn" | "gold"; who: "A" | "B" | "boss" };

function RaidBattle({ raidId }: { raidId: string }) {
  const narrow = useNarrow();
  const navigate = useNavigate();
  const { state: camp } = useCampaign();
  const [raid, setRaid] = useState<Raid | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<RaidMove[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [promo, setPromo] = useState<Move[] | null>(null);
  const [view, setView] = useState<"3d" | "2d">(() => (typeof window !== "undefined" && localStorage.getItem("mcc-view") === "2d" ? "2d" : "3d"));
  const [callout, setCallout] = useState<Callout | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [claim, setClaim] = useState<RaidClaim | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const seen = useRef(-1);
  const calloutId = useRef(1);
  const burstId = useRef(1);
  const sending = useRef(false);

  const say = useCallback((text: string, tone: Callout["tone"], who: Callout["who"]) => {
    const id = calloutId.current++;
    setCallout({ id, text, tone, who });
    window.setTimeout(() => setCallout((c) => (c && c.id === id ? null : c)), 2800);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await getRaid({ data: { raidId } });
      setRaid((old) => (old && old.version > r.version ? old : r));
      setErr(null);
    } catch (e) {
      setErr(errText(e));
    }
  }, [raidId]);

  // polling: fast while waiting for the partner, slower on our own turn
  useEffect(() => {
    void load();
  }, [load]);
  const myTurnNow = !!raid && raid.status === "active" && raid.turn === raid.seat && pending.length === 0;
  useEffect(() => {
    if (raid && raid.status !== "lobby" && raid.status !== "active") return;
    const t = window.setInterval(() => { if (!sending.current) void load(); }, myTurnNow ? 3000 : 1100);
    return () => window.clearInterval(t);
  }, [load, raid, myTurnNow]);
  useEffect(() => {
    const t = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const moves = useMemo(() => [...(raid?.moves ?? []), ...pending], [raid, pending]);
  const game = useMemo(() => replay(moves), [moves]);
  const s = game.s;

  // announce new moves (partner + boss), companions call out danger and combos
  useEffect(() => {
    if (!raid) return;
    const n = raid.moves.length;
    if (seen.current < 0) { seen.current = n; return; }
    if (n <= seen.current) return;
    const fresh = raid.moves.slice(seen.current);
    const startIdx = seen.current;
    seen.current = n;
    const partner = raid.seat === "A" ? raid.guest?.name ?? "Partner" : raid.host.name;
    fresh.forEach((m, k) => {
      const entry = game.log[startIdx + k];
      if (entry?.cap) {
        const [x, , z] = world(m.to);
        setBursts((b) => [...b, { id: burstId.current++, at: new THREE.Vector3(x, 0.3, z), color: m.by === "boss" ? "#ffd86b" : RAID.glow }]);
      }
    });
    const humanFresh = fresh.filter((m) => m.by !== "boss");
    if (humanFresh.some((m) => m.by !== raid.seat)) {
      playSfx("tap");
      const pm = game.log.slice(startIdx).find((l) => l.by !== "boss" && l.by !== raid.seat);
      if (raid.status === "active") say(`${partner} played ${pm?.text ?? "a move"}. Your turn!`, "info", raid.seat === "A" ? "B" : "A");
    }
    // tag-team combo: the last two human moves were captures by different players
    const humans = game.log.filter((l) => l.by !== "boss");
    const a = humans[humans.length - 1], b = humans[humans.length - 2];
    if (a && b && a.cap && b.cap && a.by !== b.by) window.setTimeout(() => say("TAG-TEAM COMBO! Two captures in a row!", "gold", a.by as "A" | "B"), 900);
    else if (raid.status === "active" && raid.turn === raid.seat && s.turn === "w") {
      if (inCheck(s, "w")) window.setTimeout(() => say("Check! Protect the king!", "warn", raid.seat), 900);
      else {
        const hang = hanging(s, "w");
        if (hang.length) window.setTimeout(() => say(`Careful: your piece on ${sqName(hang[0])} is under attack!`, "warn", raid.seat), 900);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raid?.moves.length]);

  // claim the reward once the raid is over
  const over = !!raid && ["won", "lost", "draw", "left"].includes(raid.status);
  useEffect(() => {
    if (!raid || !over || claim || raid.status === "left") return;
    if (raid.claimed) { setClaim({ ...raid.claimed, gains: {}, already: true, capped: false } as RaidClaim); return; }
    claimRaid({ data: { raidId: raid.raidId, pieces: game.stats } })
      .then((c) => { setClaim(c); if (c.coins > 0) { playSfx("coin"); window.dispatchEvent(new CustomEvent("morse-coins", { detail: {} })); } })
      .catch((e) => setErr(errText(e)));
    playSfx(raid.status === "won" ? "rankup" : "boom");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  // local test hook only (127.0.0.1 previews, or localStorage mccTest=1)
  useEffect(() => {
    if (window.location.hostname === "127.0.0.1" || localStorage.getItem("mccTest") === "1") (window as unknown as { __mccRaid?: unknown }).__mccRaid = { s, raid, pending: pending.length };
  }, [s, raid, pending]);

  const idleSec = raid ? Math.max(0, Math.floor((raid.now - raid.turnSince) / 1000 + (clock - lastFetch(raid)) / 1000)) : 0;
  const canTakeOver = !!raid && raid.status === "active" && raid.turn !== raid.seat && idleSec >= raid.idle && pending.length === 0;
  const [takeover, setTakeover] = useState(false);
  useEffect(() => { if (!canTakeOver) setTakeover(false); }, [canTakeOver]);
  const canMove = !!raid && raid.status === "active" && pending.length === 0 && s.turn === "w" && (raid.turn === raid.seat || takeover);

  const legal = useMemo(() => (canMove ? legalMoves(s) : []), [s, canMove]);
  const targets = sel != null ? legal.filter((m) => m.from === sel) : [];
  const checkSq = inCheck(s, s.turn) ? kingSq(s, s.turn) : -1;

  async function play(m: Move) {
    if (!raid || !canMove) return;
    setSel(null); setPromo(null);
    const mine: RaidMove = { from: m.from, to: m.to, promo: m.promo ?? "", by: raid.seat };
    setPending([mine]);
    playSfx(s.board[m.to] ? "boom" : "tap");
    sending.current = true;
    // the Colossus answers on this screen (seeded, so both players would get the same reply)
    await new Promise((r) => window.setTimeout(r, 60));
    const after = apply(s, m).s;
    let st = status(after);
    let boss: RaidMove | null = null;
    if (!st.over) {
      const bm = bossMove(after, RAID.level, seeded(raid.seed, after.ply));
      if (bm) {
        boss = { from: bm.from, to: bm.to, promo: bm.promo ?? "", by: "boss" };
        st = status(apply(after, bm).s);
      }
    }
    const end = st.over ? { result: st.winner === "w" ? "win" : st.winner === "b" ? "loss" : "draw", reason: st.reason } : null;
    try {
      const r = await raidMove({ data: { raidId: raid.raidId, version: raid.version, move: mine, boss, end } });
      setPending([]);
      setRaid(r);
      setTakeover(false);
    } catch (e) {
      setPending([]);
      say(errText(e), "warn", raid.seat);
      void load();
    } finally {
      sending.current = false;
    }
  }

  function tap(i: number) {
    if (!canMove) return;
    const hit = targets.filter((m) => m.to === i);
    if (hit.length > 1) return setPromo(hit);
    if (hit.length === 1) return void play(hit[0]);
    const p = s.board[i];
    if (p && p.c === "w" && legal.some((m) => m.from === i)) { setSel(sel === i ? null : i); playSfx("tap", 0.5); }
    else setSel(null);
  }

  const levels = useMemo(() => Object.fromEntries((camp?.army ?? []).map((a) => [a.slot, a.level])), [camp]);
  const veterans = useMemo(() => new Set((camp?.army ?? []).filter((a) => kindOfSlot(a.slot) === "p" && a.promos >= VETERAN_PROMOS).map((a) => a.slot)), [camp]);

  if (!raid) return <main className="mcc"><LoadingCampaign error={err} onRetry={() => void load()} /></main>;
  const nameOf = (seat: "A" | "B") => (seat === "A" ? raid.host.name : raid.guest?.name ?? "Partner");
  const link = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname.replace(/\/campaign\/raid\/.*$/, "")}/campaign/raids?code=${raid.code}` : "";
  const bossHp = s.bossStart ? material(s, "b") / s.bossStart : 1;
  const thinking = pending.length > 0;

  return (
    <main className="mcc mcc-battle" data-raid-battle={raid.status} data-raid-seat={raid.seat} data-raid-turn={raid.turn} data-can-move={canMove ? "1" : "0"}>
      <div className="absolute inset-0">
        {view === "3d" ? (
          <Arena3D s={s} chapter={RAID} sel={sel} targets={targets} last={game.last} checkSq={checkSq} fog={new Set()} levels={levels} veterans={veterans} rewards={camp?.rewards ?? []} cheer={callout?.tone === "gold"} bursts={bursts} onBurstDone={(id) => setBursts((b) => b.filter((x) => x.id !== id))} onTap={tap} narrow={narrow} />
        ) : (
          <Board2D s={s} chapter={RAID} sel={sel} targets={targets} last={game.last} checkSq={checkSq} fog={new Set()} levels={levels} onTap={tap} />
        )}
      </div>

      {raid.status !== "lobby" ? (
        <>
          <div className="mcc-panel mcc-hud-top">
            <div className="mcc-raid-team">
              {(["A", "B"] as const).map((seat) => (
                <div key={seat} className={cn("mcc-raid-mate", raid.turn === seat && raid.status === "active" && "is-turn", seat === raid.seat && "is-me")} data-raid-mate={seat}>
                  <span className={cn("bot", seat === "A" ? "is-gold" : "is-violet")}>◉</span>
                  <span className="min-w-0">
                    <b>{nameOf(seat)}{seat === raid.seat ? " (you)" : ""}</b>
                    <small>{raid.status !== "active" ? "" : raid.turn === seat ? (thinking && seat === raid.seat ? "Colossus thinking…" : seat === raid.seat ? "Your move" : "Their move") : "Waiting"}</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="mcc-vs"><b>VS</b>RAID</div>
            <div className="mcc-side-card is-boss">
              <span className="mcc-portrait is-boss">⚒</span>
              <div className="min-w-0 flex-1">
                <div className="nm">{RAID.boss}</div>
                <div className="sub">{thinking ? "Thinking…" : RAID.arena}</div>
                <div className="mcc-bar is-boss"><span style={{ width: `${Math.round(Math.min(1, bossHp) * 100)}%` }} /></div>
              </div>
            </div>
          </div>

          <aside className="mcc-panel mcc-twist" data-raid-status>
            <div className="k">Tag-team raid · code {raid.code}</div>
            <div className="txt mt-1 text-[#e6dcf0]">
              {raid.status === "active"
                ? canMove
                  ? takeover ? "You took over this turn. Make the move!" : "Your turn. Make it count."
                  : `${nameOf(raid.turn)} is moving…`
                : raid.reason || "The raid is over."}
            </div>
            {raid.status === "active" && raid.turn !== raid.seat ? (
              <div className="count" data-idle={idleSec}>
                <i>{Math.max(0, raid.idle - idleSec)}</i>s until you can take over
              </div>
            ) : null}
            {canTakeOver && !takeover ? (
              <button type="button" className="mcc-btn mt-2 w-full" onClick={() => { setTakeover(true); playSfx("menu"); }} data-take-over>Take over this turn</button>
            ) : null}
          </aside>

          <aside className="mcc-panel mcc-log" aria-label="Moves">
            <div className="mcc-label mb-1">Raid log</div>
            <ol>
              {game.log.map((l, i) => (
                <li key={i} className={cn(l.by === "boss" && "is-boss")}>
                  <span className="n">{i + 1}.</span>
                  <span className={cn("who", l.by === "A" ? "is-gold" : l.by === "B" ? "is-violet" : "is-boss")}>{l.by === "boss" ? "Colossus" : nameOf(l.by)}</span>
                  <span>{l.text}</span>
                </li>
              ))}
            </ol>
          </aside>

          <nav className="mcc-panel mcc-dock" aria-label="Raid">
            <button type="button" onClick={() => { if (raid.status === "active" && window.confirm("Leave the raid? It ends for both of you.")) void leaveRaid({ data: { raidId: raid.raidId } }).then(setRaid); }} data-leave-raid>
              <DoorOpen />Leave
            </button>
            <button type="button" className={cn(view === "3d" && "is-on")} onClick={() => { setView("3d"); localStorage.setItem("mcc-view", "3d"); }} data-view="3d"><Box />3D</button>
            <button type="button" className={cn(view === "2d" && "is-on")} onClick={() => { setView("2d"); localStorage.setItem("mcc-view", "2d"); }} data-view="2d"><Square />2D</button>
            <button type="button" onClick={() => void navigate({ to: "/campaign" })}><MapIcon />Map</button>
          </nav>
        </>
      ) : null}

      {callout ? (
        <div key={callout.id} className={cn("mcc-callout", callout.tone === "warn" && "is-warn", callout.tone === "gold" && "is-gold")} role="status" data-callout>
          <span className={cn("mcc-goldbot", callout.who === "B" && "is-violet")} aria-hidden>◉</span>
          {callout.text}
        </div>
      ) : null}

      {promo ? (
        <div className="mcc-overlay" onClick={() => setPromo(null)}>
          <div className="mcc-panel mcc-promo" onClick={(e) => e.stopPropagation()}>
            {promo.map((m) => (
              <button key={m.promo} type="button" onClick={() => void play(m)} aria-label={`Promote to ${m.promo}`}>
                <PieceMark kind={m.promo as Kind} tone="w" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {raid.status === "lobby" ? (
        <div className="mcc-overlay">
          <CampaignHeader on="raids" coins={camp?.coins} />
          <section className="mcc-panel mcc-intro" data-raid-waiting>
            <div className="chap">Raid party</div>
            <div className="boss mcc-goldtext" role="heading" aria-level={1}>Waiting for your partner</div>
            <div className="ep">Send them this code. They enter it on the Raids page.</div>
            <div className="mcc-raid-code" data-raid-code={raid.code}>{raid.code}</div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button type="button" className="mcc-btn" onClick={() => { void navigator.clipboard?.writeText(link); say("Invite link copied!", "gold", "A"); }} data-copy-raid-link>
                <Copy className="size-4" />Copy invite link
              </button>
              <button type="button" className="mcc-btn is-ghost" onClick={() => void leaveRaid({ data: { raidId: raid.raidId } }).then(() => navigate({ to: "/campaign/raids" }))}>Cancel</button>
            </div>
            <p className="mt-3 text-xs text-[#a99ab8]">The raid starts the moment they join. You move first.</p>
          </section>
        </div>
      ) : null}

      {over ? (
        <div className="mcc-overlay">
          <section className="mcc-panel mcc-end" data-raid-end={raid.status}>
            <div className="big mcc-goldtext" role="heading" aria-level={1}>
              {raid.status === "won" ? "Raid cleared!" : raid.status === "lost" ? "The Colossus wins" : raid.status === "draw" ? "Draw" : "Raid abandoned"}
            </div>
            <div className="why">{raid.reason}</div>
            {claim ? (
              <div className="mt-4 text-sm text-[#e6dcf0]" data-raid-claim>
                {claim.capped ? (
                  <>You have had today's 3 rewarded raids. This one was for glory.</>
                ) : (
                  <>Your army earned <b className="text-[#f2d27a]">{claim.xp} XP</b>{claim.coins > 0 ? <> and <b className="text-[#f2d27a]">{claim.coins} coins</b></> : null}.</>
                )}
              </div>
            ) : raid.status !== "left" ? <p className="mt-4 text-sm text-[#c7b7a0]">Collecting your share…</p> : null}
            {claim && Object.keys(claim.gains).length ? (
              <div className="mcc-gains">
                {Object.entries(claim.gains).sort((a, b) => b[1].xp - a[1].xp).slice(0, 8).map(([slot, g]) => (
                  <div key={slot} className={cn("mcc-gain", g.after > g.before && "is-up")}>
                    <b>{slotName(slot)}</b>
                    <div>+{g.xp} XP{g.after > g.before ? ` · LEVEL ${g.after}!` : ""}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="row">
              <Link to="/campaign/raids" className="mcc-btn">New raid</Link>
              <Link to="/campaign" className="mcc-btn is-purple">World map</Link>
            </div>
          </section>
        </div>
      ) : null}
      {err && !raid ? <p className="sr-only">{err}</p> : null}
    </main>
  );
}

/** When this raid snapshot arrived (for the idle countdown between polls). */
const fetchedAt = new WeakMap<Raid, number>();
function lastFetch(r: Raid): number {
  let t = fetchedAt.get(r);
  if (t == null) { t = Date.now(); fetchedAt.set(r, t); }
  return t;
}
