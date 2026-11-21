import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Lock, X } from "lucide-react";
import { asset } from "@/lib/base";
import { playSfx } from "@/lib/legendary/sfx";
import { tierById } from "@/lib/legendary/theme";
import { myRank, type MyRank } from "@/lib/server/legendary";
import { ui } from "@/components/legendary/bits";

/**
 * Legendary UNRANKED pull-up (owner t369u, reference unranked-ref2): crown on the frame, glowing
 * gold title, "Choose your battle", a 3×2 grid of ornate gold-framed cards (title + subtitle on top,
 * full-bleed art, OWNER badge row, tagline), CANCEL and an X at the bottom.
 * Ranked players see their rank badge instead of the UNRANKED title (owner t370u).
 * Classic keeps its own PullUpScreen in club-home.tsx.
 */
export type Medal = "crown" | "bolt" | "general" | "checker" | "helmet" | "snow" | "pawn" | "star";
export type LegendaryTile = {
  id: string;
  /** Image path under the site base, e.g. /legendary/pullup/checkers.webp */
  art: string;
  big: string;
  small: string;
  state: "play" | "preview" | "soon";
  go: () => void;
  owner?: string;
  medal?: Medal;
  tagline?: string;
  tagIcon?: Medal | "swords" | "ball" | "compass";
};

