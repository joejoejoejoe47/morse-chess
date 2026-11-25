/**
 * MB-20 Training Grounds (owner t381u, images 4 + 5): play the computer, Legendary only.
 * Setup modal = lichess "Play against computer"; the game = lichess's board page (info card left,
 * brown board centre, clocks + moves + controls right), kept close to the ref and dressed in the
 * Legendary purple and gold. Everything runs in the browser and is saved in localStorage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Flag, Menu, RotateCcw, Swords } from "lucide-react";
import { asset } from "@/lib/base";
import { playSfx } from "@/lib/legendary/sfx";
import {
  T_VARIANTS,
  applyMove,
  boardResult,
  checkSquare,
  clockText,
  computerMove,
  loadSaved,
  needsPromo,
  newGame,
  piecesOf,
  save,
  scoreForWhite,
  targets as targetsOf,
  turnOf,
  type TGame,
  type TSetup,
} from "@/lib/legendary/training";
import { TrainingSetup } from "./setup-modal";
import "./training.css";

const pieceUrl = (code: string) => asset(`/legendary/bc/pieces/${code}.svg`);
const FILES = "abcdefgh";

export function TrainingPage() {
  const [{ setup, game }, setAll] = useState<{ setup: TSetup; game: TGame | null }>(() => loadSaved());
  const [modal, setModal] = useState(() => !loadSaved().game || !!loadSaved().game?.result);
  const [view, setView] = useState<number | null>(null); // ply being looked at; null = live
  const [thinking, setThinking] = useState(false);
  const [, tick] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const setGame = useCallback((g: TGame | null, s?: TSetup) => {
    setAll((o) => {
      const next = { setup: s ?? o.setup, game: g };
      save(next.setup, next.game);
      return next;
    });
  }, []);

  const fen = game ? game.fens[game.fens.length - 1] : null;
  const shownPly = game ? (view ?? game.fens.length - 1) : 0;
  const shownFen = game ? game.fens[shownPly] : null;
  const live = !!game && view === null;
  const turn = fen ? turnOf(fen) : "w";
  const yourTurn = !!game && !game.result && turn === game.you;

  // clocks
  useEffect(() => {
    if (!game || game.result || game.setup.mode === "unlimited") return;
    const id = window.setInterval(() => tick((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [game]);
  const clockLeft = (c: "w" | "b") => {
    if (!game) return 0;
    const base = game.clock[c];
    if (game.result || !game.tickAt || turn !== c || game.setup.mode === "unlimited") return base;
    return base - (Date.now() - game.tickAt);
  };
  // flag fall
  useEffect(() => {
    if (!game || game.result || game.setup.mode === "unlimited" || !game.tickAt) return;
    if (clockLeft(turn) <= 0) {
      setGame({ ...game, clock: { ...game.clock, [turn]: 0 }, result: { winner: turn === "w" ? "b" : "w", reason: game.setup.mode === "corr" ? "Time is up for the move" : "Time out" } });
      playSfx("tap");
    }
  });

  const play = useCallback(
    (g: TGame, from: string, to: string, promo?: string | null): TGame | null => {
      const cur = g.fens[g.fens.length - 1];
      const r = applyMove(g.setup.variant, cur, from, to, promo);
      if (!r) return null;
      const mover = turnOf(cur);
      const now = Date.now();
      const clock = { ...g.clock };
      if (g.setup.mode === "realtime") {
        if (g.tickAt) clock[mover] = clock[mover] - (now - g.tickAt) + g.setup.inc * 1000;
      } else if (g.setup.mode === "corr") {
        clock[mover] = g.setup.days * 86_400_000;
      }
      const fens = [...g.fens, r.fen];
      const next: TGame = { ...g, fens, sans: [...g.sans, r.san], last: [...g.last, [from, to]], clock, tickAt: g.setup.mode === "unlimited" ? 0 : now, result: boardResult(g.setup.variant, fens) };
      playSfx("tap", r.capture ? 1 : 0.6);
      return next;
    },
    [],
  );

  // the computer's turn
  useEffect(() => {
    if (!game || game.result || turn === game.you || thinking) return;
    let alive = true;
    setThinking(true);
    const g = game;
    void computerMove(g.setup.variant, g.fens[g.fens.length - 1], g.setup.level).then((m) => {
      if (!alive) return;
      setThinking(false);
      if (!m) return;
      const n = play(g, m.from, m.to, m.promo);
      if (n) setGame(n);
    });
    return () => {
      alive = false;
      setThinking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.fens.length, game?.result, game?.id]);

  function start(s: TSetup) {
    const g = newGame(s);
    setView(null);
    setNote(null);
    setGame(g, s);
    setModal(false);
    playSfx("whoosh");
  }
  function takeback() {
    if (!game || game.result || thinking) return;
    let n = game.fens.length - 1;
    if (n <= 0) return;
    n -= turnOf(game.fens[n]) === game.you ? 2 : 1;
    if (n < 0) return;
    if (turnOf(game.fens[n]) !== game.you) return;
    setView(null);
    setGame({ ...game, fens: game.fens.slice(0, n + 1), sans: game.sans.slice(0, n), last: game.last.slice(0, n) });
  }
  function offerDraw() {
    if (!game || game.result) return;
    const s = scoreForWhite(game.setup.variant, game.fens[game.fens.length - 1]);
    const forComputer = game.you === "w" ? -s : s;
    if (game.sans.length >= 20 && forComputer < -150) {
      setGame({ ...game, result: { winner: null, reason: "Draw by agreement" } });
    } else {
      setNote("The computer declines your draw offer.");
      window.setTimeout(() => setNote(null), 2500);
    }
  }
  function resign() {
    if (!game || game.result) return;
    setGame({ ...game, result: { winner: game.you === "w" ? "b" : "w", reason: "Resignation" } });
  }

  // keyboard navigation like lichess
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!game || modal) return;
      const last = game.fens.length - 1;
      const cur = view ?? last;
      const go = (n: number) => setView(n >= last ? null : Math.max(0, n));
      if (e.key === "ArrowLeft") go(cur - 1);
      else if (e.key === "ArrowRight") go(cur + 1);
      else if (e.key === "ArrowUp" || e.key === "Home") go(0);
      else if (e.key === "ArrowDown" || e.key === "End") go(last);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [game, view, modal]);

  const v = game ? T_VARIANTS.find((x) => x.id === game.setup.variant)! : T_VARIANTS[0];
  const modeText = game ? (game.setup.mode === "unlimited" ? "Unlimited" : game.setup.mode === "corr" ? `${game.setup.days} day${game.setup.days === 1 ? "" : "s"}` : `${game.setup.minutes}+${game.setup.inc}`) : "";
  const you = game?.you ?? "w";
  const comp = you === "w" ? "b" : "w";
  const lastMove = game && shownPly > 0 ? game.last[shownPly - 1] : null;

  return (
    <main className="mcl-tr" data-training>
      <div className="mcl-tr-bg" aria-hidden />
      <header className="mcl-tr-top">
        <Link to="/" className="mcl-tr-brand" onClick={() => playSfx("tap")} data-training-home>
          <img src={asset("/legendary/ui/logo-shield.webp")} alt="" />
          <span>
            <b>Training Grounds</b>
            <small>Morse Chess Legendary</small>
          </span>
        </Link>
        <nav className="mcl-tr-nav">
          <button type="button" onClick={() => setModal(true)} data-training-new>
            <Swords className="size-4" /> New game
          </button>
          <Link to="/">Lounge</Link>
        </nav>
      </header>

      {game ? (
        <div className="mcl-tr-layout">
          <aside className="mcl-tr-info" data-training-info>
            <div className="mcl-tr-info-head">
              <span className="mcl-tr-info-icon">{v.icon}</span>
              <div>
                <p>
                  {modeText} • Casual • <span className="mcl-tr-link">{v.name.toUpperCase()}</span>
                </p>
                <small>{agoText(game.createdAt)}</small>
              </div>
            </div>
            <p className="mcl-tr-info-line">
              <i className="is-w" /> {you === "w" ? "You" : `Stockfish level ${game.setup.level}`}
            </p>
            <p className="mcl-tr-info-line">
              <i className="is-b" /> {you === "b" ? "You" : `Stockfish level ${game.setup.level}`}
            </p>
            {game.result ? <p className="mcl-tr-info-res">{resultText(game)}</p> : null}
          </aside>

          <section className="mcl-tr-boardwrap">
            <Board
              fen={shownFen!}
              orient={you}
              lastMove={lastMove}
              check={shownFen ? checkSquare(game.setup.variant, shownFen) : null}
              canMove={live && yourTurn && !thinking}
              targetsFor={(sq) => targetsOf(game.setup.variant, fen!, sq)}
              needsPromo={(f, t) => needsPromo(game.setup.variant, fen!, f, t)}
              onMove={(f, t, p) => {
                const n = play(game, f, t, p);
                if (n) setGame(n);
              }}
            />
          </section>

          <aside className="mcl-tr-side">
            {game.setup.mode !== "unlimited" ? <div className={`mcl-tr-clock ${turn === comp && !game.result ? "is-run" : ""}`} data-clock={comp}>{clockText(clockLeft(comp), game.setup.mode)}</div> : null}
            <div className="mcl-tr-panel">
              <p className="mcl-tr-who">
                <i className={thinking ? "is-think" : ""} /> Stockfish level {game.setup.level}
              </p>
              <div className="mcl-tr-navbar">
                <button type="button" aria-label="Flip" onClick={() => setView(0)} title="First move">
                  <ChevronFirst className="size-4" />
                </button>
                <button type="button" aria-label="Back" onClick={() => setView(Math.max(0, shownPly - 1))}>
                  <ChevronLeft className="size-4" />
                </button>
                <button type="button" aria-label="Forward" onClick={() => setView(shownPly + 1 >= game.fens.length - 1 ? null : shownPly + 1)}>
                  <ChevronRight className="size-4" />
                </button>
                <button type="button" aria-label="Last" onClick={() => setView(null)}>
                  <ChevronLast className="size-4" />
                </button>
                <button type="button" aria-label="Menu" onClick={() => setModal(true)}>
                  <Menu className="size-4" />
                </button>
              </div>
              <MoveList sans={game.sans} cur={shownPly} onPick={(n) => setView(n >= game.fens.length - 1 ? null : n)} />
              {game.result ? (
                <div className="mcl-tr-over" data-training-over>
                  <b>{game.result.winner === null ? "½-½" : game.result.winner === "w" ? "1-0" : "0-1"}</b>
                  <span>{resultText(game)}</span>
                  <div>
                    <button type="button" className="mcl-tr-btn is-gold" onClick={() => start({ ...game.setup })} data-training-rematch>
                      Rematch
                    </button>
                    <button type="button" className="mcl-tr-btn" onClick={() => setModal(true)}>
                      New opponent
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mcl-tr-actions">
                  <button type="button" title="Propose a takeback" onClick={takeback} data-training-takeback>
                    <RotateCcw className="size-4" />
                  </button>
                  <button type="button" title="Offer draw" onClick={offerDraw} className="mcl-tr-half">
                    ½
                  </button>
                  <button type="button" title="Resign" onClick={resign} data-training-resign>
                    <Flag className="size-4" />
                  </button>
                </div>
              )}
              {note ? <p className="mcl-tr-note">{note}</p> : null}
              <p className="mcl-tr-who">
                <i className="is-on" /> You
              </p>
            </div>
            {game.setup.mode !== "unlimited" ? <div className={`mcl-tr-clock ${turn === you && !game.result ? "is-run is-you" : ""}`} data-clock={you}>{clockText(clockLeft(you), game.setup.mode)}</div> : null}
          </aside>
        </div>
      ) : (
        <div className="mcl-tr-empty">
          <img src={asset("/legendary/ui/mi-training.svg")} alt="" />
          <p>Sharpen your game against the computer. No Elo, no coins, just practice.</p>
          <button type="button" className="mcl-tr-btn is-gold" onClick={() => setModal(true)}>
            Play against computer
          </button>
        </div>
      )}

      {modal ? <TrainingSetup initial={setup} onPlay={start} onClose={game ? () => setModal(false) : undefined} /> : null}
    </main>
  );
}

function agoText(t: number) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "right now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function resultText(g: TGame) {
  const r = g.result!;
  if (r.winner === null) return `${r.reason} • Draw`;
  const won = r.winner === g.you;
  return `${r.reason} • ${r.winner === "w" ? "White" : "Black"} is victorious${won ? " — that's you!" : ""}`;
}

function MoveList({ sans, cur, onPick }: { sans: string[]; cur: number; onPick: (ply: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector(".is-cur")?.scrollIntoView({ block: "nearest" });
  }, [cur, sans.length]);
  const rows: [number, string, string | undefined][] = [];
  for (let i = 0; i < sans.length; i += 2) rows.push([i / 2 + 1, sans[i], sans[i + 1]]);
  return (
    <div className="mcl-tr-moves" ref={box} data-training-moves>
      {rows.length ? (
        rows.map(([n, a, b]) => (
          <div key={n} className="mcl-tr-mrow">
            <span className="mcl-tr-mn">{n}</span>
            <button type="button" className={cur === n * 2 - 1 ? "is-cur" : ""} onClick={() => onPick(n * 2 - 1)}>
              {a}
            </button>
            {b ? (
              <button type="button" className={cur === n * 2 ? "is-cur" : ""} onClick={() => onPick(n * 2)}>
                {b}
              </button>
            ) : (
              <span />
            )}
          </div>
        ))
      ) : (
        <p className="mcl-tr-mempty">Your move. Good luck!</p>
      )}
    </div>
  );
}

/** Lichess-style board: click or drag, legal-move dots, last move + check highlights, promotion chooser. */
function Board({
  fen,
  orient,
  lastMove,
  check,
  canMove,
  targetsFor,
  needsPromo: promoNeeded,
  onMove,
}: {
  fen: string;
  orient: "w" | "b";
  lastMove: [string, string] | null;
  check: string | null;
  canMove: boolean;
  targetsFor: (sq: string) => string[];
  needsPromo: (from: string, to: string) => boolean;
  onMove: (from: string, to: string, promo?: string) => void;
}) {
  const pieces = useMemo(() => piecesOf(fen), [fen]);
  const [sel, setSel] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [drag, setDrag] = useState<{ sq: string; x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const me = turnOf(fen);
  useEffect(() => {
    setSel(null);
    setPromo(null);
  }, [fen]);
  const tg = useMemo(() => (sel && canMove ? targetsFor(sel) : []), [sel, canMove, targetsFor]);
  const squares: string[] = [];
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) squares.push(orient === "w" ? FILES[f] + (8 - r) : FILES[7 - f] + (r + 1));
  const sqAt = (x: number, y: number) => {
    const b = ref.current?.getBoundingClientRect();
    if (!b) return null;
    const f = Math.floor(((x - b.left) / b.width) * 8), r = Math.floor(((y - b.top) / b.height) * 8);
    if (f < 0 || f > 7 || r < 0 || r > 7) return null;
    return squares[r * 8 + f];
  };
  const tryMove = (from: string, to: string) => {
    if (!targetsFor(from).includes(to)) return false;
    if (promoNeeded(from, to)) setPromo({ from, to });
    else onMove(from, to);
    return true;
  };
  const own = (sq: string) => pieces[sq]?.[0] === me;

  return (
    <div
      ref={ref}
      className="mcl-tr-board"
      data-training-board
      onPointerMove={(e) => drag && setDrag({ ...drag, x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        if (!drag) return;
        const to = sqAt(e.clientX, e.clientY);
        const from = drag.sq;
        setDrag(null);
        if (to && to !== from && tryMove(from, to)) setSel(null);
      }}
    >
      {squares.map((sq, i) => {
        const f = FILES.indexOf(sq[0]), r = Number(sq[1]) - 1;
        const light = (f + r) % 2 === 1;
        const p = pieces[sq];
        const isT = tg.includes(sq);
        const row = Math.floor(i / 8), col = i % 8;
        return (
          <div
            key={sq}
            className={`mcl-tr-sq ${light ? "is-l" : "is-d"} ${lastMove && (lastMove[0] === sq || lastMove[1] === sq) ? "is-last" : ""} ${sel === sq ? "is-sel" : ""} ${check === sq ? "is-check" : ""}`}
            data-sq={sq}
            onPointerDown={(e) => {
              if (!canMove) return;
              if (sel && sel !== sq && tg.includes(sq)) {
                tryMove(sel, sq);
                setSel(null);
                return;
              }
              if (p && own(sq)) {
                setSel(sq);
                setDrag({ sq, x: e.clientX, y: e.clientY });
                (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
              } else setSel(null);
            }}
          >
            {p && !(drag && drag.sq === sq) ? <img src={pieceUrl(p)} alt={p} draggable={false} /> : null}
            {isT ? <span className={p ? "mcl-tr-cap" : "mcl-tr-dot"} /> : null}
            {col === 7 ? <span className="mcl-tr-rank">{sq[1]}</span> : null}
            {row === 7 ? <span className="mcl-tr-file">{sq[0]}</span> : null}
          </div>
        );
      })}
      {drag && pieces[drag.sq] ? (
        <img
          className="mcl-tr-ghost"
          src={pieceUrl(pieces[drag.sq])}
          alt=""
          style={{ left: drag.x - (ref.current?.getBoundingClientRect().left ?? 0), top: drag.y - (ref.current?.getBoundingClientRect().top ?? 0) }}
        />
      ) : null}
      {promo ? (
        <div className="mcl-tr-promo" data-training-promo>
          {["q", "n", "r", "b"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                onMove(promo.from, promo.to, k);
                setPromo(null);
              }}
            >
              <img src={pieceUrl(me + k.toUpperCase())} alt={k} />
            </button>
          ))}
          <button type="button" className="mcl-tr-promo-x" onClick={() => setPromo(null)}>
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
