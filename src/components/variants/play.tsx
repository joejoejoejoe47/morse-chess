import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { PieceSymbol } from "chess.js";
import { getHomeState } from "@/lib/server/mores";
import { setPieceStyle } from "@/lib/server/avatar";
import { boardById } from "@/lib/chess/board-skins";
import { VariantStage, type Look, type Sky, type StageUnit } from "@/components/variants/stage";

type Side = "w" | "b";
type Kind = "k" | "q" | "r" | "b" | "n" | "p";
type Unit = { side: Side; kind: Kind };
type Board = (Unit | null)[][];
type Step = { from: [number, number]; to: [number, number] };

const GLYPH: Record<Kind, string> = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" };
const SETUP: Kind[] = ["k", "r", "b", "b", "n", "n", "p"];

const LookCtx = createContext<{ look: Look; sky: Sky; light: string; dark: string; setLook: (next: Look) => void }>({
  look: "3d",
  sky: "table",
  light: "#e7d3a8",
  dark: "#b58863",
  setLook: () => undefined,
});

function ModeBar() {
  const { look, setLook } = useContext(LookCtx);
  return (
    <div className="flex rounded-md border border-[#4a3d2a] bg-[#14110d]/90 p-1">
      {(["2d", "3d", "an", "lg"] as Look[]).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => setLook(id)}
          className={
            "min-h-9 rounded px-3 text-xs font-semibold uppercase tracking-[0.16em] " +
            (look === id ? "bg-[linear-gradient(180deg,#e9c766,#a87a26)] text-[#1b140a]" : "text-[#b9a98a]")
          }
        >
          {id}
        </button>
      ))}
    </div>
  );
}

const other = (s: Side): Side => (s === "w" ? "b" : "w");

function blank(rows: number, cols: number): Board {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

function cloneBoard<T extends object>(b: (T | null)[][]): (T | null)[][] {
  return b.map((row) => row.map((c) => (c ? { ...c } : null)));
}

function onBoard(r: number, f: number, rows: number, cols: number) {
  return r >= 0 && f >= 0 && r < rows && f < cols;
}

function Shell({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[#120e0b] text-[#f4e7cb]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3a3024] px-4 py-3">
        <Link to="/" className="text-xs uppercase tracking-[0.18em] text-[#cbb892] hover:text-[#f0d68a]">
          ‹ Lounge
        </Link>
        <h1 className="font-display text-2xl text-[#f8edd4]">{title}</h1>
        <ModeBar />
        <span className="max-w-md text-right text-xs text-[#b7a88c]">{note}</span>
      </header>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-3 py-4 lg:flex-row lg:items-start lg:justify-center">{children}</div>
    </main>
  );
}

function Grid({
  rows,
  cols,
  paint,
  onPick,
  units,
  ball = null,
}: {
  rows: number;
  cols: number;
  paint: (r: number, f: number) => { bg: string; fg: string; text: string };
  onPick: (r: number, f: number) => void;
  units: StageUnit[];
  ball?: { r: number; f: number } | null;
}) {
  const { look, sky, light, dark } = useContext(LookCtx);
  const plain = new Set(["#e7d3a8", "#b58863", "#cbb892", "#8c6a45"]);
  return (
    <VariantStage
      rows={rows}
      cols={cols}
      onPick={onPick}
      units={units}
      look={look}
      sky={sky}
      ball={ball}
      paint={(r, f) => {
        const p = paint(r, f);
        if (!plain.has(p.bg)) return p;
        return { ...p, bg: (r + f) % 2 === 0 ? light : dark };
      }}
    />
  );
}

function squareTone(r: number, f: number, hot: boolean, red: boolean, black: boolean) {
  if (red) return hot ? "#7a3030" : "#5c2424";
  if (black) return (r + f) % 2 === 0 ? "#2a2a2a" : "#1a1a1a";
  const light = (r + f) % 2 === 0;
  if (hot) return light ? "#f0d48a" : "#c9a45a";
  return light ? "#e7d3a8" : "#b58863";
}

/* ── Check Mate ─────────────────────────────────────────────── */

function isRedSq(r: number, f: number, inset: number, lastTwo: boolean) {
  if (lastTwo) return !(r === 3 && (f === 3 || f === 4));
  if (inset <= 0) return false;
  return r < inset || r > 7 - inset || f < inset || f > 7 - inset;
}

function isBand(r: number, inset: number, band: number) {
  if (inset > 0) return false;
  return r < band || r > 7 - band;
}

function rayHits(
  b: Board,
  r: number,
  f: number,
  dr: number,
  df: number,
  red: (r: number, f: number) => boolean,
  takeKing: boolean,
): [number, number][] {
  const out: [number, number][] = [];
  const side = b[r][f]!.side;
  let rr = r + dr;
  let ff = f + df;
  while (onBoard(rr, ff, 8, 8)) {
    if (red(rr, ff)) break;
    const t = b[rr][ff];
    if (!t) out.push([rr, ff]);
    else {
      if (t.side !== side && (takeKing || t.kind !== "k")) out.push([rr, ff]);
      break;
    }
    rr += dr;
    ff += df;
  }
  return out;
}

function attacksFrom(b: Board, r: number, f: number, red: (r: number, f: number) => boolean): [number, number][] {
  const u = b[r][f];
  if (!u) return [];
  const out: [number, number][] = [];
  const push = (rr: number, ff: number) => {
    if (!onBoard(rr, ff, 8, 8) || red(rr, ff)) return;
    const t = b[rr][ff];
    if (!t || t.side !== u.side) out.push([rr, ff]);
  };
  if (u.kind === "n") {
    for (const [dr, df] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as const) push(r + dr, f + df);
  } else if (u.kind === "k") {
    for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) if (dr || df) push(r + dr, f + df);
  } else if (u.kind === "p") {
    const dir = u.side === "w" ? 1 : -1;
    push(r + dir, f - 1);
    push(r + dir, f + 1);
  } else {
    const dirs: [number, number][] = [];
    if (u.kind === "b" || u.kind === "q") dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (u.kind === "r" || u.kind === "q") dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    for (const [dr, df] of dirs) out.push(...rayHits(b, r, f, dr, df, red, true));
  }
  return out;
}

function movesFrom(b: Board, r: number, f: number, red: (r: number, f: number) => boolean): [number, number][] {
  const u = b[r][f];
  if (!u) return [];
  if (u.kind === "p") {
    const dir = u.side === "w" ? 1 : -1;
    const out: [number, number][] = [];
    const rr = r + dir;
    if (onBoard(rr, f, 8, 8) && !red(rr, f) && !b[rr][f]) out.push([rr, f]);
    for (const df of [-1, 1]) {
      const ff = f + df;
      if (!onBoard(rr, ff, 8, 8) || red(rr, ff)) continue;
      const t = b[rr][ff];
      if (t && t.side !== u.side && t.kind !== "k") out.push([rr, ff]);
    }
    return out;
  }
  return attacksFrom(b, r, f, red).filter(([rr, ff]) => {
    const t = b[rr][ff];
    return !t || t.kind !== "k";
  });
}

function allMoves(b: Board, side: Side, red: (r: number, f: number) => boolean): Step[] {
  const out: Step[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      if (b[r][f]?.side !== side) continue;
      for (const to of movesFrom(b, r, f, red)) out.push({ from: [r, f], to });
    }
  }
  return out;
}

