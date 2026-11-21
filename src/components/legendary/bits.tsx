import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { asset } from "@/lib/base";
import { characterById, finishById, frameById, parseLoadout } from "@/lib/avatar/catalog";
import { rankFor, tierById, RARITY, SEASON_PARTICLE, seasonImage, type Rarity, type Season } from "@/lib/legendary/theme";
import { myLegendaryPhoto, photoUrl, type MyPhoto, type PhotoInfo } from "@/lib/server/legendary";
import { cn } from "@/lib/utils";

// ── rank badge ────────────────────────────────────────────────────────────

export function RankBadge({ score, tierId, size = 28, className, showName = false }: { score: number; tierId?: string | null; size?: number; className?: string; showName?: boolean }) {
  const tier = tierById(tierId) ?? rankFor(score).tier;
  const badge = (
    <img
      src={asset(`/legendary/ui/tier-${tier.id}.webp`)}
      width={size}
      height={Math.round(size * 1.12)}
      alt={`${tier.name} rank`}
      className={cn("shrink-0 object-contain drop-shadow-[0_2px_5px_rgba(0,0,0,0.65)]", className)}
      style={{ width: size, height: Math.round(size * 1.12) }}
      data-rank={tier.id}
      draggable={false}
    />
  );
  if (!showName) return badge;
  return (
    <span className="inline-flex items-center gap-2">
      {badge}
      <span className="leading-tight">
        <span className="block font-[Cinzel] text-[13px] font-bold uppercase tracking-[0.08em]" style={{ color: tier.color }}>
          {tier.name}
        </span>
      </span>
    </span>
  );
}

// ── coin ──────────────────────────────────────────────────────────────────

export function Coin({ className }: { className?: string }) {
  return <img src={asset("/morse-coin.png")} alt="" className={cn("inline-block size-5 shrink-0 rounded-full", className)} draggable={false} />;
}

// ── player avatar (photo / letter, framed) ────────────────────────────────

const FRAME_RING: Record<string, string> = {
  plain: "ring-2 ring-[#b8913d]/70",
  gold: "ring-[3px] ring-[#f1cf6b] shadow-[0_0_14px_rgba(241,207,107,0.6)]",
  "king-gold": "ring-[3px] ring-[#f1cf6b] shadow-[0_0_14px_rgba(241,207,107,0.6)]",
  laurel: "ring-[3px] ring-[#7fae6a] shadow-[0_0_12px_rgba(127,174,106,0.5)]",
  night: "ring-[3px] ring-[#7eb6ff] shadow-[0_0_14px_rgba(80,140,255,0.6)]",
  check: "ring-[3px] ring-[#f4efe4] outline outline-2 outline-offset-2 outline-[#1c1914]",
  coin: "ring-[3px] ring-[#e6c56a] shadow-[0_0_16px_rgba(230,197,106,0.55)]",
};

export function frameIdOf(look?: string | null): string {
  try {
    return frameById(parseLoadout(look ? JSON.parse(look) : {}).frameId).id;
  } catch {
    return "plain";
  }
}

export function LetterDisc({ letter, className, style }: { letter: string; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cn(
        "grid place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#7b3fd6_0%,#3a1470_55%,#1a0833_100%)] font-[Cinzel] font-bold text-[#f8dc8a] [text-shadow:0_1px_0_#5a3a08,0_0_12px_rgba(248,220,138,0.55)]",
        className,
      )}
      style={style}
      data-letter-avatar={letter}
    >
      {letter || "?"}
    </span>
  );
}

export function PlayerAvatar({
  userId,
  photo,
  letter,
  size = 48,
  frame = "plain",
  className,
}: {
  userId?: string | null;
  photo?: PhotoInfo | null;
  letter?: string;
  size?: number;
  frame?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showPhoto = !!userId && photo?.kind === "photo" && photo.v > 0 && !broken;
  const l = (photo?.letter || letter || "?").slice(0, 1).toUpperCase();
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center rounded-full bg-[#140b20]", FRAME_RING[frame] ?? FRAME_RING.plain, className)}
      style={{ width: size, height: size }}
      data-player-avatar={showPhoto ? "photo" : "letter"}
      data-frame={frame}
    >
      {showPhoto ? (
        <img src={photoUrl(userId!, photo!.v)} alt="" className="size-full rounded-full object-cover" onError={() => setBroken(true)} draggable={false} />
      ) : (
        <LetterDisc letter={l} className="size-full" style={{ fontSize: size * 0.46 }} />
      )}
    </span>
  );
}

// ── square portraits (leaderboard): photo, else the player's AV king, else the letter ──

export const ui = (name: string) => asset(`/legendary/ui/${name}`);

/** A portrait picture for a player's saved AV look (their king), or null. */
export function lookPortrait(look?: string | null): string | null {
  if (!look) return null;
  try {
    const lo = parseLoadout(JSON.parse(look));
    if (lo.style === "an") return characterById(lo.anId).portrait || ui("pf-king-gold.webp");
    if (lo.style === "ra") return characterById("royal").portrait || ui("pf-king-gold.webp");
    if (lo.style === "lg") return ui("pf-brick.webp");
    const f = finishById(lo.finishId);
    const hex = (f.body || "#b8872f").replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > 170) return ui("pf-king-ivory.webp");
    if (r > 150 && g > 100 && b < 90) return ui("pf-king-gold.webp");
    return ui("pf-king-onyx.webp");
  } catch {
    return null;
  }
}