export function LegendaryPullUp({
  screen,
  intent,
  tiles,
  error,
  onBack,
  onClose,
}: {
  screen: "main" | "other";
  intent: "random" | "challenge";
  tiles: LegendaryTile[];
  error: string | null;
  onBack: () => void;
  onClose: () => void;
}) {
  const [rank, setRank] = useState<MyRank | null>(null);
  useEffect(() => {
    let live = true;
    void myRank().then((r) => { if (live) setRank(r); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (screen === "other" ? onBack : onClose)(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, onBack, onClose]);
  const other = screen === "other";
  const tier = rank?.ranked ? tierById(rank.tier) : null;
  void intent;
  return (
    <div className="lpu-backdrop" data-pullup-screen data-pullup-view={screen} data-legendary-pullup onClick={onClose}>
      <div className="lpu-scroll">
        <div className="lpu-panel" onClick={(e) => e.stopPropagation()}>
          <img src={ui("crown.webp")} alt="" className="lpu-crown" draggable={false} />
          <Corner className="is-tl" /><Corner className="is-tr" /><Corner className="is-bl" /><Corner className="is-br" />
          <header className="lpu-head">
            {other ? (
              <button type="button" data-pullup-back className="lpu-back" onClick={() => { playSfx("tap"); onBack(); }}>
                ← Back
              </button>
            ) : null}
            {other ? (
              <h2 className="lpu-title">Other games</h2>
            ) : tier ? (
              <div className="lpu-rank" data-rank-header={tier.id}>
                <img src={ui(`tier-${tier.id}.webp`)} alt={`${tier.name} rank`} className="lpu-rank-badge" draggable={false} />
                <span className="lpu-rank-text">
                  <span className="lpu-rank-name">{tier.name}</span>
                  <span className="lpu-rank-place">{rank?.place ? `Rank ${rank.place}` : "Ranked"}</span>
                </span>
              </div>
            ) : (
              <h2 className="lpu-title" data-unranked-title>Unranked</h2>
            )}
            <p className="lpu-sub"><span className="lpu-rule" />{other ? "Beyond the board" : "Choose your battle"}<span className="lpu-rule" /></p>
          </header>
          <div key={screen} data-pullup-tiles className={`lpu-grid ${other ? "is-other" : ""}`}>
            {tiles.map((t, i) => <Card key={t.id} t={t} i={i} compact={other} />)}
          </div>
          {error ? <p className="lpu-error">{error}</p> : null}
          <footer className="lpu-foot">
            <button type="button" className="lpu-cancel" data-pullup-cancel onClick={() => { playSfx("tap"); onClose(); }}>Cancel</button>
            <button type="button" aria-label="Close" className="lpu-x" onClick={() => { playSfx("tap"); onClose(); }}><X /></button>
          </footer>
        </div>
      </div>
    </div>
  );
}

function Card({ t, i, compact }: { t: LegendaryTile; i: number; compact: boolean }) {
  const soon = t.state === "soon";
  return (
    <button
      type="button"
      data-pullup-tile={t.id}
      data-tile-state={t.state}
      aria-disabled={soon}
      aria-label={`${t.big} — ${t.small}${soon ? " (coming soon)" : ""}`}
      className={`lpu-card ${soon ? "is-soon" : ""} ${compact ? "is-compact" : ""} ${t.big.length > 11 ? "is-long" : ""}`}
      style={{ "--d": `${i * 55}ms` } as CSSProperties}
      onClick={() => { if (!soon) t.go(); }}
    >
      <span className="lpu-artbox">
        <img src={asset(t.art)} alt="" width={960} height={720} decoding="async" draggable={false} className="lpu-art" />
        <span className="lpu-shade" aria-hidden />
        <span className="lpu-shine" aria-hidden />
        <span className="lpu-head-text">
          <span className="lpu-big">{t.big}</span>
          <span className="lpu-small">{t.small}</span>
        </span>
        {t.owner ? (
          <span className="lpu-owner">
            <span className="lpu-medal"><Icon k={t.medal ?? "crown"} /></span>
            <span className="lpu-owner-pill"><small>Owner</small><b>{t.owner}</b></span>
          </span>
        ) : null}
        {t.state === "preview" ? <span data-owner-preview className="lpu-tag">Owner preview</span> : null}
        {soon ? <span data-coming-soon className="lpu-tag is-soon"><Lock /> Coming soon</span> : null}
      </span>
      {t.tagline ? (
        <span className="lpu-tagline"><Icon k={t.tagIcon ?? "star"} /><span>{t.tagline}</span></span>
      ) : null}
    </button>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <svg className={`lpu-corner ${className}`} viewBox="0 0 60 60" aria-hidden>
      <path d="M2 58 V14 Q2 2 14 2 H58" fill="none" stroke="#d7a94b" strokeWidth="2.2" />
      <path d="M8 58 V18 Q8 8 18 8 H58" fill="none" stroke="#8a6326" strokeWidth="1.2" />
      <path d="M14 30 Q14 14 30 14 M20 26 q4 -8 12 -6" fill="none" stroke="#e8c26a" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="14" cy="14" r="2.6" fill="#f2cf74" />
    </svg>
  );
}

function Icon({ k }: { k: string }): ReactNode {
  const gold = "#f2cf74";
  switch (k) {
    case "crown":
      return <svg viewBox="0 0 24 24"><path d="M3 18 L2 7 L7.5 11 L12 4 L16.5 11 L22 7 L21 18 Z" fill={gold} stroke="#6b4a12" strokeWidth="1" strokeLinejoin="round" /><rect x="3" y="18.5" width="18" height="2.6" rx="1" fill={gold} /></svg>;
    case "bolt":
      return <svg viewBox="0 0 24 24"><path d="M13.5 2 L5 13.5 H11 L9.5 22 L19 9.5 H13 Z" fill={gold} stroke="#6b4a12" strokeWidth=".8" strokeLinejoin="round" /></svg>;
    case "general":
      return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="#b3202a" stroke={gold} strokeWidth="1.4" /><text x="12" y="16.2" textAnchor="middle" fontSize="11.5" fontWeight="700" fill={gold} fontFamily="'Noto Serif SC','Songti SC',serif">帥</text></svg>;
    case "checker":
      return <svg viewBox="0 0 24 24"><ellipse cx="12" cy="16" rx="8.5" ry="3.6" fill="#7a1015" /><ellipse cx="12" cy="13.6" rx="8.5" ry="3.6" fill="#c3242a" stroke="#ff8f84" strokeOpacity=".5" strokeWidth=".8" /><path d="M7.5 11 L7 6.5 L9.6 8.4 L12 5 L14.4 8.4 L17 6.5 L16.5 11 Z" fill={gold} stroke="#6b4a12" strokeWidth=".7" strokeLinejoin="round" /></svg>;
    case "helmet":
      return <svg viewBox="0 0 24 24"><path d="M4 14 Q4 4 13 4 Q20 4 20.5 11 L20.5 14 H15 L14 18 H7 Q4 18 4 14 Z" fill="#3e63c9" stroke={gold} strokeWidth="1.2" /><path d="M14 11 H22 M14 14 H21" stroke={gold} strokeWidth="1.2" /></svg>;
    case "snow":
      return <svg viewBox="0 0 24 24" stroke="#bfe6ff" strokeWidth="1.6" strokeLinecap="round" fill="none"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" /><path d="M9.5 3.8 12 6l2.5-2.2M9.5 20.2 12 18l2.5 2.2M4 10.2l3.3.8-.9 3.2M20 13.8l-3.3-.8.9-3.2M4 13.8l3.3-.8-.9-3.2M20 10.2l-3.3.8.9 3.2" /></svg>;
    case "pawn":
      return <svg viewBox="0 0 24 24"><circle cx="12" cy="6.5" r="3.2" fill={gold} /><path d="M9 11h6l1.5 7H7.5z" fill={gold} /><rect x="6" y="18.5" width="12" height="2.6" rx="1" fill={gold} /></svg>;
    case "swords":
      return <svg viewBox="0 0 24 24" stroke={gold} strokeWidth="1.7" strokeLinecap="round"><path d="M4 4l11 11M20 4L9 15" /><path d="M13 17l4 4M11 17l-4 4M15.5 13.5l3 3M8.5 13.5l-3 3" /></svg>;
    case "ball":
      return <svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="9.5" ry="5.8" transform="rotate(-35 12 12)" fill="#8a4a22" stroke={gold} strokeWidth="1" /><path d="M9 15l6-6M10.5 10.5l1.5 1.5M12 9l1.5 1.5M9 12l1.5 1.5" stroke="#f6efe2" strokeWidth="1" /></svg>;
    case "compass":
      return <svg viewBox="0 0 24 24"><path d="M12 1.5 L14 10 L22.5 12 L14 14 L12 22.5 L10 14 L1.5 12 L10 10 Z" fill={gold} /><circle cx="12" cy="12" r="2" fill="#2a1a08" /></svg>;
    default:
      return <svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z" fill={gold} /></svg>;
  }
}
