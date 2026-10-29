import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { PieceSymbol } from "chess.js";
import { ImagePlus } from "lucide-react";
import { ClubBrand } from "@/components/club-brand";
import { NamePlate } from "@/components/avatar/name-plate";
import { getHomeState } from "@/lib/server/mores";
import { setPieceStyle } from "@/lib/server/avatar";
import { boardById } from "@/lib/chess/board-skins";
import { roomBackdrop, useLookPrefs } from "@/lib/chess/look-prefs";
import { cn } from "@/lib/utils";
import { VariantStage, type FieldOpts, type HomeTeam, type Look, type MoveCue, type Sky, type StadiumShow, type StageUnit } from "@/components/variants/stage";
import {
  footballSync,
  getFootballPrefs,
  resignFootball,
  saveFootballTeam,
  sendFootballMove,
  type FootballMatchAction,
  type FootballMatchBoard,
  type FootballMatchCue,
  type FootballMatchEvent,
  type FootballMatchView,
  type FootballPrefs,
  type FootballTeam,
} from "@/lib/server/football";
import { DEFAULT_TEAM, TeamSetup, awayColor, inkOn } from "@/components/variants/team-setup";
import { CrowdAudio, crowdMuted } from "@/lib/crowd-audio";
import { playScoreSound, preloadScoreSound, scoreSoundAllowed } from "@/lib/score-sound";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { FLIGHT, JUMPS, JUMP_WINDOW, fieldSpot } from "@/components/variants/field-units";

type Side = "w" | "b";
type Kind = "k" | "q" | "r" | "b" | "n" | "p";
type Unit = { side: Side; kind: Kind };
type Board = (Unit | null)[][];
type Step = { from: [number, number]; to: [number, number] };

const GLYPH: Record<Kind, string> = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" };
const SETUP: Kind[] = ["k", "r", "b", "b", "n", "n", "p"];

