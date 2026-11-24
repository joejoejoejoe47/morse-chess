/**
 * Legendary in-game chrome (game-ref.jpg): small player cards in the top corners, a small move
 * history at the bottom right, slim buttons along the bottom edge, no sparks. The board and the
 * game itself are the normal Morse Chess ones.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatClock } from "@/lib/mores-constants";
import { legendaryPhotos, type PhotoInfo } from "@/lib/server/legendary";
import { CrownMark, frameIdOf, PlayerAvatar, RankBadge } from "@/components/legendary/bits";
import { cn } from "@/lib/utils";

export function usePhotos(ids: (string | null | undefined)[]): Record<string, PhotoInfo> {
  const key = ids.filter(Boolean).sort().join(",");
  const [map, setMap] = useState<Record<string, PhotoInfo>>({});
  useEffect(() => {
    if (!key) return;
    let live = true;
    void legendaryPhotos({ data: { ids: key.split(",") } })
      .then((m) => live && setMap(m))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);
  return map;
}

export function LgLogo({ small = false }: { small?: boolean }) {
  return (
    <div className="pointer-events-none flex flex-col items-center leading-none" data-legendary-logo>
      <CrownMark className={small ? "h-4 w-5" : "h-6 w-8"} />
      <span className={cn("mcl-wordmark", small ? "text-[17px] sm:text-[22px]" : "text-[30px]")}>MORSE CHESS</span>
      <span className={cn("mt-0.5 font-[Cinzel] font-bold tracking-[0.42em] text-[#b58cff]", small ? "text-[8px] sm:text-[10px]" : "text-[12px]")}>LEGENDARY</span>
    </div>
  );
}

export function LgPlayerCard({
  name,
  score,
  userId,
  photo,
  look,
  clock,
  hot,
  label,
  align = "left",
}: {
  name: string;
  score: number;
  userId?: string | null;
  photo?: PhotoInfo | null;
  look?: string | null;
  clock: number | null;
  hot: boolean;
  label?: string;
  align?: "left" | "right";
}) {
  return (
    <div className={cn("mcl-card flex items-center gap-2.5 rounded-lg px-2.5 py-2 sm:px-3", align === "right" && "flex-row-reverse text-right", hot && "is-hot")} data-player-card={align}>
      <PlayerAvatar userId={userId} photo={photo} letter={name[0]} size={40} frame={frameIdOf(look)} />
      <div className="min-w-0">
        <div className={cn("flex items-center gap-1.5", align === "right" && "flex-row-reverse")}>
          <span className="max-w-[7.5rem] truncate font-[Cinzel] text-[12px] font-bold uppercase tracking-[0.06em] text-[#f6e7c3] sm:max-w-[10rem] sm:text-[13px]">{name}</span>
          <RankBadge score={score} size={18} />
        </div>
        <div className={cn("flex items-baseline gap-2", align === "right" && "flex-row-reverse")}>
          <span className="font-[Cinzel] text-[13px] font-bold text-[#e7c56a] tabular-nums">{score}</span>
          {clock !== null ? <span className={cn("font-mono text-[15px] tabular-nums", hot ? "text-[#fff6dc]" : "text-[#a99e86]")}>{formatClock(clock)}</span> : null}
        </div>
        {label ? <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#9c8f74]">{label}</p> : null}
      </div>
    </div>
  );
}

export function LgMoveHistory({ moves, className }: { moves: { san: string }[]; className?: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [moves.length]);
  const rows: [number, string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([i / 2 + 1, moves[i].san, moves[i + 1]?.san]);
  return (
    <div className={cn("mcl-card w-44 rounded-lg px-3 py-2", className)} data-move-history>
      <p className="mb-1 text-center font-[Cinzel] text-[10px] font-bold uppercase tracking-[0.2em] text-[#e7c56a]">◆ Move history ◆</p>
      <div className="max-h-40 overflow-y-auto pr-1 font-mono text-[12px] leading-[1.55] text-[#efe3c4]">
        {rows.length === 0 ? <p className="text-center text-[11px] text-[#8f8470]">No moves yet</p> : null}
        {rows.map(([n, w, b]) => (
          <div key={n} className="grid grid-cols-[1.6rem_1fr_1fr] gap-1">
            <span className="text-[#8f8470]">{n}.</span>
            <span>{w}</span>
            <span>{b ?? ""}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}

export function LgBarButton({ children, onClick, active = false, title, className, ...rest }: { children: ReactNode; onClick?: () => void; active?: boolean; title?: string; className?: string } & Record<string, unknown>) {
  return (
    <button type="button" title={title} onClick={onClick} className={cn("mcl-bar-btn", active && "is-on", className)} {...rest}>
      {children}
    </button>
  );
}

/** The jewelled gold crown over the in-game title (t393u ref). */
function JewelCrown() {
  return (
    <svg viewBox="0 0 64 44" className="mcl-hd-crown" aria-hidden>
      <defs>
        <linearGradient id="mcl-hd-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4c8" />
          <stop offset=".35" stopColor="#f6cf63" />
          <stop offset=".7" stopColor="#c68a1e" />
          <stop offset="1" stopColor="#7a4a0c" />
        </linearGradient>
        <linearGradient id="mcl-hd-gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2d6ff" />
          <stop offset=".45" stopColor="#a54bff" />
          <stop offset="1" stopColor="#4a0f8c" />
        </linearGradient>
      </defs>
      <path d="M6 34 L3 10 L17 21 L24 5 L32 17 L40 5 L47 21 L61 10 L58 34 Z" fill="url(#mcl-hd-gold)" stroke="#5a3608" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 31 L6 15 L17 24 L24 10 L32 21 L40 10 L47 24 L58 15 L56 31 Z" fill="none" stroke="#fff3c4" strokeOpacity=".55" strokeWidth=".8" />
      <rect x="5" y="33" width="54" height="8" rx="2" fill="url(#mcl-hd-gold)" stroke="#5a3608" strokeWidth="1.2" />
      <path d="M8 35.5 H56" stroke="#fff3c4" strokeOpacity=".6" strokeWidth=".8" />
      {[3, 24, 40, 61].map((x, i) => (
        <circle key={i} cx={x} cy={i === 0 || i === 3 ? 10 : 5} r="2.6" fill="url(#mcl-hd-gold)" stroke="#5a3608" strokeWidth=".8" />
      ))}
      <circle cx="32" cy="16" r="2.4" fill="url(#mcl-hd-gold)" stroke="#5a3608" strokeWidth=".8" />
      <path d="M32 22 L37 28 L32 34 L27 28 Z" fill="url(#mcl-hd-gem)" stroke="#2a0850" strokeWidth=".8" />
      <circle cx="18" cy="29" r="2.6" fill="url(#mcl-hd-gem)" stroke="#2a0850" strokeWidth=".7" />
      <circle cx="46" cy="29" r="2.6" fill="url(#mcl-hd-gem)" stroke="#2a0850" strokeWidth=".7" />
      {[14, 24, 40, 50].map((x) => (
        <circle key={x} cx={x} cy="37" r="1.5" fill="url(#mcl-hd-gem)" />
      ))}
      <path d="M30.6 25.5 L32 24 L33 25.6" stroke="#fff" strokeOpacity=".8" strokeWidth=".7" fill="none" />
    </svg>
  );
}