function applyStep(b: Board, step: Step, band: number, inset: number): { board: Board; crowned: Side | null } {
  const board = cloneBoard(b);
  const u = board[step.from[0]][step.from[1]];
  if (!u) return { board, crowned: null };
  board[step.from[0]][step.from[1]] = null;
  let crowned: Side | null = null;
  const next = { ...u };
  if (next.kind !== "k" && isBand(step.to[0], inset, band)) {
    next.kind = "k";
    crowned = next.side;
  }
  board[step.to[0]][step.to[1]] = next;
  return { board, crowned };
}

function isAttacked(b: Board, r: number, f: number, by: Side, red: (r: number, f: number) => boolean) {
  for (let rr = 0; rr < 8; rr++) {
    for (let ff = 0; ff < 8; ff++) {
      if (b[rr][ff]?.side !== by) continue;
      if (attacksFrom(b, rr, ff, red).some(([tr, tf]) => tr === r && tf === f)) return true;
    }
  }
  return false;
}

function canSave(b: Board, side: Side, kr: number, kf: number, red: (r: number, f: number) => boolean, band: number, inset: number) {
  if (!isAttacked(b, kr, kf, other(side), red)) return true;
  for (const step of allMoves(b, side, red)) {
    const next = applyStep(b, step, band, inset).board;
    let nr = kr;
    let nf = kf;
    if (step.from[0] === kr && step.from[1] === kf) {
      nr = step.to[0];
      nf = step.to[1];
    }
    const u = next[nr][nf];
    if (!u || u.kind !== "k" || u.side !== side) continue;
    if (!isAttacked(next, nr, nf, other(side), red)) return true;
  }
  return false;
}

function stripKings(b: Board, side: Side, red: (r: number, f: number) => boolean, band: number, inset: number) {
  let board = b;
  let removed = 0;
  for (let guard = 0; guard < 8; guard++) {
    const doomed: [number, number][] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const u = board[r][f];
        if (u?.side === side && u.kind === "k" && !canSave(board, side, r, f, red, band, inset)) doomed.push([r, f]);
      }
    }
    if (!doomed.length) break;
    board = cloneBoard(board);
    for (const [r, f] of doomed) {
      board[r][f] = null;
      removed++;
    }
  }
  return { board, removed };
}

function kingCount(b: Board, side: Side) {
  let n = 0;
  for (const row of b) for (const c of row) if (c?.side === side && c.kind === "k") n++;
  return n;
}

function wouldCapture(kind: Kind, side: Side, r: number, f: number, b: Board) {
  const ghost = cloneBoard(b);
  ghost[r][f] = { side, kind };
  return attacksFrom(ghost, r, f, () => false).some(([rr, ff]) => rr === r && ff === f ? false : Boolean(b[rr]?.[ff] || (ghost[rr][ff] && !(rr === r && ff === f) && b[rr][ff])));
}

function placeHits(kind: Kind, side: Side, r: number, f: number, b: Board) {
  const ghost = cloneBoard(b);
  ghost[r][f] = { side, kind };
  return attacksFrom(ghost, r, f, () => false).some(([rr, ff]) => Boolean(b[rr][ff]));
}