const LookCtx = createContext<{ look: Look; sky: Sky; light: string; dark: string; modes: Look[]; setLook: (next: Look) => void }>({
  look: "3d",
  sky: "table",
  light: "#e7d3a8",
  dark: "#b58863",
  modes: ["2d", "3d", "an", "lg"],
  setLook: () => undefined,
});

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
  status,
  clock = null,
  opp,
  hot = false,
  rail,
  leave = "Lounge",
  onLeave,
  verdict = null,
  children,
}: {
  title: string;
  status: string;
  clock?: string | null;
  opp: string;
  hot?: boolean;
  rail?: ReactNode;
  leave?: string;
  /** instead of just going to the lounge (an online game asks first and resigns) */
  onLeave?: () => void;
  verdict?: "victory" | "defeat" | null;
  children: ReactNode;
}) {
  const { look, modes, setLook } = useContext(LookCtx);
  const prefs = useLookPrefs();
  const [wash, setWash] = useState<"dark" | "light" | "color">("dark");
  const [chatOpen, setChatOpen] = useState(false);
  const [lines, setLines] = useState<{ id: number; from: string; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [camera, setCamera] = useState(false);
  const [sheet, setSheet] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const room = wash === "light" ? "#f6f1e4" : wash === "color" ? (prefs.roomColor ?? "#0c0d0b") : "#0c0d0b";
  const roomImage = wash === "color" ? prefs.roomImage : null;

  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let live = true;
    void navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: false })
      .then((next) => {
        if (!live) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        if (video.current) video.current.srcObject = next;
      })
      .catch(() => setCamera(false));
    return () => {
      live = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [camera]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [lines.length, chatOpen]);

  return (
    <main
      className="relative flex h-dvh max-h-dvh flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      style={roomBackdrop(room, roomImage)}
    >
      <header data-coin-bar className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">
        <ClubBrand to="/" tone={wash === "light" ? "dark" : "light"} />
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <span className="hidden text-[15px] text-mist md:inline">
            {title}
            {" · "}
            {status}
          </span>
          <div className="flex overflow-hidden rounded-full border border-line bg-panel">
            {modes.map((id) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "min-h-11 min-w-11 px-4 py-2 text-sm font-medium uppercase sm:px-3 sm:py-1.5 sm:text-[13px]",
                  look === id ? "bg-ivory text-ink" : "text-mist hover:text-ivory",
                )}
                onClick={() => setLook(id)}
              >
                {id}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-full border border-line bg-panel">
            <button type="button" className={cn("min-h-11 px-3 text-sm font-medium", wash === "dark" ? "bg-ivory text-ink" : "text-mist hover:text-ivory")} onClick={() => setWash("dark")}>Dark</button>
            <button type="button" className={cn("min-h-11 px-3 text-sm font-medium", wash === "light" ? "bg-ivory text-ink" : "text-mist hover:text-ivory")} onClick={() => setWash("light")}>Light</button>
          </div>
          <button
            type="button"
            aria-label="Board color"
            className={cn("size-11 rounded-full border", wash === "color" ? "border-gold-line ring-2 ring-gold-line/50" : "border-line")}
            style={{ backgroundColor: prefs.roomColor ?? "#0c0d0b" }}
            onClick={() => setWash("color")}
          />
          {onLeave ? (
            <button type="button" data-leave-game onClick={onLeave} className="inline-flex min-h-11 items-center rounded-full border border-line bg-panel px-4 text-sm font-medium text-ivory hover:border-line-strong">
              {leave}
            </button>
          ) : (
            <Link to="/" className="inline-flex min-h-11 items-center rounded-full border border-line bg-panel px-4 text-sm font-medium text-ivory hover:border-line-strong">
              {leave}
            </Link>
          )}
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">{children}</div>
        {verdict && sheet ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/45">
            <div className="relative px-10">
              <button type="button" aria-label="Close" className="absolute -right-2 -top-8 text-2xl text-ivory" onClick={() => setSheet(false)}>
                ×
              </button>
              <p className="font-display text-6xl uppercase tracking-[0.12em] text-ivory sm:text-7xl">
                {verdict === "victory" ? "Victory" : "Defeat"}
              </p>
            </div>
          </div>
        ) : null}
        {rail ? (
          <aside className="absolute inset-x-0 bottom-0 z-20 flex max-h-[48%] flex-col overflow-y-auto border-t border-line bg-ink/95 backdrop-blur-md sm:inset-y-0 sm:left-0 sm:right-auto sm:max-h-none sm:w-[min(100%,20rem)] sm:border-r sm:border-t-0">
            {rail}
          </aside>
        ) : null}
        {camera ? (
          <div className="absolute left-1/2 top-3 z-20 w-32 -translate-x-1/2">
            <p className="mb-1 text-center text-[10px] uppercase tracking-[0.16em] text-ivory">Real life</p>
            <video ref={video} autoPlay playsInline muted className="aspect-[3/4] w-full rounded-xl border border-white/25 bg-black object-cover shadow-xl" />
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex justify-between gap-2 sm:inset-x-4 sm:bottom-4">
          <div className={rail ? "sm:pl-[21rem]" : ""}>
            <NamePlate label="Opponent" name={opp} clock={clock} hot={!hot} />
          </div>
          <NamePlate label="You" name="You" align="right" clock={clock} hot={hot} />
        </div>
        {chatOpen ? (
          <aside className="absolute inset-x-0 bottom-0 z-20 flex max-h-[48%] flex-col border-t border-line bg-ink/95 backdrop-blur-md sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(100%,20rem)] sm:border-l sm:border-t-0">
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-mist">Table chat</p>
              <div className="flex gap-2">
                <button type="button" className="min-h-11 rounded-full border border-line px-3 text-sm text-ivory" onClick={() => setCamera((on) => !on)}>
                  {camera ? "Camera off" : "Real life"}
                </button>
                <button type="button" className="min-h-11 rounded-full border border-line px-3 text-sm text-ivory" onClick={() => setChatOpen(false)}>
                  Put away
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {lines.length === 0 ? <p className="text-[13px] text-mist">Say something. It stays on this table.</p> : null}
              {lines.map((line) => (
                <div key={line.id} className="rounded-lg bg-panel px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-mist">{line.from}</p>
                  <p className="mt-0.5 text-[15px] text-ivory">{line.text}</p>
                </div>
              ))}
              <div ref={chatEnd} />
            </div>
            <form
              className="flex items-center gap-2 border-t border-line p-2"
              onSubmit={(e) => {
                e.preventDefault();
                const text = draft.trim();
                if (!text) return;
                setLines((list) => [...list, { id: Date.now(), from: "You", text }]);
                setDraft("");
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message…"
                maxLength={280}
                className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-3 text-base text-ivory outline-none placeholder:text-mist focus:border-gold-line"
              />
              <button type="submit" aria-label="Send" className="inline-flex size-11 items-center justify-center rounded-lg border border-line text-ivory">
                <ImagePlus className="size-4" />
              </button>
            </form>
          </aside>
        ) : (
          <div className="absolute right-3 top-[42%] z-10 flex -translate-y-1/2 flex-col items-end gap-2">
            <button type="button" className="min-h-11 rounded-full border border-line bg-ink/80 px-4 py-2 text-sm text-ivory backdrop-blur-sm hover:border-line-strong" onClick={() => setChatOpen(true)}>
              Chat
            </button>
            <button type="button" className="min-h-11 rounded-full border border-line bg-ink/80 px-4 py-2 text-sm text-ivory backdrop-blur-sm hover:border-line-strong" onClick={() => setCamera((on) => !on)}>
              {camera ? "Camera off" : "Real life"}
            </button>
          </div>
        )}
      </div>
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
  cue = null,
  stadium = false,
  sel = null,
  show = null,
  onReady,
  field = null,
  home = null,
  park = false,
}: {
  onReady?: () => void;
  field?: FieldOpts | null;
  home?: HomeTeam | null;
  park?: boolean;
  rows: number;
  cols: number;
  paint: (r: number, f: number) => { bg: string; fg: string; text: string };
  onPick: (r: number, f: number) => void;
  units: StageUnit[];
  ball?: { r: number; f: number } | null;
  cue?: MoveCue | null;
  stadium?: boolean;
  sel?: { r: number; f: number; throwing: boolean } | null;
  show?: StadiumShow | null;
}) {
  const { look, sky, light, dark } = useContext(LookCtx);
  const plain = new Set(["#e7d3a8", "#b58863", "#cbb892", "#8c6a45"]);
  const painted = (r: number, f: number) => {
    const p = paint(r, f);
    if (!plain.has(p.bg)) return p;
    return { ...p, bg: (r + f) % 2 === 0 ? light : dark };
  };
  if (look === "2d") {
    onReady && queueMicrotask(onReady);
    const cells = [];
    for (let r = rows - 1; r >= 0; r--) {
      for (let f = 0; f < cols; f++) {
        const p = painted(r, f);
        const dot = stadium && p.bg === "#e6c56a";
        if (stadium && !p.text && !dot) {
          cells.push(<button key={`${r}:${f}`} type="button" className="relative min-h-0" onClick={() => onPick(r, f)} />);
          continue;
        }
        cells.push(
          <button
            key={`${r}:${f}`}
            type="button"
            onClick={() => onPick(r, f)}
            className="relative grid min-h-0 place-items-center [container-type:size]"
            style={{ background: stadium ? "transparent" : p.bg }}
          >
            {dot ? <span className="pointer-events-none size-[28%] rounded-full bg-[#f4e7b2] shadow-[0_0_12px_rgba(244,231,178,0.9)]" /> : null}
            {p.text ? (
              <span
                className="pointer-events-none select-none font-display leading-none"
                style={{
                  fontSize: "78cqmin",
                  color: p.fg,
                  WebkitTextStroke: "1.5px rgba(20,12,8,0.85)",
                  textShadow: "0 6px 12px rgba(0,0,0,0.35)",
                }}
              >
                {p.text}
              </span>
            ) : null}
          </button>,
        );
      }
    }
    return (
      <div className="grid h-full w-full place-items-center p-3 sm:p-6">
        <div
          className="h-full max-h-full max-w-full overflow-hidden rounded-xl border border-[#3a2a1c] shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
          style={{ aspectRatio: `${cols} / ${rows}`, background: stadium ? "#1a2430" : undefined }}
        >
          <div className="grid h-full w-full" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gridTemplateRows: `repeat(${rows},minmax(0,1fr))` }}>
            {cells}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="h-full w-full">
      <VariantStage rows={rows} cols={cols} onPick={onPick} units={units} look={look} sky={sky} ball={ball} cue={cue} stadium={stadium} paint={painted} sel={sel} show={show} onReady={onReady} field={field} home={home} park={park} />
    </div>
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
  const [cue, setCue] = useState<MoveCue | null>(null);

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
    const mover = live[step.from[0]][step.from[1]];
    const victim = live[step.to[0]][step.to[1]];
    if (mover) {
      setCue({
        id: Date.now(),
        from: step.from,
        to: step.to,
        capture: Boolean(victim),
        thrown: false,
        side: "b",
        kind: mover.kind,
        victim: victim?.kind,
        victimSide: victim?.side,
      });
    }
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
    const mover = board[step.from[0]][step.from[1]];
    const victim = board[step.to[0]][step.to[1]];
    if (mover) {
      setCue({
        id: Date.now(),
        from: step.from,
        to: step.to,
        capture: Boolean(victim),
        thrown: false,
        side: mover.side,
        kind: mover.kind,
        victim: victim?.kind,
        victimSide: victim?.side,
      });
    }
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
    <Shell
      title="Check Mate"
      opp={versus}
      leave="Return to lounge"
      verdict={banner.startsWith("You checkmated") ? "victory" : banner.includes("your last king") ? "defeat" : null}
      hot={phase !== "play" || turn === "w"}
      status={phase === "play" ? (turn === "w" ? "Your move" : `${versus} is moving`) : phase === "place" ? "Place your pieces" : "Board closed"}
      rail={
        <div className="space-y-3 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-mist">Check Mate</p>
          <p className="text-sm text-ivory">{banner || note}</p>
          {phase === "place" && placing ? (
            <p className="font-display text-4xl text-ivory">
              {GLYPH[placing]} <span className="text-base text-mist">{queue.length} left</span>
            </p>
          ) : null}
          <p className="text-xs uppercase tracking-[0.16em] text-mist">
            {phase === "play" ? (turn === "w" ? "Your move" : `${versus} is moving`) : phase === "place" ? "Your half only" : "Game over"}
          </p>
          <p className="text-sm leading-relaxed text-mist">
            Black bands crown any piece that steps on them. When both sides have a new king the band grows, then turns red from the edges until two squares remain.
          </p>
        </div>
      }
    >
      <Grid
        rows={8}
        cols={8}
        onPick={onSquare}
        units={board.flatMap((row, r) => row.flatMap((u, f) => (u ? [{ r, f, side: u.side, kind: u.kind }] : [])))}
        cue={cue}
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
    </Shell>
  );
}

/* ── Football ───────────────────────────────────────────────── */

type FUnit = Unit & { ball?: boolean; held?: number; id?: string };
type FBoard = (FUnit | null)[][];

const F_ROWS = 14;
const F_COLS = 8;
const FILES = "abcdefgh";
const KIND_NAME: Record<Kind, string> = { k: "King", q: "Queen", r: "Rook", b: "Bishop", n: "Knight", p: "Pawn" };
const GAME_SECONDS = 10 * 60;
/** Owner (v4): every 5 s you wait, the other team gets one extra move. You can still move. */
const SHOT_CLOCK_MS = 5000;

/** Owner (t238u): each team on its own side, like a chess board; the team with the ball has it in its king's hands. */
function footballStart(holder: Side = "w"): { board: FBoard; loose: [number, number] | null } {
  const board = blank(F_ROWS, F_COLS) as FBoard;
  const back: Kind[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  for (let f = 0; f < 8; f++) {
    board[2][f] = { side: "w", kind: back[f], id: `${FILES[f]}1` };
    board[3][f] = { side: "w", kind: "p", id: `${FILES[f]}2` };
    board[10][f] = { side: "b", kind: "p", id: `${FILES[f]}7` };
    board[11][f] = { side: "b", kind: back[f], id: `${FILES[f]}8` };
  }
  const kr = holder === "w" ? 2 : 11;
  board[kr][4] = { ...board[kr][4]!, ball: true, held: 0 };
  return { board, loose: null };
}

/**
 * Owner (t238u): the ball carrier was tackled without a fumble on row `row` (or the king put the ball down there).
 * `off` keeps the ball. The players still in the game slide together, keeping their shape: the offense so its
 * front man stands on that yard line, the defense back so it is just past it. Then the king takes the ball
 * (only he may throw it forward). Same as FootballMatch::shift on the server.
 */
function shiftBoard(b: FBoard, row: number, off: Side): FBoard {
  const y = (r: number) => (off === "w" ? r : F_ROWS - 1 - r);
  const rowOf = (yy: number) => (off === "w" ? yy : F_ROWS - 1 - yy);
  const line = Math.max(1, Math.min(F_ROWS - 3, y(row)));
  type E = { u: FUnit; y: number; f: number };
  const mine: E[] = [];
  const theirs: E[] = [];
  b.forEach((cells, r) =>
    cells.forEach((u, f) => {
      if (!u) return;
      const e = { u: { ...u, ball: false, held: 0 }, y: y(r), f };
      (u.side === off ? mine : theirs).push(e);
    }),
  );
  // the men at or behind the line move up so the front one is on it; anyone already past it comes back to it
  const behind = mine.map((e) => e.y).filter((v) => v <= line);
  const dOff = behind.length ? line - Math.max(...behind) : 0;
  const dDef = theirs.length ? Math.max(0, line + 1 - Math.min(...theirs.map((e) => e.y))) : 0;
  mine.sort((p, q) => q.y - p.y || p.f - q.f);
  theirs.sort((p, q) => p.y - q.y || p.f - q.f);
  const out = blank(F_ROWS, F_COLS) as FBoard;
  const place = (e: E, target: number, lo: number, hi: number) => {
    const ty = Math.max(lo, Math.min(hi, target));
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const [a, z] of [[lo, hi], [0, F_ROWS - 1]]) {
      for (let yy = a; yy <= z; yy++) {
        const r = rowOf(yy);
        for (let ff = 0; ff < F_COLS; ff++) {
          const d = Math.abs(yy - ty) + Math.abs(ff - e.f) * 1.1;
          if (!out[r][ff] && d < bestD) {
            bestD = d;
            best = [r, ff];
          }
        }
      }
      if (best) break;
    }
    if (best) out[best[0]][best[1]] = e.u;
  };
  for (const e of mine) place(e, e.y + dOff, 0, line);
  for (const e of theirs) place(e, e.y + dDef, line + 1, F_ROWS - 1);
  let at: [number, number] | null = null;
  out.forEach((cells, r) => cells.forEach((u, f) => {
    if (u && u.side === off && (!at || u.kind === "k")) at = [r, f];
  }));
  if (at) out[at[0]][at[1]] = { ...out[at[0]][at[1]]!, ball: true, held: 0 };
  return out;
}

/** Field goal odds in % (owner t238u): the king may kick from anywhere; 95% next to the end zone, 5% from his own end.
 *  Same numbers as FootballMatch::FG on the server. */
const FG_NEAR = 95;
const FG_FAR = 5;
const FG_SPAN = 12;
function fgOdds(side: Side, r: number) {
  const d = Math.max(1, Math.min(FG_SPAN, side === "w" ? 12 - r : r - 1));
  return Math.round(FG_NEAR - ((d - 1) * (FG_NEAR - FG_FAR)) / (FG_SPAN - 1));
}

function findBall(b: FBoard): { r: number; f: number; u: FUnit } | null {
  for (let r = 0; r < F_ROWS; r++) for (let f = 0; f < F_COLS; f++) if (b[r][f]?.ball) return { r, f, u: b[r][f]! };
  return null;
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

/**
 * Turnover risk (owner t237u), the same numbers as FootballMatch.php: a base plus the chess value of the
 * defenders within 2 squares (full weight next to the spot, less 2 away), capped at 50%. Nobody near = 0%.
 */
const FB_VALUE: Record<Kind, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FB_RISK = {
  run: { base: 2, near: 1.5, far: 0.5 },
  tackle: { base: 10, near: 3, far: 1.5 },
  pass: { base: 3, near: 3, far: 1.5 },
} as const;
const FB_RISK_CAP = 50;
/** a jump (SPACE / right-click) under a pass adds this to the steal chance */
const FB_JUMP_BONUS = 40;
const FB_JUMP_CAP = 85;

function fbDefenders(b: FBoard, at: [number, number], def: Side) {
  const out: { r: number; f: number; id: string; kind: Kind; d: number }[] = [];
  for (let r = Math.max(0, at[0] - 2); r <= Math.min(F_ROWS - 1, at[0] + 2); r++)
    for (let f = Math.max(0, at[1] - 2); f <= Math.min(F_COLS - 1, at[1] + 2); f++) {
      const u = b[r]?.[f];
      if (u && u.side === def && u.id) out.push({ r, f, id: u.id, kind: u.kind, d: Math.max(Math.abs(r - at[0]), Math.abs(f - at[1])) });
    }
  return out.sort((x, y) => FB_VALUE[y.kind] - FB_VALUE[x.kind] || x.d - y.d);
}

function fbRisk(b: FBoard, at: [number, number], def: Side, kind: keyof typeof FB_RISK) {
  const k = FB_RISK[kind];
  let sum = 0;
  for (const d of fbDefenders(b, at, def)) sum += FB_VALUE[d.kind] * (d.d <= 1 ? k.near : k.far);
  return sum <= 0 ? 0 : Math.min(FB_RISK_CAP, Math.round(k.base + sum));
}

/** the tackle risk once the tackler stands on the carrier's square */
function fbTackleRisk(b: FBoard, from: [number, number], to: [number, number]) {
  const t = b[from[0]][from[1]];
  if (!t) return 0;
  const after = cloneBoard(b) as FBoard;
  after[from[0]][from[1]] = null;
  after[to[0]][to[1]] = t;
  return fbRisk(after, to, t.side, "tackle");
}

function throwRange(kind: Kind) {
  if (kind === "q" || kind === "k") return 99; // the king throws to any of his players (owner t237u)
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
      // owner t238u: only the king throws forward; everyone else throws back (or sideways)
      if (u.kind !== "k" && (u.side === "w" ? rr > r : rr < r)) continue;
      const dist = Math.max(Math.abs(rr - r), Math.abs(ff - f));
      if (u.kind === "q" || u.kind === "k" || dist <= reach) out.push([rr, ff]);
    }
  }
  return out;
}

function inEnd(side: Side, r: number) {
  return side === "w" ? r >= 12 : r <= 1;
}

type FFrame = { board: FBoard; loose: [number, number] | null; cue: MoveCue | null; at?: number };
type Phase = "count" | "play" | "celebrate" | "replay" | "kick";
type Banner = { side: Side; text: string; small?: boolean };
const F_WORLD = (r: number, f: number): [number, number] => [f - (F_COLS - 1) / 2, (F_ROWS - 1) / 2 - r];
/** replay: up to 10 s of play, real speed; long thinking pauses are trimmed to this */
const REPLAY_SPAN = 10000;
const REPLAY_GAP = 1500;

function TeamBox({ name, color, n, side }: { name: string; color: string; n: number; side: Side }) {
  return (
    <div className="flex w-[4.2rem] flex-col items-center sm:w-24" data-fb-team={side}>
      <div
        className="grid h-12 w-full place-items-center rounded-xl border border-white/25 text-[2rem] font-black leading-none tabular-nums shadow-[0_6px_22px_rgba(0,0,0,0.45)] sm:h-16 sm:text-5xl"
        style={{ backgroundColor: color, color: inkOn(color) }}
      >
        {n}
      </div>
      <span className="mt-1 max-w-full truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white [text-shadow:0_1px_4px_#000] sm:text-xs">{name}</span>
    </div>
  );
}

