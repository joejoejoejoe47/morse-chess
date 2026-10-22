import { createFileRoute, Link } from "@tanstack/react-router";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { ClubBrand } from "@/components/club-brand";
import { ChessBoard2D } from "@/components/chess/board-2d";
import { ChessBoard3D } from "@/components/chess/board-3d";
import { GLADE_PITCH } from "@/components/chess/glade-field";
import { SKY_ARENA_CAMERA } from "@/components/chess/sky-arena-board";
import { LEGO_BOARD_ID, LEGO_CAMERA } from "@/components/chess/lego-board";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { boardById } from "@/lib/chess/board-skins";
import { squareToWorld } from "@/lib/chess/board-math";
import { judgeGame, replayLine, type GameJudgment, type Judgment } from "@/lib/history/judge";
import { isMuted, playSfx, primeSfx, setMuted } from "@/lib/history/sfx";
import { historyGame, type HistoryGame } from "@/lib/server/mores";

type Cam = "white" | "black" | "top" | "orbit" | "free";
type Search = { ply?: number; cam?: Cam; play?: boolean };

export const Route = createFileRoute("/history/$gameId")({
  component: ReplayRoute,
  validateSearch: (s: Record<string, unknown>): Search => ({
    ply: s.ply !== undefined && Number.isFinite(Number(s.ply)) ? Number(s.ply) : undefined,
    cam: ["white", "black", "top", "orbit", "free"].includes(String(s.cam))
      ? (s.cam as Cam)
      : undefined,
    play: s.play === true || s.play === "1" || s.play === 1 ? true : undefined,
  }),
});

function ReplayRoute() {
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return <ReplayLoader />;
}

function ReplayLoader() {
  const { gameId } = Route.useParams();
  const [game, setGame] = useState<HistoryGame | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    historyGame({ data: { gameId } })
      .then((g) => live && setGame(g))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load that game."));
    return () => {
      live = false;
    };
  }, [gameId]);
  if (error || game === null) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink p-6 text-ivory">
        <div className="border border-line bg-panel/50 p-6 text-center">
          <p>{error ?? "That game is not in your history."}</p>
          <Link
            to="/history"
            className="mt-4 inline-block rounded-none border border-gold-line/60 px-5 py-2 text-sm"
          >
            Back to History
          </Link>
        </div>
      </main>
    );
  }
  if (!game) return <SplashSkeleton />;
  return <Replay game={game} />;
}

const VERDICT: Record<
  Judgment,
  { label: string; emoji: string; tone: string; count: number; extra?: string }
> = {
  brilliant: { label: "Brilliant", emoji: "✅", extra: "🔥", tone: "#1bb8a6", count: 9 },
  great: { label: "Great", emoji: "✅", tone: "#3f8fd8", count: 5 },
  good: { label: "Good", emoji: "✅", tone: "#5c9e45", count: 3 },
  inaccuracy: { label: "Inaccuracy", emoji: "❓", tone: "#d6a531", count: 3 },
  mistake: { label: "Mistake", emoji: "❌", tone: "#e07b2e", count: 3 },
  blunder: { label: "Blunder", emoji: "❌", tone: "#d03b3b", count: 8 },
};

const SPEEDS = [0.5, 1, 2, 4] as const;
const BASE_STEP_MS = 1500;

