/**
 * Battle Chess 2D board (owner t375u, MB-14). Forceman's island: a wooden 14x8 board on blue water,
 * water ditches, 2x2 rock mountains, bushes and two-cell frigates, drawn in the Legendary style.
 * One SVG in cell units; same props shape as BgBoard2D so game-view treats it like any board.
 * MB-19 (owner t381u, video 4pmjgON8Y68): wood-grain squares, a wood-grain blue sea that runs to the
 * screen edge, the land casting a shadow on the water, the cburnett set plus matching new pieces,
 * galleons, low-poly snowy mountains and leafy bushes (art in bc-art.tsx).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BC_STD, BcBush, BcHill, BcMountain, BcPlumes, BcShip, BcSpecial, bcLavaTex, bcPieceUrl, bcTex } from "@/components/games/bc-art";
import { BC_H, BC_W, BC_X0, BC_X1, BC_Y0, BC_Y1, bcColor, bcHill, bcParse, bcPos, bcSq, bcTerrain } from "@/lib/boardgames/battlechess";

type Props = {
  fen: string;
  you: "w" | "b";
  lastMove: { from: string; to: string } | null;
  lastSan?: string | null;
  myTurn: boolean;
  disabled?: boolean;
  onMove: (from: string, to: string) => void;
  legalFor?: (from: string) => string[];
  checkSq?: string | null;
};

export type BcPiece = { id: string; p: string; c: "w" | "b"; kind: string; x: number; y: number; sq: string; w?: number; h?: number; rider?: string };

/** Pieces with stable ids (a move keeps its id so it glides; a frigate is one piece over two cells). */
export function useBcPieces(fen: string, lastMove: { from: string; to: string } | null) {
  const ref = useRef<{ fen: string; ids: Map<string, string>; next: number }>({ fen: "", ids: new Map(), next: 1 });
  return useMemo(() => {
    const s = bcParse(fen);
    const out: BcPiece[] = [];
    if (!s) return out;
    const ships: Record<string, { xs: number[]; ys: number[] }> = {};
    for (let yi = 0; yi < BC_H; yi++)
      for (let xi = 0; xi < BC_W; xi++) {
        const p = s.cells[yi][xi];
        if (p === ".") continue;
        const x = xi + BC_X0, y = BC_Y1 - yi;
        if (p.toUpperCase() === "F") {
          (ships[p] ??= { xs: [], ys: [] }).xs.push(x);
          ships[p].ys.push(y);
          continue;
        }
        out.push({ id: "", p, c: bcColor(p)!, kind: p.toUpperCase(), x, y, sq: bcSq(x, y), rider: s.cargo[bcSq(x, y)] });
      }
    for (const [p, v] of Object.entries(ships)) {
      const x = Math.min(...v.xs), y = Math.min(...v.ys);
      out.push({ id: `ship-${p}`, p, c: bcColor(p)!, kind: "F", x, y, sq: bcSq(x, y), w: Math.max(...v.xs) - x + 1, h: Math.max(...v.ys) - y + 1 });
    }
    const cur = ref.current;
    const prev = cur.ids;
    const ids = new Map<string, string>();
    const moved = lastMove && cur.fen !== fen ? lastMove : null;
    for (const pc of out) {
      if (pc.kind === "F") continue;
      if (moved && pc.sq === moved.to && prev.has(moved.from)) ids.set(pc.sq, prev.get(moved.from)!);
      else if (prev.has(pc.sq) && !(moved && pc.sq === moved.to)) ids.set(pc.sq, prev.get(pc.sq)!);
    }
    for (const pc of out) if (pc.kind !== "F" && !ids.has(pc.sq)) ids.set(pc.sq, `p${cur.next++}`);
    ref.current = { fen, ids, next: cur.next };
    return out.map((pc) => (pc.kind === "F" ? pc : { ...pc, id: ids.get(pc.sq)! }));
  }, [fen, lastMove]);
}

/** Board cell (x,y) -> screen column/row. Your own army is always at the bottom. */
function view(you: "w" | "b") {
  return (x: number, y: number): [number, number] => (you === "w" ? [BC_X1 - x, y - BC_Y0] : [x - BC_X0, BC_Y1 - y]);
}

export const BC_NAME: Record<string, string> = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn", C: "Archer", E: "Eagle", A: "Assassin", F: "Frigate", I: "Pirate", W: "Wizard", U: "Boots", H: "Chest", S: "Boat" };