function Scoreboard({ home, away, score, clock, shot }: { home: FootballTeam; away: FootballTeam; score: { w: number; b: number }; clock: string; shot: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-2" data-fb-board>
      <div className="flex items-start gap-1.5 sm:gap-3">
        <TeamBox side="w" name={home.name} color={home.color} n={score.w} />
        <div className="flex min-w-[8.5rem] flex-col items-center rounded-xl border border-white/20 bg-black/75 px-3 pb-1.5 pt-1 shadow-[0_6px_22px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:min-w-[13rem] sm:px-5">
          <span className="font-mono text-[2.1rem] font-black leading-none tabular-nums text-white sm:text-6xl">{clock}</span>
          <span className="mt-1 max-w-[11rem] truncate text-[10px] font-bold uppercase tracking-[0.14em] text-white/90 sm:max-w-[16rem] sm:text-sm">
            <span style={{ color: home.color }}>{home.name}</span> <span className="text-[#ffe14a]">VS</span> <span style={{ color: away.color }}>{away.name}</span>
          </span>
          {shot !== null ? (
            <span className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/15" data-fb-shot>
              <span key={shot} className="block h-full rounded-full bg-[#ffe14a]" style={{ animation: `fbShot ${SHOT_CLOCK_MS}ms linear forwards` }} />
            </span>
          ) : null}
        </div>
        <TeamBox side="b" name={away.name} color={away.color} n={score.b} />
      </div>
      <style>{"@keyframes fbShot{from{width:100%}to{width:0%}}"}</style>
    </div>
  );
}

/* ── Football vs a player (owner t234u): the server keeps the game, this screen shows it ── */

/** The rules, shown under the "Rules" button (owner t235u–t238u). */
const FOOTBALL_RULES = [
  "Each team starts on its own side with the ball in its king's hands. Carry it into the other end zone for a touchdown (6 points).",
  "Pick a player and move him like his chess piece. Players stay where they are after every move. There are no downs.",
  "Passing: the king can throw to any of his players, forward too. Everyone else can only throw backward or sideways.",
  "Land on an enemy player to tackle him. He is out until the next touchdown or turnover, and the tackler stays on that square.",
  "Tackle the player with the ball and he might fumble. Fumble = turnover: the tacklers get the ball. No fumble = his team keeps it: both teams slide to that yard line, the defense just past it, and the king gets the ball.",
  "Every run and every pass is a risk: the more (and the stronger) enemy players are near, the bigger the chance of a fumble or an interception. A queen is scarier than a pawn! The risk is shown before you move.",
  "Throw to a teammate who is already in the end zone: touchdown! Unless a defender is near him, then it can be intercepted.",
  "Jump with SPACE or a right-click while an enemy pass flies over one of your players: it makes an interception much more likely.",
  "The king can kick a field goal (3 points) from anywhere. The closer he is, the better the chance (shown on the button). Make it or miss it, the other team gets the ball.",
  "After a touchdown, a field goal or a turnover (a fumble or an interception), everyone on both teams comes back.",
  "Kings cannot be tackled. A king who holds the ball for 3 moves puts it down: both teams line up at his yard line and he gets it back.",
  "Take more than 5 seconds and the other team sneaks in one bonus move. The game lasts 10 minutes.",
];

const RANK_FLIP: Record<string, string> = { "1": "8", "2": "7", "7": "2", "8": "1" };
/** The away player sees the field from his own end: rows flipped and teams swapped, so on screen "me" is always w. */
function flipUnitId(id: string | undefined): string | undefined {
  return id && id.length === 2 ? id[0] + (RANK_FLIP[id[1]] ?? id[1]) : id;
}
function mSq(sq: [number, number], flip: boolean): [number, number] {
  return flip ? [F_ROWS - 1 - sq[0], sq[1]] : [sq[0], sq[1]];
}
function mSide(side: Side, flip: boolean): Side {
  return flip ? other(side) : side;
}
function mBoard(b: FootballMatchBoard, flip: boolean): FBoard {
  const out = blank(F_ROWS, F_COLS) as FBoard;
  for (let r = 0; r < F_ROWS; r++)
    for (let f = 0; f < F_COLS; f++) {
      const u = b[r]?.[f];
      if (!u) continue;
      const [rr, ff] = mSq([r, f], flip);
      out[rr][ff] = { side: mSide(u.side, flip), kind: u.kind, id: flip ? flipUnitId(u.id) : u.id, ball: Boolean(u.ball), held: u.held ?? 0 };
    }
  return out;
}
function mCue(c: FootballMatchCue, flip: boolean, id: number): MoveCue {
  return {
    id,
    unit: flip ? flipUnitId(c.unit) : c.unit,
    from: mSq(c.from, flip),
    to: mSq(c.to, flip),
    capture: Boolean(c.capture),
    thrown: Boolean(c.thrown),
    goal: c.goal || undefined,
    miss: c.miss || undefined,
    side: mSide(c.side, flip),
    kind: c.kind,
    victim: c.victim ?? undefined,
    victimSide: c.victimSide ? mSide(c.victimSide, flip) : undefined,
  };
}

