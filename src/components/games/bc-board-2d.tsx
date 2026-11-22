/**
 * Battle Chess 2D board (owner t375u, MB-14). Forceman's island: a wooden 14x8 board on blue water,
 * water ditches, 2x2 rock mountains, bushes and two-cell frigates, drawn in the Legendary style.
 * One SVG in cell units; same props shape as BgBoard2D so game-view treats it like any board.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BC_H, BC_W, BC_X0, BC_X1, BC_Y0, BC_Y1, bcColor, bcParse, bcPos, bcSq, bcTerrain } from "@/lib/boardgames/battlechess";

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

export type BcPiece = { id: string; p: string; c: "w" | "b"; kind: string; x: number; y: number; sq: string; w?: number; h?: number };

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
        out.push({ id: "", p, c: bcColor(p)!, kind: p.toUpperCase(), x, y, sq: bcSq(x, y) });
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

export const BC_NAME: Record<string, string> = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn", C: "Archer", E: "Eagle", A: "Assassin", F: "Frigate", I: "Pirate", W: "Wizard", U: "Boots", H: "Chest" };

/** Flat white-or-black icons, the same read as the video: a solid shape, a hard outline. */
function PieceArt({ kind, fill, stroke }: { kind: string; fill: string; stroke: string }) {
  const p = { fill, stroke, strokeWidth: 4, strokeLinejoin: "round" as const };
  if (kind === "H")
    return (
      <g>
        <path d="M50 8 L82 34 L68 88 L32 88 L18 34 Z" fill="#7dcea0" stroke="#145c32" strokeWidth={4} strokeLinejoin="round" />
        <path d="M50 8 L50 88 M18 34 L82 34" stroke="#145c32" strokeWidth={3} fill="none" />
        <path d="M36 22 L50 12 L64 22 L50 30 Z" fill="#d5ffe4" stroke="#145c32" strokeWidth={3} />
      </g>
    );
  if (kind === "K")
    return (
      <g {...p}>
        <path d="M46 6 H54 V16 H64 V24 H54 V34 H46 V24 H36 V16 H46 Z" />
        <path d="M22 40 H78 L70 92 H30 Z" />
      </g>
    );
  if (kind === "Q")
    return (
      <g {...p}>
        <circle cx={20} cy={24} r={7} />
        <circle cx={50} cy={12} r={7} />
        <circle cx={80} cy={24} r={7} />
        <path d="M20 30 L30 92 H70 L80 30 L50 18 Z" />
      </g>
    );
  if (kind === "R")
    return (
      <g {...p}>
        <path d="M18 18 H32 V28 H40 V18 H48 V28 H60 V18 H68 V28 H82 V40 H18 Z" />
        <path d="M24 40 H76 L70 92 H30 Z" />
      </g>
    );
  if (kind === "B")
    return (
      <g {...p}>
        <circle cx={50} cy={16} r={8} />
        <path d="M50 24 L70 48 L62 92 H38 L30 48 Z" />
        <path d="M50 40 V70" stroke={stroke} strokeWidth={3} fill="none" />
      </g>
    );
  if (kind === "N")
    return (
      <path d="M28 90 L18 78 L30 60 L22 40 C22 18 48 8 62 18 C70 24 66 36 74 42 L80 58 L62 50 L70 70 L58 90 Z" {...p} />
    );
  if (kind === "P")
    return (
      <g {...p}>
        <circle cx={50} cy={24} r={14} />
        <path d="M32 92 L40 46 H60 L68 92 Z" />
      </g>
    );
  if (kind === "C")
    return (
      <g fill="none" stroke={fill} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 10 Q78 50 30 90" />
        <path d="M30 10 V90" strokeWidth={4} />
        <path d="M16 50 H78" />
        <path d="M66 38 L80 50 L66 62" fill={fill} stroke={fill} />
      </g>
    );
  if (kind === "E")
    return <path d="M50 28 C40 14 22 12 6 20 C20 26 30 36 36 46 C22 50 16 62 22 70 L40 60 L46 88 L50 76 L54 88 L60 60 L78 70 C84 62 78 50 64 46 C70 36 80 26 94 20 C78 12 60 14 50 28 Z" {...p} />;
  if (kind === "A")
    return (
      <g {...p}>
        <path d="M50 6 C32 16 24 34 28 52 C32 66 42 72 50 72 C58 72 68 66 72 52 C76 34 68 16 50 6 Z" />
        <path d="M24 92 H76 L68 70 H32 Z" />
      </g>
    );
  if (kind === "I")
    return (
      <g {...p}>
        <path d="M16 40 C22 16 78 16 84 40 H16 Z" />
        <path d="M28 44 H72 L66 92 H34 Z" />
        <path d="M62 58 L90 30 L96 38 L68 66 Z" />
      </g>
    );
  if (kind === "W")
    return (
      <g {...p}>
        <path d="M50 4 L74 46 H26 Z" />
        <path d="M22 46 H78 L70 94 H30 Z" />
      </g>
    );
  if (kind === "U")
    return (
      <g fill="none" stroke={fill} strokeWidth={10} strokeLinecap="round">
        <path d="M22 34 V72 C22 88 42 88 42 72 V34" />
        <path d="M58 34 V72 C58 88 78 88 78 72 V34" />
      </g>
    );
  return (
    <g {...p}>
      <circle cx={50} cy={50} r={28} />
    </g>
  );
}

