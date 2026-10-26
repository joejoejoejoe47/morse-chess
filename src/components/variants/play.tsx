import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { PieceSymbol } from "chess.js";
import { ImagePlus } from "lucide-react";
import { ClubBrand } from "@/components/club-brand";
import { NamePlate } from "@/components/avatar/name-plate";
import { getHomeState } from "@/lib/server/mores";
import { setPieceStyle } from "@/lib/server/avatar";
import { boardById } from "@/lib/chess/board-skins";
import { roomBackdrop, useLookPrefs } from "@/lib/chess/look-prefs";
import { cn } from "@/lib/utils";
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
  children,
}: {
  title: string;
  status: string;
  clock?: string | null;
  opp: string;
  hot?: boolean;
  rail?: ReactNode;
  children: ReactNode;
}) {
  const { look, setLook } = useContext(LookCtx);
  const prefs = useLookPrefs();
  const [wash, setWash] = useState<"dark" | "light" | "color">("dark");
  const [chatOpen, setChatOpen] = useState(false);
  const [lines, setLines] = useState<{ id: number; from: string; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [camera, setCamera] = useState(false);
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
            {(["2d", "3d", "an", "lg"] as Look[]).map((id) => (
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
          <Link to="/" className="inline-flex min-h-11 items-center rounded-full border border-line bg-panel px-4 text-sm font-medium text-ivory hover:border-line-strong">
            Lounge
          </Link>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">{children}</div>
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
  const painted = (r: number, f: number) => {
    const p = paint(r, f);
    if (!plain.has(p.bg)) return p;
    return { ...p, bg: (r + f) % 2 === 0 ? light : dark };
  };
  if (look === "2d") {
    const cells = [];
    for (let r = rows - 1; r >= 0; r--) {
      for (let f = 0; f < cols; f++) {
        const p = painted(r, f);
        cells.push(
          <button
            key={`${r}:${f}`}
            type="button"
            onClick={() => onPick(r, f)}
            className="relative grid min-h-0 place-items-center [container-type:size]"
            style={{ background: p.bg }}
          >
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
          style={{ aspectRatio: `${cols} / ${rows}` }}
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
      <VariantStage rows={rows} cols={cols} onPick={onPick} units={units} look={look} sky={sky} ball={ball} paint={painted} />
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
    <Shell
      title="Check Mate"
      opp={versus}
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
    <Shell
      title="Football"
      opp={versus}
      clock={clock}
      hot={turn === "w" && !over}
      status={`${score.w}–${score.b}${result ? ` · ${result}` : turn === "w" ? " · Your down" : ` · ${versus}`}`}
    >
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
      {sel && board[sel[0]][sel[1]]?.ball && turn === "w" && !over ? (
        <button
          type="button"
          className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-line bg-ink/80 px-4 py-2 text-sm text-ivory"
          onClick={() => setThrowing((v) => !v)}
        >
          {throwing ? "Throwing — pick a teammate" : "Throw the ball"}
        </button>
      ) : null}
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
    <Shell
      title="Morse Strategy"
      opp={versus}
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