export function CheckMate({ versus }: { versus: string }) {
  const [board, setBoard] = useState<Board>(() => blank(8, 8));
  const [queue, setQueue] = useState<Kind[]>(SETUP);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [turn, setTurn] = useState<Side>("w");
  const [phase, setPhase] = useState<"place" | "play" | "over">("place");
  const [band, setBand] = useState(1);
  const [inset, setInset] = useState(0);
  const [lastTwo, setLastTwo] = useState(false);
  const [crowned, setCrowned] = useState<{ w: boolean; b: boolean }>({ w: false, b: false });
  const [note, setNote] = useState("Place your king, rook, two bishops, two knights and one pawn. Red squares can take a piece on the first move.");
  const [banner, setBanner] = useState("");

  const red = (r: number, f: number) => isRedSq(r, f, inset, lastTwo);
  const placing = queue[0];

  function finish(text: string) {
    setPhase("over");
    setBanner(text);
    setNote(text);
  }

  function openTurn(nextBoard: Board, side: Side, zone: { band: number; inset: number; lastTwo: boolean; crowned: { w: boolean; b: boolean } }) {
    const redFn = (r: number, f: number) => isRedSq(r, f, zone.inset, zone.lastTwo);
    const stripped = stripKings(nextBoard, side, redFn, zone.band, zone.inset);
    if (kingCount(stripped.board, side) === 0) {
      setBoard(stripped.board);
      finish(side === "w" ? `${versus} checkmated your last king.` : "You checkmated the last enemy king.");
      return stripped.board;
    }
    if (zone.lastTwo && kingCount(stripped.board, "w") > 0 && kingCount(stripped.board, "b") > 0) {
      const alive = (s: Side) => {
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
          const u = stripped.board[r][f];
          if (u?.side === s && u.kind === "k" && isRedSq(r, f, zone.inset, true)) return false;
        }
        return true;
      };
      if (alive("w") && alive("b")) {
        setBoard(stripped.board);
        finish("Both kings are still on the last two squares. Tie.");
        return stripped.board;
      }
    }
    setBoard(stripped.board);
    setTurn(side);
    if (side === "b" && phase !== "over") {
      window.setTimeout(() => botPlay(stripped.board, zone), 450);
    }
    return stripped.board;
  }

  function growZone(prev: { band: number; inset: number; lastTwo: boolean; crowned: { w: boolean; b: boolean } }, boardNow: Board) {
    let { band: nb, inset: ni, lastTwo: lt } = prev;
    if (prev.crowned.w && prev.crowned.b) {
      if (nb < 2) nb = 2;
      else if (!lt && ni < 3) ni += 1;
      else lt = true;
    }
    const next = cloneBoard(boardNow);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        if (isRedSq(r, f, ni, lt)) next[r][f] = null;
      }
    }
    return { board: next, zone: { ...prev, band: nb, inset: ni, lastTwo: lt } };
  }

  function botPlay(live: Board, zone: { band: number; inset: number; lastTwo: boolean; crowned: { w: boolean; b: boolean } }) {
    const redFn = (r: number, f: number) => isRedSq(r, f, zone.inset, zone.lastTwo);
    const moves = allMoves(live, "b", redFn);
    if (!moves.length) {
      if (kingCount(live, "b") > 0 && kingCount(live, "w") > 0) finish("No moves left. Tie.");
      return;
    }
    const step = moves[Math.floor(Math.random() * moves.length)];
    const applied = applyStep(live, step, zone.band, zone.inset);
    const crowns = { ...zone.crowned, b: zone.crowned.b || applied.crowned === "b" };
    const grown = growZone({ ...zone, crowned: crowns }, applied.board);
    setBand(grown.zone.band);
    setInset(grown.zone.inset);
    setLastTwo(grown.zone.lastTwo);
    setCrowned(grown.zone.crowned);
    setSel(null);
    openTurn(grown.board, "w", grown.zone);
  }

  function playHuman(step: Step) {
    const zone = { band, inset, lastTwo, crowned };
    const applied = applyStep(board, step, band, inset);
    const crowns = { ...crowned, w: crowned.w || applied.crowned === "w" };
    setCrowned(crowns);
    setSel(null);
    setNote(applied.crowned === "w" ? "That piece became a king on the black." : "Your move is down.");
    openTurn(applied.board, "b", { ...zone, crowned: crowns });
  }

  function onSquare(r: number, f: number) {
    if (phase === "over") return;
    if (phase === "place") {
      if (!placing) return;
      if (r > 3 || board[r][f] || placeHits(placing, "w", r, f, board)) return;
      const next = cloneBoard(board);
      next[r][f] = { side: "w", kind: placing };
      const rest = queue.slice(1);
      setQueue(rest);
      if (rest.length) {
        setBoard(next);
        return;
      }
      const full = botPlace(next);
      setBoard(full);
      setPhase("play");
      setTurn("w");
      setNote("The black ranks crown a piece that steps on them. Checkmate one king and the other stays.");
      return;
    }
    if (turn !== "w") return;
    const u = board[r][f];
    if (u?.side === "w") {
      setSel([r, f]);
      return;
    }
    if (!sel) return;
    const legal = movesFrom(board, sel[0], sel[1], red).some(([rr, ff]) => rr === r && ff === f);
    if (!legal) return;
    playHuman({ from: sel, to: [r, f] });
  }

  function botPlace(start: Board) {
    const next = cloneBoard(start);
    for (const kind of SETUP) {
      const spots: [number, number][] = [];
      const any: [number, number][] = [];
      for (let r = 4; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          if (next[r][f]) continue;
          any.push([r, f]);
          if (!placeHits(kind, "b", r, f, next)) spots.push([r, f]);
        }
      }
      const bag = spots.length ? spots : any;
      const pick = bag[Math.floor(Math.random() * bag.length)];
      if (pick) next[pick[0]][pick[1]] = { side: "b", kind };
    }
    return next;
  }

  const hot = new Set<string>();
  if (phase === "place" && placing) {
    for (let r = 0; r < 4; r++) for (let f = 0; f < 8; f++) {
      if (!board[r][f] && placeHits(placing, "w", r, f, board)) hot.add(`${r}:${f}`);
    }
  }
  if (phase === "play" && sel) {
    for (const [r, f] of movesFrom(board, sel[0], sel[1], red)) hot.add(`${r}:${f}`);
  }

  return (
    <Shell title="Check Mate" note={versus}>
      <Grid
        rows={8}
        cols={8}
        onPick={onSquare}
        units={board.flatMap((row, r) => row.flatMap((u, f) => (u ? [{ r, f, side: u.side, kind: u.kind }] : [])))}
        paint={(r, f) => {
          const u = board[r][f];
          const marked = hot.has(`${r}:${f}`) || (sel && sel[0] === r && sel[1] === f);
          const danger = phase === "place" ? hot.has(`${r}:${f}`) : red(r, f);
          const black = isBand(r, inset, band);
          return {
            bg: squareTone(r, f, Boolean(marked && !danger), danger, black && !danger),
            fg: u?.side === "b" ? "#1a120c" : "#f7f1e4",
            text: u ? GLYPH[u.kind] : "",
          };
        }}
      />
      <aside className="w-full max-w-sm space-y-3 rounded-xl border border-[#3a3024] bg-[#1b1612] p-4">
        <p className="text-sm text-[#e7d7b8]">{banner || note}</p>
        {phase === "place" && placing ? (
          <p className="font-display text-3xl">
            Place {GLYPH[placing]} <span className="text-base text-[#cbb892]">{queue.length} left</span>
          </p>
        ) : null}
        <p className="text-xs uppercase tracking-[0.16em] text-[#b7a88c]">
          {phase === "play" ? (turn === "w" ? "Your move" : `${versus} is moving`) : phase === "place" ? "Your half only" : "Game over"}
        </p>
        <p className="text-xs text-[#b7a88c]">
          Black bands crown any piece that steps on them. When both sides have a new king the band grows, then turns red from the edges until two squares remain.
        </p>
      </aside>
    </Shell>
  );
}