/** Flat silhouettes for the new pieces (100x100), drawn like the chess glyphs. */
function SpecialIcon({ kind, fill, stroke }: { kind: string; fill: string; stroke: string }) {
  if (kind === "C")
    return (
      <g strokeLinecap="round" strokeLinejoin="round" fill="none">
        {[stroke, fill].map((col, i) => (
          <g key={i} stroke={col} strokeWidth={i ? 7 : 15}>
            <path d="M34 12 Q86 50 34 88" />
            <path d="M34 12 L34 88" strokeWidth={i ? 3 : 9} />
            <path d="M14 50 L84 50" />
            <path d="M72 38 L86 50 L72 62" />
            <path d="M14 50 L6 42 M14 50 L6 58" strokeWidth={i ? 4 : 10} />
          </g>
        ))}
      </g>
    );
  if (kind === "E")
    return (
      <g strokeLinejoin="round">
        <path
          d="M50 34 C42 22 24 18 6 24 C18 30 26 38 34 46 C24 48 20 56 22 64 L38 58 L44 82 L50 74 L56 82 L62 58 L78 64 C80 56 76 48 66 46 C74 38 82 30 94 24 C76 18 58 22 50 34 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth={5}
        />
        <circle cx={50} cy={30} r={8} fill={fill} stroke={stroke} strokeWidth={4} />
        <path d="M50 28 L60 33 L50 36 Z" fill={stroke} />
      </g>
    );
  if (kind === "A")
    return (
      <g strokeLinejoin="round">
        <path d="M50 6 C34 14 26 30 28 48 C30 62 40 70 50 70 C60 70 70 62 72 48 C74 30 66 14 50 6 Z" fill={fill} stroke={stroke} strokeWidth={5} />
        <path d="M38 40 C42 34 58 34 62 40 C60 54 40 54 38 40 Z" fill={stroke} />
        <path d="M44 44 L48 44 M52 44 L56 44" stroke={fill} strokeWidth={3} strokeLinecap="round" />
        <path d="M22 92 L78 92 L72 74 C64 70 36 70 28 74 Z" fill={fill} stroke={stroke} strokeWidth={5} />
        <path d="M70 56 L90 30 L94 34 L74 60 Z" fill={fill} stroke={stroke} strokeWidth={4} />
        <path d="M66 54 L78 66" stroke={stroke} strokeWidth={6} strokeLinecap="round" />
      </g>
    );
  if (kind === "I")
    return (
      <g strokeLinejoin="round">
        <path d="M18 46 C20 20 80 20 82 46 L76 46 C74 30 26 30 24 46 Z" fill={fill} stroke={stroke} strokeWidth={5} />
        <path d="M14 46 L86 46 L78 58 L22 58 Z" fill={stroke} />
        <path d="M28 58 L28 88 L72 88 L72 58" fill={fill} stroke={stroke} strokeWidth={5} />
        <path d="M62 62 L92 28 L98 34 L68 68 Z" fill={fill} stroke={stroke} strokeWidth={4} />
      </g>
    );
  if (kind === "W")
    return (
      <g strokeLinejoin="round">
        <path d="M50 4 L70 42 L30 42 Z" fill={fill} stroke={stroke} strokeWidth={5} />
        <path d="M22 42 L78 42 L72 92 L28 92 Z" fill={fill} stroke={stroke} strokeWidth={5} />
        <path d="M40 62 L60 62 L58 78 L42 78 Z" fill={stroke} />
        <circle cx={50} cy={28} r={4} fill={stroke} />
      </g>
    );
  if (kind === "U")
    return (
      <g strokeLinejoin="round">
        <path d="M22 40 L22 78 C22 90 40 90 40 78 L40 40" fill="none" stroke={fill} strokeWidth={12} />
        <path d="M60 40 L60 78 C60 90 78 90 78 78 L78 40" fill="none" stroke={fill} strokeWidth={12} />
        <path d="M16 40 L46 40 M54 40 L84 40" stroke={stroke} strokeWidth={6} strokeLinecap="round" />
      </g>
    );
  if (kind === "H")
    return (
      <g strokeLinejoin="round">
        <path d="M18 40 L82 40 L74 88 L26 88 Z" fill={fill} stroke={stroke} strokeWidth={5} />
        <path d="M18 40 Q50 14 82 40" fill={stroke} />
        <path d="M46 54 L54 54 L54 74 L46 74 Z" fill={stroke} />
      </g>
    );
  return null;
}