export function BcBoard2D({ fen, you, lastMove, lastSan, myTurn, disabled, onMove, legalFor, checkSq }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const pieces = useBcPieces(fen, lastMove);
  const v = useMemo(() => view(you), [you]);
  const targets = useMemo(() => (sel && legalFor ? legalFor(sel) : []), [sel, legalFor]);
  useEffect(() => setSel(null), [fen]);
  const state = useMemo(() => bcParse(fen), [fen]);
  const ownAt = (sq: string) => {
    const p = bcPos(sq);
    if (!p || !state) return false;
    const c = state.cells[BC_Y1 - p[1]][p[0] - BC_X0];
    return bcColor(c) === you;
  };
  const enemyAt = (sq: string) => {
    const p = bcPos(sq);
    if (!p || !state) return false;
    const c = state.cells[BC_Y1 - p[1]][p[0] - BC_X0];
    return c !== "." && bcColor(c) !== you;
  };
  function tap(sq: string) {
    if (disabled || !myTurn) return;
    if (sel && targets.includes(sq)) {
      onMove(sel, sq);
      setSel(null);
      return;
    }
    setSel(ownAt(sq) && sq !== sel ? sq : null);
  }

  // terrain layers
  const cells: React.ReactNode[] = [];
  const shadows: React.ReactNode[] = [];
  const landCells: React.ReactNode[] = [];
  for (let y = BC_Y0; y <= BC_Y1; y++)
    for (let x = BC_X0; x <= BC_X1; x++) {
      const [c, r] = v(x, y);
      const t = bcTerrain(x, y);
      const dark = (x + y) % 2 === 0;
      const n = (x * 7 + y * 13 + ((x * y) & 5)) & 3;
      const tex = t === "W" ? (dark ? "sea-d" : "sea-l") : dark ? "land-d" : "land-l";
      (t === "W" ? cells : landCells).push(<image key={`t${x},${y}`} href={bcTex(tex, n)} x={c - 0.004} y={r - 0.004} width={1.008} height={1.008} preserveAspectRatio="none" />);
      if (t !== "W") shadows.push(<rect key={`s${x},${y}`} x={c + 0.06} y={r + 0.1} width={1} height={1} />);
    }
  // open sea beyond the grid so the water reaches the screen edge
  const far: React.ReactNode[] = [];
  for (let r = -12; r < BC_H + 12; r++)
    for (let c = -16; c < BC_W + 16; c++) {
      if (r >= 0 && r < BC_H && c >= 0 && c < BC_W) continue;
      const dark = (c + r + (you === "w" ? BC_X1 + BC_Y0 : BC_X0 + BC_Y1)) % 2 === 0;
      const n = (c * 7 + r * 13) & 3;
      far.push(<image key={`f${c},${r}`} href={bcTex(dark ? "sea-d" : "sea-l", n)} x={c - 0.004} y={r - 0.004} width={1.008} height={1.008} preserveAspectRatio="none" />);
    }
  // island outline (gold rim on every land/water edge)
  const rim: string[] = [];
  for (let y = BC_Y0; y <= BC_Y1; y++)
    for (let x = BC_X0; x <= BC_X1; x++) {
      if (bcTerrain(x, y) === "W") continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (bcTerrain(x + dx, y + dy) !== "W") continue;
        const [c, r] = v(x, y);
        const [c2, r2] = v(x + dx, y + dy);
        if (c2 !== c) {
          const ex = Math.max(c, c2);
          rim.push(`M${ex} ${r} L${ex} ${r + 1}`);
        } else {
          const ey = Math.max(r, r2);
          rim.push(`M${c} ${ey} L${c + 1} ${ey}`);
        }
      }
    }
  const mountains = [
    [0, 7],
    [12, 1],
  ].map(([mx, my]) => {
    const pts = [v(mx, my), v(mx + 1, my), v(mx, my + 1), v(mx + 1, my + 1)];
    const c = Math.min(...pts.map((p) => p[0])), r = Math.min(...pts.map((p) => p[1]));
    return (
      <g key={`m${mx}`} transform={`translate(${c - 0.28} ${r - 0.22}) scale(0.0256)`} data-bc-mountain>
        <BcMountain />
      </g>
    );
  });
  const mountCells: [number, number][] = [
    [0, 7],
    [12, 1],
  ];
  // the volcano that erupted this turn: the big mountain nearest the fresh lava (t389u)
  const fresh = state && state.storm.includes("V") ? Object.entries(state.lava).filter(([, t]) => t === 3).map(([sq]) => bcPos(sq)!).filter(Boolean) : [];
  const volcano = fresh.length
    ? mountCells.reduce((best, m) => {
        const d = (q: [number, number]) => fresh.reduce((a, f) => a + Math.hypot(f[0] - q[0] - 0.5, f[1] - q[1] - 0.5), 0);
        return d(m) < d(best) ? m : best;
      })
    : null;
  const volcCenter = volcano ? (() => { const pts = [v(volcano[0], volcano[1]), v(volcano[0] + 1, volcano[1] + 1)]; return [Math.min(pts[0][0], pts[1][0]) + 1, Math.min(pts[0][1], pts[1][1]) + 0.8] as [number, number]; })() : null;
  const plumes = volcano && volcCenter ? (
    <g key={`plume${fen}`} transform={`translate(${volcCenter[0] - 1.28} ${volcCenter[1] - 0.55}) scale(0.0256)`} pointerEvents="none">
      <BcPlumes />
    </g>
  ) : null;
  const hills: React.ReactNode[] = [];
  for (let y = BC_Y0; y <= BC_Y1; y++)
    for (let x = BC_X0; x <= BC_X1; x++)
      if (bcHill(x, y)) {
        const [c, r] = v(x, y);
        hills.push(
          <g key={`hill${x},${y}`} transform={`translate(${c - 0.05} ${r - 0.05}) scale(0.011)`} data-bc-hill-cell={bcSq(x, y)}>
            <BcHill />
          </g>,
        );
      }
  const bushes = [
    [6, 5],
    [7, 4],
  ].map(([bx, by]) => {
    const [c, r] = v(bx, by);
    return (
      <g key={`b${bx}`} transform={`translate(${c - 0.17} ${r - 0.2}) scale(0.0134)`} data-bc-bush>
        <BcBush />
      </g>
    );
  });

  // frame the islands and ships tightly (x -6..19, y -3..12); the open sea fills the rest of the screen
  const corners = [v(-6, -3), v(19, 12)];
  const c0 = Math.min(corners[0][0], corners[1][0]), r0 = Math.min(corners[0][1], corners[1][1]);
  const c1 = Math.max(corners[0][0], corners[1][0]) + 1, r1 = Math.max(corners[0][1], corners[1][1]) + 1;
  const frame = `${c0 - 0.25} ${r0 - 0.25} ${c1 - c0 + 0.5} ${r1 - r0 + 0.5}`;

  const lastSq = new Set(lastMove ? [lastMove.from, lastMove.to] : []);
  const shot = lastMove && lastSan && lastSan.includes("*") ? lastMove : null;

  return (
    <div className="bc2-wrap" data-bc-board>
      <svg className="bc2-svg" style={{ overflow: "visible" }} viewBox={frame} preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="bc-land-sh" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation={0.07} />
          </filter>
          <filter id="bc-pc-w" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx={0.02} dy={0.035} stdDeviation={0.025} floodColor="#000" floodOpacity={0.45} />
          </filter>
          <filter id="bc-pc-b" x="-20%" y="-20%" width="140%" height="140%">
            <feMorphology in="SourceAlpha" operator="dilate" radius={0.018} result="d" />
            <feFlood floodColor="#fff" floodOpacity={0.85} />
            <feComposite in2="d" operator="in" result="halo" />
            <feDropShadow in="SourceGraphic" dx={0.02} dy={0.035} stdDeviation={0.025} floodColor="#000" floodOpacity={0.45} result="sh" />
            <feMerge>
              <feMergeNode in="halo" />
              <feMergeNode in="sh" />
            </feMerge>
          </filter>
          <radialGradient id="bc-sea" cx="50%" cy="50%" r="70%">
            <stop offset="0" stopColor="#000" stopOpacity={0} />
            <stop offset="1" stopColor="#0b0618" stopOpacity={0.55} />
          </radialGradient>
        </defs>
        <rect x={-0.3} y={-0.3} width={BC_W + 0.6} height={BC_H + 0.6} fill="#3a6cd6" />
        {far}
        {cells}
        <g fill="#06123a" opacity={0.55} filter="url(#bc-land-sh)" pointerEvents="none" data-bc-shadow>
          {shadows}
        </g>
        {landCells}
        <path d={rim.join(" ")} stroke="#2a1708" strokeOpacity={0.55} strokeWidth={0.03} strokeLinecap="square" />
        {mountains}
        {hills}
        {bushes}
        {state
          ? Object.entries(state.lava).map(([sq, ttl], i) => {
              const p = bcPos(sq);
              if (!p || ttl <= 0) return null;
              const [c, r] = v(p[0], p[1]);
              const flying = ttl === 3 && volcCenter;
              const n = (p[0] * 5 + p[1] * 3) & 3;
              return (
                <g key={`lava${sq}${flying ? fen : ""}`} data-lava={sq} pointerEvents="none">
                  <image href={bcLavaTex(n)} x={c} y={r} width={1} height={1} preserveAspectRatio="none" className={flying ? "bc2-lava-land" : undefined} style={flying ? { animationDelay: `${0.25 + i * 0.18}s` } : undefined} opacity={ttl === 1 ? 0.8 : 1} />
                  {flying ? (
                    <>
                      <g className="bc2-lava-fly" style={{ ["--dx" as string]: `${c + 0.5 - volcCenter[0]}px`, ["--dy" as string]: `${r + 0.5 - volcCenter[1]}px`, animationDelay: `${i * 0.18}s`, transform: `translate(${volcCenter[0]}px, ${volcCenter[1]}px)` }}>
                        <image href={bcLavaTex(n)} x={-0.3} y={-0.3} width={0.6} height={0.6} preserveAspectRatio="none" />
                      </g>
                      <circle cx={c + 0.5} cy={r + 0.5} r={0.5} fill="none" stroke="#ffb13a" strokeWidth={0.1} className="bc2-lava-hit" style={{ animationDelay: `${0.25 + i * 0.18}s` }} />
                    </>
                  ) : null}
                </g>
              );
            })
          : null}
        {plumes}
        {/* last move, check, selection */}
        {[...lastSq].map((sq) => {
          const p = bcPos(sq);
          if (!p) return null;
          const [c, r] = v(p[0], p[1]);
          return <rect key={`lm${sq}`} x={c} y={r} width={1} height={1} fill="#f2c94c" opacity={0.32} pointerEvents="none" />;
        })}
        {checkSq
          ? (() => {
              const p = bcPos(checkSq)!;
              const [c, r] = v(p[0], p[1]);
              return <circle cx={c + 0.5} cy={r + 0.5} r={0.5} fill="url(#bc-check)" className="bc2-check" pointerEvents="none" />;
            })()
          : null}
        <radialGradient id="bc-check">
          <stop offset="0.3" stopColor="#ff3b3b" stopOpacity={0.9} />
          <stop offset="1" stopColor="#ff3b3b" stopOpacity={0} />
        </radialGradient>
        {sel
          ? (() => {
              const p = bcPos(sel)!;
              const [c, r] = v(p[0], p[1]);
              return <rect x={c + 0.04} y={r + 0.04} width={0.92} height={0.92} rx={0.12} fill="#ffe08a" fillOpacity={0.25} stroke="#ffe08a" strokeWidth={0.06} pointerEvents="none" />;
            })()
          : null}
        {/* pieces */}
        {pieces.map((pc) => {
          const white = pc.c === "w";
          if (pc.kind === "F") {
            const xs = [pc.x, pc.x + (pc.w ?? 1) - 1], ys = [pc.y, pc.y + (pc.h ?? 1) - 1];
            const corners = xs.flatMap((x) => ys.map((y) => v(x, y)));
            const c = Math.min(...corners.map((q) => q[0])), r = Math.min(...corners.map((q) => q[1]));
            const sw = Math.max(...corners.map((q) => q[0])) - c + 1, sh = Math.max(...corners.map((q) => q[1])) - r + 1;
            return (
              <g key={pc.id} className="bc2-piece" style={{ transform: `translate(${c}px, ${r}px)` }} data-piece={`${pc.c}F`} data-bc-ship={pc.c}>
                <g transform={sw >= sh ? "translate(0.05 -0.5) scale(0.019)" : "translate(-0.3 0.62) scale(0.016)"}>
                  <BcShip white={white} />
                </g>
              </g>
            );
          }
          if (pc.kind === "S" || (pc.kind === "I" && bcTerrain(pc.x, pc.y) === "W")) {
            const [c, r] = v(pc.x, pc.y);
            return (
              <g key={pc.id} className="bc2-piece" style={{ transform: `translate(${c}px, ${r}px)` }} data-piece={`${pc.c}${pc.kind}`} data-sq-piece={pc.sq} data-bc-boat={pc.kind} data-bc-rider={pc.rider}>
                <title>{`${white ? "White" : "Black"} ${pc.kind === "S" ? "Boat" : "Pirate ship"}${pc.rider ? ` carrying a ${BC_NAME[pc.rider.toUpperCase()]?.toLowerCase()}` : ""}`}</title>
                {pc.rider ? (
                  BC_STD.has(pc.rider.toUpperCase()) ? (
                    <image href={bcPieceUrl(bcColor(pc.rider)!, pc.rider.toUpperCase())} x={-0.14} y={-0.3} width={0.92} height={0.92} filter={bcColor(pc.rider) === "w" ? "url(#bc-pc-w)" : "url(#bc-pc-b)"} />
                  ) : (
                    <g transform="translate(-0.1 -0.26) scale(0.0185)">
                      <BcSpecial kind={pc.rider.toUpperCase()} white={bcColor(pc.rider) === "w"} />
                    </g>
                  )
                ) : null}
                <g transform={pc.rider ? "translate(0.06 0.18) scale(0.0098)" : "translate(-0.02 0.1) scale(0.0104)"}>
                  <BcShip white={white} pirate={pc.kind === "I"} />
                </g>
              </g>
            );
          }
          const [c, r] = v(pc.x, pc.y);
          return (
            <g key={pc.id} className="bc2-piece" style={{ transform: `translate(${c}px, ${r}px)` }} data-piece={`${pc.c}${pc.kind}`} data-sq-piece={pc.sq}>
              <title>{`${white ? "White" : "Black"} ${BC_NAME[pc.kind]}`}</title>
              {BC_STD.has(pc.kind) ? (
                <image href={bcPieceUrl(pc.c, pc.kind)} x={0.03} y={0.03} width={0.94} height={0.94} filter={white ? "url(#bc-pc-w)" : "url(#bc-pc-b)"} />
              ) : (
                <g transform="translate(0.04 0.04) scale(0.02044)" filter={pc.kind === "H" ? "url(#bc-pc-w)" : white ? "url(#bc-pc-w)" : "url(#bc-pc-b)"}>
                  <BcSpecial kind={pc.kind} white={white} />
                </g>
              )}
            </g>
          );
        })}
        {/* shot trail (archer arrow / cannonball / rook boarding) */}
        {shot
          ? (() => {
              const a = bcPos(shot.from)!, b = bcPos(shot.to)!;
              const [c1, r1] = v(a[0], a[1]);
              const [c2, r2] = v(b[0], b[1]);
              return (
                <g key={`${shot.from}${shot.to}${fen}`} pointerEvents="none" className="bc2-shot">
                  <line x1={c1 + 0.5} y1={r1 + 0.5} x2={c2 + 0.5} y2={r2 + 0.5} stroke="#ffd36b" strokeWidth={0.08} strokeDasharray="0.18 0.12" strokeLinecap="round" />
                  <circle cx={c2 + 0.5} cy={r2 + 0.5} r={0.42} fill="none" stroke="#ff7a3b" strokeWidth={0.08} className="bc2-boom" />
                </g>
              );
            })()
          : null}
        {/* targets */}
        {targets.map((sq) => {
          const p = bcPos(sq)!;
          const [c, r] = v(p[0], p[1]);
          return enemyAt(sq) ? (
            <g key={`tg${sq}`} pointerEvents="none" data-target={sq}>
              <circle cx={c + 0.5} cy={r + 0.5} r={0.4} fill="none" stroke="#ff5a4a" strokeWidth={0.07} />
              <path d={`M${c + 0.5} ${r + 0.04} L${c + 0.5} ${r + 0.24} M${c + 0.5} ${r + 0.76} L${c + 0.5} ${r + 0.96} M${c + 0.04} ${r + 0.5} L${c + 0.24} ${r + 0.5} M${c + 0.76} ${r + 0.5} L${c + 0.96} ${r + 0.5}`} stroke="#ff5a4a" strokeWidth={0.06} />
            </g>
          ) : (
            <circle key={`tg${sq}`} cx={c + 0.5} cy={r + 0.5} r={0.15} fill="#ffe08a" opacity={0.9} pointerEvents="none" data-target={sq} />
          );
        })}
        {/* hit cells on top */}
        {Array.from({ length: BC_H }, (_, yi) =>
          Array.from({ length: BC_W }, (_, xi) => {
            const x = xi + BC_X0, y = BC_Y1 - yi;
            const [c, r] = v(x, y);
            const sq = bcSq(x, y);
            return <rect key={`h${sq}`} x={c} y={r} width={1} height={1} fill="transparent" data-sq={sq} onClick={() => tap(sq)} style={{ cursor: myTurn && !disabled ? "pointer" : "default" }} />;
          }),
        )}
      </svg>
    </div>
  );
}