/* ── Football ───────────────────────────────────────────────── */

type FUnit = Unit & { ball?: boolean; held?: number };
type FBoard = (FUnit | null)[][];

const F_ROWS = 14;
const F_COLS = 8;

function footballStart(): { board: FBoard; loose: [number, number] | null } {
  const board = blank(F_ROWS, F_COLS) as FBoard;
  const back: Kind[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  for (let f = 0; f < 8; f++) {
    board[5][f] = { side: "w", kind: back[f] };
    board[6][f] = { side: "w", kind: "p" };
    board[8][f] = { side: "b", kind: "p" };
    board[9][f] = { side: "b", kind: back[f] };
  }
  return { board, loose: [7, 3] };
}

function fMoves(b: FBoard, r: number, f: number): [number, number][] {
  const u = b[r][f];
  if (!u) return [];
  const out: [number, number][] = [];
  const push = (rr: number, ff: number) => {
    if (!onBoard(rr, ff, F_ROWS, F_COLS)) return;
    const t = b[rr][ff];
    if (t?.kind === "k") return;
    if (!t || t.side !== u.side) out.push([rr, ff]);
  };
  const slide = (dr: number, df: number) => {
    let rr = r + dr;
    let ff = f + df;
    while (onBoard(rr, ff, F_ROWS, F_COLS)) {
      const t = b[rr][ff];
      if (!t) out.push([rr, ff]);
      else {
        if (t.side !== u.side && t.kind !== "k") out.push([rr, ff]);
        break;
      }
      rr += dr;
      ff += df;
    }
  };
  if (u.kind === "p") {
    const dir = u.side === "w" ? 1 : -1;
    const rr = r + dir;
    if (onBoard(rr, f, F_ROWS, F_COLS) && !b[rr][f]) out.push([rr, f]);
    for (const df of [-1, 1]) {
      const ff = f + df;
      const t = onBoard(rr, ff, F_ROWS, F_COLS) ? b[rr][ff] : null;
      if (t && t.side !== u.side && t.kind !== "k") out.push([rr, ff]);
    }
  } else if (u.kind === "n") {
    for (const [dr, df] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as const) push(r + dr, f + df);
  } else if (u.kind === "k") {
    for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) if (dr || df) push(r + dr, f + df);
  } else {
    const dirs: [number, number][] = [];
    if (u.kind === "b" || u.kind === "q") dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (u.kind === "r" || u.kind === "q") dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    for (const [dr, df] of dirs) slide(dr, df);
  }
  return out;
}

function throwRange(kind: Kind) {
  if (kind === "q") return 99;
  if (kind === "n" || kind === "b") return 5;
  if (kind === "r") return 8;
  return 1;
}

function catchSquares(b: FBoard, r: number, f: number): [number, number][] {
  const u = b[r][f];
  if (!u?.ball) return [];
  const reach = throwRange(u.kind);
  const out: [number, number][] = [];
  for (let rr = 0; rr < F_ROWS; rr++) {
    for (let ff = 0; ff < F_COLS; ff++) {
      const t = b[rr][ff];
      if (!t || t.side !== u.side || (rr === r && ff === f)) continue;
      const dist = u.kind === "q" ? 0 : Math.max(Math.abs(rr - r), Math.abs(ff - f));
      if (u.kind === "q" || dist <= reach) out.push([rr, ff]);
    }
  }
  return out;
}