function Ship({ w, h, white }: { w: number; h: number; white: boolean }) {
  const fill = white ? "#f7f7f7" : "#161616";
  const ink = white ? "#161616" : "#f7f7f7";
  const g = (
    <g strokeLinejoin="round">
      <path d="M0.12 0.58 L1.88 0.58 L1.58 0.9 L0.38 0.9 Z" fill={fill} stroke={ink} strokeWidth={0.07} />
      <path d="M0.7 0.58 L0.7 0.08" stroke={ink} strokeWidth={0.05} />
      <path d="M1.15 0.58 L1.15 0.16" stroke={ink} strokeWidth={0.05} />
      <path d="M0.7 0.12 L1.15 0.32 L0.7 0.5 Z" fill={fill} stroke={ink} strokeWidth={0.05} />
      <path d="M1.15 0.2 L1.55 0.36 L1.15 0.52 Z" fill={fill} stroke={ink} strokeWidth={0.05} />
    </g>
  );
  return w >= h ? g : <g transform="translate(1 0) rotate(90)">{g}</g>;
}

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
  for (let y = BC_Y0; y <= BC_Y1; y++)
    for (let x = BC_X0; x <= BC_X1; x++) {
      const [c, r] = v(x, y);
      const t = bcTerrain(x, y);
      const dark = (x + y) % 2 === 0;
      cells.push(
        t === "W" ? (
          <rect key={`t${x},${y}`} x={c} y={r} width={1} height={1} fill={dark ? "url(#bc-w1)" : "url(#bc-w2)"} />
        ) : (
          <rect key={`t${x},${y}`} x={c} y={r} width={1} height={1} fill={dark ? "url(#bc-d)" : "url(#bc-l)"} />
        ),
      );
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
      <g key={`m${mx}`} transform={`translate(${c} ${r})`} data-bc-mountain>
        <path d="M0.1 1.86 L0.32 0.9 L0.7 0.42 L1.08 0.18 L1.5 0.5 L1.78 1.02 L1.92 1.86 Z" fill="#8d93a0" stroke="#3b3f4a" strokeWidth={0.05} strokeLinejoin="round" />
        <path d="M0.7 0.42 L0.92 1.1 L0.32 0.9 Z" fill="#c9ced8" />
        <path d="M1.08 0.18 L1.18 0.96 L1.5 0.5 Z" fill="#e8ebf1" />
        <path d="M1.18 0.96 L1.78 1.02 L1.5 0.5 Z" fill="#a7adb9" />
        <path d="M0.92 1.1 L1.18 0.96 L1.38 1.86 L0.5 1.86 Z" fill="#6f7480" />
        <path d="M1.02 0.36 L1.14 0.28 L1.2 0.44 Z M0.64 0.62 L0.74 0.52 L0.78 0.7 Z" fill="#fff" opacity={0.9} />
      </g>
    );
  });
  const bushes = [
    [6, 5],
    [7, 4],
  ].map(([bx, by]) => {
    const [c, r] = v(bx, by);
    return (
      <g key={`b${bx}`} transform={`translate(${c} ${r})`} data-bc-bush>
        <circle cx={0.5} cy={0.56} r={0.36} fill="#2f6b2a" />
        <circle cx={0.32} cy={0.48} r={0.2} fill="#3f8a34" />
        <circle cx={0.62} cy={0.38} r={0.22} fill="#4a9b3c" />
        <circle cx={0.66} cy={0.64} r={0.2} fill="#3a7f31" />
        <circle cx={0.42} cy={0.7} r={0.18} fill="#357a2e" />
        <circle cx={0.56} cy={0.32} r={0.07} fill="#8fd17a" opacity={0.7} />
        <circle cx={0.3} cy={0.42} r={0.05} fill="#8fd17a" opacity={0.7} />
      </g>
    );
  });

  const lastSq = new Set(lastMove ? [lastMove.from, lastMove.to] : []);
  const shot = lastMove && lastSan && lastSan.includes("*") ? lastMove : null;

  return (
    <div className="bc2-wrap" data-bc-board>
      <svg className="bc2-svg" viewBox={`-0.3 -0.3 ${BC_W + 0.6} ${BC_H + 0.6}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="bc-w1" width={1} height={1} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="#386aba" />
          </pattern>
          <pattern id="bc-w2" width={1} height={1} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="#0e43a7" />
          </pattern>
          <pattern id="bc-l" width={1} height={1} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="#e6b36a" />
          </pattern>
          <pattern id="bc-d" width={1} height={1} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="#b6733f" />
          </pattern>
          <radialGradient id="bc-sea" cx="50%" cy="50%" r="70%">
            <stop offset="0" stopColor="#000" stopOpacity={0} />
            <stop offset="1" stopColor="#0b0618" stopOpacity={0.55} />
          </radialGradient>
        </defs>
        <rect x={-0.3} y={-0.3} width={BC_W + 0.6} height={BC_H + 0.6} fill="#386aba" />
        {cells}
        <path d={rim.join(" ")} stroke="#1a120c" strokeWidth={0.045} strokeLinecap="square" />
        {mountains}
        {bushes}
        {state
          ? Object.entries(state.lava).map(([sq, ttl]) => {
              const p = bcPos(sq);
              if (!p || ttl <= 0) return null;
              const [c, r] = v(p[0], p[1]);
              return <rect key={`lava${sq}`} x={c + 0.08} y={r + 0.08} width={0.84} height={0.84} rx={0.12} fill="#ff5a1f" opacity={0.72} data-lava={sq} />;
            })
          : null}
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
          const fill = white ? "#f7f7f7" : "#141414";
          const stroke = white ? "#141414" : "#f7f7f7";
          if (pc.kind === "F") {
            const xs = [pc.x, pc.x + (pc.w ?? 1) - 1], ys = [pc.y, pc.y + (pc.h ?? 1) - 1];
            const corners = xs.flatMap((x) => ys.map((y) => v(x, y)));
            const c = Math.min(...corners.map((q) => q[0])), r = Math.min(...corners.map((q) => q[1]));
            const sw = Math.max(...corners.map((q) => q[0])) - c + 1, sh = Math.max(...corners.map((q) => q[1])) - r + 1;
            return (
              <g key={pc.id} className="bc2-piece" style={{ transform: `translate(${c}px, ${r}px)` }} data-piece={`${pc.c}F`} data-bc-ship={pc.c}>
                <Ship w={sw} h={sh} white={white} />
              </g>
            );
          }
          const [c, r] = v(pc.x, pc.y);
          return (
            <g key={pc.id} className="bc2-piece" style={{ transform: `translate(${c}px, ${r}px)` }} data-piece={`${pc.c}${pc.kind}`} data-sq-piece={pc.sq}>
              <title>{`${white ? "White" : "Black"} ${BC_NAME[pc.kind]}`}</title>
              <g transform="translate(0.08 0.06) scale(0.0084)">
                <PieceArt kind={pc.kind} fill={fill} stroke={stroke} />
              </g>
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
