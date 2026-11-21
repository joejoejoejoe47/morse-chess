/**
 * 2D board for Checkers and Chinese Chess inside the normal game screen (owner t377u).
 * Same props shape as ChessBoard2D: fen / you / lastMove / myTurn / onMove / legalFor.
 */
import { useMemo, useRef, useState, useEffect } from "react";
import { bgDims, bgMust, bgPieces, bgPos, bgSq, XQ_CHAR, type BgPiece, type GridGameId } from "@/lib/boardgames/adapter";

type Props = {
  game: GridGameId;
  fen: string;
  you: "w" | "b";
  lastMove: { from: string; to: string } | null;
  myTurn: boolean;
  disabled?: boolean;
  onMove: (from: string, to: string) => void;
  legalFor?: (from: string) => string[];
  checkSq?: string | null;
};

/** Stable ids so pieces glide from square to square instead of popping. */
export function usePieceIds(game: GridGameId, fen: string, lastMove: { from: string; to: string } | null) {
  const ref = useRef<{ fen: string; ids: Map<string, number>; next: number }>({ fen: "", ids: new Map(), next: 1 });
  return useMemo(() => {
    const cur = ref.current;
    const pieces = bgPieces(game, fen);
    const ids = new Map<string, number>();
    const prev = cur.ids;
    if (lastMove && prev.has(lastMove.from) && cur.fen !== fen) {
      for (const p of pieces) {
        if (p.sq === lastMove.to) ids.set(p.sq, prev.get(lastMove.from)!);
        else if (prev.has(p.sq) && p.sq !== lastMove.from) ids.set(p.sq, prev.get(p.sq)!);
      }
    } else if (cur.fen === fen) {
      for (const p of pieces) if (prev.has(p.sq)) ids.set(p.sq, prev.get(p.sq)!);
    }
    for (const p of pieces) if (!ids.has(p.sq)) ids.set(p.sq, cur.next++);
    ref.current = { fen, ids, next: cur.next };
    return pieces.map((p) => ({ ...p, id: ids.get(p.sq)! }));
  }, [game, fen, lastMove]);
}