function onlyKings(b: FBoard) {
  let w = 0;
  let bN = 0;
  let otherW = 0;
  let otherB = 0;
  for (const row of b) {
    for (const c of row) {
      if (!c) continue;
      if (c.kind === "k") {
        if (c.side === "w") w++;
        else bN++;
      } else if (c.side === "w") otherW++;
      else otherB++;
    }
  }
  return w > 0 && bN > 0 && otherW === 0 && otherB === 0;
}

function inEnd(side: Side, r: number) {
  return side === "w" ? r >= 12 : r <= 1;
}

export function Football({ versus }: { versus: string }) {
  const start = useMemo(() => footballStart(), []);
  const [board, setBoard] = useState<FBoard>(start.board);
  const [loose, setLoose] = useState<[number, number] | null>(start.loose);
  const [turn, setTurn] = useState<Side>("w");
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [throwing, setThrowing] = useState(false);
  const [score, setScore] = useState({ w: 0, b: 0 });
  const [left, setLeft] = useState(5 * 60);
  const [over, setOver] = useState("");

  useEffect(() => {
    if (over) return;
    const id = window.setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          setOver("time");
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [over]);

  function dropKingBall(b: FBoard, side: Side, ball: [number, number] | null) {
    const next = cloneBoard(b) as FBoard;
    let looseNow = ball;
    for (let r = 0; r < F_ROWS; r++) {
      for (let f = 0; f < F_COLS; f++) {
        const u = next[r][f];
        if (u?.side === side && u.kind === "k" && u.ball && (u.held ?? 0) >= 3) {
          next[r][f] = { ...u, ball: false, held: 0 };
          looseNow = [r, f];
        }
      }
    }
    return { board: next, loose: looseNow };
  }

  function scoreReset(b: FBoard, scorer: Side, current: { w: number; b: number }) {
    const next = cloneBoard(b) as FBoard;
    for (let r = 0; r < F_ROWS; r++) for (let f = 0; f < F_COLS; f++) {
      if (next[r][f]?.ball) next[r][f] = { ...next[r][f]!, ball: false, held: 0 };
    }
    return { board: next, loose: [7, 3] as [number, number], score: { ...current, [scorer]: current[scorer] + 6 } };
  }

  function finishTurn(next: FBoard, ball: [number, number] | null, scored: { w: number; b: number }, mover: Side) {
    if (onlyKings(next)) {
      setBoard(next);
      setLoose(ball);
      setScore(scored);
      setOver("kings");
      return;
    }
    const side = other(mover);
    const dropped = dropKingBall(next, side, ball);
    setBoard(dropped.board);
    setLoose(dropped.loose);
    setScore(scored);
    setTurn(side);
    setSel(null);
    setThrowing(false);
    if (side === "b" && !over) window.setTimeout(() => botFootball(dropped.board, dropped.loose, scored), 400);
  }

  function moveTo(from: [number, number], to: [number, number], live = board, ball = loose, scored = score) {
    const next = cloneBoard(live) as FBoard;
    const u = next[from[0]][from[1]];
    if (!u) return;
    const victim = next[to[0]][to[1]];
    let carry = Boolean(u.ball);
    if (!carry && ball && ball[0] === to[0] && ball[1] === to[1]) carry = true;
    if (victim?.ball) carry = true;
    next[from[0]][from[1]] = null;
    const held = u.kind === "k" && carry ? (u.held ?? 0) + 1 : 0;
    next[to[0]][to[1]] = { ...u, ball: carry, held };
    let looseNow: [number, number] | null = carry ? null : ball && ball[0] === to[0] && ball[1] === to[1] ? null : ball;
    let points = scored;
    if (carry && inEnd(u.side, to[0])) {
      const reset = scoreReset(next, u.side, scored);
      finishTurn(reset.board, reset.loose, reset.score, u.side);
      return;
    }
    finishTurn(next, looseNow, points, u.side);
  }

  function pass(from: [number, number], to: [number, number], live = board, scored = score) {
    const next = cloneBoard(live) as FBoard;
    const u = next[from[0]][from[1]];
    const catcher = next[to[0]][to[1]];
    if (!u?.ball || !catcher || catcher.side !== u.side) return;
    next[from[0]][from[1]] = { ...u, ball: false, held: 0 };
    next[to[0]][to[1]] = { ...catcher, ball: true, held: catcher.kind === "k" ? 1 : 0 };
    if (inEnd(catcher.side, to[0])) {
      const reset = scoreReset(next, catcher.side, scored);
      finishTurn(reset.board, reset.loose, reset.score, u.side);
      return;
    }
    finishTurn(next, null, scored, u.side);
  }

  function botFootball(live: FBoard, ball: [number, number] | null, scored: { w: number; b: number }) {
    type Act = { kind: "m" | "t"; from: [number, number]; to: [number, number]; rank: number };
    const acts: Act[] = [];
    for (let r = 0; r < F_ROWS; r++) {
      for (let f = 0; f < F_COLS; f++) {
        const u = live[r][f];
        if (u?.side !== "b") continue;
        for (const to of fMoves(live, r, f)) {
          let rank = 1;
          if (ball && to[0] === ball[0] && to[1] === ball[1]) rank += 5;
          if (u.ball) rank += (r - to[0]) * 2;
          if (live[to[0]][to[1]]) rank += 3;
          acts.push({ kind: "m", from: [r, f], to, rank });
        }
        if (u.ball) {
          for (const to of catchSquares(live, r, f)) {
            acts.push({ kind: "t", from: [r, f], to, rank: (r - to[0]) * 3 + 2 });
          }
        }
      }
    }
    if (!acts.length) {
      setTurn("w");
      return;
    }
    acts.sort((a, b) => b.rank - a.rank);
    const pick = acts[Math.floor(Math.random() * Math.min(3, acts.length))];
    if (pick.kind === "t") pass(pick.from, pick.to, live, scored);
    else moveTo(pick.from, pick.to, live, ball, scored);
  }

  function onSquare(r: number, f: number) {
    if (over || turn !== "w") return;
    const u = board[r][f];
    if (throwing && sel) {
      if (catchSquares(board, sel[0], sel[1]).some(([rr, ff]) => rr === r && ff === f)) pass(sel, [r, f]);
      else setThrowing(false);
      return;
    }
    if (u?.side === "w") {
      setSel([r, f]);
      setThrowing(false);
      return;
    }
    if (!sel) return;
    if (fMoves(board, sel[0], sel[1]).some(([rr, ff]) => rr === r && ff === f)) moveTo(sel, [r, f]);
  }

  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const result = over === "time" ? (score.w === score.b ? "Time. Tie game." : score.w > score.b ? "Time. You win." : `Time. ${versus} wins.`) : over === "kings" ? "King versus king. Tie game." : "";

  return (
    <Shell title="Football" note="5:00 · touchdown 6">
      <div className="flex w-full max-w-[760px] items-center justify-between px-2 font-display text-3xl">
        <span>You {score.w}</span>
        <span className="tabular-nums text-[#f0d68a]">{clock}</span>
        <span>{score.b} {versus}</span>
      </div>
      <Grid
        rows={F_ROWS}
        cols={F_COLS}
        onPick={onSquare}
        ball={loose ? { r: loose[0], f: loose[1] } : null}
        units={board.flatMap((row, r) => row.flatMap((u, f) => (u ? [{ r, f, side: u.side, kind: u.kind, ball: u.ball }] : [])))}
        paint={(r, f) => {
          const u = board[r][f];
          const end = r <= 1 || r >= 12;
          const marked = sel && ((throwing && catchSquares(board, sel[0], sel[1]).some(([rr, ff]) => rr === r && ff === f)) || (!throwing && fMoves(board, sel[0], sel[1]).some(([rr, ff]) => rr === r && ff === f)) || (sel[0] === r && sel[1] === f));
          const ballHere = loose && loose[0] === r && loose[1] === f;
          let bg = end ? (r + f) % 2 ? "#1f6b3a" : "#185c32" : (r + f) % 2 ? "#2f8f4e" : "#277a42";
          if (marked) bg = "#e6c56a";
          const post = end && f === 3;
          return {
            bg,
            fg: u?.side === "b" ? "#14110e" : "#fffaf0",
            text: `${post && !u ? "⊓" : ""}${u ? GLYPH[u.kind] : ""}${u?.ball || ballHere ? "●" : ""}`,
          };
        }}
      />
      <aside className="w-full max-w-sm space-y-3 rounded-xl border border-[#3a3024] bg-[#1b1612] p-4">
        <p className="text-sm">{result || (turn === "w" ? "Your down." : `${versus} has the ball side.`)}</p>
        <p className="text-xs text-[#b7a88c]">Run the ball into the far end zone, or throw it to a teammate standing there. Pawn throws 1, knight and bishop 5, rook 8, queen the whole field, king 1. A king drops the ball after 3 downs. Kings cannot be taken.</p>
        {sel && board[sel[0]][sel[1]]?.ball && turn === "w" && !over ? (
          <button type="button" className="rounded-md border border-[#d6ad4f] px-3 py-2 text-sm uppercase tracking-[0.14em]" onClick={() => setThrowing((v) => !v)}>
            {throwing ? "Throwing — pick a teammate" : "Throw the ball"}
          </button>
        ) : null}
      </aside>
    </Shell>
  );
}

/* ── Morse Strategy ─────────────────────────────────────────── */

type Rank = number | "A" | "B";
type SUnit = { side: Side; rank: Rank; seen: boolean };
type SBoard = (SUnit | null)[][];

const BAG: { rank: Rank; name: string }[] = [
  { rank: "A", name: "Apple" },
  { rank: 10, name: "10" },
  { rank: 9, name: "9" },
  { rank: 8, name: "8" },
  { rank: 7, name: "7" },
  { rank: 6, name: "6" },
  { rank: 5, name: "Queen" },
  { rank: 4, name: "Rook" },
  { rank: 3, name: "Bishop" },
  { rank: 3, name: "Bishop" },
  { rank: 2, name: "Knight" },
  { rank: 2, name: "Knight" },
  { rank: 1, name: "Pawn" },
  { rank: 1, name: "Pawn" },
  { rank: 1, name: "Pawn" },
  { rank: "B", name: "Bomb" },
  { rank: "B", name: "Bomb" },
];

function rankLabel(rank: Rank) {
  if (rank === "A") return "Apple";
  if (rank === "B") return "Bomb";
  if (rank === 5) return "Queen";
  if (rank === 4) return "Rook";
  if (rank === 3) return "Bishop";
  if (rank === 2) return "Knight";
  if (rank === 1) return "Pawn";
  return String(rank);
}

function canStep(rank: Rank) {
  return rank !== "A" && rank !== "B";
}

function rankPiece(rank: Rank): PieceSymbol {
  if (rank === "A" || (typeof rank === "number" && rank >= 8)) return "k";
  if (rank === "B" || rank === 1) return "p";
  if (rank === 5 || rank === 6 || rank === 7) return "q";
  if (rank === 4) return "r";
  if (rank === 3) return "b";
  return "n";
}

export function Strategy({ versus }: { versus: string }) {
  const [board, setBoard] = useState<SBoard>(() => blank(10, 10) as SBoard);
  const [bag, setBag] = useState(() => BAG.map((p, i) => ({ ...p, i })));
  const [pick, setPick] = useState(0);
  const [phase, setPhase] = useState<"place" | "play" | "over">("place");
  const [turn, setTurn] = useState<Side>("w");
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [banner, setBanner] = useState("");
  const [setupName, setSetupName] = useState("My setup");
  const [setups, setSetups] = useState<{ name: string; cells: { r: number; f: number; rank: Rank }[] }[]>([]);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("morse-strategy-setups") || "[]");
      if (Array.isArray(raw)) setSetups(raw);
    } catch {
      /* ignore */
    }
  }, []);

  function saveSetup() {
    const cells: { r: number; f: number; rank: Rank }[] = [];
    for (let r = 0; r < 4; r++) for (let f = 0; f < 10; f++) {
      const u = board[r][f];
      if (u?.side === "w") cells.push({ r, f, rank: u.rank });
    }
    if (!cells.length) return;
    const next = [{ name: setupName.trim() || "My setup", cells }, ...setups].slice(0, 8);
    setSetups(next);
    localStorage.setItem("morse-strategy-setups", JSON.stringify(next));
  }

  function loadSetup(cells: { r: number; f: number; rank: Rank }[]) {
    if (phase !== "place") return;
    const next = blank(10, 10) as SBoard;
    const used = new Set<number>();
    for (const c of cells) {
      if (c.r > 3) continue;
      next[c.r][c.f] = { side: "w", rank: c.rank, seen: true };
      const idx = BAG.findIndex((p, i) => p.rank === c.rank && !used.has(i));
      if (idx >= 0) used.add(idx);
    }
    setBoard(next);
    setBag(BAG.map((p, i) => ({ ...p, i })).filter((p) => !used.has(p.i)));
    setPick(0);
  }

  function begin(placed: SBoard) {
    const next = cloneBoard(placed) as SBoard;
    const pool = [...BAG];
    const spots: [number, number][] = [];
    for (let r = 6; r < 10; r++) for (let f = 0; f < 10; f++) spots.push([r, f]);
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    pool.forEach((p, i) => {
      const [r, f] = spots[i];
      next[r][f] = { side: "b", rank: p.rank, seen: false };
    });
    setBoard(next);
    setPhase("play");
    setTurn("w");
    setBanner("");
  }

  function onPlace(r: number, f: number) {
    const have = bag[pick];
    if (!have || r > 3) return;
    const next = cloneBoard(board) as SBoard;
    if (next[r][f]) {
      setBag((cur) => [...cur, { rank: next[r][f]!.rank, name: rankLabel(next[r][f]!.rank), i: Math.random() }]);
      next[r][f] = null;
      setBoard(next);
      return;
    }
    next[r][f] = { side: "w", rank: have.rank, seen: true };
    const rest = bag.filter((_, i) => i !== pick);
    setBoard(next);
    setBag(rest);
    setPick(0);
    if (!rest.length) begin(next);
  }

  function neighbors(r: number, f: number): [number, number][] {
    return [[r - 1, f], [r + 1, f], [r, f - 1], [r, f + 1]].filter(([rr, ff]) => onBoard(rr, ff, 10, 10)) as [number, number][];
  }

  function fight(att: SUnit, def: SUnit): "take" | "die" | "both" | "flag" {
    if (def.rank === "A") return "flag";
    if (att.rank === "B" || att.rank === "A") return "die";
    if (def.rank === "B") return att.rank === 3 ? "take" : "die";
    if (att.rank === def.rank) return "both";
    return att.rank > def.rank ? "take" : "die";
  }

  function apply(live: SBoard, from: [number, number], to: [number, number], side: Side) {
    const next = cloneBoard(live) as SBoard;
    const att = next[from[0]][from[1]];
    if (!att) return;
    const def = next[to[0]][to[1]];
    next[from[0]][from[1]] = null;
    if (!def) {
      next[to[0]][to[1]] = att;
    } else {
      const result = fight(att, def);
      const shownA = { ...att, seen: true };
      const shownD = { ...def, seen: true };
      if (result === "flag") {
        next[to[0]][to[1]] = shownA;
        setBoard(next);
        setPhase("over");
        setBanner(side === "w" ? "You found the apple." : `${versus} found your apple.`);
        return;
      }
      if (result === "take") next[to[0]][to[1]] = shownA;
      else if (result === "die") next[to[0]][to[1]] = shownD;
      else next[to[0]][to[1]] = null;
    }
    const apples = { w: false, b: false };
    for (const row of next) for (const c of row) if (c?.rank === "A") apples[c.side] = true;
    if (!apples.w || !apples.b) {
      setBoard(next);
      setPhase("over");
      setBanner(!apples.b ? "You found the apple." : `${versus} found your apple.`);
      return;
    }
    setBoard(next);
    setSel(null);
    const nxt = other(side);
    setTurn(nxt);
    if (nxt === "b") window.setTimeout(() => botStep(next), 400);
  }

  function botStep(live: SBoard) {
    const acts: { from: [number, number]; to: [number, number]; rank: number }[] = [];
    for (let r = 0; r < 10; r++) {
      for (let f = 0; f < 10; f++) {
        const u = live[r][f];
        if (u?.side !== "b" || !canStep(u.rank)) continue;
        for (const to of neighbors(r, f)) {
          const t = live[to[0]][to[1]];
          if (t?.side === "b") continue;
          let rank = typeof u.rank === "number" ? 1 : 0;
          if (t) rank += 4;
          acts.push({ from: [r, f], to, rank });
        }
      }
    }
    if (!acts.length) {
      setPhase("over");
      setBanner("No moves left. Tie.");
      return;
    }
    acts.sort((a, b) => b.rank - a.rank);
    const pickAct = acts[Math.floor(Math.random() * Math.min(4, acts.length))];
    apply(live, pickAct.from, pickAct.to, "b");
  }

  function onSquare(r: number, f: number) {
    if (phase === "over") return;
    if (phase === "place") {
      onPlace(r, f);
      return;
    }
    if (turn !== "w") return;
    const u = board[r][f];
    if (u?.side === "w") {
      setSel(canStep(u.rank) ? [r, f] : null);
      return;
    }
    if (!sel) return;
    if (!neighbors(sel[0], sel[1]).some(([rr, ff]) => rr === r && ff === f)) return;
    apply(board, sel, [r, f], "w");
  }

  return (
    <Shell title="Morse Strategy" note={versus}>
      <Grid
        rows={10}
        cols={10}
        onPick={onSquare}
        units={board.flatMap((row, r) =>
          row.flatMap((u, f) =>
            u
              ? [{
                  r,
                  f,
                  side: u.side,
                  kind: rankPiece(u.rank),
                  label: u.rank === "A" ? "A" : u.rank === "B" ? "B" : String(u.rank),
                  hidden: u.side === "b" && !u.seen,
                }]
              : [],
          ),
        )}
        paint={(r, f) => {
          const u = board[r][f];
          const mine = u?.side === "w";
          const hidden = u && !mine && !u.seen;
          const marked = sel && (neighbors(sel[0], sel[1]).some(([rr, ff]) => rr === r && ff === f) || (sel[0] === r && sel[1] === f));
          const light = (r + f) % 2 === 0;
          return {
            bg: marked ? "#e6c56a" : light ? "#cbb892" : "#8c6a45",
            fg: hidden ? "#111" : mine ? "#1a140f" : "#f4e7cb",
            text: hidden ? "♟" : u ? (u.rank === "A" ? "🍎" : u.rank === "B" ? "✸" : String(u.rank)) : "",
          };
        }}
      />
      <aside className="w-full max-w-sm space-y-3 rounded-xl border border-[#3a3024] bg-[#1b1612] p-4">
        <p className="text-sm">{banner || (phase === "place" ? "Place every piece on your side. Bishop (3) defuses bombs. Find the apple." : turn === "w" ? "Your move. One square, no diagonals." : `${versus} is moving.`)}</p>
        {phase === "place" ? (
          <div className="grid max-h-64 grid-cols-2 gap-2 overflow-auto">
            {bag.map((p, i) => (
              <button key={`${p.name}-${p.i}`} type="button" onClick={() => setPick(i)} className={"rounded-md border px-2 py-2 text-left text-sm " + (i === pick ? "border-[#e6c56a] text-[#f0d68a]" : "border-[#3a3024]")}>
                {p.name}
              </button>
            ))}
          </div>
        ) : null}
        {phase === "place" ? (
          <div className="space-y-2">
            <input value={setupName} onChange={(e) => setSetupName(e.target.value)} className="w-full rounded-md border border-[#3a3024] bg-black/30 px-2 py-2 text-sm" placeholder="Setup name" />
            <button type="button" onClick={saveSetup} className="rounded-md border border-[#d6ad4f] px-3 py-2 text-xs uppercase tracking-[0.14em]">Save setup</button>
            {setups.map((s) => (
              <button key={s.name} type="button" onClick={() => loadSetup(s.cells)} className="block text-left text-sm text-[#e6c56a]">{s.name}</button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#b7a88c]">Enemy pieces stay black until they fight. Higher rank takes lower. Equals both fall. Bombs stay put and kill, unless a bishop defuses one. The apple is the king — take it to win.</p>
        )}
      </aside>
    </Shell>
  );
}

export function VariantPlay({ mode, versus }: { mode: "checkmate" | "football" | "strategy"; versus: string }) {
  const [look, setLook] = useState<Look>(() => {
    try {
      const saved = localStorage.getItem("morse-board-view");
      if (saved === "2d" || saved === "3d" || saved === "an" || saved === "lg") return saved;
    } catch {
      /* ignore */
    }
    return "3d";
  });
  const [boardId, setBoardId] = useState("lodge");
  useEffect(() => {
    void getHomeState()
      .then((home) => {
        if (home?.profile?.equippedBoard) setBoardId(home.profile.equippedBoard);
      })
      .catch(() => undefined);
  }, []);
  const skin = boardById(boardId);
  const sky: Sky = look === "lg" ? "lego" : look === "an" && mode === "football" ? "arena" : "table";
  function choose(next: Look) {
    setLook(next);
    try {
      localStorage.setItem("morse-board-view", next);
    } catch {
      /* ignore */
    }
    void setPieceStyle({ data: { style: next } }).catch(() => undefined);
  }
  const game = mode === "football" ? <Football versus={versus} /> : mode === "strategy" ? <Strategy versus={versus} /> : <CheckMate versus={versus} />;
  return (
    <LookCtx.Provider value={{ look, sky, light: skin.lightSq, dark: skin.darkSq, setLook: choose }}>
      {game}
    </LookCtx.Provider>
  );
}