export function Football({ versus, online }: { versus: string; online?: string }) {
  const start = useMemo(() => footballStart(), []);
  const [board, setBoard] = useState<FBoard>(start.board);
  const [loose, setLoose] = useState<[number, number] | null>(start.loose);
  const [turn, setTurn] = useState<Side>("w");
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [throwing, setThrowing] = useState(false);
  const [score, setScore] = useState({ w: 0, b: 0 });
  const [left, setLeft] = useState(GAME_SECONDS);
  const [over, setOver] = useState("");
  const [cue, setCue] = useState<MoveCue | null>(null);
  // 3, 2, 1, GO! first; nothing moves and the clock waits until it is over
  const [phase, setPhase] = useState<Phase>("count");
  const [count, setCount] = useState(3);
  const [show, setShow] = useState<StadiumShow>({});
  const [replay, setReplay] = useState<FFrame | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [tryFor, setTryFor] = useState<{ side: Side; moves: number } | null>(null);
  const [shotTick, setShotTick] = useState(0);
  const [turnNo, setTurnNo] = useState(0);
  useEffect(() => setTurnNo((n) => n + 1), [turn, phase]);
  const [muted, setMutedState] = useState(() => crowdMuted());
  // the player's team (saved per user) and their piece names for the board they have on
  const [prefs, setPrefs] = useState<FootballPrefs | null>(null);
  const [prefsDone, setPrefsDone] = useState(false);
  const [setup, setSetup] = useState(false);
  const team = prefs?.team ?? DEFAULT_TEAM;
  // online: the other player, with their own saved team (a clashing colour gets the away colour)
  const [opp, setOpp] = useState<{ name: string; team: FootballTeam | null } | null>(null);
  const away = useMemo(() => {
    if (!online) return { name: "Phantoms", color: awayColor(team.color) };
    const t = opp?.team;
    const clash = !t || t.color.toLowerCase() === team.color.toLowerCase();
    return { name: t?.name ?? opp?.name ?? "Visitors", color: clash ? awayColor(team.color) : t.color };
  }, [team.color, online, opp]);
  const vsName = online ? (opp?.name ?? "your opponent") : versus;
  const mp = useRef({ flip: false, seq: 0, skew: 0, turnAt: 0, bonus: 0, sending: false, ready: false });
  const [countAt, setCountAt] = useState<number | null>(null);
  const [winner, setWinner] = useState<Side | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [, setMpTick] = useState(0);
  const navigate = useNavigate();
  const names = prefs?.names?.[prefs.board] ?? {};
  const phaseRef = useRef<Phase>("count");
  phaseRef.current = phase;
  const tryRef = useRef(tryFor);
  tryRef.current = tryFor;
  const now = useRef({ board, loose, score, turn, sel, over, names, team, away });
  now.current = { board, loose, score, turn, sel, over, names, team, away };
  // every play since the last kick-off (with when it happened), for the touchdown replay
  const drive = useRef<{ board: FBoard; loose: [number, number] | null; plays: FFrame[] }>({ board: start.board, loose: start.loose, plays: [] });
  const timers = useRef<number[]>([]);
  const resume = useRef<(() => void) | null>(null);
  const crowd = useRef<CrowdAudio | null>(null);
  const me = useCurrentUser();
  const meId = useRef<string | null>(null);
  meId.current = me?.id ?? null;
  useEffect(() => {
    if (me?.id && scoreSoundAllowed(me.id)) preloadScoreSound();
  }, [me?.id]);
  /** the touchdown show runs once per score: a second call while it is on is ignored */
  const tdLock = useRef(false);
  /** Skip the replay. Vs the bot (or alone) one press is enough; a two-player game would need both
   *  players (owner, v4): then the first press waits for the other side's skip. */
  const SKIP_NEEDS_BOTH = Boolean(online);
  const [skipWait, setSkipWait] = useState(false);
  const slowBy = () => (window as unknown as { __fbSlow?: number }).__fbSlow ?? 1;
  const later = (fn: () => void, ms: number) => {
    // __fbSlow only exists with the screenshot test hooks on; it stretches the touchdown show
    const id = window.setTimeout(fn, ms * slowBy());
    timers.current.push(id);
    return id;
  };
  /** a pass into the end zone waits for the catch before the touchdown: an interception cancels it */
  const pendingTd = useRef<number | null>(null);
  /** the pass in the air (owner t237u): its pick-off chance, the dice, and whether the defense already jumped */
  const passDice = useRef<{ risk: number; roll: number; tried: boolean } | null>(null);
  const [air, setAir] = useState<{ risk: number; mine: boolean; until: number } | null>(null);

  useEffect(() => {
    const audio = new CrowdAudio();
    crowd.current = audio;
    audio.start();
    audio.set("count");
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      audio.stop();
    };
  }, []);
  useEffect(() => {
    let live = true;
    const fallback = window.setTimeout(() => live && setPrefsDone(true), 6000);
    void getFootballPrefs()
      .then((p) => {
        if (!live) return;
        setPrefs(p);
        if (!p.team) setSetup(true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setPrefsDone(true);
        window.clearTimeout(fallback);
      });
    return () => {
      live = false;
      window.clearTimeout(fallback);
    };
  }, []);
  // the countdown starts once the stadium is on screen (or after 12 s at most) and the team is picked
  const [ready, setReady] = useState(false);
  const [frozen, setFrozen] = useState<number | null>(null);
  const onReady = useRef(() => setReady(true)).current;
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 12000);
    return () => window.clearTimeout(id);
  }, []);
  const local = ready && prefsDone && !(setup && phase === "count");
  // online: both players say they are ready, then the server starts the same countdown for both
  mp.current.ready = local;
  const go = online ? countAt !== null : local;
  useEffect(() => {
    if (!go || phaseRef.current !== "count") return;
    const base = online && countAt !== null ? countAt - 4100 - Date.now() : 0;
    const ids = [3, 2, 1, 0].map((n, i) => window.setTimeout(() => setCount(n), Math.max(0, base + 400 + i * 1000)));
    ids.push(
      window.setTimeout(() => {
        setPhase("play");
        phaseRef.current = "play";
        crowd.current?.set("calm");
      }, Math.max(0, base + 4100)),
    );
    return () => ids.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go]);

  useEffect(() => {
    if (over || phase !== "play" || online) return; // online: the server keeps the clock
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
  }, [over, phase]);

  // the 5-second shot clock: while it is your move, every 5 s the other team sneaks in one move
  useEffect(() => {
    if (over || phase !== "play" || turn !== "w" || setup || online) return;
    const id = window.setInterval(() => {
      if ((window as unknown as { __fbNoShot?: boolean }).__fbNoShot) return;
      const s = now.current;
      if (phaseRef.current !== "play" || s.turn !== "w" || s.over) return;
      setShotTick((n) => n + 1);
      botFootball(s.board, s.loose, s.score, true);
    }, SHOT_CLOCK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, phase, turn, setup]);

  /** The crowd never goes quiet on a move (owner, v3); a big play lifts it a little. */
  function playSound(next: MoveCue) {
    const long = next.thrown && Math.abs(next.to[0] - next.from[0]) >= 4;
    if (next.capture || long || next.goal) {
      crowd.current?.set("roar");
      later(() => {
        setShow((s) => ({ ...s, hype: { id: Date.now(), level: long || next.goal ? 0.7 : 0.55 } }));
      }, 750);
    }
  }

  function dropKingBall(b: FBoard, side: Side, ball: [number, number] | null) {
    const next = cloneBoard(b) as FBoard;
    let looseNow = ball;
    let dropped: [number, number] | null = null;
    for (let r = 0; r < F_ROWS; r++) {
      for (let f = 0; f < F_COLS; f++) {
        const u = next[r][f];
        if (u?.side === side && u.kind === "k" && u.ball && (u.held ?? 0) >= 3) {
          next[r][f] = { ...u, ball: false, held: 0 };
          looseNow = [r, f];
          dropped = [r, f];
        }
      }
    }
    return { board: next, loose: looseNow, dropped };
  }

  /** The play is over (the ball carrier tackled, the king putting the ball down, a turnover): show it for a
   *  moment, then the next play (owner t238u: a slide to the yard line, or everyone back on a turnover). */
  function deadBall(b: FBoard, ball: [number, number] | null, scored: { w: number; b: number }, mover: Side, row: number, holder: Side, text: string, first: Side, all = false) {
    setBoard(b);
    setLoose(ball);
    setScore(scored);
    setSel(null);
    setThrowing(false);
    setPhase("kick");
    phaseRef.current = "kick";
    setBanner({ side: holder, text, small: true });
    void mover;
    later(() => setBanner((v) => (v?.small ? null : v)), 1900);
    later(() => scrimmage(row, holder, scored, first, b, all), 1500);
  }

  function scrimmage(row: number, holder: Side, scored: { w: number; b: number }, first: Side, alive: FBoard, all = false) {
    // owner t236u/t238u: a turnover brings everyone back, the new team's king has the ball;
    // otherwise both teams slide to the yard line and the king takes the ball
    const next = all ? footballStart(holder) : { board: shiftBoard(alive, row, holder), loose: null };
    if (all) {
      setBanner({ side: first, text: "Everyone's back!", small: true });
      later(() => setBanner((v) => (v?.small ? null : v)), 1900);
    }
    setBoard(next.board);
    setLoose(next.loose);
    setCue(null);
    setSel(null);
    setThrowing(false);
    setTurn(first);
    drive.current = { board: next.board, loose: next.loose, plays: [] };
    // a moment to jog into the formation before the snap
    later(() => {
      if (phaseRef.current !== "kick") return;
      setPhase("play");
      phaseRef.current = "play";
      if (first === "b") later(() => botFootball(next.board, next.loose, scored), 500);
    }, 1300);
  }

  /** After a score (or a missed kick): everyone back on his own side and `first`, the team that gets the
   *  ball, starts with it in its king's hands (owner t238u). */
  function kickoff(b: FBoard, scored: { w: number; b: number }, first: Side) {
    void b;
    const next = footballStart(first).board;
    tdLock.current = false;
    tryRef.current = null;
    setTryFor(null);
    setPhase("play");
    phaseRef.current = "play";
    setBoard(next);
    setLoose(null);
    setScore(scored);
    setCue(null);
    setSel(null);
    setThrowing(false);
    setTurn(first);
    drive.current = { board: next, loose: null, plays: [] };
    if (first === "b") later(() => botFootball(next, null, scored), 1500);
  }

  function finishTurn(next: FBoard, ball: [number, number] | null, scored: { w: number; b: number }, mover: Side, bonus = false) {
    // owner t238u: a team down to its king plays on (he can still run, throw or kick)
    const t = tryRef.current;
    if (t) {
      const moves = mover === t.side ? t.moves + 1 : t.moves;
      const holder = findBall(next);
      // the try is over on a turnover, a loose ball or after two of their own moves
      if (!holder || holder.u.side !== t.side || moves >= 2) {
        setBoard(next);
        setLoose(ball);
        setBanner({ side: t.side, text: "No good!", small: true });
        later(() => setBanner((v) => (v?.small ? null : v)), 1500);
        tryRef.current = null;
        setPhase("kick");
        phaseRef.current = "kick";
        later(() => kickoff(next, scored, other(t.side)), 1100);
        return;
      }
      tryRef.current = { ...t, moves };
      setTryFor({ ...t, moves });
    }
    const side = bonus ? "w" : other(mover);
    const dropped = dropKingBall(next, side, ball);
    if (dropped.dropped && !tryRef.current) {
      // owner (t207u/t238u): the king put the ball down, so the play is dead; both teams slide to his yard line
      deadBall(dropped.board, dropped.loose, scored, mover, dropped.dropped[0], side, "Ball down!", side);
      return;
    }
    setBoard(dropped.board);
    setLoose(dropped.loose);
    setScore(scored);
    setTurn(side);
    if (bonus) {
      // the player keeps their pick if that piece is still there
      const keep = now.current.sel;
      if (!keep || dropped.board[keep[0]][keep[1]]?.side !== "w") {
        setSel(null);
        setThrowing(false);
      }
    } else {
      setSel(null);
      setThrowing(false);
    }
    if (side === "b" && !over) window.setTimeout(() => botFootball(dropped.board, dropped.loose, scored), 400);
  }

  function record(next: FBoard, ball: [number, number] | null, c: MoveCue) {
    drive.current.plays.push({ board: cloneBoard(next) as FBoard, loose: ball, cue: c, at: performance.now() });
  }

  function scorerName(side: Side, u: FUnit) {
    if (side === "w") return (u.id && now.current.names[u.id]) || KIND_NAME[u.kind];
    return `${now.current.away.name} ${KIND_NAME[u.kind]}`;
  }

  /** Touchdown: fireworks and a roar, then the last 10 s again (camera on the ball), then everyone back to midfield. */
  function touchdown(scoring: FBoard, scorer: Side, scored: { w: number; b: number }, carrier: FUnit) {
    if (tdLock.current) return;
    tdLock.current = true;
    setSkipWait(false);
    const wasTry = Boolean(tryRef.current);
    tryRef.current = null;
    setTryFor(null);
    setBoard(scoring);
    setLoose(null);
    setScore(scored);
    setSel(null);
    setThrowing(false);
    setPhase("celebrate");
    phaseRef.current = "celebrate";
    const id = Date.now();
    const endZ = F_WORLD(scorer === "w" ? 12.5 : 0.5, 0)[1];
    later(() => {
      setBanner({ side: scorer, text: "Touchdown!" });
      playScoreSound(meId.current);
      setShow({ hype: { id, level: 1 }, fireworks: { id, z: endZ } });
      crowd.current?.set("swell");
    }, 700);
    // the last 10 seconds of play, at real speed (long pauses trimmed)
    const all = drive.current.plays;
    let first = all.length - 1;
    let span = 0;
    while (first > 0) {
      const gap = Math.min(REPLAY_GAP, (all[first].at ?? 0) - (all[first - 1].at ?? 0));
      if (span + gap > REPLAY_SPAN) break;
      span += gap;
      first--;
    }
    const plays = all.slice(Math.max(0, first));
    const offs = plays.map(() => 0);
    for (let i = 1; i < plays.length; i++) offs[i] = offs[i - 1] + Math.max(120, Math.min(REPLAY_GAP, (plays[i].at ?? 0) - (plays[i - 1].at ?? 0)));
    const before = first > 0 ? { board: all[first - 1].board, loose: all[first - 1].loose } : { board: drive.current.board, loose: drive.current.loose };
    const name = scorerName(scorer, carrier);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      resume.current = null;
      setSkipWait(false);
      setReplay(null);
      setCaption(null);
      setBanner(null);
      setShow((s) => ({ hype: s.hype, fireworks: s.fireworks }));
      setCue(null);
      setEpoch((e) => e + 1);
      setPhase("play");
      phaseRef.current = "play";
      crowd.current?.set("calm");
      void wasTry;
      if (online) {
        // the server's kick-off (after both skipped, or the replay ran out) lines everyone up
        setPhase("kick");
        phaseRef.current = "kick";
        return;
      }
      kickoff(scoring, scored, other(scorer));
      setBanner({ side: other(scorer), text: "Everyone's back!", small: true });
      later(() => setBanner((v) => (v?.small ? null : v)), 2200);
    };
    resume.current = finish;
    const BEGIN = 3300;
    later(() => {
      setBanner(null);
      setPhase("replay");
      phaseRef.current = "replay";
      setCue(null);
      setEpoch((e) => e + 1);
      setReplay({ board: before.board, loose: before.loose, cue: null });
      setCaption(`${name} scored`);
      const p0 = plays[0]?.cue;
      setShow((s) => ({
        ...s,
        shot: { id, kind: 0, follow: true, from: F_WORLD(p0?.from[0] ?? 7, p0?.from[1] ?? 3), to: F_WORLD(p0?.to[0] ?? 7, p0?.to[1] ?? 3), end: endZ },
      }));
    }, BEGIN - 500);
    plays.forEach((play, i) => {
      later(() => setReplay({ ...play, cue: play.cue ? { ...play.cue, id: id + i + 1 } : null }), BEGIN + offs[i]);
    });
    later(finish, BEGIN + (offs[offs.length - 1] ?? 0) + 2600);
  }

  /** Field goal (owner t238u): only the king, from anywhere; the odds fall with the distance. Make it or
   *  miss it, the other team gets the ball and everyone comes back. */
  function fieldGoal(from: [number, number], live = board, scored = score) {
    const next = cloneBoard(live) as FBoard;
    const u = next[from[0]][from[1]];
    if (!u?.ball || u.kind !== "k") return;
    const pct = fgOdds(u.side, from[0]);
    const good = Math.random() * 100 < pct;
    const c: MoveCue = { id: Date.now(), unit: u.id, from, to: [u.side === "w" ? 13 : 0, 3], capture: false, thrown: true, goal: true, miss: !good || undefined, side: u.side, kind: u.kind };
    setCue(c);
    next[from[0]][from[1]] = { ...u, ball: false, held: 0 };
    record(next, null, c);
    playSound(c);
    const s2 = good ? { ...scored, [u.side]: scored[u.side] + 3 } : scored;
    tryRef.current = null;
    setTryFor(null);
    setBoard(next);
    setLoose(null);
    setSel(null);
    setThrowing(false);
    setPhase("kick");
    phaseRef.current = "kick";
    const id = c.id;
    later(() => {
      setScore(s2);
      if (good) {
        setBanner({ side: u.side, text: "Field goal!" });
        playScoreSound(meId.current);
        setShow((s) => ({ ...s, hype: { id, level: 0.85 }, fireworks: { id, z: F_WORLD(u.side === "w" ? 13 : 0, 0)[1] } }));
        crowd.current?.set("swell");
      } else {
        setBanner({ side: other(u.side), text: "No good!" });
      }
    }, 1300);
    later(() => {
      setBanner(null);
      setPhase("play");
      phaseRef.current = "play";
      crowd.current?.set("calm");
      kickoff(next, s2, other(u.side));
    }, 4200);
  }

  function moveTo(from: [number, number], to: [number, number], live = board, ball = loose, scored = score, bonus = false) {
    const next = cloneBoard(live) as FBoard;
    const u = next[from[0]][from[1]];
    if (!u) return;
    const victim = next[to[0]][to[1]];
    let carry = Boolean(u.ball);
    if (!carry && ball && ball[0] === to[0] && ball[1] === to[1]) carry = true;
    // owner t237u: tackling the carrier only MAYBE knocks the ball loose; a run near defenders may fumble too
    const sack = Boolean(victim?.ball);
    let fumble = false;
    if (sack) {
      fumble = tryRef.current ? true : Math.random() * 100 < fbTackleRisk(live, from, to);
      carry = fumble;
    } else if (carry && !victim && !inEnd(u.side, to[0]) && !tryRef.current) {
      fumble = Math.random() * 100 < fbRisk(live, to, other(u.side), "run");
    }
    const c: MoveCue = {
      id: Date.now(),
      unit: u.id,
      from,
      to,
      capture: Boolean(victim),
      thrown: false,
      side: u.side,
      kind: u.kind,
      victim: victim?.kind,
      victimSide: victim?.side,
    };
    setCue(c);
    next[from[0]][from[1]] = null;
    const held = u.kind === "k" && carry ? (u.held ?? 0) + 1 : 0;
    next[to[0]][to[1]] = { ...u, ball: carry, held };
    const looseNow: [number, number] | null = carry ? null : ball && ball[0] === to[0] && ball[1] === to[1] ? null : ball;
    record(next, looseNow, c);
    playSound(c);
    if (carry && inEnd(u.side, to[0])) {
      touchdown(next, u.side, { ...scored, [u.side]: scored[u.side] + 6 }, u);
      return;
    }
    const first = bonus ? "w" : other(u.side);
    if (sack && !tryRef.current) {
      // the carrier is tackled and out (t235u). Fumble = turnover, everyone back; no fumble = his team keeps it there
      // (a fumble is a fresh drive: the team that won the ball starts it, like on the server)
      if (fumble) deadBall(next, null, scored, u.side, to[0], u.side, "Fumble! Turnover", u.side, true);
      else deadBall(next, null, scored, u.side, to[0], other(u.side), "Tackled! Ball kept", first);
      return;
    }
    if (fumble) {
      next[to[0]][to[1]] = { ...next[to[0]][to[1]]!, ball: false, held: 0 };
      deadBall(next, [to[0], to[1]], scored, u.side, to[0], other(u.side), "Fumble! Turnover", first, true);
      return;
    }
    // owner t238u: any other tackle does not stop play; he is out and the tackler stays on the square
    finishTurn(next, looseNow, scored, u.side, bonus);
  }

  function pass(from: [number, number], to: [number, number], live = board, scored = score, bonus = false) {
    const next = cloneBoard(live) as FBoard;
    const u = next[from[0]][from[1]];
    const catcher = next[to[0]][to[1]];
    if (!u?.ball || !catcher || catcher.side !== u.side) return;
    const c: MoveCue = { id: Date.now(), unit: u.id, from, to, capture: false, thrown: true, side: u.side, kind: u.kind };
    setCue(c);
    next[from[0]][from[1]] = { ...u, ball: false, held: 0 };
    next[to[0]][to[1]] = { ...catcher, ball: true, held: catcher.kind === "k" ? 1 : 0 };
    record(next, null, c);
    playSound(c);
    const airMs = (0.55 + Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.06) * 1000;
    const def = other(u.side);
    const risk = tryRef.current ? 0 : fbRisk(live, to, def, "pass");
    const roll = Math.random() * 100;
    // owner t238u: a pass to a man in the end zone with nobody near him is a sure touchdown (no jump)
    passDice.current = { risk, roll, tried: inEnd(catcher.side, to[0]) && risk === 0 };
    setAir({ risk, mine: u.side === "w", until: Date.now() + airMs + 400 });
    later(() => setAir(null), airMs + 400);
    if (roll < risk) {
      // a defender near the catcher picks it off just before the catch (owner t237u)
      const d = fbDefenders(live, to, def)[0];
      setBoard(next);
      setLoose(null);
      setSel(null);
      setThrowing(false);
      setPhase("celebrate");
      phaseRef.current = "celebrate";
      later(() => pickOff({ r: d.r, f: d.f, id: d.id }, def, to, from), Math.max(400, airMs * 0.7));
      return;
    }
    if (inEnd(catcher.side, to[0])) {
      // wait for the catch before the party starts
      const scoring = next;
      // the wait is the time the ball is in the air (it hangs over anyone it flies over: t204u)
      const air = 0.55 + Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.06;
      pendingTd.current = later(() => {
        pendingTd.current = null;
        touchdown(scoring, catcher.side, { ...scored, [catcher.side]: scored[catcher.side] + 6 }, catcher);
      }, Math.max(900, air * 1000 + 950));
      setBoard(next);
      setLoose(null);
      setSel(null);
      setThrowing(false);
      setPhase("celebrate");
      phaseRef.current = "celebrate";
      return;
    }
    finishTurn(next, null, scored, u.side, bonus);
  }

  /**
   * SPACE or right-click (owner, t204u): your player jumps. If a Phantoms pass is hanging over him right
   * then, he picks it off. Otherwise it is just a jump.
   */
  function jump() {
    const s = now.current;
    if (s.over || (phaseRef.current !== "play" && pendingTd.current == null)) return;
    const live = s.board;
    const fl = FLIGHT;
    let pick: { r: number; f: number; id: string } | null = null;
    let steal = false;
    if (fl.active && fl.side === "b" && !fl.steal) {
      const under = fl.over
        .filter((m) => m.side === "w" && Math.abs(m.u - fl.u) <= JUMP_WINDOW && live[m.r]?.[m.f]?.id === m.id)
        .sort((a, b) => Math.abs(a.u - fl.u) - Math.abs(b.u - fl.u))[0];
      if (under) {
        pick = { r: under.r, f: under.f, id: under.id };
        steal = true;
      }
    }
    if (!pick && s.sel) {
      const u = live[s.sel[0]]?.[s.sel[1]];
      if (u?.side === "w" && u.id) pick = { r: s.sel[0], f: s.sel[1], id: u.id };
    }
    if (!pick && fl.active) {
      // nobody picked: whoever of yours is nearest the ball
      const br = (F_ROWS - 1) / 2 - fl.pos.z;
      const bf = fl.pos.x + (F_COLS - 1) / 2;
      let best = 2.2;
      for (let r = 0; r < F_ROWS; r++)
        for (let f = 0; f < F_COLS; f++) {
          const u = live[r][f];
          const d = Math.hypot(r - br, f - bf);
          if (u?.side === "w" && u.id && d < best) {
            best = d;
            pick = { r, f, id: u.id };
          }
        }
    }
    if (!pick) return;
    JUMPS.set(pick.id, performance.now() / 1000);
    if (steal && online) {
      // the server rolls the dice (owner t237u); its intercept event makes him grab the ball on screen
      void send({ t: "intercept", id: (mp.current.flip ? flipUnitId(pick.id) : pick.id) ?? "" });
    } else if (steal) {
      // the jump adds to the pick-off chance, one try per pass
      const d = passDice.current;
      if (!d || d.tried) return;
      d.tried = true;
      if (d.roll < Math.min(FB_JUMP_CAP, d.risk + FB_JUMP_BONUS)) pickOff(pick, "w", FLIGHT.to, FLIGHT.from);
      else missed();
    }
  }

  function missed() {
    setBanner((v) => v ?? { side: "b", text: "Missed it!", small: true });
    later(() => setBanner((v) => (v?.small && v.text === "Missed it!" ? null : v)), 1100);
  }

  /** $side's player takes the ball out of the air: a turnover, everyone comes back (owner t237u), or a touchdown */
  function pickOff(pick: { r: number; f: number; id: string }, side: Side, to: [number, number], from: [number, number]) {
    const live = now.current.board;
    const [tr, tf] = to;
    const catcher = live[tr]?.[tf];
    const j = live[pick.r]?.[pick.f];
    if (!catcher?.ball || catcher.side === side || !j || j.side !== side) return;
    passDice.current = null;
    setAir(null);
    const next = cloneBoard(live) as FBoard;
    next[tr][tf] = { ...catcher, ball: false, held: 0 };
    next[pick.r][pick.f] = { ...j, ball: true, held: j.kind === "k" ? 1 : 0 };
    // the ball leaves its line and goes into his hands, up in the air
    FLIGHT.steal = { id: pick.id, at: fieldSpot(pick.r, pick.f, F_ROWS, F_COLS, 1.15) };
    if (pendingTd.current != null) {
      window.clearTimeout(pendingTd.current);
      pendingTd.current = null;
    }
    if (phaseRef.current === "celebrate") {
      setPhase("play");
      phaseRef.current = "play";
    }
    record(next, null, { id: Date.now(), unit: j.id, from, to: [pick.r, pick.f], capture: false, thrown: true, side: other(side), kind: catcher.kind });
    crowd.current?.set("roar");
    setBoard(next);
    setLoose(null);
    setTurn(side);
    setSel(side === "w" ? [pick.r, pick.f] : null);
    setThrowing(false);
    setShotTick((n) => n + 1);
    setBanner({ side, text: "Interception!", small: true });
    later(() => setBanner((v) => (v?.small ? null : v)), 1600);
    if (inEnd(side, pick.r)) {
      later(() => touchdown(next, side, { ...now.current.score, [side]: now.current.score[side] + 6 }, next[pick.r][pick.f]!), 700);
      return;
    }
    // a turnover ends the play (t207u) and brings everyone back (t237u): new line where he caught it, his ball
    if (!tryRef.current) later(() => deadBall(next, null, now.current.score, other(side), pick.r, side, "Interception!", side, true), 650);
  }
  const jumpRef = useRef(jump);
  jumpRef.current = jump;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      if (!e.repeat) jumpRef.current();
    };
    const menu = (e: MouseEvent) => {
      // right-click on the field is the jump button, not the browser menu
      if ((e.target as HTMLElement | null)?.tagName !== "CANVAS") return;
      e.preventDefault();
      jumpRef.current();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("contextmenu", menu);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("contextmenu", menu);
    };
  }, []);

  function botFootball(live: FBoard, ball: [number, number] | null, scored: { w: number; b: number }, bonus = false) {
    if (phaseRef.current !== "play" || online) return;
    type Act = { kind: "m" | "t" | "g"; from: [number, number]; to: [number, number]; rank: number };
    const acts: Act[] = [];
    const hb = findBall(live);
    const theirBall = hb && hb.u.side === "w" ? hb : null;
    const ourBall = hb?.u.side === "b";
    const helpers = live.flat().filter((u) => u?.side === "b" && u.kind !== "k").length;
    const cheb = (a: [number, number], b: { r: number; f: number }) => Math.max(Math.abs(a[0] - b.r), Math.abs(a[1] - b.f));
    for (let r = 0; r < F_ROWS; r++) {
      for (let f = 0; f < F_COLS; f++) {
        const u = live[r][f];
        if (u?.side !== "b") continue;
        for (const to of fMoves(live, r, f)) {
          let rank = 1;
          if (ball && to[0] === ball[0] && to[1] === ball[1]) rank += 5;
          if (u.ball) rank += (r - to[0]) * 2;
          if (u.ball && inEnd("b", to[0])) rank += 20;
          if (live[to[0]][to[1]]) rank += 3;
          if (live[to[0]][to[1]]?.ball) rank += 6 + fbTackleRisk(live, [r, f], to) / 5;
          else if (u.ball && !live[to[0]][to[1]] && !inEnd("b", to[0])) rank -= fbRisk(live, to, "w", "run") / 4;
          // owner t238u: players stay put, so the defense closes in on the ball and the offense gets open downfield
          if (theirBall) rank += (cheb([r, f], theirBall) - cheb(to, theirBall)) * 0.8;
          else if (ourBall && !u.ball) rank += (r - to[0]) * 0.4;
          acts.push({ kind: "m", from: [r, f], to, rank });
        }
        if (u.ball) {
          for (const to of catchSquares(live, r, f)) {
            acts.push({ kind: "t", from: [r, f], to, rank: (r - to[0]) * 3 + 2 + (inEnd("b", to[0]) ? 20 : 0) - fbRisk(live, to, "w", "pass") / 4 });
          }
          // the king may kick from anywhere (t238u): worth it when close, or when he has nobody left to help
          if (u.kind === "k") acts.push({ kind: "g", from: [r, f], to: [r, f], rank: (fgOdds("b", r) - 45) / 3 + (helpers === 0 ? 8 : 0) + ((u.held ?? 0) >= 2 ? 2 : 0) });
        }
      }
    }
    if (!acts.length) {
      setTurn("w");
      return;
    }
    acts.sort((a, b) => b.rank - a.rank);
    // It picks at random among its 4 best-ranked moves (it used to be the best 3), so it is a small bit easier.
    const pick = acts[Math.floor(Math.random() * Math.min(4, acts.length))];
    if (pick.kind === "g") fieldGoal(pick.from, live, scored);
    else if (pick.kind === "t") pass(pick.from, pick.to, live, scored, bonus);
    else moveTo(pick.from, pick.to, live, ball, scored, bonus);
  }

  function onSquare(r: number, f: number) {
    if (over || !(turn === "w" || bonusReady()) || phase !== "play" || setup) return;
    const u = board[r][f];
    if (throwing && sel) {
      if (catchSquares(board, sel[0], sel[1]).some(([rr, ff]) => rr === r && ff === f)) {
        if (online) void send({ t: "pass", from: mSq(sel, mp.current.flip), to: mSq([r, f], mp.current.flip) });
        else pass(sel, [r, f]);
      } else setThrowing(false);
      return;
    }
    if (sel && sel[0] === r && sel[1] === f) {
      setSel(null); // tap him again to put him back down
      return;
    }
    if (u?.side === "w") {
      setSel([r, f]);
      setThrowing(false);
      return;
    }
    if (!sel) return;
    if (fMoves(board, sel[0], sel[1]).some(([rr, ff]) => rr === r && ff === f)) {
      if (online) void send({ t: "move", from: mSq(sel, mp.current.flip), to: mSq([r, f], mp.current.flip) });
      else moveTo(sel, [r, f]);
    }
  }

  function kick(from: [number, number]) {
    if (online) void send({ t: "goal", from: mSq(from, mp.current.flip) });
    else fieldGoal(from);
  }

  /** online: the other team has had the ball 5 s, so you may sneak in one move */
  function bonusReady() {
    if (!online || phaseRef.current !== "play" || now.current.turn === "w") return false;
    const m = mp.current;
    return Math.floor((Date.now() + m.skew - m.turnAt) / SHOT_CLOCK_MS) > m.bonus;
  }

  async function send(a: FootballMatchAction) {
    if (!online) return;
    const m = mp.current;
    m.sending = true;
    try {
      const v = await sendFootballMove({ data: { gameId: online, since: m.seq, action: a } });
      applyRef.current(v);
    } catch (e) {
      if (a.t === "intercept") missed();
      else {
        setNote(e instanceof Error ? e.message : "That did not go through.");
        later(() => setNote(null), 1600);
      }
      setSel(null);
      setThrowing(false);
    } finally {
      m.sending = false;
    }
  }

  /** One event from the server: show it like the same thing would show vs the bot. */
  function onEvent(e: FootballMatchEvent, serverNow: number) {
    const flip = mp.current.flip;
    const b = mBoard(e.board, flip);
    const lo = e.loose ? mSq(e.loose, flip) : null;
    const sc = flip ? { w: e.score.b, b: e.score.w } : e.score;
    const tn = mSide(e.turn, flip);
    const small = (side: Side, text: string, ms: number) => {
      setBanner({ side, text, small: true });
      later(() => setBanner((v) => (v?.small ? null : v)), ms);
    };
    switch (e.t) {
      case "count":
        if (e.until) setCountAt(Date.now() + (e.until - serverNow));
        // t238u: the kickoff formation is not symmetric any more (one king has the ball), so show it from my side
        if (e.board) {
          setBoard(b);
          setLoose(lo);
          setTurn(tn);
        }
        break;
      case "snap":
        if (phaseRef.current === "count") setCountAt((c) => c ?? Date.now());
        else {
          setPhase("play");
          phaseRef.current = "play";
        }
        setTurn(tn);
        break;
      case "move":
      case "pass": {
        if (!e.cue) break;
        const c = mCue(e.cue, flip, Date.now() + e.seq);
        setCue(c);
        setBoard(b);
        setLoose(lo);
        setScore(sc);
        setTurn(tn);
        record(b, lo, c);
        playSound(c);
        if (e.t === "pass") {
          // owner t237u: show the pick-off chance while the ball is in the air
          const airMs = (0.55 + Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]) * 0.06) * 1000;
          setAir({ risk: e.risk ?? 0, mine: c.side === "w", until: Date.now() + airMs + 400 });
          later(() => setAir(null), airMs + 400);
        }
        const keep = now.current.sel;
        if (c.side === "w" || !keep || b[keep[0]][keep[1]]?.side !== "w") {
          setSel(null);
          setThrowing(false);
        }
        break;
      }
      case "goal": {
        if (!e.cue) break;
        const c = mCue(e.cue, flip, Date.now() + e.seq);
        setCue(c);
        setBoard(b);
        setLoose(null);
        setSel(null);
        setThrowing(false);
        record(b, null, c);
        playSound(c);
        setPhase("kick");
        phaseRef.current = "kick";
        // the server rolled the kick (t238u): make it or miss it, the other team gets the ball next
        const good = e.good !== false;
        later(() => {
          setScore(sc);
          if (!good) {
            setBanner({ side: other(c.side), text: "No good!" });
            return;
          }
          setBanner({ side: c.side, text: "Field goal!" });
          playScoreSound(meId.current);
          setShow((s) => ({ ...s, hype: { id: c.id, level: 0.85 }, fireworks: { id: c.id, z: F_WORLD(c.side === "w" ? 13 : 0, 0)[1] } }));
          crowd.current?.set("swell");
        }, 1300);
        break;
      }
      case "intercept": {
        const id = flip ? flipUnitId(e.id) : e.id;
        const side = mSide(e.side ?? "w", flip);
        const at = e.at2 ? mSq(e.at2, flip) : null;
        if (!id || !at) break;
        // the server rolled the dice (t237u): whoever got it grabs the ball out of the air on both screens
        JUMPS.set(id, performance.now() / 1000);
        if (FLIGHT.active && !FLIGHT.steal) FLIGHT.steal = { id, at: fieldSpot(at[0], at[1], F_ROWS, F_COLS, 1.15) };
        setAir(null);
        record(b, null, { id: Date.now() + e.seq, unit: id, from: e.from ? mSq(e.from, flip) : at, to: at, capture: false, thrown: true, side: other(side), kind: b[at[0]][at[1]]?.kind ?? "p" });
        crowd.current?.set("roar");
        setBoard(b);
        setLoose(null);
        setTurn(tn);
        setSel(side === "w" ? at : null);
        setThrowing(false);
        small(side, "Interception!", 1600);
        break;
      }
      case "dead":
        setBoard(b);
        setLoose(lo);
        setScore(sc);
        setSel(null);
        setThrowing(false);
        setPhase("kick");
        phaseRef.current = "kick";
        if (e.text && e.text !== "Interception!") small(mSide(e.side ?? "w", flip), e.text, 1900);
        break;
      case "lineup":
        setBoard(b);
        setLoose(lo);
        setCue(null);
        setSel(null);
        setThrowing(false);
        setTurn(tn);
        drive.current = { board: b, loose: lo, plays: [] };
        if (e.fresh) small(tn, "Everyone's back!", 1900);
        break;
      case "td": {
        const scorer = mSide(e.scorer ?? "w", flip);
        const cid = flip ? flipUnitId(e.carrier) : e.carrier;
        const carrier = b.flat().find((u) => u?.id === cid) ?? { side: scorer, kind: "p" as Kind, id: cid };
        touchdown(b, scorer, sc, carrier);
        break;
      }
      case "kickoff": {
        if (resume.current) resume.current();
        tdLock.current = false;
        const first = mSide(e.first ?? "w", flip);
        setBoard(b);
        setLoose(lo);
        setScore(sc);
        setCue(null);
        setSel(null);
        setThrowing(false);
        setTurn(first);
        setSkipWait(false);
        drive.current = { board: b, loose: lo, plays: [] };
        setPhase("play");
        phaseRef.current = "play";
        crowd.current?.set("calm");
        if (e.after === "td") small(first, "Everyone's back!", 2200);
        else setBanner(null);
        break;
      }
      case "skip":
        if (mSide(e.side ?? "w", flip) === "w") setSkipWait(true);
        break;
      case "over":
        setOver(e.why || "time");
        setWinner(e.winner ? mSide(e.winner, flip) : null);
        setSel(null);
        setThrowing(false);
        break;
    }
  }

  /** A poll answer: the clock and turn timing, then every new event in order. */
  function applyView(v: FootballMatchView) {
    const m = mp.current;
    m.flip = v.side === "b";
    m.skew = v.now - Date.now();
    m.turnAt = v.turnAt;
    m.bonus = v.bonus;
    const os = other(v.side);
    setOpp((o) => (o && o.name === v.names[os] && o.team?.color === v.teams[os]?.color && o.team?.name === v.teams[os]?.name ? o : { name: v.names[os], team: v.teams[os] }));
    setLeft(Math.max(0, Math.ceil(v.clockMs / 1000)));
    if ((m.seq === 0 && v.seq > 0 && v.phase !== "count") || v.gap) {
      // opened mid-game (a reload) or missed too much: jump straight to the board as it is now
      m.seq = v.seq;
      setBoard(mBoard(v.board, m.flip));
      setLoose(v.loose ? mSq(v.loose, m.flip) : null);
      setScore(m.flip ? { w: v.score.b, b: v.score.w } : v.score);
      setTurn(mSide(v.turn, m.flip));
      setCue(null);
      const ph: Phase = v.phase === "play" || v.phase === "tdpass" ? "play" : "kick";
      setCountAt((c) => c ?? Date.now());
      setPhase(ph);
      phaseRef.current = ph;
      if (v.over) {
        setOver(v.over);
        setWinner(v.winner ? mSide(v.winner, m.flip) : null);
      }
      return;
    }
    for (const e of v.events) {
      if (e.seq <= m.seq) continue;
      onEvent(e, v.now);
      m.seq = e.seq;
    }
    // a move's event is written before the turn passes over, so take whose turn it is from the snapshot
    if (v.phase === "play" && m.seq === v.seq) setTurn(mSide(v.turn, m.flip));
  }
  const pickRef = useRef(onSquare);
  pickRef.current = onSquare;
  const applyRef = useRef(applyView);
  applyRef.current = applyView;
  useEffect(() => {
    if (!online) return;
    let alive = true;
    let busy = false;
    const pull = async () => {
      if (busy || mp.current.sending) return;
      busy = true;
      try {
        const v = await footballSync({ data: { gameId: online, since: mp.current.seq, ready: mp.current.ready } });
        if (alive) applyRef.current(v);
      } catch {
        /* a dropped poll: the next one catches up */
      } finally {
        busy = false;
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 350);
    // redraw for the 5-second bonus move button
    const tick = window.setInterval(() => setMpTick((n) => n + 1), 250);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, [online]);

  async function leaveOnline() {
    if (!online) return;
    if (!over && !window.confirm(`Leave the game? ${vsName} wins.`)) return;
    if (!over) await resignFootball({ data: { gameId: online } }).catch(() => undefined);
    void navigate({ to: "/" });
  }

  async function saveTeam(next: FootballTeam) {
    const saved = await saveFootballTeam({ data: next });
    setPrefs(saved);
    setSetup(false);
  }

  // test hooks for screenshots, only when localStorage "morse-fb-debug" is "1"
  const self = useRef<{ load: (grid: string[], turn: Side) => void; hold: (n: number) => void; td: () => void; setup: () => void; fight: (gap?: number, carry?: boolean) => void; lob: (gap?: number) => void }>({ load: () => undefined, hold: () => undefined, td: () => undefined, setup: () => undefined, fight: () => undefined, lob: () => undefined });
  self.current.hold = (n: number) => setFrozen(n < 0 ? null : n);
  self.current.setup = () => setSetup(true);
  // load a position from the state() grid strings ("wk*" = the white king with the ball), then let `turn` move
  self.current.load = (grid: string[], turn: Side) => {
    const b = grid.map((row, r) => row.split(" ").map((c, f) => (c === ".." ? null : { side: c[0] as Side, kind: c[1] as Kind, ball: c.endsWith("*"), held: 0, id: `${c[0]}${c[1]}${r}-${f}` }))) as FBoard;
    setBoard(b);
    setLoose(null);
    setTurn(turn);
    drive.current = { board: b, loose: null, plays: [] };
    if (turn === "b") later(() => botFootball(b, null, now.current.score), 800);
  };
  // stage a tackle for the screenshots: a black player steps in front of a white one, who then takes him on
  self.current.fight = (gap = 2, carry = false) => {
    const b = cloneBoard(board) as FBoard;
    // carry: the black player gets the ball, so the tackle hits the ball carrier (t238u screenshots)
    if (carry) for (const row of b) for (let f = 0; f < row.length; f++) if (row[f]?.ball) row[f] = { ...row[f]!, ball: false, held: 0 };
    let w: [number, number] | null = null;
    for (let r = 2; r < 9 && !w; r++) for (let f = 2; f < 6 && !w; f++) if (b[r][f]?.side === "w" && !b[r][f]?.ball && !b[r + gap]?.[f]) w = [r, f];
    let k: [number, number] | null = null;
    for (let r = F_ROWS - 1; r >= 0 && !k; r--) for (let f = 0; f < F_COLS && !k; f++) if (b[r][f]?.side === "b" && !b[r][f]?.ball) k = [r, f];
    if (!w || !k) return;
    const at: [number, number] = [w[0] + gap, w[1]];
    b[at[0]][at[1]] = carry ? { ...b[k[0]][k[1]]!, ball: true } : b[k[0]][k[1]];
    b[k[0]][k[1]] = null;
    setBoard(b);
    if (carry) setLoose(null);
    later(() => moveTo(w!, at, b), 1500);
  };
  // a Phantoms pass straight over one of your players, for the jump / interception screenshots
  self.current.lob = (gap = 3) => {
    const b = cloneBoard(board) as FBoard;
    for (const row of b) for (let f = 0; f < row.length; f++) if (row[f]?.ball) row[f] = { ...row[f]!, ball: false };
    let w: [number, number] | null = null;
    const free = (r: number, f: number) => !b[r][f] || b[r][f]!.kind !== "k";
    for (let r = gap; r < F_ROWS - gap && !w; r++) for (let f = 1; f < F_COLS - 1 && !w; f++) if (b[r][f]?.side === "w" && b[r][f]?.kind !== "k" && free(r + gap, f) && free(r - gap, f)) w = [r, f];
    const blacks: [number, number][] = [];
    for (let r = 0; r < F_ROWS; r++) for (let f = 0; f < F_COLS; f++) if (b[r][f]?.side === "b" && b[r][f]?.kind !== "k") blacks.push([r, f]);
    if (!w || blacks.length < 2) return;
    const from: [number, number] = [w[0] + gap, w[1]];
    const to: [number, number] = [w[0] - gap, w[1]];
    // the two blacks must not sit on the spots we clear
    const pool = blacks.filter(([r, f]) => !(f === w![1] && (r === from[0] || r === to[0])));
    const src = pool.length >= 2 ? pool : blacks;
    const qb = b[src[0][0]][src[0][1]]!;
    const wr = b[src[1][0]][src[1][1]]!;
    b[src[0][0]][src[0][1]] = null;
    b[src[1][0]][src[1][1]] = null;
    b[from[0]][from[1]] = { ...qb, ball: true };
    b[to[0]][to[1]] = { ...wr, ball: false };
    setBoard(b);
    setLoose(null);
    setTurn("b");
    later(() => pass(from, to, b, now.current.score), 1400);
  };
  self.current.td = () => {
    // a scripted white run down the field (legality ignored), for the replay and fireworks
    let b = cloneBoard(board) as FBoard;
    let at: [number, number] | null = null;
    for (let r = F_ROWS - 1; r >= 0 && !at; r--) for (let f = 0; f < F_COLS && !at; f++) if (b[r][f]?.side === "w") at = [r, f];
    if (!at) return;
    const f = at[1];
    for (let r = at[0] + 1; r < F_ROWS; r++) b[r][f] = null;
    b[at[0]][f] = { ...b[at[0]][f]!, ball: true };
    drive.current = { board: cloneBoard(b) as FBoard, loose: null, plays: [] };
    let r = at[0];
    let t = performance.now() - 9000;
    while (r < 12) {
      const to = Math.min(12, r + 1);
      const u = b[r][f]!;
      b = cloneBoard(b) as FBoard;
      b[r][f] = null;
      b[to][f] = u;
      drive.current.plays.push({ board: cloneBoard(b) as FBoard, loose: null, cue: { id: Date.now() + r, unit: u.id, from: [r, f], to: [to, f], capture: false, thrown: false, side: "w", kind: u.kind }, at: (t += 1300) });
      r = to;
    }
    const last = drive.current.plays[drive.current.plays.length - 1];
    setCue(last.cue);
    touchdown(b, "w", { ...score, w: score.w + 6 }, b[12][f]!);
  };
  useEffect(() => {
    let on = false;
    try {
      on = localStorage.getItem("morse-fb-debug") === "1";
    } catch {
      /* ignore */
    }
    if (!on) return;
    const w = window as unknown as { __fb?: unknown };
    w.__fb = {
      hold: (n: number) => self.current.hold(n),
      load: (grid: string[], turn: Side) => self.current.load(grid, turn),
      td: () => self.current.td(),
      setup: () => self.current.setup(),
      fight: (gap?: number, carry?: boolean) => self.current.fight(gap, carry),
      lob: (gap?: number) => self.current.lob(gap),
      jump: () => jumpRef.current(),
      pick: (r: number, f: number) => pickRef.current(r, f),
      skip: () => (document.querySelector("[data-fb-replay] button") as HTMLButtonElement | null)?.click(),
      flight: () => ({ active: FLIGHT.active, u: Math.round(FLIGHT.u * 100) / 100, over: FLIGHT.over.map((m) => `${m.side}${m.r},${m.f}@${Math.round(m.u * 100) / 100}`), stolen: Boolean(FLIGHT.steal) }),
      field: (field: "neon" | "park") => setPrefs((p) => (p ? { ...p, field } : p)),
      state: () => ({ online: Boolean(online), seq: mp.current.seq, phase: phaseRef.current, plays: drive.current.plays.length, turn: now.current.turn, over: now.current.over, sel: now.current.sel, throwBtn: Boolean(document.querySelector("[data-fb-throw]")), score: now.current.score, try: tryRef.current, t: Math.round(performance.now()), ball: findBall(now.current.board)?.u.side ?? null, risk: document.querySelector("[data-fb-risk]")?.textContent ?? null, grid: now.current.board.map((row) => row.map((u) => (u ? `${u.side}${u.kind}${u.ball ? "*" : ""}` : "..")).join(" ")), men: now.current.board.flat().reduce((n, u) => (u ? { ...n, [u.side]: n[u.side] + 1 } : n), { w: 0, b: 0 }) }),
    };
    return () => {
      delete w.__fb;
    };
  }, []);

  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const result =
    over === "time"
      ? score.w === score.b
        ? "Time. Tie game."
        : score.w > score.b
          ? "Time. You win."
          : `Time. ${vsName} wins.`
      : over === "kings"
        ? "King versus king. Tie game."
        : over === "resign" || over === "forfeit"
          ? winner === "w"
            ? `${vsName} left. You win.`
            : "You left the game."
          : "";
  const view: FFrame = replay ?? { board, loose, cue };
  const viewCue = replay ? replay.cue : cue;
  const bonus = bonusReady();
  const canAct = phase === "play" && (turn === "w" || bonus) && !over && !setup;
  const carrier = sel ? board[sel[0]][sel[1]] : null;
  const hasBall = Boolean(carrier?.ball && carrier.side === "w");
  // owner t238u: only the king kicks, from anywhere; the button shows his chance
  const kickable = Boolean(sel && hasBall && carrier?.kind === "k");
  const fgPct = kickable && sel ? fgOdds("w", sel[0]) : null;
  // owner t237u: show the fumble / interception risk before you move
  let riskText: string | null = null;
  if (canAct && sel && carrier?.side === "w" && !replay && !tryFor) {
    if (hasBall && throwing) {
      const t = catchSquares(board, sel[0], sel[1])
        .map((to) => ({ k: board[to[0]][to[1]]!.kind, risk: fbRisk(board, to, "b", "pass") }))
        .sort((x, y) => x.risk - y.risk)
        .slice(0, 4);
      if (t.length) riskText = `Interception risk: ${t.map((x) => `${KIND_NAME[x.k]} ${x.risk}%`).join(" · ")}`;
      else riskText = "Nobody to throw to (only the king can throw forward)";
    } else if (hasBall) {
      const rs = fMoves(board, sel[0], sel[1])
        .filter((to) => !board[to[0]][to[1]] && !inEnd("w", to[0]))
        .map((to) => fbRisk(board, to, "b", "run"));
      if (rs.length) {
        const lo = Math.min(...rs);
        const hi = Math.max(...rs);
        riskText = `Fumble risk if he runs: ${lo === hi ? `${lo}%` : `${lo}–${hi}%`}`;
      }
      if (fgPct !== null) riskText = `${riskText ? `${riskText} · ` : ""}Field goal chance: ${fgPct}%`;
    } else {
      const hit = fMoves(board, sel[0], sel[1]).find((to) => board[to[0]][to[1]]?.ball && board[to[0]][to[1]]?.side === "b");
      if (hit) riskText = `Tackle the ball carrier: ${fbTackleRisk(board, sel, hit)}% chance he fumbles`;
    }
  }
  const airText =
    air && !replay
      ? air.mine
        ? `Interception risk: ${air.risk}%`
        : `JUMP! (SPACE) — ${Math.min(FB_JUMP_CAP, air.risk + FB_JUMP_BONUS)}% steal chance`
      : null;
  const field = useMemo<FieldOpts>(
    () => ({ epoch, colors: { w: team.color, b: away.color }, goal: throwing && kickable && canAct, onGoal: () => now.current.sel && kick(now.current.sel), replay: Boolean(replay) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [epoch, team.color, away.color, throwing, kickable, canAct, Boolean(replay)],
  );

  return (
    <Shell
      title="Football"
      opp={vsName}
      clock={clock}
      hot={turn === "w" && !over}
      status={`${team.name} ${score.w} – ${score.b} ${away.name}${result ? ` · ${result}` : tryFor ? " · Try" : turn === "w" ? " · Your move" : ` · ${vsName}`}`}
      verdict={
        over === "time" && score.w !== score.b
          ? score.w > score.b
            ? "victory"
            : "defeat"
          : online && (over === "resign" || over === "forfeit")
            ? winner === "w"
              ? "victory"
              : "defeat"
            : null
      }
      onLeave={online && !over ? () => void leaveOnline() : undefined}
      leave={online && !over ? "Leave game" : undefined}
    >
      <Grid
        stadium
        rows={F_ROWS}
        cols={F_COLS}
        onPick={onSquare}
        ball={view.loose ? { r: view.loose[0], f: view.loose[1] } : null}
        units={view.board.flatMap((row, r) => row.flatMap((u, f) => (u ? [{ r, f, side: u.side, kind: u.kind, ball: u.ball, id: u.id }] : [])))}
        cue={viewCue}
        sel={sel && !replay ? { r: sel[0], f: sel[1], throwing } : null}
        show={show}
        onReady={onReady}
        field={field}
        home={team}
        park={prefs?.field === "park"}
        paint={(r, f) => {
          const live = view.board;
          const u = live[r][f];
          const end = r <= 1 || r >= 12;
          const mark = !replay && sel;
          const marked = mark && sel && ((throwing && catchSquares(board, sel[0], sel[1]).some(([rr, ff]) => rr === r && ff === f)) || (!throwing && fMoves(board, sel[0], sel[1]).some(([rr, ff]) => rr === r && ff === f)) || (sel[0] === r && sel[1] === f));
          const ballHere = view.loose && view.loose[0] === r && view.loose[1] === f;
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
      <Scoreboard home={team} away={away} score={score} clock={clock} shot={canAct && turn === "w" ? (online ? `${mp.current.turnAt}:${mp.current.bonus}` : `${shotTick}:${turnNo}`) : null} />
      {/* crowd sound switch, under the scoreboard on phones */}
      <div className="pointer-events-auto absolute left-3 top-[6.4rem] z-10 sm:top-3" data-fb-score>
        <button
          type="button"
          aria-label={muted ? "Crowd sound off" : "Crowd sound on"}
          className="min-h-9 rounded-full border border-line bg-ink/75 px-3 py-1 text-xs text-ivory backdrop-blur-sm"
          onClick={() => {
            const next = !muted;
            setMutedState(next);
            crowd.current?.setMuted(next);
          }}
        >
          {muted ? "🔇 Crowd" : "🔊 Crowd"}
        </button>
        <button
          type="button"
          data-fb-rules-btn
          className="ml-2 min-h-9 rounded-full border border-line bg-ink/75 px-3 py-1 text-xs text-ivory backdrop-blur-sm"
          onClick={() => setRules((v) => !v)}
        >
          📖 Rules
        </button>
      </div>
      {rules ? (
        <div className="pointer-events-auto absolute left-3 right-3 top-[9rem] z-30 max-w-md rounded-xl border border-line bg-ink/90 p-4 text-[13px] leading-snug text-cream shadow-xl backdrop-blur-sm sm:right-auto sm:top-14" data-fb-rules>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-lg text-ivory">Football rules</span>
            <button type="button" aria-label="Close rules" className="px-2 text-lg text-ivory" onClick={() => setRules(false)}>
              ✕
            </button>
          </div>
          <ol className="list-decimal space-y-1 pl-5">
            {FOOTBALL_RULES.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
            {online ? <li>Vs a player: the replay after a touchdown is skipped only when you both press Skip. No coins, no Elo.</li> : null}
          </ol>
        </div>
      ) : null}
      {online && bonus && !over ? (
        <div className="pointer-events-none absolute inset-x-0 top-[9.5rem] z-10 flex justify-center sm:top-[5.5rem]" data-fb-bonus>
          <span className="rounded-full bg-[#ffe14a] px-4 py-1 text-xs font-black uppercase tracking-[0.18em] text-ink shadow-lg">⚡ Bonus move — go!</span>
        </div>
      ) : null}
      {riskText || airText ? (
        <div className="pointer-events-none absolute inset-x-0 top-[11.5rem] z-10 flex justify-center px-4 sm:top-[7.5rem]" data-fb-risk={airText ? "air" : "move"}>
          <span className="rounded-full bg-black/70 px-4 py-1 text-xs font-bold text-[#ffe14a] shadow-lg">{airText ?? riskText}</span>
        </div>
      ) : null}
      {note ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[9rem] z-20 flex justify-center px-4 sm:bottom-24" data-fb-note>
          <span className="rounded-full bg-black/75 px-4 py-2 text-sm text-ivory">{note}</span>
        </div>
      ) : null}
      {online && phase === "count" && !setup && !go ? (
        <div className="pointer-events-none absolute inset-x-0 top-[40%] z-20 flex justify-center px-4" data-fb-wait-opp>
          <span className="rounded-xl bg-black/70 px-5 py-3 text-lg font-semibold text-ivory">Waiting for {vsName} to get ready…</span>
        </div>
      ) : null}
      {hasBall && canAct ? (
        <div className="pointer-events-auto absolute inset-x-0 bottom-[5.2rem] z-10 flex justify-center gap-2 sm:bottom-5" data-fb-throw>
          <button
            type="button"
            className={cn(
              "min-h-12 rounded-full border px-5 text-sm font-bold uppercase tracking-[0.12em] shadow-[0_6px_20px_rgba(0,0,0,0.45)]",
              throwing ? "border-[#ffe14a] bg-[#ffe14a] text-ink" : "border-line bg-ink/85 text-ivory backdrop-blur-sm",
            )}
            onClick={() => setThrowing((v) => !v)}
          >
            {throwing ? "Pick a teammate ✕" : "🏈 Throw ball"}
          </button>
          {kickable ? (
            <button
              type="button"
              className="min-h-12 rounded-full border border-[#ffe14a] bg-ink/85 px-5 text-sm font-bold uppercase tracking-[0.12em] text-[#ffe14a] shadow-[0_6px_20px_rgba(0,0,0,0.45)] backdrop-blur-sm"
              onClick={() => sel && kick(sel)}
            >
              🥅 Field goal {fgPct}%
            </button>
          ) : null}
        </div>
      ) : null}
      {(phase === "count" && !setup) || frozen !== null ? (
        <div className="pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-black/25" data-fb-count>
          {!go && frozen === null ? null : <span
            key={frozen ?? count}
            className="fb-count select-none font-sans text-[min(38vw,46vh)] font-black leading-none"
            style={{
              animation: frozen !== null ? "none" : undefined,
              color: (frozen ?? count) ? "#ffffff" : "#ffe14a",
              textShadow: (frozen ?? count) % 2 ? `0 0 28px ${team.color}, 0 0 80px ${team.color}, 0 8px 0 #0b2a8a` : `0 0 28px ${away.color}, 0 0 80px ${away.color}, 0 8px 0 #5a0a2e`,
            }}
          >
            {(frozen ?? count) || "GO!"}
          </span>}
        </div>
      ) : null}
      {banner ? (
        <div className="pointer-events-none absolute inset-x-0 top-[24%] z-20 grid place-items-center px-4 text-center" data-fb-td>
          <span
            className={cn(
              "fb-count select-none font-sans font-black uppercase italic leading-none tracking-[0.04em] text-white",
              banner.small ? "text-[min(9vw,9vh)]" : "text-[min(14vw,16vh)]",
            )}
            style={{ textShadow: `0 0 24px ${banner.side === "w" ? team.color : away.color}, 0 0 70px ${banner.side === "w" ? team.color : away.color}, 0 6px 0 #000` }}
          >
            {banner.text}
          </span>
        </div>
      ) : null}
      {phase === "replay" || phase === "celebrate" ? (
        <div className="absolute inset-x-0 top-[6.6rem] z-20 flex items-center justify-center gap-3 sm:top-[7.4rem]" data-fb-replay>
          {phase === "replay" ? (
            <span className="rounded-md bg-[#c8102e] px-3 py-1 text-xs font-black uppercase tracking-[0.25em] text-white shadow-[0_0_18px_rgba(255,45,122,0.7)]">● Replay</span>
          ) : null}
          {resume.current && skipWait ? (
            <span className="min-h-11 rounded-full border border-line bg-ink/85 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-ivory/80 backdrop-blur-sm" data-fb-skip-wait>
              Waiting for opponent to skip…
            </span>
          ) : resume.current ? (
            <button
              type="button"
              className="min-h-11 rounded-full border border-line bg-ink/85 px-5 text-sm font-semibold uppercase tracking-[0.14em] text-ivory backdrop-blur-sm hover:border-line-strong"
              onClick={() => {
                if (SKIP_NEEDS_BOTH) {
                  setSkipWait(true);
                  void send({ t: "skip" });
                } else resume.current?.();
              }}
            >
              Skip ▸▸
            </button>
          ) : null}
        </div>
      ) : null}
      {phase === "replay" ? <div className="pointer-events-none absolute inset-0 z-10 [background:linear-gradient(transparent_80%,rgba(0,0,0,0.6)),linear-gradient(rgba(0,0,0,0.45),transparent_14%)]" /> : null}
      {phase === "replay" && caption ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[5.4rem] z-20 flex justify-center px-4 sm:bottom-8" data-fb-caption>
          <span className="max-w-full truncate rounded-lg bg-black/70 px-5 py-2 text-xl font-black uppercase tracking-[0.08em] text-white shadow-[0_6px_24px_rgba(0,0,0,0.5)] sm:text-3xl" style={{ borderBottom: `4px solid ${team.color}` }}>
            {caption}
          </span>
        </div>
      ) : null}
      {setup ? <TeamSetup initial={prefs?.team} title={prefs?.team ? "Change your team" : "Pick your team"} onSave={saveTeam} onClose={prefs?.team ? () => setSetup(false) : undefined} /> : null}
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
  const [cue, setCue] = useState<MoveCue | null>(null);
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
    const lifted = next[r][f];
    if (lifted) {
      // Read the rank now: the state updater runs later, after the square is cleared.
      setBag((cur) => [...cur, { rank: lifted.rank, name: rankLabel(lifted.rank), i: Math.random() }]);
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
    setCue({
      id: Date.now(),
      from,
      to,
      capture: Boolean(def),
      thrown: false,
      side,
      kind: rankPiece(att.rank),
      victim: def ? rankPiece(def.rank) : undefined,
      victimSide: def?.side,
    });
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
    <Shell
      title="Morse Strategy"
      opp={versus}
      verdict={banner.startsWith("You found") ? "victory" : banner.includes("found your") ? "defeat" : null}
      hot={phase !== "play" || turn === "w"}
      status={phase === "place" ? "Set your side" : phase === "over" ? "Board closed" : turn === "w" ? "Your move" : `${versus} is moving`}
      rail={
        <div className="flex h-full min-h-0 flex-col gap-3 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-mist">Morse Strategy</p>
          <p className="text-sm text-ivory">{banner || (phase === "place" ? "Place every piece on your side. Bishop (3) defuses bombs. Find the apple." : turn === "w" ? "Your move. One square, no diagonals." : `${versus} is moving.`)}</p>
          {phase === "place" ? (
            <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-auto">
              {bag.map((p, i) => (
                <button key={`${p.name}-${p.i}`} type="button" onClick={() => setPick(i)} className={"rounded-md border px-2 py-2 text-left text-sm " + (i === pick ? "border-gold-line text-ivory" : "border-line text-mist")}>
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-mist">Enemy pieces stay black until they fight. Higher rank takes lower. Equals both fall. Bombs stay put and kill, unless a bishop defuses one. The apple is the king — take it to win.</p>
          )}
          {phase === "place" ? (
            <div className="space-y-2">
              <input value={setupName} onChange={(e) => setSetupName(e.target.value)} className="w-full rounded-md border border-line bg-ink px-2 py-2 text-sm text-ivory" placeholder="Setup name" />
              <button type="button" onClick={saveSetup} className="rounded-md border border-gold-line px-3 py-2 text-xs uppercase tracking-[0.14em] text-ivory">Save setup</button>
              {setups.map((s) => (
                <button key={s.name} type="button" onClick={() => loadSetup(s.cells)} className="block text-left text-sm text-ivory">{s.name}</button>
              ))}
            </div>
          ) : null}
        </div>
      }
    >
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
        cue={cue}
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
    </Shell>
  );
}

export function VariantPlay({ mode, versus, game: online }: { mode: "checkmate" | "football" | "strategy"; versus: string; game?: string }) {
  const modes: Look[] = mode === "strategy" ? ["an", "lg"] : ["2d", "3d", "an", "lg"];
  const [look, setLook] = useState<Look>(() => {
    try {
      const saved = localStorage.getItem("morse-board-view");
      if (saved === "2d" || saved === "3d" || saved === "an" || saved === "lg") {
        if (mode === "strategy" && saved !== "an" && saved !== "lg") return "an";
        return saved;
      }
    } catch {
      /* ignore */
    }
    return mode === "strategy" ? "an" : "3d";
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
    if (!modes.includes(next)) return;
    setLook(next);
    try {
      localStorage.setItem("morse-board-view", next);
    } catch {
      /* ignore */
    }
    void setPieceStyle({ data: { style: next } }).catch(() => undefined);
  }
  const game = mode === "football" ? <Football versus={versus} online={online} /> : mode === "strategy" ? <Strategy versus={versus} /> : <CheckMate versus={versus} />;
  return (
    <LookCtx.Provider value={{ look, sky, light: skin.lightSq, dark: skin.darkSq, modes, setLook: choose }}>
      {game}
    </LookCtx.Provider>
  );
}