/** A gold filigree scroll for either end of the mode plaque. */
function Filigree({ flip = false }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 34 44" className={cn("mcl-hd-fili", flip && "is-flip")} aria-hidden>
      <path d="M33 4 C20 4 12 8 9 16 C7 21 9 26 13 27 C17 28 19 24 17 21 C15 18 12 20 13 22 M9 16 C5 18 2 22 2 22 C2 22 5 26 9 28 M33 40 C20 40 12 36 9 28 C7 23 9 18 13 17 C17 16 19 20 17 23 C15 26 12 24 13 22" fill="none" stroke="url(#mcl-hd-gold)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M2 22 L6 18 L10 22 L6 26 Z" fill="url(#mcl-hd-gem)" stroke="#f6cf63" strokeWidth=".8" />
    </svg>
  );
}

const Sparkle = ({ style }: { style: React.CSSProperties }) => (
  <svg viewBox="0 0 20 20" className="mcl-hd-spark" style={style} aria-hidden>
    <path d="M10 0 L11.4 8.6 L20 10 L11.4 11.4 L10 20 L8.6 11.4 L0 10 L8.6 8.6 Z" fill="#fffbe8" />
  </svg>
);

/**
 * In-game header (owner t393u, game-header-ref.png): a jewelled crown over a big bevelled gold
 * MORSE CHESS with glints and a neon LEGENDARY, then an ornate purple plaque (filigree ends, gem,
 * mode | ranked · clock, [OWNER PREVIEW]) beside a glossy gold YOUR MOVE pill (muted when waiting),
 * all on a soft starry velvet glow. On phones it stacks: logo, plaque, pill.
 */
export function LgGameCrest({
  mode,
  clock,
  ranked,
  preview = false,
  turn,
}: {
  mode: string;
  clock: string;
  ranked: boolean | null;
  preview?: boolean;
  turn: { text: string; mine: boolean; over: boolean };
}) {
  return (
    <div className="mcl-crest mcl-hd pointer-events-none flex min-w-0 flex-col items-center" data-legendary-crest>
      <div className="mcl-hd-glow" aria-hidden />
      <div className="mcl-hd-logo" data-legendary-logo>
        <JewelCrown />
        <div className="mcl-hd-title-wrap">
          <span className="mcl-hd-title">MORSE CHESS</span>
          <Sparkle style={{ left: "8%", top: "-6%", animationDelay: "0s" }} />
          <Sparkle style={{ left: "47%", top: "62%", animationDelay: ".9s", width: 9, height: 9 }} />
          <Sparkle style={{ right: "4%", top: "8%", animationDelay: "1.6s" }} />
        </div>
        <span className="mcl-hd-legend">LEGENDARY</span>
      </div>
      <div className="mcl-crest-row mcl-hd-row">
        <span className="mcl-hd-plaque" data-mode-badge>
          <Filigree />
          <svg viewBox="0 0 24 24" className="mcl-hd-gem" aria-hidden>
            <path d="M12 1 L23 12 L12 23 L1 12 Z" fill="url(#mcl-hd-gem)" stroke="#f6cf63" strokeWidth="1.4" />
            <path d="M12 1 L12 23 M1 12 L23 12 M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5" stroke="#f2d6ff" strokeOpacity=".35" strokeWidth=".7" />
          </svg>
          <span className="mcl-crest-name mcl-hd-name">{mode}</span>
          <span className="mcl-hd-sep" aria-hidden />
          <span className="mcl-crest-info mcl-hd-info">{ranked === null ? clock : `${ranked ? "Ranked" : "Unranked"} · ${clock}`}</span>
          {preview ? <span className="mcl-crest-preview mcl-hd-preview">[Owner preview]</span> : null}
          <Filigree flip />
        </span>
        <span className={cn("mcl-crest-turn mcl-hd-turn", turn.mine && !turn.over && "is-mine", turn.over && "is-over")} data-turn-indicator aria-live="polite">
          <span className="mcl-hd-orb" aria-hidden />
          <span className="mcl-hd-turn-text">{turn.text}</span>
        </span>
      </div>
    </div>
  );
}