export function SquarePortrait({ userId, photo, look, letter, className }: { userId?: string | null; photo?: PhotoInfo | null; look?: string | null; letter?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const showPhoto = !!userId && photo?.kind === "photo" && photo.v > 0 && !broken;
  const av = showPhoto ? null : lookPortrait(look);
  const l = (letter || "?").slice(0, 1).toUpperCase();
  return (
    <span className={cn("mcl-portrait", className)} data-portrait={showPhoto ? "photo" : av ? "king" : "letter"}>
      {showPhoto ? (
        <img src={photoUrl(userId!, photo!.v)} alt="" onError={() => setBroken(true)} draggable={false} />
      ) : av ? (
        <img src={av} alt="" draggable={false} />
      ) : (
        <LetterDisc letter={l} className="size-full !rounded-none text-[1.4em]" />
      )}
    </span>
  );
}

// ── my photo (shared across the Legendary pages) ──────────────────────────

let mine: MyPhoto | null = null;
const PHOTO_EVENT = "mcl-photo-changed";

export function setMyPhotoCache(p: MyPhoto) {
  mine = p;
  window.dispatchEvent(new Event(PHOTO_EVENT));
}

export function useMyPhoto(enabled = true): { photo: MyPhoto | null; loaded: boolean } {
  const [photo, setPhoto] = useState<MyPhoto | null>(mine);
  const [loaded, setLoaded] = useState(mine !== null);
  useEffect(() => {
    if (!enabled) return;
    const sync = () => {
      setPhoto(mine);
      setLoaded(true);
    };
    window.addEventListener(PHOTO_EVENT, sync);
    if (mine === null) {
      void myLegendaryPhoto()
        .then((p) => {
          mine = p;
          sync();
        })
        .catch(() => setLoaded(true));
    }
    return () => window.removeEventListener(PHOTO_EVENT, sync);
  }, [enabled]);
  return { photo, loaded };
}

// ── countdown ─────────────────────────────────────────────────────────────

export function useCountdown(targetMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return targetMs == null ? 0 : Math.max(0, targetMs - now);
}

export function hms(ms: number): [string, string, string] {
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return [p(Math.floor(s / 3600)), p(Math.floor((s % 3600) / 60)), p(s % 60)];
}

// ── panel ─────────────────────────────────────────────────────────────────

export function GoldPanel({ children, className, title, crown = false, ...rest }: { children: ReactNode; className?: string; title?: ReactNode; crown?: boolean } & Record<string, unknown>) {
  return (
    <section className={cn("mcl-panel relative rounded-xl", className)} {...rest}>
      {crown ? <CrownMark className="absolute -top-4 left-1/2 h-7 w-9 -translate-x-1/2" /> : null}
      {title ? <h2 className="mcl-title px-4 pt-3 text-center text-[15px]">{title}</h2> : null}
      {children}
    </section>
  );
}

export function CrownMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 28" className={className} aria-hidden>
      <defs>
        <linearGradient id="mcl-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.5" stopColor="#e7b84a" />
          <stop offset="1" stopColor="#8c5a14" />
        </linearGradient>
      </defs>
      <path d="M3 23 1 6l9 7 8-11 8 11 9-7-2 17Z" fill="url(#mcl-crown)" stroke="#5c3a0a" strokeWidth="1.2" />
      <rect x="3" y="22.5" width="30" height="4" rx="1.4" fill="url(#mcl-crown)" stroke="#5c3a0a" strokeWidth="1" />
      <circle cx="18" cy="15" r="2.2" fill="#a34dff" />
      <circle cx="10" cy="17" r="1.5" fill="#3d8bff" />
      <circle cx="26" cy="17" r="1.5" fill="#3d8bff" />
    </svg>
  );
}

export function RarityTag({ rarity }: { rarity: Rarity }) {
  return (
    <span className="font-[Cinzel] text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: RARITY[rarity].color }}>
      {RARITY[rarity].name}
    </span>
  );
}

// ── season backdrop + a few slow particles ────────────────────────────────

export function SeasonBackdrop({ season, dim = false }: { season: Season; dim?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const img = new Image();
    img.onload = () => setReady(true);
    img.src = seasonImage(season);
  }, [season]);
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" data-season={season} aria-hidden>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${seasonImage(season, true)}")` }} />
      <div className={cn("absolute inset-0 bg-cover bg-center transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")} style={{ backgroundImage: `url("${seasonImage(season)}")` }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(8,4,14,0.32)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/35 to-transparent" />
      {dim ? <div className="absolute inset-0 bg-[#0a0612]/70 backdrop-blur-[2px]" /> : null}
      <Particles kind={SEASON_PARTICLE[season]} />
    </div>
  );
}

function Particles({ kind }: { kind: "leaf" | "snow" | "petal" | "firefly" | "spark" }) {
  const bits = useMemo(
    () =>
      Array.from({ length: kind === "snow" ? 14 : 9 }, (_, i) => ({
        left: (i * 37 + 11) % 100,
        delay: -((i * 2.3) % 14),
        dur: 14 + ((i * 7) % 9),
        size: kind === "snow" ? 3 + (i % 3) : kind === "firefly" || kind === "spark" ? 3 + (i % 2) : 10 + (i % 3) * 3,
        drift: ((i * 29) % 16) - 8,
      })),
    [kind],
  );
  return (
    <div className="mcl-particles absolute inset-0" data-particles={kind}>
      {bits.map((b, i) => (
        <span
          key={i}
          className={cn("mcl-particle absolute block", `mcl-p-${kind}`)}
          style={
            {
              left: `${b.left}%`,
              width: b.size,
              height: b.size,
              "--delay": `${b.delay}s`,
              "--dur": `${b.dur}s`,
              "--drift": `${b.drift}vw`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
