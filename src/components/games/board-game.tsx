import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, RotateCcw, Undo2 } from "lucide-react";
import {
  CHECKERS_START, ckLegalMoves, ckParse, ckPlay, ckPos, ckStatus, type CkMove, type CkState,
} from "@/lib/boardgames/checkers";
import {
  XIANGQI_START, xqGeneral, xqInCheck, xqLegalMoves, xqParse, xqPlay, xqPos, xqStatus, type XqMove, type XqState,
} from "@/lib/boardgames/xiangqi";
import { botMove, type BoardGameId } from "@/lib/boardgames/bot";
import { playSfx } from "@/lib/legendary/sfx";
import "@/board-games.css";

/**
 * Checkers and Chinese Chess (owner t363u/t364u): a polished 2D board vs MorseBot or two players
 * on one device. Rules live in src/lib/boardgames (the server copy is php/src/BoardGames.php).
 */
type Color = "w" | "b";
type Mode = "bot" | "hotseat";
type Level = "easy" | "normal";
type AnyState = CkState | XqState;
type AnyMove = CkMove | XqMove;
type Ids = (number | null)[][];

const INFO: Record<BoardGameId, { name: string; sub: string; red: string; black: string; rules: string[] }> = {
  checkers: {
    name: "Checkers",
    sub: "Jump · King me",
    red: "Red",
    black: "Black",
    rules: [
      "Pieces move one square diagonally forward on the dark squares. Red moves first.",
      "Jump over an enemy piece next to you onto the empty square behind it to capture it.",
      "Captures are forced: if you can jump, you must. If the same piece can jump again, it keeps jumping.",
      "Reach the far row and your piece is crowned King. Kings move and jump backwards too.",
      "You win when your opponent has no move left (no pieces, or every piece blocked).",
      "40 moves each with no capture and no plain piece moving is a draw.",
    ],
  },
  xiangqi: {
    name: "Chinese Chess",
    sub: "Xiangqi · Generals & Cannons",
    red: "Red",
    black: "Black",
    rules: [
      "Pieces stand on the line crossings. Red moves first. Checkmate the enemy General to win.",
      "General 帥/將: one step straight, never leaving the palace (the 3×3 box with the cross).",
      "Advisor 仕/士: one step diagonally inside the palace. Elephant 相/象: exactly two diagonally, can't cross the river, blocked if the middle point is taken.",
      "Horse 傌/馬: one step straight then one diagonal, blocked if a piece sits right next to it in that direction.",
      "Chariot 俥/車: any distance straight. Cannon 炮/砲: moves like a chariot but captures only by jumping over exactly one piece.",
      "Soldier 兵/卒: one step forward; after crossing the river it may also step sideways.",
      "The two Generals may never face each other on an open file (the flying-general rule).",
      "If you have no legal move — checkmate or stalemate — you lose. 60 moves each with no capture is a draw.",
    ],
  },
};

const XQ_CHAR: Record<string, string> = {
  K: "帥", A: "仕", E: "相", H: "傌", R: "俥", C: "炮", P: "兵",
  k: "將", a: "士", e: "象", h: "馬", r: "車", c: "砲", p: "卒",
};

const startOf = (g: BoardGameId): AnyState => (g === "checkers" ? ckParse(CHECKERS_START)! : xqParse(XIANGQI_START)!);
const legalOf = (g: BoardGameId, s: AnyState): AnyMove[] => (g === "checkers" ? ckLegalMoves(s as CkState) : xqLegalMoves(s as XqState));
const statusOf = (g: BoardGameId, s: AnyState) => (g === "checkers" ? ckStatus(s as CkState) : xqStatus(s as XqState));
const posOf = (g: BoardGameId, sq: string) => (g === "checkers" ? ckPos(sq) : xqPos(sq));
const isLoud = (m: AnyMove) => ("jump" in m ? m.jump !== null : m.capture);

