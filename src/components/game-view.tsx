import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Chess, type Square } from "chess.js";
import { Flag, Undo2 } from "lucide-react";
import {
  claimTimeout,
  closeGameCamera,
  closeGameChat,
  getGame,
  getHomeState,
  joinQueue,
  makeMove,
  openGameCamera,
  openGameChat,
  openGameLive,
  resignGame,
  sendGameChat,
  type GameSnapshot,
} from "@/lib/server/mores";
import { formatClock, formatEloDelta, isBotUserId } from "@/lib/mores-constants";
import { Button } from "@/components/ui/button";
import { ClubBrand } from "@/components/club-brand";
import { BoardAdjustPanel } from "@/components/board-adjust";
import { useTheme } from "@/components/theme";
import { ChessBoard2D } from "@/components/chess/board-2d";
import { PieceMark, type PieceKind } from "@/components/chess/marks";
import { LiveCall } from "@/components/live-call";
import { equippedSkin } from "@/lib/chess/board-skins";
import { roomBackdrop, useLookPrefs } from "@/lib/chess/look-prefs";
import { useRoomModelUrl } from "@/lib/chess/room-model";
import { cn } from "@/lib/utils";

const ChessBoard3D = lazy(() =>
  import("@/components/chess/board-3d").then((m) => ({ default: m.ChessBoard3D })),
);

const DARK_ROOM = "#0c0d0b";
const LIGHT_ROOM = "#f6f1e4";

function colorLightness(r: number, g: number, b: number) {
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
}

function hexIsLight(hex: string) {
  const n = hex.replace("#", "");
  if (n.length < 6) return false;
  return (
    colorLightness(
      Number.parseInt(n.slice(0, 2), 16),
      Number.parseInt(n.slice(2, 4), 16),
      Number.parseInt(n.slice(4, 6), 16),
    ) >= 0.5
  );
}

function imageIsLight(src: string) {
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        resolve(false);
        return;
      }
      ctx.drawImage(img, 0, 0, 16, 16);
      const data = ctx.getImageData(0, 0, 16, 16).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += colorLightness(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
      }
      resolve(sum / (data.length / 4) >= 0.5);
    };
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

type BoardView = "2d" | "3d";

function readBoardView(): BoardView {
  try {
    return localStorage.getItem("morse-board-view") === "2d" ? "2d" : "3d";
  } catch {
    return "3d";
  }
}

let clickCtx: AudioContext | null = null;
let woodBuf: AudioBuffer | null = null;

function woodBuffer(c: AudioContext) {
  if (woodBuf && woodBuf.sampleRate === c.sampleRate) return woodBuf;
  const sr = c.sampleRate;
  const n = Math.floor(sr * 0.11);
  const buf = c.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 38);
    const body =
      Math.sin(2 * Math.PI * 156 * t) * 0.62 +
      Math.sin(2 * Math.PI * 86 * t) * 0.28 +
      Math.sin(2 * Math.PI * 228 * t) * 0.1;
    const tip = Math.sin(2 * Math.PI * 980 * t) * Math.exp(-t * 160) * 0.07;
    d[i] = (body * env + tip) * 0.16;
  }
  woodBuf = buf;
  return buf;
}

function chessClick(san?: string | null) {
  try {
    clickCtx ??= new AudioContext();
    const c = clickCtx;
    if (c.state === "suspended") void c.resume();
    const src = c.createBufferSource();
    src.buffer = woodBuffer(c);
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    const g = c.createGain();
    const capture = Boolean(san && san.includes("x"));
    g.gain.value = capture ? 0.55 : 0.4;
    src.connect(filter).connect(g).connect(c.destination);
    src.start();
  } catch {
    /* audio optional */
  }
}