export function BgBoard2D({ game, fen, you, lastMove, myTurn, disabled, onMove, legalFor, checkSq }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const pieces = usePieceIds(game, fen, lastMove);
  const { files, ranks } = bgDims(game);
  const flip = you === "b";
  const targets = useMemo(() => (sel && legalFor ? legalFor(sel) : []), [sel, legalFor]);
  const must = useMemo(() => (myTurn ? new Set(bgMust(game, fen)) : new Set<string>()), [game, fen, myTurn]);
  useEffect(() => setSel(null), [fen]);
  // A checkers jump chain: keep the jumping piece selected.
  useEffect(() => {
    if (myTurn && must.size === 1 && game === "checkers" && lastMove && must.has(lastMove.to)) setSel(lastMove.to);
  }, [myTurn, must, game, lastMove]);
  const mine = (p: BgPiece | undefined) => !!p && p.c === you;
  const at = (sq: string) => pieces.find((p) => p.sq === sq);
  function tap(sq: string) {
    if (disabled || !myTurn) return;
    if (sel && targets.includes(sq)) {
      onMove(sel, sq);
      setSel(null);
      return;
    }
    const p = at(sq);
    if (mine(p) && (legalFor?.(sq).length ?? 0) > 0) setSel(sq === sel ? null : sq);
    else setSel(null);
  }

  if (game === "checkers") {
    const S = 100;
    const xy = (r: number, f: number) => (flip ? [(7 - f) * S, r * S] : [f * S, (7 - r) * S]);
    const lastSet = new Set(lastMove ? [lastMove.from, lastMove.to] : []);
    return (
      <div className="bg2-wrap" data-bg-board="checkers">
        <svg className="bg2-board" viewBox="-40 -40 880 880" role="img" aria-label="Checkers board">
          <defs>
            <linearGradient id="b2Frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6dc8a" /><stop offset=".45" stopColor="#b8862e" /><stop offset="1" stopColor="#7a5418" /></linearGradient>
            <linearGradient id="b2Light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ecd6a8" /><stop offset="1" stopColor="#d4b47c" /></linearGradient>
            <linearGradient id="b2Dark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4d2c1d" /><stop offset="1" stopColor="#2a160e" /></linearGradient>
            <radialGradient id="b2Red" cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#ff6b5e" /><stop offset=".55" stopColor="#c3242a" /><stop offset="1" stopColor="#6e0f13" /></radialGradient>
            <radialGradient id="b2Black" cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#5c5560" /><stop offset=".55" stopColor="#24202a" /><stop offset="1" stopColor="#0b090d" /></radialGradient>
            <filter id="b2Shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#000" floodOpacity=".55" /></filter>
          </defs>
          <rect x="-40" y="-40" width="880" height="880" rx="26" fill="url(#b2Frame)" />
          <rect x="-22" y="-22" width="844" height="844" rx="12" fill="#1a0f0a" />
          {Array.from({ length: 64 }, (_, i) => {
            const r = Math.floor(i / 8), f = i % 8;
            const [x, y] = xy(r, f);
            const dark = (r + f) % 2 === 0;
            const sq = bgSq(game, r, f);
            const tgt = targets.includes(sq);
            return (
              <g key={i} onClick={() => tap(sq)} data-sq={sq} data-target={tgt ? sq : undefined} style={{ cursor: tgt ? "pointer" : undefined }}>
                <rect x={x} y={y} width={S} height={S} fill={dark ? "url(#b2Dark)" : "url(#b2Light)"} />
                {dark && lastSet.has(sq) ? <rect x={x} y={y} width={S} height={S} fill="#f2c94c" opacity=".24" /> : null}
                {tgt ? <circle cx={x + S / 2} cy={y + S / 2} r="15" className="bg2-dot" /> : null}
              </g>
            );
          })}
          {Array.from({ length: 8 }, (_, i) => (
            <g key={`l${i}`} className="bg2-coord">
              <text x={i * S + S / 2} y={826}>{"abcdefgh"[flip ? 7 - i : i]}</text>
              <text x={-31} y={i * S + S / 2 + 6}>{flip ? i + 1 : 8 - i}</text>
            </g>
          ))}
          {[...pieces].sort((a, b) => a.id - b.id).map((p) => {
            const [x, y] = xy(p.r, p.f);
            const red = p.c === "w";
            return (
              <g key={p.id} className="bg2-piece" style={{ transform: `translate(${x + S / 2}px, ${y + S / 2}px)` }} onClick={() => tap(p.sq)} data-piece={p.sq}>
                {must.has(p.sq) ? <circle r="46" className="bg2-must" /> : null}
                {sel === p.sq ? <circle r="46" className="bg2-sel" /> : null}
                <g filter="url(#b2Shadow)">
                  {p.king ? <circle r="38" cy="11" fill={red ? "#5c0b0f" : "#050406"} /> : null}
                  {p.king ? <circle r="38" cy="6" fill={red ? "url(#b2Red)" : "url(#b2Black)"} /> : null}
                  <circle r="38" cy={p.king ? 0 : 5} fill={red ? "#5c0b0f" : "#050406"} transform={p.king ? "translate(0 -6)" : undefined} />
                  <g transform={p.king ? "translate(0 -6)" : undefined}>
                    <circle r="38" fill={red ? "url(#b2Red)" : "url(#b2Black)"} />
                    <circle r="29" fill="none" stroke={red ? "#ff8f84" : "#6f6875"} strokeOpacity=".55" strokeWidth="2.5" />
                    <circle r="22" fill="none" stroke={red ? "#7a1015" : "#000"} strokeOpacity=".5" strokeWidth="2" />
                    {p.king ? <path d="M-19 9 L-23 -11 L-10 -2 L0 -17 L10 -2 L23 -11 L19 9 Z" fill="#f2c94c" stroke="#7a5418" strokeWidth="2.5" strokeLinejoin="round" /> : null}
                  </g>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // Xiangqi: 9 x 10 points.
  const S = 80;
  const W = 8 * S, H = 9 * S;
  const xy = (r: number, f: number) => (flip ? [(8 - f) * S, r * S] : [f * S, (9 - r) * S]);
  const lastSet = new Set(lastMove ? [lastMove.from, lastMove.to] : []);
  const palace = (r0: number) => {
    const [x1, y1] = xy(r0, 3), [x2, y2] = xy(r0 + 2, 5), [x3, y3] = xy(r0, 5), [x4, y4] = xy(r0 + 2, 3);
    return <path d={`M${x1} ${y1}L${x2} ${y2}M${x3} ${y3}L${x4} ${y4}`} />;
  };
  return (
    <div className="bg2-wrap is-xq" data-bg-board="xiangqi">
      <svg className="bg2-board" viewBox={`${-70} ${-70} ${W + 140} ${H + 140}`} role="img" aria-label="Chinese chess board">
        <defs>
          <linearGradient id="x2Frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6dc8a" /><stop offset=".45" stopColor="#b8862e" /><stop offset="1" stopColor="#7a5418" /></linearGradient>
          <linearGradient id="x2Wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f0d29a" /><stop offset=".5" stopColor="#e2bb78" /><stop offset="1" stopColor="#cfa262" /></linearGradient>
          <radialGradient id="x2Disc" cx=".4" cy=".35" r=".75"><stop offset="0" stopColor="#fff4dc" /><stop offset=".7" stopColor="#ecd3a0" /><stop offset="1" stopColor="#b98c4f" /></radialGradient>
          <filter id="x2Shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000" floodOpacity=".5" /></filter>
        </defs>
        <rect x={-70} y={-70} width={W + 140} height={H + 140} rx="24" fill="url(#x2Frame)" />
        <rect x={-54} y={-54} width={W + 108} height={H + 108} rx="12" fill="url(#x2Wood)" />
        <g className="bg2-xqline">
          <rect x="0" y="0" width={W} height={H} fill="none" strokeWidth="4" />
          {Array.from({ length: 10 }, (_, r) => <path key={`r${r}`} d={`M0 ${r * S}H${W}`} />)}
          {Array.from({ length: 9 }, (_, f) =>
            f === 0 || f === 8 ? null : (
              <g key={`f${f}`}>
                <path d={`M${f * S} 0V${4 * S}`} />
                <path d={`M${f * S} ${5 * S}V${H}`} />
              </g>
            ),
          )}
          {palace(0)}
          {palace(7)}
        </g>
        <text className="bg2-river" x={W * 0.27} y={4.5 * S + 14}>{flip ? "漢 界" : "楚 河"}</text>
        <text className="bg2-river" x={W * 0.73} y={4.5 * S + 14}>{flip ? "楚 河" : "漢 界"}</text>
        {Array.from({ length: 90 }, (_, i) => {
          const r = Math.floor(i / 9), f = i % 9;
          const [x, y] = xy(r, f);
          const sq = bgSq(game, r, f);
          const tgt = targets.includes(sq);
          return (
            <g key={i} onClick={() => tap(sq)} data-sq={sq} data-target={tgt ? sq : undefined}>
              <rect x={x - S / 2} y={y - S / 2} width={S} height={S} fill="transparent" />
              {lastSet.has(sq) ? <circle cx={x} cy={y} r="38" fill="none" stroke="#3a7bd5" strokeWidth="4" strokeDasharray="8 6" /> : null}
              {tgt ? <circle cx={x} cy={y} r="13" className="bg2-dot" /> : null}
            </g>
          );
        })}
        {[...pieces].sort((a, b) => a.id - b.id).map((p) => {
          const [x, y] = xy(p.r, p.f);
          const red = p.c === "w";
          return (
            <g key={p.id} className="bg2-piece" style={{ transform: `translate(${x}px, ${y}px)` }} onClick={() => tap(p.sq)} data-piece={p.sq}>
              {checkSq === p.sq ? <circle r="44" className="bg2-check" /> : null}
              {sel === p.sq ? <circle r="44" className="bg2-sel" /> : null}
              <g filter="url(#x2Shadow)">
                <circle r="35" cy="4" fill="#7a5426" />
                <circle r="35" fill="url(#x2Disc)" />
                <circle r="28" fill="none" stroke={red ? "#b3202a" : "#1d1a1f"} strokeWidth="2.5" />
                <text className="bg2-xqchar" fill={red ? "#b3202a" : "#1d1a1f"} y="1">{XQ_CHAR[p.kind][p.c]}</text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export { bgPos };