function freshIds(s: AnyState): Ids {
  let n = 1;
  return s.board.map((row) => row.map((c) => (c ? n++ : null)));
}

function moveIds(g: BoardGameId, ids: Ids, m: AnyMove): Ids {
  const next = ids.map((r) => r.slice());
  const [fr, ff] = posOf(g, m.from);
  const [tr, tf] = posOf(g, m.to);
  if ("jump" in m && m.jump) {
    const [jr, jf] = posOf(g, m.jump);
    next[jr][jf] = null;
  }
  next[tr][tf] = next[fr][ff];
  next[fr][ff] = null;
  return next;
}

type Snap = { state: AnyState; ids: Ids; last: AnyMove | null; san: string[] };

export function BoardGame({ game }: { game: BoardGameId }) {
  const info = INFO[game];
  const [phase, setPhase] = useState<"setup" | "play">("setup");
  const [mode, setMode] = useState<Mode>("bot");
  const [level, setLevel] = useState<Level>("normal");
  const [you, setYou] = useState<Color>("w");
  const [snap, setSnap] = useState<Snap>(() => { const s = startOf(game); return { state: s, ids: freshIds(s), last: null, san: [] }; });
  const [history, setHistory] = useState<Snap[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [thinking, setThinking] = useState(false);
  const botTimer = useRef<number | null>(null);

  const state = snap.state;
  const status = useMemo(() => statusOf(game, state), [game, state]);
  const legal = useMemo(() => (status.over ? [] : legalOf(game, state)), [game, state, status.over]);
  const botSide: Color | null = mode === "bot" ? (you === "w" ? "b" : "w") : null;
  const myTurn = !status.over && state.turn !== botSide;
  const flip = mode === "bot" ? you === "b" : false;

  // forced-capture hint: the pieces that must jump (checkers)
  const mustMove = useMemo(() => {
    if (game !== "checkers" || !legal.length || !isLoud(legal[0])) return new Set<string>();
    return new Set(legal.map((m) => m.from));
  }, [game, legal]);
  const targets = useMemo(() => (sel ? legal.filter((m) => m.from === sel) : []), [legal, sel]);

  function apply(m: AnyMove) {
    setHistory((h) => [...h, snap]);
    const res = game === "checkers" ? ckPlay(snap.state as CkState, m as CkMove) : xqPlay(snap.state as XqState, m as XqMove);
    const next: Snap = { state: res.state, ids: moveIds(game, snap.ids, m), last: m, san: [...snap.san, res.san] };
    setSnap(next);
    playSfx(isLoud(m) ? "coin" : "tap");
    // a checkers multi-jump keeps the same piece selected
    if (game === "checkers" && (res.state as CkState).cont) setSel((res.state as CkState).cont);
    else setSel(null);
    const st = statusOf(game, res.state);
    if (st.over) window.setTimeout(() => playSfx(st.winner === null ? "tap" : (mode === "hotseat" || st.winner === you) ? "rankup" : "boom"), 350);
  }

  // MorseBot plays its turn (and keeps going through a multi-jump)
  useEffect(() => {
    if (phase !== "play" || status.over || botSide === null || state.turn !== botSide) return;
    setThinking(true);
    botTimer.current = window.setTimeout(() => {
      const m = botMove(game, state, level === "easy" ? 150 : 650, level);
      setThinking(false);
      if (m) apply(m);
    }, game === "checkers" && (state as CkState).cont ? 380 : 520);
    return () => { if (botTimer.current) window.clearTimeout(botTimer.current); setThinking(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, state, botSide, status.over]);

  function clickSquare(sq: string) {
    if (!myTurn || thinking) return;
    const move = targets.find((m) => m.to === sq);
    if (move) { apply(move); return; }
    if (game === "checkers" && (state as CkState).cont) return; // mid-jump: the same piece must go on
    if (legal.some((m) => m.from === sq)) { setSel(sq === sel ? null : sq); playSfx("tap"); }
    else setSel(null);
  }

  function start(side: Color, m: Mode) {
    const s = startOf(game);
    setYou(side);
    setMode(m);
    setSnap({ state: s, ids: freshIds(s), last: null, san: [] });
    setHistory([]);
    setSel(null);
    setPhase("play");
  }

  function undo() {
    if (!history.length || thinking) return;
    // vs MorseBot: step back to your last turn
    let h = history.slice();
    let target = h.pop()!;
    if (mode === "bot") {
      while (h.length && target.state.turn !== you) target = h.pop()!;
      if (target.state.turn !== you) return;
    }
    setHistory(h);
    setSnap(target);
    setSel(game === "checkers" ? ((target.state as CkState).cont ?? null) : null);
  }

  const turnName = state.turn === "w" ? info.red : info.black;
  const youName = mode === "bot" ? "You" : info.red;
  const themName = mode === "bot" ? "MorseBot" : info.black;
  const resultText = status.over
    ? status.winner === null
      ? "Draw"
      : mode === "bot"
        ? status.winner === you ? "You win!" : "MorseBot wins"
        : `${status.winner === "w" ? info.red : info.black} wins!`
    : "";
  const reasonText = status.over
    ? status.reason === "checkmate" ? "Checkmate" : status.reason === "stalemate" ? "No legal move left" : status.reason === "no-moves" ? "No move left" : "No captures for too long"
    : "";
  const check = game === "xiangqi" && !status.over && xqInCheck((state as XqState).board, state.turn);

  return (
    <main className={`bg-page bg-${game}`} data-board-game={game}>
      <div className="bg-shell">
        <header className="bg-top">
          <Link to="/" className="bg-chip" aria-label="Back to the lounge"><ArrowLeft className="size-4" /> Lounge</Link>
          <div className="bg-title-wrap">
            <h1 className="bg-title">{info.name}</h1>
            <p className="bg-sub">{info.sub} · Unranked</p>
          </div>
          <button type="button" className="bg-chip" onClick={() => setRules(true)}><BookOpen className="size-4" /> Rules</button>
        </header>

        {phase === "setup" ? (
          <section className="bg-setup" data-bg-setup>
            <div className="bg-setup-card">
              <h2 className="bg-setup-h">Who do you want to play?</h2>
              <div className="bg-setup-row">
                <button type="button" className="bg-pick is-gold" data-bg-start="bot-w" onClick={() => start("w", "bot")}>
                  <span className="bg-pick-disc is-red">{game === "xiangqi" ? "帥" : ""}</span>
                  <span><b>Play Red</b><small>You move first vs MorseBot</small></span>
                </button>
                <button type="button" className="bg-pick" data-bg-start="bot-b" onClick={() => start("b", "bot")}>
                  <span className="bg-pick-disc is-black">{game === "xiangqi" ? "將" : ""}</span>
                  <span><b>Play Black</b><small>MorseBot moves first</small></span>
                </button>
                <button type="button" className="bg-pick" data-bg-start="hotseat" onClick={() => start("w", "hotseat")}>
                  <span className="bg-pick-disc is-duo"><span className="is-red" /><span className="is-black" /></span>
                  <span><b>Two players</b><small>Take turns on this device</small></span>
                </button>
              </div>
              <div className="bg-level" role="radiogroup" aria-label="MorseBot strength">
                <span>MorseBot</span>
                {(["easy", "normal"] as Level[]).map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={level === l} className={level === l ? "is-on" : ""} onClick={() => setLevel(l)}>
                    {l === "easy" ? "Easy" : "Normal"}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section className="bg-play">
            <PlayerStrip name={flip ? youName : themName} color={flip ? "w" : "b"} game={game} active={!status.over && state.turn === (flip ? "w" : "b")} thinking={thinking && botSide === (flip ? "w" : "b")} state={state} />
            <div className="bg-board-wrap">
              {game === "checkers" ? (
                <CheckersBoard state={state as CkState} ids={snap.ids} flip={flip} sel={sel} targets={targets} last={snap.last} must={myTurn ? mustMove : new Set()} onSquare={clickSquare} />
              ) : (
                <XiangqiBoard state={state as XqState} ids={snap.ids} flip={flip} sel={sel} targets={targets} last={snap.last} check={check} onPoint={clickSquare} />
              )}
              {status.over ? (
                <div className="bg-result" data-bg-result={status.winner ?? "draw"}>
                  <div className="bg-result-card">
                    <p className="bg-result-kicker">{reasonText}</p>
                    <p className="bg-result-title">{resultText}</p>
                    <div className="bg-result-row">
                      <button type="button" className="bg-btn is-gold" onClick={() => start(you, mode)}>Play again</button>
                      <button type="button" className="bg-btn" onClick={() => setPhase("setup")}>Change sides</button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <PlayerStrip name={flip ? themName : youName} color={flip ? "b" : "w"} game={game} active={!status.over && state.turn === (flip ? "b" : "w")} thinking={thinking && botSide === (flip ? "b" : "w")} state={state} />
            <div className="bg-bar">
              <span className="bg-turn" data-bg-turn={state.turn}>
                {status.over ? resultText : check ? `${turnName} is in check!` : game === "checkers" && (state as CkState).cont ? `${turnName}: keep jumping!` : mustMove.size && myTurn ? `${turnName}: you must jump` : `${turnName} to move`}
              </span>
              <span className="bg-bar-btns">
                <button type="button" className="bg-chip" onClick={undo} disabled={!history.length || thinking}><Undo2 className="size-4" /> Undo</button>
                <button type="button" className="bg-chip" onClick={() => start(you, mode)}><RotateCcw className="size-4" /> New</button>
              </span>
            </div>
            <ol className="bg-moves" aria-label="Moves">
              {snap.san.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </section>
        )}
      </div>

      {rules ? (
        <div className="bg-modal" role="dialog" aria-modal="true" aria-label={`${info.name} rules`} onClick={() => setRules(false)}>
          <div className="bg-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="bg-setup-h">How to play {info.name}</h2>
            <ul>{info.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
            <button type="button" className="bg-btn is-gold" onClick={() => setRules(false)}>Got it</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function countPieces(state: AnyState, color: Color) {
  let n = 0;
  for (const row of state.board) for (const c of row) if (c && ((c === c.toUpperCase()) === (color === "w"))) n++;
  return n;
}

function PlayerStrip({ name, color, game, active, thinking, state }: { name: string; color: Color; game: BoardGameId; active: boolean; thinking: boolean; state: AnyState }) {
  const left = countPieces(state, color);
  const full = game === "checkers" ? 12 : 16;
  return (
    <div className={`bg-player ${active ? "is-active" : ""}`} data-bg-player={color}>
      <span className={`bg-pdisc ${color === "w" ? "is-red" : "is-black"}`}>{game === "xiangqi" ? (color === "w" ? "帥" : "將") : ""}</span>
      <span className="bg-pname">{name}</span>
      {thinking ? <span className="bg-thinking">thinking<i>.</i><i>.</i><i>.</i></span> : null}
      <span className="bg-pcount">{left}/{full}</span>
    </div>
  );
}

/* ───────────── Checkers board ───────────── */
function CheckersBoard({ state, ids, flip, sel, targets, last, must, onSquare }: {
  state: CkState; ids: Ids; flip: boolean; sel: string | null; targets: AnyMove[]; last: AnyMove | null; must: Set<string>; onSquare: (sq: string) => void;
}) {
  const S = 100;
  const xy = (r: number, f: number) => (flip ? [(7 - f) * S, r * S] : [f * S, (7 - r) * S]);
  const sqName = (r: number, f: number) => "abcdefgh"[f] + (r + 1);
  const pieces: { id: number; r: number; f: number; c: string }[] = [];
  state.board.forEach((row, r) => row.forEach((c, f) => { if (c) pieces.push({ id: ids[r][f] ?? r * 8 + f + 1000, r, f, c }); }));
  pieces.sort((a, b) => a.id - b.id);
  const lastSet = new Set(last ? [last.from, last.to] : []);
  return (
    <svg className="bg-board is-ck" viewBox="-28 -28 856 856" role="img" aria-label="Checkers board">
      <defs>
        <linearGradient id="ckFrame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6dc8a" /><stop offset=".45" stopColor="#b8862e" /><stop offset="1" stopColor="#7a5418" /></linearGradient>
        <linearGradient id="ckLight" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ecd6a8" /><stop offset="1" stopColor="#d8bb84" /></linearGradient>
        <linearGradient id="ckDark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4a2a1c" /><stop offset="1" stopColor="#2c170f" /></linearGradient>
        <radialGradient id="ckRed" cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#ff6b5e" /><stop offset=".55" stopColor="#c3242a" /><stop offset="1" stopColor="#6e0f13" /></radialGradient>
        <radialGradient id="ckBlack" cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#5c5560" /><stop offset=".55" stopColor="#24202a" /><stop offset="1" stopColor="#0b090d" /></radialGradient>
        <filter id="ckShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#000" floodOpacity=".55" /></filter>
      </defs>
      <rect x="-28" y="-28" width="856" height="856" rx="22" fill="url(#ckFrame)" />
      <rect x="-14" y="-14" width="828" height="828" rx="10" fill="#1a0f0a" />
      {Array.from({ length: 64 }, (_, i) => {
        const r = Math.floor(i / 8), f = i % 8;
        const [x, y] = xy(r, f);
        const dark = (r + f) % 2 === 0;
        const sq = sqName(r, f);
        return (
          <g key={i} onClick={() => onSquare(sq)} className={dark ? "bg-hit" : ""} data-sq={sq}>
            <rect x={x} y={y} width={S} height={S} fill={dark ? "url(#ckDark)" : "url(#ckLight)"} />
            {dark && lastSet.has(sq) ? <rect x={x} y={y} width={S} height={S} fill="#f2c94c" opacity=".22" /> : null}
            {sel === sq ? <rect x={x + 3} y={y + 3} width={S - 6} height={S - 6} fill="none" stroke="#f6d77a" strokeWidth="5" rx="6" /> : null}
          </g>
        );
      })}
      {pieces.map((p) => {
        const [x, y] = xy(p.r, p.f);
        const red = p.c === "M" || p.c === "K";
        const king = p.c === "K" || p.c === "k";
        const sq = sqName(p.r, p.f);
        return (
          <g key={p.id} className="bg-piece" style={{ transform: `translate(${x + S / 2}px, ${y + S / 2}px)` }} onClick={() => onSquare(sq)} data-piece={sq}>
            {must.has(sq) ? <circle r="45" className="bg-must" /> : null}
            <g filter="url(#ckShadow)">
              <circle r="38" fill={red ? "#5c0b0f" : "#050406"} cy="5" />
              <circle r="38" fill={red ? "url(#ckRed)" : "url(#ckBlack)"} />
              <circle r="29" fill="none" stroke={red ? "#ff8f84" : "#6f6875"} strokeOpacity=".55" strokeWidth="2.5" />
              <circle r="22" fill="none" stroke={red ? "#7a1015" : "#000"} strokeOpacity=".5" strokeWidth="2" />
              {king ? (
                <path d="M-20 10 L-24 -12 L-11 -2 L0 -18 L11 -2 L24 -12 L20 10 Z" fill="#f2c94c" stroke="#7a5418" strokeWidth="2.5" strokeLinejoin="round" />
              ) : null}
            </g>
          </g>
        );
      })}
      {targets.map((m) => {
        const [r, f] = ckPos(m.to);
        const [x, y] = xy(r, f);
        return <circle key={m.to} cx={x + S / 2} cy={y + S / 2} r={isLoud(m) ? 20 : 14} className={`bg-dot ${isLoud(m) ? "is-cap" : ""}`} onClick={() => onSquare(m.to)} data-target={m.to} />;
      })}
    </svg>
  );
}

/* ───────────── Xiangqi board ───────────── */
function XiangqiBoard({ state, ids, flip, sel, targets, last, check, onPoint }: {
  state: XqState; ids: Ids; flip: boolean; sel: string | null; targets: AnyMove[]; last: AnyMove | null; check: boolean; onPoint: (sq: string) => void;
}) {
  const G = 80; // grid step
  const P = 56; // padding to the first line
  const xy = (r: number, f: number) => (flip ? [P + (8 - f) * G, P + r * G] : [P + f * G, P + (9 - r) * G]);
  const name = (r: number, f: number) => "abcdefghi"[f] + r;
  const W = P * 2 + 8 * G, H = P * 2 + 9 * G;
  const lines: ReactElement[] = [];
  for (let r = 0; r <= 9; r++) { const [x1, y] = xy(r, 0); const [x2] = xy(r, 8); lines.push(<line key={`h${r}`} x1={x1} y1={y} x2={x2} y2={y} />); }
  for (let f = 0; f <= 8; f++) {
    const edge = f === 0 || f === 8;
    const [x, y0] = xy(0, f), [, y4] = xy(4, f), [, y5] = xy(5, f), [, y9] = xy(9, f);
    if (edge) lines.push(<line key={`v${f}`} x1={x} y1={y0} x2={x} y2={y9} />);
    else { lines.push(<line key={`v${f}a`} x1={x} y1={y0} x2={x} y2={y4} />, <line key={`v${f}b`} x1={x} y1={y5} x2={x} y2={y9} />); }
  }
  for (const [ra, rb] of [[0, 2], [7, 9]]) {
    const [x1, y1] = xy(ra, 3), [x2, y2] = xy(rb, 5), [x3, y3] = xy(ra, 5), [x4, y4] = xy(rb, 3);
    lines.push(<line key={`p${ra}a`} x1={x1} y1={y1} x2={x2} y2={y2} />, <line key={`p${ra}b`} x1={x3} y1={y3} x2={x4} y2={y4} />);
  }
  // position marks for cannons and soldiers
  const marks: [number, number][] = [[2, 1], [2, 7], [7, 1], [7, 7], [3, 0], [3, 2], [3, 4], [3, 6], [3, 8], [6, 0], [6, 2], [6, 4], [6, 6], [6, 8]];
  const markEls = marks.map(([r, f]) => {
    const [x, y] = xy(r, f);
    const d = 8, l = 14;
    const parts: string[] = [];
    for (const sx of [-1, 1]) {
      if ((sx === -1 && f === 0) || (sx === 1 && f === 8)) continue;
      for (const sy of [-1, 1]) parts.push(`M${x + sx * d} ${y + sy * (d + l)} L${x + sx * d} ${y + sy * d} L${x + sx * (d + l)} ${y + sy * d}`);
    }
    return <path key={`m${r}${f}`} d={parts.join(" ")} />;
  });
  const [, ry4] = xy(4, 0), [, ry5] = xy(5, 0);
  const riverY = (ry4 + ry5) / 2;
  const pieces: { id: number; r: number; f: number; c: string }[] = [];
  state.board.forEach((row, r) => row.forEach((c, f) => { if (c) pieces.push({ id: ids[r][f] ?? r * 9 + f + 1000, r, f, c }); }));
  pieces.sort((a, b) => a.id - b.id);
  const lastSet = new Set(last ? [last.from, last.to] : []);
  const gen = check ? xqGeneral(state.board, state.turn) : null;
  return (
    <svg className="bg-board is-xq" viewBox={`-26 -26 ${W + 52} ${H + 52}`} role="img" aria-label="Chinese chess board">
      <defs>
        <linearGradient id="xqFrame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6dc8a" /><stop offset=".45" stopColor="#b8862e" /><stop offset="1" stopColor="#7a5418" /></linearGradient>
        <linearGradient id="xqWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e9c98f" /><stop offset=".5" stopColor="#dbb274" /><stop offset="1" stopColor="#c99a5b" /></linearGradient>
        <radialGradient id="xqDisc" cx=".38" cy=".3" r=".8"><stop offset="0" stopColor="#fff6e2" /><stop offset=".6" stopColor="#ecd8b0" /><stop offset="1" stopColor="#b8935c" /></radialGradient>
        <filter id="xqShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000" floodOpacity=".5" /></filter>
        <pattern id="xqGrain" width="160" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 Q40 2 80 6 T160 6" fill="none" stroke="#8a5a2b" strokeOpacity=".09" strokeWidth="2" /></pattern>
      </defs>
      <rect x="-26" y="-26" width={W + 52} height={H + 52} rx="22" fill="url(#xqFrame)" />
      <rect x="-12" y="-12" width={W + 24} height={H + 24} rx="10" fill="url(#xqWood)" />
      <rect x="-12" y="-12" width={W + 24} height={H + 24} rx="10" fill="url(#xqGrain)" />
      <g className="bg-xq-lines">{lines}{markEls}</g>
      <rect x={P - 6} y={P - 6} width={8 * G + 12} height={9 * G + 12} fill="none" stroke="#5a3415" strokeWidth="4" />
      <text x={P + 2 * G} y={riverY} className="bg-river">{flip ? "漢 界" : "楚 河"}</text>
      <text x={P + 6 * G} y={riverY} className="bg-river">{flip ? "楚 河" : "漢 界"}</text>
      {lastSet.size ? [...lastSet].map((sq) => { const [r, f] = xqPos(sq); const [x, y] = xy(r, f); return <circle key={`l${sq}`} cx={x} cy={y} r="36" fill="#f2c94c" opacity=".28" />; }) : null}
      {Array.from({ length: 90 }, (_, i) => {
        const r = Math.floor(i / 9), f = i % 9;
        const [x, y] = xy(r, f);
        const sq = name(r, f);
        return <circle key={sq} cx={x} cy={y} r={G / 2} fill="transparent" onClick={() => onPoint(sq)} data-sq={sq} />;
      })}
      {pieces.map((p) => {
        const [x, y] = xy(p.r, p.f);
        const red = p.c === p.c.toUpperCase();
        const sq = name(p.r, p.f);
        const inCheck = gen && gen[0] === p.r && gen[1] === p.f;
        return (
          <g key={p.id} className="bg-piece" style={{ transform: `translate(${x}px, ${y}px)` }} onClick={() => onPoint(sq)} data-piece={sq}>
            {inCheck ? <circle r="42" className="bg-check" /> : null}
            {sel === sq ? <circle r="41" fill="none" stroke="#f6d77a" strokeWidth="5" /> : null}
            <g filter="url(#xqShadow)">
              <circle r="34" cy="4" fill="#8a6434" />
              <circle r="34" fill="url(#xqDisc)" stroke="#9c7440" strokeWidth="2" />
              <circle r="27" fill="none" stroke={red ? "#b3202a" : "#1d1a1f"} strokeWidth="2.5" />
              <text className="bg-xq-char" fill={red ? "#b3202a" : "#1d1a1f"} y="1">{XQ_CHAR[p.c]}</text>
            </g>
          </g>
        );
      })}
      {targets.map((m) => {
        const [r, f] = xqPos(m.to);
        const [x, y] = xy(r, f);
        return <circle key={m.to} cx={x} cy={y} r={isLoud(m) ? 38 : 11} className={`bg-dot ${isLoud(m) ? "is-cap" : ""}`} onClick={() => onPoint(m.to)} data-target={m.to} />;
      })}
    </svg>
  );
}