function PromotionPicker({
  you,
  onPick,
  onCancel,
}: {
  you: "w" | "b";
  onPick: (kind: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
}) {
  const pieces: { kind: PieceKind; label: string }[] = [
    { kind: "q", label: "Queen" },
    { kind: "r", label: "Rook" },
    { kind: "b", label: "Bishop" },
    { kind: "n", label: "Knight" },
  ];
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-ink/75 px-5">
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-mist">Pawn to the far rank</p>
        <h2 className="mt-2 font-display text-3xl text-ivory">Choose a piece</h2>
        <div className="mt-5 grid grid-cols-4 gap-2">
          {pieces.map((p) => (
            <button
              key={p.kind}
              type="button"
              className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-md border border-line bg-ink-soft px-2 py-3 text-ivory hover:border-gold-line hover:bg-panel-2"
              onClick={() => onPick(p.kind as "q" | "r" | "b" | "n")}
            >
              <PieceMark kind={p.kind} tone={you} className="size-10" />
              <span className="text-xs text-mist">{p.label}</span>
            </button>
          ))}
        </div>
        <Button type="button" variant="ghost" className="mt-4" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ResultOverlay({ game }: { game: GameSnapshot }) {
  const navigate = useNavigate();
  const won =
    (game.status === "white_win" && game.you === "w") ||
    (game.status === "black_win" && game.you === "b");
  const draw = game.status === "draw";
  const [again, setAgain] = useState(false);
  const [left, setLeft] = useState(5);
  const [againError, setAgainError] = useState<string | null>(null);

  useEffect(() => {
    if (!again) return;
    const started = Date.now();
    let live = true;
    const tick = async () => {
      setLeft(Math.max(0, 5 - Math.floor((Date.now() - started) / 1000)));
      try {
        const home = await getHomeState();
        if (!live || !home.activeGameId || home.activeGameId === game.id) return;
        await navigate({ to: "/play/$gameId", params: { gameId: home.activeGameId } });
      } catch (err) {
        if (live) setAgainError(err instanceof Error ? err.message : "Could not start the next game.");
      }
    };
    void (async () => {
      try {
        const { gameId } = await joinQueue({ data: { mode: game.mode } });
        if (!live) return;
        if (gameId && gameId !== game.id) {
          await navigate({ to: "/play/$gameId", params: { gameId } });
          return;
        }
      } catch (err) {
        if (live) setAgainError(err instanceof Error ? err.message : "Could not start the next game.");
      }
    })();
    const id = window.setInterval(() => void tick(), 400);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [again, game.id, game.mode, navigate]);

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-ink/75 px-5">
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-mist">
          {draw ? "Drawn game" : won ? "Checkmate is yours" : "Checkmate against you"}
        </p>
        <h2 className="mt-3 font-display text-5xl text-ivory">
          {draw ? "Draw" : won ? "Victory" : "Defeat"}
        </h2>
        <p className="mt-4 text-base text-mist">
          {draw
            ? game.scorePrize
              ? `Elo evened ${formatEloDelta(game.scorePrize)}.`
              : "Elo evened."
            : won
              ? `Elo ${formatEloDelta(game.scorePrize ?? 0)} for the win.`
              : `Elo ${formatEloDelta(game.scorePrize ?? 0)} for the loss.`}
        </p>
        <p className="mt-1 font-mono text-lg tabular-nums text-ivory">Elo {game.myScore}</p>
        {again ? (
          <div className="mt-6 space-y-2">
            <p className="text-sm text-mist">Asking everyone at the boards.</p>
            <p className="font-display text-3xl tabular-nums text-ivory">{left}s</p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            {won && game.pull ? (
              <Button type="button" variant="solid" onClick={() => setAgain(true)}>
                Play again
              </Button>
            ) : null}
            <Button asChild variant={won && game.pull ? "outline" : "solid"}>
              <Link to="/">Return to the lounge</Link>
            </Button>
          </div>
        )}
        {againError ? <p className="mt-3 text-sm text-danger">{againError}</p> : null}
      </div>
    </div>
  );
}

export function GameView({ gameId }: { gameId: string }) {
  const theme = useTheme();
  const prefs = useLookPrefs();
  const [wash, setWash] = useState<"dark" | "light" | "color">("dark");
  const [photoLight, setPhotoLight] = useState(false);
  const roomColor = prefs.roomColor ?? DARK_ROOM;
  const modelUrl = useRoomModelUrl(prefs.roomScene === "model", prefs.modelRev);
  const cosmic = wash === "color" && (prefs.roomScene === "space" || prefs.roomScene === "model");
  const room = wash === "light" ? LIGHT_ROOM : wash === "dark" ? DARK_ROOM : cosmic ? "#05060c" : roomColor;
  const roomImage = wash === "color" && prefs.roomScene === "photo" ? prefs.roomImage : null;
  const liveScene = wash === "color" ? prefs.roomScene : "color";
  const backdropLight =
    wash === "light" ||
    (wash === "color" &&
      prefs.roomScene !== "space" &&
      prefs.roomScene !== "model" &&
      (prefs.roomScene === "photo" ? photoLight : hexIsLight(roomColor)));
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clocks, setClocks] = useState({ w: 0, b: 0 });
  const [view, setView] = useState<BoardView>(readBoardView);
  const [draft, setDraft] = useState("");
  const [seatVideo, setSeatVideo] = useState<HTMLVideoElement | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [tuning, setTuning] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  const lastSan = useRef<string | null>(null);
  const plyRef = useRef(0);
  const pollGen = useRef(0);
  const pendingMove = useRef(false);
  const claimingTimeout = useRef(false);

  useEffect(() => {
    if (wash !== "color" || prefs.roomScene !== "photo" || !prefs.roomImage) return;
    let live = true;
    void imageIsLight(prefs.roomImage).then((light) => {
      if (live) setPhotoLight(light);
    });
    return () => {
      live = false;
    };
  }, [wash, prefs.roomScene, prefs.roomImage]);

  function applySnap(snap: GameSnapshot, fromMove = false) {
    const ply = snap.moves.length;
    if (ply < plyRef.current) return;
    if (!fromMove && pendingMove.current && ply <= plyRef.current) return;
    plyRef.current = ply;
    if (fromMove) pendingMove.current = false;
    setGame(snap);
    setError(null);
    setClocks({ w: snap.whiteClockMs ?? 60_000, b: snap.blackClockMs ?? 60_000 });
    if (snap.lastMove && snap.lastMove.san !== lastSan.current) {
      chessClick(snap.lastMove.san);
      lastSan.current = snap.lastMove.san;
    }
  }

  useEffect(() => {
    let live = true;
    let inFlight = false;
    const tick = async () => {
      if (inFlight || pendingMove.current) return;
      const gen = ++pollGen.current;
      inFlight = true;
      try {
        const snap = await getGame({ data: { gameId } });
        if (!live || gen !== pollGen.current) return;
        if (!snap) {
          setError("This board is not yours, or it no longer exists.");
          return;
        }
        applySnap(snap);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Lost the board connection.");
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 900);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [gameId]);

  useEffect(() => {
    if (!game || game.mode !== "timed" || game.status !== "active") return;
    const id = window.setInterval(() => {
      setClocks((prev) => {
        const key = game.turn;
        const next = Math.max(0, prev[key] - 250);
        if (next === prev[key]) return prev;
        return { ...prev, [key]: next };
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [game?.mode, game?.status, game?.turn, game?.id]);

  useEffect(() => {
    if (!game || game.mode !== "timed" || game.status !== "active") return;
    if ((game.remainingMs ?? 1) > 0) return;
    const active = game.turn === "w" ? clocks.w : clocks.b;
    if (active > 0) return;
    if (claimingTimeout.current) return;
    claimingTimeout.current = true;
    void claimTimeout({ data: { gameId } })
      .then((snap) => {
        if (snap) applySnap(snap, true);
      })
      .finally(() => {
        claimingTimeout.current = false;
      });
  }, [clocks, game, gameId]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [game?.chat?.length, game?.chatOpen]);

  function setBoardView(next: BoardView) {
    setView(next);
    try {
      localStorage.setItem("morse-board-view", next);
    } catch {
      /* ignore */
    }
  }

  async function submitMove(from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") {
    const current = game;
    if (!current || current.status !== "active") return;
    try {
      const local = new Chess(current.fen);
      const moved = local.move({ from, to, promotion });
      if (moved) {
        pendingMove.current = true;
        plyRef.current = current.moves.length + 1;
        setGame({
          ...current,
          fen: local.fen(),
          turn: local.turn(),
          lastMove: { from: moved.from, to: moved.to, san: moved.san },
          moves: [...current.moves, { san: moved.san, from: moved.from, to: moved.to }],
        });
        chessClick(moved.san);
        lastSan.current = moved.san;
      }
    } catch {
      /* wait for server */
    }
    const res = await makeMove({ data: { gameId, from, to, promotion } });
    if (res.ok && res.game) {
      applySnap(res.game, true);
      return;
    }
    pendingMove.current = false;
    const fallback = "game" in res ? res.game : null;
    if (fallback) {
      plyRef.current = fallback.moves.length;
      applySnap(fallback, true);
    } else {
      const snap = await getGame({ data: { gameId } });
      if (snap) {
        plyRef.current = snap.moves.length;
        applySnap(snap, true);
      }
      if (!res.ok && res.error) setError(res.error);
    }
  }

  function onMove(from: Square, to: Square) {
    const current = game;
    if (!current || current.status !== "active") return;
    const piece = new Chess(current.fen).get(from);
    const needsPromo = piece?.type === "p" && (to.endsWith("8") || to.endsWith("1"));
    if (needsPromo) {
      setPromo({ from, to });
      return;
    }
    void submitMove(from, to);
  }

  if (error && !game) {
    return (
      <main className="grid min-h-dvh place-items-center px-5">
        <div className="max-w-sm text-center">
          <p className="text-base text-danger">{error}</p>
          <Button asChild variant="solid" className="mt-4">
            <Link to="/">Back to the lounge</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="text-base text-mist">Setting the board…</p>
      </main>
    );
  }

  const myTurn = game.status === "active" && game.turn === game.you;
  const myName = game.you === "w" ? game.white.username : game.black.username;
  const opp = game.you === "w" ? game.black : game.white;
  const myClock = game.you === "w" ? clocks.w : clocks.b;
  const oppClock = game.you === "w" ? clocks.b : clocks.w;
  const over = game.status !== "active";
  const skin = equippedSkin(game.myScore, game.myBoard, myName);
  const vsBot = isBotUserId(opp.userId);
  const selfId = game.you === "w" ? game.white.userId : game.black.userId;
  const cameraOn = view === "3d" && game.cameraOpen;
  const boardProps = {
    fen: game.fen,
    you: game.you,
    lastMove: game.lastMove,
    myTurn,
    onMove,
    disabled: over,
    appearance: theme,
    skin,
    outlineOn: prefs.outline,
  };

  return (
    <main
      className="relative flex h-dvh max-h-dvh flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      style={roomBackdrop(room, roomImage)}
    >
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">
        <ClubBrand to="/" tone={backdropLight ? "dark" : "light"} />
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <span className="hidden text-[15px] text-mist md:inline">
            {game.mode === "timed" ? "Timed · 1 min / turn" : "Breeze"}
            {" · "}
            {over ? "Board closed" : myTurn ? "Your move" : "Waiting"}
            {" · "}
            {skin.name}
          </span>
          <div className="flex overflow-hidden rounded-full border border-line bg-panel">
            <button
              type="button"
              className={cn(
                "min-h-11 min-w-11 px-4 py-2 text-sm font-medium sm:px-3 sm:py-1.5 sm:text-[13px]",
                view === "2d" ? "bg-ivory text-ink" : "text-mist hover:text-ivory",
              )}
              onClick={() => setBoardView("2d")}
            >
              2D
            </button>
            <button
              type="button"
              className={cn(
                "min-h-11 min-w-11 px-4 py-2 text-sm font-medium sm:px-3 sm:py-1.5 sm:text-[13px]",
                view === "3d" ? "bg-ivory text-ink" : "text-mist hover:text-ivory",
              )}
              onClick={() => setBoardView("3d")}
            >
              3D
            </button>
          </div>
          <button
            type="button"
            className="min-h-11 rounded-full border border-line bg-panel px-4 py-2 text-sm font-medium text-ivory hover:border-line-strong"
            onClick={() => setTuning(true)}
          >
            Use
          </button>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-line bg-panel">
              <button
                type="button"
                className={cn(
                  "min-h-11 px-3 text-sm font-medium",
                  wash === "dark" ? "bg-ivory text-ink" : "text-mist hover:text-ivory",
                )}
                onClick={() => setWash("dark")}
              >
                Dark
              </button>
              <button
                type="button"
                className={cn(
                  "min-h-11 px-3 text-sm font-medium",
                  wash === "light" ? "bg-ivory text-ink" : "text-mist hover:text-ivory",
                )}
                onClick={() => setWash("light")}
              >
                Light
              </button>
            </div>
            <button
              type="button"
              aria-label="Board color"
              title="Board color"
              className={cn(
                "size-11 rounded-full border",
                wash === "color" ? "border-gold-line ring-2 ring-gold-line/50" : "border-line",
              )}
              style={
                prefs.roomScene === "space"
                  ? {
                      backgroundColor: "#070b16",
                      backgroundImage:
                        "radial-gradient(circle at 30% 35%, #f6e7b2 0 1.5px, transparent 2px), radial-gradient(circle at 68% 62%, #fff 0 1px, transparent 1.6px), radial-gradient(circle at 48% 70%, #9ecbff 0 1px, transparent 1.6px)",
                    }
                  : prefs.roomScene === "model"
                    ? { backgroundColor: "#1c2030" }
                    : prefs.roomImage
                      ? {
                          backgroundImage: `url("${prefs.roomImage}")`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : { backgroundColor: prefs.roomColor ?? DARK_ROOM }
              }
              onClick={() => setWash("color")}
            />
          </div>
          {game.status === "active" ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={async () => {
                const snap = await resignGame({ data: { gameId } });
                if (snap) applySnap(snap, true);
              }}
            >
              <Flag className="size-3.5" />
              Resign
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link to="/">
                <Undo2 className="size-3.5" />
                Lounge
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          {view === "2d" ? (
            <ChessBoard2D {...boardProps} />
          ) : (
            <Suspense
              fallback={
                <div className="grid h-full place-items-center text-base text-mist">Setting the board…</div>
              }
            >
              <ChessBoard3D
                {...boardProps}
                roomColor={room}
                roomImage={roomImage}
                roomScene={liveScene}
                modelUrl={liveScene === "model" ? modelUrl : null}
                tableSeat={cameraOn ? (vsBot ? "bot" : "video") : null}
                seatVideo={seatVideo}
              />
            </Suspense>
          )}
        </div>
        {error ? (
          <p className="pointer-events-none absolute left-1/2 top-12 z-10 -translate-x-1/2 rounded-full bg-ink/70 px-3 py-1.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
        {tuning ? (
          <div className="absolute inset-x-3 bottom-[max(5.5rem,env(safe-area-inset-bottom))] z-30 flex justify-center sm:inset-x-4">
            <BoardAdjustPanel
              title="Board look"
              enterLabel="Enter"
              allowBackground={false}
              showClubLight={false}
              onEnter={() => setTuning(false)}
              onClose={() => setTuning(false)}
            />
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex justify-between gap-2 sm:inset-x-4 sm:bottom-4">
          <HudChip
            label="Opponent"
            name={opp.username}
            clock={game.mode === "timed" ? oppClock : null}
            hot={!myTurn && !over}
          />
          <HudChip
            label="You"
            name={myName}
            clock={game.mode === "timed" ? myClock : null}
            hot={myTurn && !over}
            align="right"
          />
        </div>
        {promo && !over ? (
          <PromotionPicker
            you={game.you}
            onPick={(kind) => {
              const next = promo;
              setPromo(null);
              void submitMove(next.from, next.to, kind);
            }}
            onCancel={() => setPromo(null)}
          />
        ) : null}
        {over ? <ResultOverlay game={game} /> : null}
        {cameraOn && !vsBot ? (
          <LiveCall
            gameId={game.id}
            selfId={selfId}
            name={myName}
            audio={false}
            video
            hud={false}
            onRemoteVideo={setSeatVideo}
          />
        ) : null}
        {game.chatOpen ? (
          <aside className="absolute inset-x-0 bottom-0 z-20 flex max-h-[48%] flex-col border-t border-line bg-ink/95 backdrop-blur-md sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(100%,20rem)] sm:border-l sm:border-t-0">
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-mist">Table chat</p>
              <div className="flex flex-wrap justify-end gap-2">
                {view === "3d" ? (
                  <button
                    type="button"
                    className="min-h-11 rounded-full border border-line px-3 text-sm text-ivory hover:border-line-strong"
                    onClick={async () => {
                      const snap = game.cameraOpen
                        ? await closeGameCamera({ data: { gameId } })
                        : await openGameCamera({ data: { gameId } });
                      if (snap) applySnap(snap, true);
                    }}
                  >
                    {game.cameraOpen ? "Camera off" : "Real life"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="min-h-11 rounded-full border border-line px-3 text-sm text-ivory hover:border-line-strong"
                  onClick={async () => {
                    const snap = await closeGameChat({ data: { gameId } });
                    if (snap) applySnap(snap, true);
                  }}
                >
                  Put away
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {(game.chat ?? []).length === 0 ? (
                <p className="text-[13px] text-mist">Say something. The user sees it on this same table.</p>
              ) : (
                (game.chat ?? []).map((m) => (
                  <div key={m.id} className="rounded-lg bg-panel px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-mist">{m.from}</p>
                    <p className="mt-0.5 text-[15px] text-ivory">{m.text}</p>
                  </div>
                ))
              )}
              <div ref={chatEnd} />
            </div>
            <form
              className="border-t border-line p-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const text = draft.trim();
                if (!text) return;
                setDraft("");
                const snap = await sendGameChat({ data: { gameId, text } });
                if (snap) applySnap(snap, true);
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message…"
                maxLength={280}
                className="w-full rounded-lg border border-line bg-panel px-3 py-3 text-base text-ivory outline-none placeholder:text-mist focus:border-gold-line"
              />
            </form>
            {game.liveOpen && !vsBot ? (
              <LiveCall gameId={game.id} selfId={selfId} name={myName} audio />
            ) : (
              <div className="border-t border-line p-2">
                <button
                  type="button"
                  className="min-h-11 w-full rounded-lg border border-line bg-forest px-3 text-sm text-ivory disabled:opacity-40"
                  disabled={vsBot}
                  onClick={async () => {
                    const snap = await openGameLive({ data: { gameId } });
                    if (snap) applySnap(snap, true);
                  }}
                >
                  {vsBot ? "MorseBot has no voice" : "Live"}
                </button>
              </div>
            )}
          </aside>
        ) : (
          <div className="absolute right-3 top-[42%] z-10 flex -translate-y-1/2 flex-col items-end gap-2">
            <button
              type="button"
              className="min-h-11 rounded-full border border-line bg-ink/80 px-4 py-2 text-sm text-ivory backdrop-blur-sm hover:border-line-strong"
              onClick={async () => {
                const snap = await openGameChat({ data: { gameId } });
                if (snap) applySnap(snap, true);
              }}
            >
              Chat
            </button>
            {view === "3d" ? (
              game.cameraOpen ? (
                <button
                  type="button"
                  className="min-h-11 rounded-full border border-line bg-ink/80 px-4 py-2 text-sm text-ivory backdrop-blur-sm hover:border-line-strong"
                  onClick={async () => {
                    const snap = await closeGameCamera({ data: { gameId } });
                    if (snap) applySnap(snap, true);
                  }}
                >
                  Camera off
                </button>
              ) : (
                <button
                  type="button"
                  className="min-h-11 rounded-full border border-line bg-ink/80 px-4 py-2 text-sm text-ivory backdrop-blur-sm hover:border-line-strong"
                  onClick={async () => {
                    const snap = await openGameCamera({ data: { gameId } });
                    if (snap) applySnap(snap, true);
                  }}
                >
                  Real life
                </button>
              )
            ) : null}
            {game.liveOpen && !vsBot ? (
              <div className="w-56 rounded-full bg-ink/80 backdrop-blur-md">
                <LiveCall gameId={game.id} selfId={selfId} name={myName} audio />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

function HudChip({
  label,
  name,
  clock,
  hot,
  align,
}: {
  label: string;
  name: string;
  clock: number | null;
  hot: boolean;
  align?: "right";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-ink/75 px-4 py-2.5 backdrop-blur-sm",
        align === "right" && "text-right",
      )}
    >
      <p className="text-xs uppercase tracking-[0.16em] text-mist">{label}</p>
      <p className="font-display text-2xl leading-tight text-ivory">{name}</p>
      {clock !== null ? (
        <p className={cn("font-display text-3xl tabular-nums", hot ? "text-cream" : "text-mist")}>
          {formatClock(clock)}
        </p>
      ) : null}
    </div>
  );
}
