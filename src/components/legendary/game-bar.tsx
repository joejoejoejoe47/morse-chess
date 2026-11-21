/**
 * Legendary in-game button bar (owner t378u, gamebar-ref.png): one row of dark purple tiles with
 * thin double gold borders, gold SVG icons over gold small-caps labels. RESIGN and MORE are wide.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const G = "url(#mgb-gold)";

function Defs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <linearGradient id="mgb-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbe7a6" />
          <stop offset=".45" stopColor="#e2b85c" />
          <stop offset="1" stopColor="#a87a2c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export const BarIcon: Record<string, ReactNode> = {
  resign: (
    <svg viewBox="0 0 48 48" aria-hidden>
      {/* sword */}
      <path d="M24 2l2.6 4v24h-5.2V6z" fill={G} />
      <path d="M24 4.5v25" stroke="#6b4a17" strokeWidth=".8" />
      <rect x="15" y="29.5" width="18" height="3" rx="1.4" fill={G} />
      <rect x="22.4" y="32.5" width="3.2" height="9" rx="1" fill={G} />
      <circle cx="24" cy="43.6" r="2.4" fill={G} />
      {/* crown around the blade */}
      <path d="M8 13l5.5 5 4-7 3.6 7.5h5.8l3.6-7.5 4 7 5.5-5-3 13.5H11z" fill={G} />
      <rect x="11" y="25" width="26" height="3.2" rx="1" fill={G} />
      <circle cx="8" cy="12.2" r="1.8" fill={G} />
      <circle cx="40" cy="12.2" r="1.8" fill={G} />
      <circle cx="17.5" cy="10" r="1.6" fill={G} />
      <circle cx="30.5" cy="10" r="1.6" fill={G} />
      <path d="M21.4 6h5.2v20.5h-5.2z" fill={G} />
      <path d="M24 6.5v19" stroke="#6b4a17" strokeWidth=".9" />
    </svg>
  ),
  "2d": (
    <svg viewBox="0 0 48 48" aria-hidden>
      <path d="M24 4l20 20-20 20L4 24z" fill={G} />
      <path d="M24 15l9 9-9 9-9-9z" fill="#120b1e" />
      <path d="M24 4l20 20-20 20L4 24z" fill="none" stroke="#fff3c4" strokeOpacity=".35" strokeWidth=".8" />
    </svg>
  ),
  "3d": (
    <svg viewBox="0 0 48 48" aria-hidden>
      <path d="M24 4l18 9-18 9-18-9z" fill="#fbe2a0" />
      <path d="M6 13l18 9v22L6 35z" fill="#d9a84c" />
      <path d="M42 13L24 22v22l18-9z" fill="#a9792c" />
      <path d="M24 22v22" stroke="#7a5418" strokeWidth=".8" />
    </svg>
  ),
  an: (
    <svg viewBox="0 0 48 48" aria-hidden fill="none" stroke={G} strokeWidth="3.4" strokeLinecap="round">
      <circle cx="24" cy="24" r="13" />
      <path d="M24 3v11M24 34v11M3 24h11M34 24h11" />
      <circle cx="24" cy="24" r="3.4" fill={G} stroke="none" />
    </svg>
  ),
  lg: (
    <svg viewBox="0 0 48 48" aria-hidden>
      {[-1, 1].map((s) => (
        <g key={s} transform={s < 0 ? "" : "translate(48 0) scale(-1 1)"}>
          <path d="M22 44C11 40 6 30 8.5 14" fill="none" stroke={G} strokeWidth="2.4" strokeLinecap="round" />
          {[
            [9.6, 36, -50], [7, 29, -25], [6.4, 22, -5], [7.6, 15, 15], [10.5, 9, 35],
          ].map(([x, y, a], i) => (
            <ellipse key={i} cx={x} cy={y} rx="2.6" ry="5.2" transform={`rotate(${a} ${x} ${y})`} fill={G} />
          ))}
          {[[14.4, 39.5, -70], [12.4, 32.5, -48], [12, 25.5, -30], [13, 18.5, -12]].map(([x, y, a], i) => (
            <ellipse key={`i${i}`} cx={x} cy={y} rx="2.3" ry="4.6" transform={`rotate(${a} ${x} ${y})`} fill={G} />
          ))}
        </g>
      ))}
      <circle cx="24" cy="44" r="2" fill={G} />
    </svg>
  ),
  ra: (
    <svg viewBox="0 0 48 48" aria-hidden fill="none" stroke={G} strokeLinecap="round">
      <path d="M12.5 24a11.5 11.5 0 0123 0" strokeWidth="2.8" />
      <path d="M6 26a18 18 0 0136 0" strokeWidth="2.8" />
      <path d="M18.6 25a5.6 5.6 0 0110.8 0" strokeWidth="2.8" />
      <circle cx="24" cy="25" r="3" fill={G} stroke="none" />
      <path d="M24 28l-8 17M24 28l8 17M19 38h10" strokeWidth="2.8" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 48 48" aria-hidden>
      <path d="M24 5C12.4 5 4 12.2 4 21.2c0 5.3 2.9 9.9 7.4 12.8L9 43l10-6.1c1.6.3 3.3.5 5 .5 11.6 0 20-7.2 20-16.2S35.6 5 24 5z" fill={G} />
      <circle cx="15" cy="21.5" r="2.9" fill="#1a1028" />
      <circle cx="24" cy="21.5" r="2.9" fill="#1a1028" />
      <circle cx="33" cy="21.5" r="2.9" fill="#1a1028" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 48 16" aria-hidden>
      <circle cx="8" cy="8" r="4.4" fill={G} />
      <circle cx="24" cy="8" r="4.4" fill={G} />
      <circle cx="40" cy="8" r="4.4" fill={G} />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 48 48" aria-hidden>
      <path d="M24 5L4 22h6v20h11V30h6v12h11V22h6z" fill={G} />
    </svg>
  ),
};

export function BarTile({
  icon,
  label,
  wide = false,
  active = false,
  onClick,
  title,
  className,
  ...rest
}: {
  icon: ReactNode;
  label: ReactNode;
  wide?: boolean;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <button type="button" title={title} onClick={onClick} className={cn("mgb-tile", wide && "is-wide", active && "is-on", className)} aria-pressed={active} {...rest}>
      <span className="mgb-ico">{icon}</span>
      <span className="mgb-lab">{label}</span>
    </button>
  );
}

/** Content for a tile rendered by another component (e.g. RaBuy owns its own <button>). */
export function BarTileInner({ icon, label }: { icon: ReactNode; label: ReactNode }) {
  return (
    <>
      <span className="mgb-ico">{icon}</span>
      <span className="mgb-lab">{label}</span>
    </>
  );
}

/** The row: scrolls sideways on narrow phones; the active tile scrolls into view. */
export function GameBar({ children, more }: { children: ReactNode; more?: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = row.current?.querySelector<HTMLElement>(".mgb-tile.is-on");
    on?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, []);
  return (
    <div className="mgb" data-legendary-gamebar>
      <Defs />
      {more}
      <div ref={row} className="mgb-row">
        {children}
      </div>
    </div>
  );
}
