import { characterById, frameById, parseLoadout } from "@/lib/avatar/catalog";
import { cn } from "@/lib/utils";
import { asset } from "@/lib/base";

const FRAMES: Record<string, string> = {
  plain: "border border-line bg-ink/80",
  gold: "border-2 border-[#e6c56a] bg-[#1a140c]/90 shadow-[0_0_18px_rgba(230,197,106,0.35)]",
  laurel: "border border-[#d7b56a] bg-[#142016]/90 shadow-[inset_0_0_0_3px_rgba(90,122,78,0.65)]",
  night: "border border-[#7eb6ff] bg-[#0c1424]/90 shadow-[0_0_18px_rgba(80,140,255,0.35)]",
  check: "border-2 border-transparent bg-[linear-gradient(#14120f,#14120f),repeating-conic-gradient(#f4efe4_0_25%,#1c1914_0_50%)] bg-origin-border [background-clip:padding-box,border-box]",
  coin: "border border-[#e6c56a] bg-[#1a140c]/90",
};

export function NamePlate({
  name,
  look,
  dance = false,
  align = "left",
  clock,
  hot = false,
  label,
}: {
  name: string;
  look?: string | null;
  dance?: boolean;
  align?: "left" | "right";
  clock?: string | null;
  hot?: boolean;
  label?: string;
}) {
  const loadout = parseLoadout(look ? safeParse(look) : {});
  const character = characterById(loadout.anId);
  const frame = frameById(loadout.frameId);
  return (
    <div className={cn("pointer-events-none flex items-center gap-3", align === "right" ? "flex-row-reverse" : "flex-row")}>
      <img
        src={character.portrait || asset("/party/w-k.png")}
        alt=""
        className={cn(
          "size-11 shrink-0 rounded-full border border-gold-line/70 bg-[#1a140e] object-cover shadow-lg",
          dance && "origin-bottom animate-bounce",
        )}
      />
      <div className={cn("min-w-0 max-w-[14rem] rounded-full px-3 py-1.5", FRAMES[frame.id] ?? FRAMES.plain)}>
        {label ? <p className="truncate text-[10px] uppercase tracking-[0.16em] text-mist">{label}</p> : null}
        <p className={cn("truncate font-display text-lg leading-none text-ivory", dance && "text-2xl text-[#f6e7b2]")}>{name}</p>
        {clock ? <p className={cn("mt-0.5 font-display text-xl tabular-nums leading-none", hot ? "text-cream" : "text-mist")}>{clock}</p> : null}
      </div>
    </div>
  );
}

function safeParse(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}
