/** Flat board for phones and slower computers: same hazards, drawn with the Morse piece marks. */
import { PATHS } from "@/components/chess/marks";
import { boardById } from "@/lib/chess/board-skins";
import { cn } from "@/lib/utils";
import { onRim, sqName, type Move, type State } from "./engine";
import type { Chapter } from "./data";
import { tierFor } from "./data";

const GEAR_SVG = (
  <svg viewBox="0 0 100 100" className="gear" aria-hidden>
    <path
      fill="#c08a3a"
      d="M50 8l6 10 11-4 2 12 12 2-4 11 10 6-10 6 4 11-12 2-2 12-11-4-6 10-6-10-11 4-2-12-12-2 4-11-10-6 10-6-4-11 12-2 2-12 11 4z M50 34a16 16 0 1 0 0.1 0z"
      fillRule="evenodd"
    />
  </svg>
);

export function Board2D({
  s,
  chapter,
  sel,
  targets,
  last,
  checkSq,
  fog,
  levels,
  onTap,
}: {
  s: State;
  chapter: Chapter;
  sel: number | null;
  targets: Move[];
  last: { from: number; to: number } | null;
  checkSq: number;
  fog: Set<number>;
  levels: Record<string, number>;
  onTap: (sq: number) => void;
}) {
  const skin = boardById(chapter.board);
  const tmap = new Map(targets.map((m) => [m.to, m]));
  const gears = new Set(chapter.rules.gears ?? []);
  const cells = [];
  for (let r = 7; r >= 0; r--)
    for (let f = 0; f < 8; f++) {
      const i = r * 8 + f;
      const light = (f + r) % 2 === 1;
      const p = s.board[i];
      const t = tmap.get(i);
      const perk = t && (t.kind === "shield-wall" || t.kind === "phase-leap" || t.kind === "ricochet");
      const hidden = fog.has(i);
      const tier = p && p.c === "w" ? tierFor(levels[p.id] ?? 1) : null;
      cells.push(
        <button
          key={i}
          type="button"
          className={cn("mcc-sq", sel === i && "is-sel", last && (last.from === i || last.to === i) && "is-last", checkSq === i && "is-check", s.phase === 2 && onRim(i) && "is-rim")}
          style={{ background: light ? skin.lightSq : skin.darkSq }}
          onClick={() => onTap(i)}
          data-sq={sqName(i)}
          aria-label={sqName(i)}
        >
          {gears.has(i) ? GEAR_SVG : null}
          {s.walls[i] ? <span className="wall">{"▮".repeat(s.walls[i])}</span> : null}
          {p && !(p.c === "b" && hidden) ? (
            <svg viewBox="0 0 40 40" className="pc" style={{ opacity: p.glass ? 0.55 : 1 }}>
              <path
                d={PATH_OF(p.k)}
                fill={p.c === "w" ? tier!.color : p.glass ? "#bfe4ff" : "#1a1020"}
                stroke={p.c === "w" ? "#2a1606" : chapter.accent}
                strokeWidth={1.6}
                strokeLinejoin="round"
                style={p.c === "w" ? ((levels[p.id] ?? 1) >= 7 ? { filter: `drop-shadow(0 0 4px ${tier!.ring})` } : undefined) : { filter: "drop-shadow(0 0 1.5px rgba(255, 236, 200, 0.9))" }}
              />
            </svg>
          ) : null}
          {hidden ? <span className="fog" /> : null}
          {t ? <span className={cn("dot", t.kind === "wall" ? "is-wall" : (p || t.kind === "ep") && "is-cap", perk && "is-perk")} /> : null}
          {f === 0 ? <span className="coord" style={{ color: light ? skin.darkSq : skin.lightSq, left: 3, top: 1, bottom: "auto" }}>{r + 1}</span> : null}
          {r === 0 ? <span className="coord" style={{ color: light ? skin.darkSq : skin.lightSq, left: "auto", right: 3 }}>{"abcdefgh"[f]}</span> : null}
        </button>,
      );
    }
  return (
    <div className="mcc-board2d">
      <div className="mcc-b2" data-board2d>
        {cells}
      </div>
    </div>
  );
}

const PATH_OF = (k: keyof typeof PATHS) => PATHS[k];
