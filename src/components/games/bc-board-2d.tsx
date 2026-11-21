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

const GLYPH: Record<string, string> = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
export const BC_NAME: Record<string, string> = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn", C: "Archer", E: "Eagle", A: "Assassin", F: "Frigate" };

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
  return null;
}

function Ship({ w, h, white }: { w: number; h: number; white: boolean }) {
  // drawn for a 2x1 ship; rotated for a 1x2 one
  const hull = white ? "#f6efe0" : "#1b1424";
  const line = white ? "#2a1a0e" : "#e0b85a";
  const sail = white ? "#ffffff" : "#2b2238";
  const g = (
    <g>
      <path d="M0.12 0.62 L1.88 0.62 L1.62 0.9 L0.36 0.9 Z" fill={hull} stroke={line} strokeWidth={0.05} strokeLinejoin="round" />
      <path d="M0.3 0.74 L1.7 0.74" stroke={line} strokeWidth={0.025} />
      {[0.62, 1.05, 1.42].map((mx, i) => (
        <g key={i}>
          <path d={`M${mx} 0.62 L${mx} ${0.1 + i * 0.04}`} stroke={line} strokeWidth={0.04} />
          <path d={`M${mx - 0.17 + i * 0.02} ${0.16 + i * 0.04} Q${mx + 0.02} ${0.3} ${mx - 0.17 + i * 0.02} ${0.54} L${mx + 0.2} 0.52 Q${mx + 0.3} 0.34 ${mx + 0.2} ${0.16 + i * 0.04} Z`} fill={sail} stroke={line} strokeWidth={0.035} strokeLinejoin="round" />
        </g>
      ))}
      <path d="M1.42 0.12 L1.66 0.17 L1.42 0.22 Z" fill="#c0392b" />
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
      <svg className="bc2-svg font-display" viewBox={`-0.3 -0.3 ${BC_W + 0.6} ${BC_H + 0.6}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="bc-w1" width={1} height={1} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="#2f5fb8" />
            <path d="M0 0.3 Q0.25 0.24 0.5 0.3 T1 0.3 M0 0.72 Q0.25 0.66 0.5 0.72 T1 0.72" stroke="#5b86d6" strokeWidth={0.025} fill="none" opacity={0.6} />
          </pattern>
          <pattern id="bc-w2" width={1} height={1} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="#244c9a" />
            <path d="M0 0.5 Q0.25 0.44 0.5 0.5 T1 0.5" stroke="#4a76c8" strokeWidth={0.025} fill="none" opacity={0.6} />
          </pattern>
          <pattern id="bc-l" width={1} height={1} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="#d8a96a" />
            <path d="M0 0.2 Q0.5 0.26 1 0.18 M0 0.55 Q0.5 0.5 1 0.58 M0 0.84 Q0.5 0.9 1 0.82" stroke="#b9854a" strokeWidth={0.02} fill="none" />
          </pattern>
          <pattern id="bc-d" width={1} height={1} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="#8a5426" />
            <path d="M0 0.3 Q0.5 0.36 1 0.28 M0 0.7 Q0.5 0.64 1 0.72" stroke="#6b3c18" strokeWidth={0.025} fill="none" />
          </pattern>
          <radialGradient id="bc-sea" cx="50%" cy="50%" r="70%">
            <stop offset="0" stopColor="#000" stopOpacity={0} />
            <stop offset="1" stopColor="#0b0618" stopOpacity={0.55} />
          </radialGradient>
        </defs>
        <rect x={-0.3} y={-0.3} width={BC_W + 0.6} height={BC_H + 0.6} rx={0.4} fill="#120a20" stroke="#e0b85a" strokeWidth={0.12} />
        <rect x={-0.1} y={-0.1} width={BC_W + 0.2} height={BC_H + 0.2} rx={0.2} fill="none" stroke="#e0b85a" strokeWidth={0.03} opacity={0.7} />
        {cells}
        <rect x={0} y={0} width={BC_W} height={BC_H} fill="url(#bc-sea)" pointerEvents="none" />
        <path d={rim.join(" ")} stroke="#f2d27a" strokeWidth={0.07} strokeLinecap="round" />
        {mountains}
        {bushes}
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
          const fill = white ? "#fbf3df" : "#17101f";
          const stroke = white ? "#2a1a0e" : "#e0b85a";
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
          const glyph = GLYPH[pc.kind];
          return (
            <g key={pc.id} className="bc2-piece" style={{ transform: `translate(${c}px, ${r}px)` }} data-piece={`${pc.c}${pc.kind}`} data-sq-piece={pc.sq}>
              <title>{`${white ? "White" : "Black"} ${BC_NAME[pc.kind]}`}</title>
              {glyph ? (
                <text x={0.5} y={0.84} textAnchor="middle" fontSize={0.86} fill={fill} stroke={stroke} strokeWidth={0.045} paintOrder="stroke" style={{ filter: "drop-shadow(0 0.04px 0.05px rgba(0,0,0,.5))" }}>
                  {glyph}
                </text>
              ) : (
                <g transform="translate(0.1 0.1) scale(0.008)">
                  <SpecialIcon kind={pc.kind} fill={fill} stroke={stroke} />
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
