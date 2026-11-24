/** /campaign: the 3D world map, the chapter card and the way into the Army. */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { playSfx } from "@/lib/legendary/sfx";
import { cn } from "@/lib/utils";
import { CHAPTERS, levelFor, slotName, type CampaignState } from "./data";
import { CampaignDoor, CampaignHeader, LoadingCampaign, useCampaign } from "./shell";
import { WorldMap, type MapNode } from "./world-map";

const ROMAN = ["I", "II", "III", "IV", "V"];
const REWARD_ICON: Record<string, string> = { board: "♜", frame: "⚙", skin: "♛", aura: "✦", vfx: "✧", companion: "🤖" };

export function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 900);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 900);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return narrow;
}

export function nodesFor(state: CampaignState): MapNode[] {
  return CHAPTERS.map((c) => {
    const cleared = state.cleared.includes(c.n);
    const unlocked = c.n === 1 || state.cleared.includes(c.n - 1);
    return { chapter: c, state: cleared ? "cleared" : c.n > state.open ? "soon" : unlocked ? "open" : "locked" };
  });
}

export function CampaignMapPage() {
  return (
    <CampaignDoor>
      <MapInner />
    </CampaignDoor>
  );
}

function MapInner() {
  const { state, error, reload } = useCampaign();
  const narrow = useNarrow();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const nodes = useMemo(() => (state ? nodesFor(state) : []), [state]);

  useEffect(() => {
    if (!state || selected != null) return;
    const next = nodes.find((n) => n.state === "open") ?? nodes[0];
    setSelected(next.chapter.n);
  }, [state, nodes, selected]);

  useEffect(() => {
    if (!state) return;
    const total = Object.values(state.synced ?? {}).reduce((a, b) => a + b, 0);
    if (total > 0) {
      const best = Object.entries(state.synced).sort((a, b) => b[1] - a[1])[0];
      setToast(`Your army earned ${total} XP from your recent games · ${slotName(best[0])} +${best[1]}`);
      const t = window.setTimeout(() => setToast(null), 5200);
      return () => window.clearTimeout(t);
    }
  }, [state]);

  const node = nodes.find((n) => n.chapter.n === selected) ?? null;
  const ch = node?.chapter;
  const prog = state?.progress.find((p) => p.chapter === ch?.n);
  const armyPower = state ? Math.round(state.army.reduce((a, s) => a + levelFor(s.xp), 0) / 16 * 10) / 10 : 0;
  const hasFrame = state?.rewards.includes("gear-frame");

  return (
    <main className="mcc" data-campaign-map>
      <div className="mcc-map-canvas">{state ? <WorldMap nodes={nodes} selected={selected} onSelect={(n) => { setSelected(n); playSfx("tap"); }} narrow={narrow} /> : null}</div>
      <CampaignHeader on="map" coins={state?.coins} frame={hasFrame ? "gear" : undefined} />
      {!state ? <LoadingCampaign error={error} onRetry={reload} /> : null}
      {state ? (
        <>
          <div className="mcc-map-title">
            <div className="t mcc-goldtext" role="heading" aria-level={1}>The Campaign</div>
            <div className="s">Five bosses · one legendary army</div>
          </div>
          {toast ? <div className="mcc-synced" role="status" data-army-synced>{toast}</div> : null}

          <div className="mcc-side">
            <Link to="/campaign/army" className="mcc-panel mcc-sidebtn" onClick={() => playSfx("tap")} data-open-army>
              <span className="ic">♞</span>
              <span>
                <b>Your Army</b>
                <small>Average level {armyPower} · perks & titles</small>
              </span>
            </Link>
            <span className="mcc-panel mcc-sidebtn is-soon" title="Coming in the next update">
              <span className="ic">⚔</span>
              <span>
                <b>Co-op Raids</b>
                <small>Team up vs a raid boss · soon</small>
              </span>
            </span>
            <span className="mcc-panel mcc-sidebtn is-soon" title="Coming in a later update">
              <span className="ic">🏗</span>
              <span>
                <b>Arena Builder</b>
                <small>Design & share arenas · soon</small>
              </span>
            </span>
          </div>

          {ch && node ? (
            <section className="mcc-panel mcc-chapter" data-chapter-card={ch.n} data-chapter-state={node.state}>
              <div className="num">Chapter {ROMAN[ch.n - 1]} · {ch.arena}</div>
              <div className="boss mcc-goldtext" role="heading" aria-level={2}>{ch.boss}</div>
              <div className="arena">{ch.epithet}</div>
              <div className="twist">
                <span className="mcc-label">Boss twist</span>
                <div className="mt-1">{ch.twist}</div>
              </div>
              <div className="quote">“{ch.quote}”</div>
              <div className="mcc-rewards">
                <span className="mcc-label">First-clear rewards</span>
                {ch.rewards.map((r) => (
                  <div key={r.id} className={cn("mcc-reward", node.state === "cleared" && "is-won")}>
                    <span className="ic">{REWARD_ICON[r.kind]}</span>
                    <span>{r.name}</span>
                    {node.state === "cleared" ? <span className="won">Won</span> : null}
                  </div>
                ))}
              </div>
              <div className="go">
                {node.state === "open" || node.state === "cleared" ? (
                  <button
                    type="button"
                    className="mcc-btn"
                    onClick={() => { playSfx("menu"); void navigate({ to: "/campaign/play/$chapter", params: { chapter: String(ch.n) } }); }}
                    data-enter-battle={ch.n}
                  >
                    {node.state === "cleared" ? "Fight again" : "Enter battle"}
                  </button>
                ) : (
                  <button type="button" className="mcc-btn" disabled>
                    {node.state === "soon" ? "Opens soon" : `Clear chapter ${ROMAN[ch.n - 2]} first`}
                  </button>
                )}
                <Link to="/campaign/army" className="mcc-btn is-ghost is-sm" onClick={() => playSfx("tap")}>Army</Link>
              </div>
              {prog ? <div className="meta">Tries {prog.tries} · Wins {prog.wins}{prog.bestPlies ? ` · Fastest win ${Math.ceil(prog.bestPlies / 2)} moves` : ""}</div> : null}
            </section>
          ) : null}

          <nav className="mcc-panel mcc-steps" aria-label="Chapters">
            {nodes.map((n) => (
              <button
                key={n.chapter.n}
                type="button"
                className={cn("mcc-step", selected === n.chapter.n && "is-on", n.state === "cleared" && "is-done", (n.state === "locked" || n.state === "soon") && "is-locked")}
                onClick={() => { setSelected(n.chapter.n); playSfx("tap"); }}
                data-step={n.chapter.n}
              >
                <span className="medal">{n.state === "cleared" ? "✓" : ROMAN[n.chapter.n - 1]}</span>
                <span className="nm">{n.chapter.boss.replace(/^The /, "")}</span>
              </button>
            ))}
          </nav>
        </>
      ) : null}
    </main>
  );
}