function Replay({ game }: { game: HistoryGame }) {
  const search = Route.useSearch();
  const { fens, played } = useMemo(() => replayLine(game.moves), [game.moves]);
  const total = played.length;
  const [ply, setPly] = useState(() => Math.max(0, Math.min(total, search.ply ?? 0)));
  const [playing, setPlaying] = useState(Boolean(search.play));
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [cam, setCam] = useState<Cam>(search.cam ?? (game.you === "w" ? "white" : "black"));
  const [muted, setMutedState] = useState(() => isMuted());
  const [judged, setJudged] = useState<GameJudgment | null>(null);
  const [judgeDone, setJudgeDone] = useState(false);
  const [burst, setBurst] = useState<{ ply: number; key: number } | null>(null);
  const burstKey = useRef(0);
  const skin = boardById(game.board);
  const flat = game.style === "2d";

  useEffect(() => {
    const stop = judgeGame(game.id, game.moves, (j, done) => {
      setJudged(j);
      if (done) setJudgeDone(true);
    });
    return stop;
  }, [game.id, game.moves]);

  const verdictAt = useCallback(
    (p: number) => (p > 0 ? judged?.verdicts[p - 1] : undefined),
    [judged],
  );

  /** Arrive at ply p by moving forward one move: emojis + sound. */
  const announce = useCallback(
    (p: number) => {
      const mv = played[p - 1];
      if (!mv) return;
      const v = verdictAt(p);
      burstKey.current += 1;
      setBurst({ ply: p, key: burstKey.current });
      if (v) void playSfx(v.kind);
      if (mv.san.includes("#")) void playSfx("mate", 160);
      else if (mv.san.includes("+")) void playSfx("check", 120);
      else if (mv.captured) void playSfx("capture", 60);
    },
    [played, verdictAt],
  );

  // Show the emojis for a ply opened from a link (?ply=N) once its verdict is known.
  const linked = useRef(search.ply ?? 0);
  useEffect(() => {
    if (linked.current > 0 && verdictAt(linked.current)) {
      burstKey.current += 1;
      setBurst({ ply: linked.current, key: burstKey.current });
      linked.current = 0;
    }
  }, [verdictAt]);

  const stepForward = useCallback(() => {
    setPly((p) => {
      if (p >= total) return p;
      const n = p + 1;
      queueMicrotask(() => announce(n));
      return n;
    });
  }, [total, announce]);

  // Autoplay. Waits for the next move's verdict while the engine is still judging,
  // so every move arrives with its emojis and sound.
  const nextReady = judgeDone || !!verdictAt(ply + 1);
  useEffect(() => {
    if (!playing) return;
    if (ply >= total) {
      setPlaying(false);
      return;
    }
    if (!nextReady) return;
    const t = window.setTimeout(stepForward, BASE_STEP_MS / speed);
    return () => window.clearTimeout(t);
  }, [playing, ply, total, nextReady, speed, stepForward]);

  // Keyboard: space play/pause, arrows step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
      if (e.key === " ") {
        e.preventDefault();
        primeSfx();
        setPlaying((x) => !x);
      } else if (e.key === "ArrowRight") {
        primeSfx();
        setPlaying(false);
        stepForward();
      } else if (e.key === "ArrowLeft") {
        setPlaying(false);
        setPly((p) => Math.max(0, p - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepForward]);

  const fen = fens[ply] ?? fens[0];
  const last = ply > 0 ? played[ply - 1] : null;
  const lastMove = last ? { from: last.from, to: last.to } : null;
  const current = verdictAt(ply);
  const judgedCount = judged?.verdicts.length ?? 0;
  const pitch = skin.id === "grassland" || skin.id === "castle" ? GLADE_PITCH : 1;
  const burstMove = burst ? played[burst.ply - 1] : null;
  const burstVerdict = burst ? verdictAt(burst.ply) : undefined;
  const resultText =
    game.result === "win" ? "You won" : game.result === "loss" ? "You lost" : "Draw";

  const overlay = (
    <>
      <CameraDirector mode={cam} you={game.you} skinId={game.style === "lg" ? LEGO_BOARD_ID : skin.id} onGrab={() => setCam("free")} />
      {burst && burstMove && burstVerdict && burst.ply === ply ? (
        <EmojiBurst
          key={burst.key}
          at={squareToWorld(burstMove.to, pitch)}
          kind={burstVerdict.kind}
          lift={pitch > 1 ? 2.4 : 1.15}
        />
      ) : null}
    </>
  );

  return (
    <main className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-ink pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-ivory">
      <header
        data-coin-bar
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6"
      >
        <ClubBrand to="/" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="hidden text-mist md:inline">
            {game.white.username} vs {game.black.username} ·{" "}
            {game.minutes ? `${game.minutes} min` : "Breeze"} ·{" "}
            {new Date(game.createdAt).toLocaleDateString()} · {resultText} · {skin.name}
          </span>
          <Link
            to="/history"
            className="min-h-10 rounded-none border border-line px-4 py-2 text-mist hover:border-gold-line hover:text-ivory"
          >
            History
          </Link>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-0 flex-1" data-replay-board>
          {flat ? (
            <div className="relative h-full">
              <ChessBoard2D
                fen={fen}
                you={game.you}
                lastMove={lastMove}
                myTurn={false}
                onMove={() => undefined}
                disabled
                skin={skin}
              />
              {burst && burstMove && burstVerdict && burst.ply === ply ? (
                <FlatBurst
                  key={burst.key}
                  square={burstMove.to}
                  you={game.you}
                  kind={burstVerdict.kind}
                />
              ) : null}
            </div>
          ) : (
            <ChessBoard3D
              fen={fen}
              you={game.you}
              lastMove={lastMove}
              myTurn={false}
              onMove={() => undefined}
              disabled
              skin={skin}
              people={game.style === "an"}
              real={game.style === "ra"}
              lego={game.style === "lg"}
              showTip={false}
              kings={{ w: game.whiteLook, b: game.blackLook }}
              overlay={overlay}
            />
          )}
          {current ? (
            <div
              className="pointer-events-none absolute left-3 top-3 border px-3 py-2 text-sm"
              style={{ borderColor: VERDICT[current.kind].tone, background: "rgba(12,13,11,0.78)" }}
            >
              <span className="font-medium" style={{ color: VERDICT[current.kind].tone }}>
                {VERDICT[current.kind].label}
              </span>
              <span className="ml-2 text-mist">
                {Math.ceil(ply / 2)}
                {ply % 2 === 1 ? "." : "…"} {last?.san}
                {current.loss > 0 ? ` · −${(current.loss / 100).toFixed(2)}` : ""}
              </span>
            </div>
          ) : null}
          {!judgeDone ? (
            <div
              className="pointer-events-none absolute bottom-3 right-3 border border-line bg-ink/75 px-3 py-1.5 text-xs text-mist"
              data-judging
            >
              Judging moves {judgedCount}/{total}
            </div>
          ) : null}
        </div>

        <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-panel/40 pt-14 lg:flex">
          <MoveList
            played={played}
            judged={judged}
            ply={ply}
            onPick={(p) => {
              setPlaying(false);
              setPly(p);
            }}
          />
        </aside>
      </div>

      <footer className="border-t border-line bg-panel/60 px-3 py-2 sm:px-6">
        <input
          type="range"
          min={0}
          max={total}
          value={ply}
          aria-label="Scrub"
          className="w-full accent-[#c9a45c]"
          onChange={(e) => {
            setPlaying(false);
            setPly(Number(e.target.value));
          }}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Ctl
            label="First"
            onClick={() => {
              setPlaying(false);
              setPly(0);
            }}
          >
            ⏮
          </Ctl>
          <Ctl
            label="Back"
            onClick={() => {
              setPlaying(false);
              setPly((p) => Math.max(0, p - 1));
            }}
          >
            ◀
          </Ctl>
          <Ctl
            label={playing ? "Pause" : "Play"}
            wide
            onClick={() => {
              primeSfx();
              if (!playing && ply >= total) setPly(0);
              setPlaying((x) => !x);
            }}
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </Ctl>
          <Ctl
            label="Forward"
            onClick={() => {
              primeSfx();
              setPlaying(false);
              stepForward();
            }}
          >
            ▶
          </Ctl>
          <Ctl
            label="Last"
            onClick={() => {
              setPlaying(false);
              setPly(total);
            }}
          >
            ⏭
          </Ctl>
          <span className="ml-1 text-xs text-mist">
            {ply}/{total}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex border border-line">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={
                    "min-h-9 rounded-none px-2.5 text-xs " +
                    (speed === s ? "bg-walnut text-ivory" : "text-mist hover:text-ivory")
                  }
                  onClick={() => setSpeed(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
            {!flat ? (
              <div className="flex border border-line" role="radiogroup" aria-label="Camera">
                {(["white", "black", "top", "orbit", "free"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={cam === c}
                    className={
                      "min-h-9 rounded-none px-2.5 text-xs capitalize " +
                      (cam === c ? "bg-walnut text-ivory" : "text-mist hover:text-ivory")
                    }
                    onClick={() => setCam(c)}
                  >
                    {c === "top"
                      ? "Top"
                      : c === "orbit"
                        ? "Orbit"
                        : c === "free"
                          ? "Free"
                          : `${c[0].toUpperCase()}${c.slice(1)} side`}
                  </button>
                ))}
              </div>
            ) : null}
            <Ctl
              label={muted ? "Unmute" : "Mute"}
              onClick={() => {
                primeSfx();
                setMuted(!muted);
                setMutedState(!muted);
              }}
            >
              {muted ? "🔇" : "🔊"}
            </Ctl>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Ctl({
  children,
  onClick,
  label,
  wide,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={
        "min-h-10 rounded-none border border-line bg-ink/60 text-sm text-ivory hover:border-gold-line " +
        (wide ? "min-w-24 px-3" : "min-w-10 px-2")
      }
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MoveList({
  played,
  judged,
  ply,
  onPick,
}: {
  played: { san: string }[];
  judged: GameJudgment | null;
  ply: number;
  onPick: (p: number) => void;
}) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest" });
  }, [ply]);
  const rows: number[] = [];
  for (let i = 0; i < played.length; i += 2) rows.push(i);
  const cell = (i: number) => {
    const m = played[i];
    if (!m) return <span />;
    const v = judged?.verdicts[i];
    const on = ply === i + 1;
    return (
      <button
        ref={on ? active : undefined}
        type="button"
        className={
          "flex min-h-8 items-center justify-between gap-1 rounded-none px-2 text-left " +
          (on ? "bg-walnut text-ivory" : "text-cream hover:bg-ink/50")
        }
        onClick={() => onPick(i + 1)}
      >
        <span>{m.san}</span>
        {v ? (
          <span
            className="text-[11px]"
            style={{ color: VERDICT[v.kind].tone }}
            title={VERDICT[v.kind].label}
          >
            {v.kind === "brilliant" ? "🔥" : VERDICT[v.kind].emoji}
          </span>
        ) : (
          <span className="text-[11px] text-mist">·</span>
        )}
      </button>
    );
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
      <p className="px-2 pb-2 text-xs uppercase tracking-[0.2em] text-mist">Moves</p>
      {rows.map((i) => (
        <div key={i} className="grid grid-cols-[2.2rem_1fr_1fr] items-center">
          <span className="px-1 text-xs text-mist">{i / 2 + 1}.</span>
          {cell(i)}
          {cell(i + 1)}
        </div>
      ))}
    </div>
  );
}

function burstEmojis(kind: Judgment) {
  const v = VERDICT[kind];
  const out: string[] = [];
  for (let i = 0; i < v.count; i++) out.push(v.extra && i % 2 === 1 ? v.extra : v.emoji);
  return out;
}

function EmojiCloud({ kind }: { kind: Judgment }) {
  const items = useMemo(() => {
    const list = burstEmojis(kind).map((e, i, all) => ({
      order: Math.random(),
      e,
      x: (i - (all.length - 1) / 2) * 24 + (Math.random() - 0.5) * 10,
      drift: (Math.random() - 0.5) * 60,
      delay: 0,
      dur: 1.5 + Math.random() * 0.6,
      size:
        kind === "blunder" || kind === "brilliant"
          ? 30 + Math.random() * 10
          : 26 + Math.random() * 6,
    }));
    // stagger in a random order so the cloud does not rise as a slanted line
    [...list]
      .sort((a, b) => a.order - b.order)
      .forEach((it, i) => (it.delay = i * 0.09 + Math.random() * 0.05));
    return list;
  }, [kind]);
  const v = VERDICT[kind];
  return (
    <div style={{ position: "relative", width: 0, height: 0 }} data-emoji-burst={kind}>
      {items.map((it, i) => (
        <span
          key={i}
          className="morse-emoji"
          style={
            {
              marginLeft: it.x,
              fontSize: it.size,
              "--drift": `${it.drift}px`,
              "--delay": `${it.delay}s`,
              "--dur": `${it.dur}s`,
            } as React.CSSProperties
          }
        >
          {it.e}
        </span>
      ))}
      <span
        className="morse-verdict border px-2 py-0.5 text-xs font-semibold"
        style={{ borderColor: v.tone, color: "#f6f1e4", background: v.tone + "e6" }}
      >
        {v.label}
      </span>
    </div>
  );
}

function EmojiBurst({
  at,
  kind,
  lift,
}: {
  at: [number, number, number];
  kind: Judgment;
  lift: number;
}) {
  return (
    <Html
      position={[at[0], at[1] + lift, at[2]]}
      zIndexRange={[40, 0]}
      style={{ pointerEvents: "none" }}
    >
      <EmojiCloud kind={kind} />
    </Html>
  );
}

function FlatBurst({ square, you, kind }: { square: string; you: "w" | "b"; kind: Judgment }) {
  // board-2d is a centered square; approximate the target square's center.
  const f = square.charCodeAt(0) - 97;
  const r = Number(square[1]) - 1;
  const col = you === "w" ? f : 7 - f;
  const row = you === "w" ? 7 - r : r;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="relative aspect-square h-full max-h-full max-w-full">
        <div
          style={{
            position: "absolute",
            left: `${(col + 0.5) * 12.5}%`,
            top: `${(row + 0.2) * 12.5}%`,
          }}
        >
          <EmojiCloud kind={kind} />
        </div>
      </div>
    </div>
  );
}

type Controls = {
  target: THREE.Vector3;
  autoRotate: boolean;
  autoRotateSpeed: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minDistance: number;
  maxDistance: number;
  update: () => void;
  addEventListener: (t: string, fn: () => void) => void;
  removeEventListener: (t: string, fn: () => void) => void;
};

/**
 * Moves the camera to the chosen preset. White/black side and top-down glide there and
 * stop; orbit circles the board slowly; free hands the camera to the player. Dragging
 * the board during a preset switches to free.
 */
function CameraDirector({
  mode,
  you,
  skinId,
  onGrab,
}: {
  mode: Cam;
  you: "w" | "b";
  skinId: string;
  onGrab: () => void;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const goal = useRef<THREE.Vector3 | null>(null);
  const base = useRef<{ dist: number; polar: number; minPolar: number; maxPolar: number } | null>(
    null,
  );
  const gliding = useRef(false);

  useEffect(() => {
    if (!controls || base.current) return;
    const start =
      skinId === "grassland" || skinId === "castle"
        ? new THREE.Vector3(0.4, 42, 68)
        : skinId === "sky-arena"
          ? new THREE.Vector3(...SKY_ARENA_CAMERA.w)
          : skinId === LEGO_BOARD_ID
            ? new THREE.Vector3(...LEGO_CAMERA.w)
          : new THREE.Vector3(0, 15.2, 11.2);
    const rel = start.clone().sub(new THREE.Vector3(0, 0.2, 0));
    base.current = {
      dist: rel.length(),
      polar: Math.acos(rel.y / rel.length()),
      minPolar: controls.minPolarAngle,
      maxPolar: controls.maxPolarAngle,
    };
  }, [controls, skinId]);

  useEffect(() => {
    if (!controls) return;
    const grab = () => {
      if (!gliding.current && mode !== "free") onGrab();
    };
    controls.addEventListener("start", grab);
    return () => controls.removeEventListener("start", grab);
  }, [controls, mode, onGrab]);

  useEffect(() => {
    if (!controls || !base.current) return;
    const b = base.current;
    controls.autoRotate = false;
    controls.minPolarAngle = mode === "top" ? 0 : b.minPolar;
    controls.maxPolarAngle = b.maxPolar;
    const t = controls.target;
    const at = (polar: number, azimuth: number, dist: number) =>
      new THREE.Vector3(
        t.x + dist * Math.sin(polar) * Math.sin(azimuth),
        t.y + dist * Math.cos(polar),
        t.z + dist * Math.sin(polar) * Math.cos(azimuth),
      );
    // The meadow boards open far out to show the whole field; presets frame the board itself.
    const meadow = skinId === "grassland" || skinId === "castle";
    const dist = Math.min(
      controls.maxDistance,
      Math.max(controls.minDistance, b.dist * (meadow ? 0.72 : 1)),
    );
    const side = meadow ? b.polar - 0.12 : b.polar;
    if (mode === "white") goal.current = at(side, 0, dist);
    else if (mode === "black") goal.current = at(side, Math.PI, dist);
    else if (mode === "top") goal.current = at(0.001, you === "w" ? 0 : Math.PI, dist);
    else if (mode === "orbit") {
      goal.current = at(
        Math.min(b.maxPolar - 0.05, b.polar + 0.18),
        Math.atan2(camera.position.x - t.x, camera.position.z - t.z),
        dist * 0.96,
      );
    } else goal.current = null;
    gliding.current = goal.current !== null;
  }, [mode, controls, camera, you, skinId]);

  useFrame((_, dt) => {
    if (!controls) return;
    const g = goal.current;
    if (g) {
      // ease toward the preset, interpolating around the board, not through it
      const t = controls.target;
      const cur = new THREE.Spherical().setFromVector3(camera.position.clone().sub(t));
      const end = new THREE.Spherical().setFromVector3(g.clone().sub(t));
      let dTheta = end.theta - cur.theta;
      if (dTheta > Math.PI) dTheta -= Math.PI * 2;
      if (dTheta < -Math.PI) dTheta += Math.PI * 2;
      const k = 1 - Math.exp(-dt * 3.2);
      cur.theta += dTheta * k;
      cur.phi += (end.phi - cur.phi) * k;
      cur.radius += (end.radius - cur.radius) * k;
      camera.position.copy(new THREE.Vector3().setFromSpherical(cur).add(t));
      camera.lookAt(t);
      if (
        Math.abs(dTheta) < 0.004 &&
        Math.abs(end.phi - cur.phi) < 0.004 &&
        Math.abs(end.radius - cur.radius) < 0.02
      ) {
        goal.current = null;
        gliding.current = false;
        if (mode === "orbit") {
          controls.autoRotate = true;
          controls.autoRotateSpeed = 0.9;
        }
      }
      controls.update();
    }
  });
  return null;
}
