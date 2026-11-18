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
