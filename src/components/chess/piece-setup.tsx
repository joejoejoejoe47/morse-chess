import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { Color, PieceSymbol, Square } from "chess.js";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { PieceMark } from "@/components/chess/marks";
import { isLightSquare, squareToWorld } from "@/lib/chess/board-math";
import { CAST_POOL, hydrateCast, useLegoLook } from "@/lib/lego-look";
import { LEGO_CHARS, LegoStatic, pieceChar, type LegoCharId } from "@/components/chess/lego-board";

const FILES = "abcdefgh";
const KINDS: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];
const KIND_NAME: Record<PieceSymbol, string> = {
  k: "King",
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
  p: "Pawn",
};
const STORE = "morse-setup-squares";

type Spot = { c: Color; t: PieceSymbol };
type Board = Partial<Record<Square, Spot>>;
type Held = { color: Color; type: PieceSymbol };

const WHO: Record<string, string> = Object.fromEntries(CAST_POOL.map((row) => [row.id, row.name]));
Object.assign(WHO, {
  doom: "Dr. Doom",
  widow: "Black Widow",
  skeleton: "Skeleton",
  blacktron: "Blacktron",
  goblin: "Goblin",
  doombot: "Doombot",
  agent: "Officer",
  legion: "Iron Legion",
});

function squareAt(file: number, rank: number): Square {
  return `${FILES[file]}${rank + 1}` as Square;
}

function readBoard(): Board {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Spot>;
    const next: Board = {};
    for (const [sq, spot] of Object.entries(parsed)) {
      if (!/^[a-h][1-8]$/.test(sq)) continue;
      if (!spot || (spot.c !== "w" && spot.c !== "b") || !KINDS.includes(spot.t)) continue;
      next[sq as Square] = spot;
    }
    return next;
  } catch {
    return {};
  }
}

/** One king each side, no pawns on the end rows. Extra queens, rooks and the rest are fine. */
export function setupFen(board: Board): string | null {
  let whiteKing = 0;
  let blackKing = 0;
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = "";
    let gap = 0;
    for (let file = 0; file < 8; file++) {
      const spot = board[squareAt(file, rank - 1)];
      if (!spot) {
        gap++;
        continue;
      }
      if (spot.t === "p" && (rank === 1 || rank === 8)) return null;
      if (gap) {
        row += String(gap);
        gap = 0;
      }
      row += spot.c === "w" ? spot.t.toUpperCase() : spot.t;
      if (spot.t === "k") {
        if (spot.c === "w") whiteKing++;
        else blackKing++;
      }
    }
    if (gap) row += String(gap);
    rows.push(row || "8");
  }
  if (whiteKing !== 1 || blackKing !== 1) return null;
  return `${rows.join("/")} w - - 0 1`;
}

function kingCount(board: Board) {
  let w = 0;
  let b = 0;
  for (const spot of Object.values(board)) {
    if (spot?.t !== "k") continue;
    if (spot.c === "w") w++;
    else b++;
  }
  return { w, b };
}

function fromRect(rect: DOMRect, x: number, y: number): Square | null {
  const lx = x - rect.left;
  const ly = y - rect.top;
  if (lx < 0 || ly < 0 || lx >= rect.width || ly >= rect.height) return null;
  const file = Math.min(7, Math.floor((lx / rect.width) * 8));
  const row = Math.min(7, Math.floor((ly / rect.height) * 8));
  return squareAt(file, 7 - row);
}

function guyName(color: Color, type: PieceSymbol, lg: boolean) {
  if (!lg) return KIND_NAME[type];
  const id = pieceChar(color, type);
  return `${KIND_NAME[type]} · ${WHO[id] ?? id}`;
}

/** The square under the pointer, in the same space the 3D board uses. */
function HitBridge({ locateRef }: { locateRef: MutableRefObject<(x: number, y: number) => Square | null> }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const pt = new THREE.Vector3();
    locateRef.current = (x, y) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (x < rect.left || y < rect.top || x > rect.right || y > rect.bottom) return null;
      ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, pt)) return null;
      const file = Math.round(pt.x + 3.5);
      const rank = Math.round(3.5 - pt.z);
      if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
      return squareAt(file, rank);
    };
    return () => {
      locateRef.current = () => null;
    };
  }, [camera, gl, locateRef]);
  return null;
}

function Stand({ id, color, sq, lift }: { id: LegoCharId; color: Color; sq: Square; lift: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const spec = LEGO_CHARS[id];
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const [x, , z] = squareToWorld(sq);
    let y = 0.12;
    if (lift) {
      if (start.current === null) start.current = state.clock.elapsedTime;
      const u = Math.min(1, (state.clock.elapsedTime - start.current) / 0.42);
      y += (1 - u) * (1 - u) * 1.45;
    }
    g.position.set(x, y, z);
  });
  return (
    <group ref={ref} rotation={[0, color === "w" ? Math.PI : 0, 0]}>
      <group position={[0, -spec.height * 0.45, 0]}>
        <LegoStatic id={id} />
      </group>
    </group>
  );
}

function FloatGuy({ id, color, sq }: { id: LegoCharId; color: Color; sq: Square }) {
  const [x, , z] = squareToWorld(sq);
  const spec = LEGO_CHARS[id];
  return (
    <group position={[x, 1.55, z]} rotation={[0, color === "w" ? Math.PI : 0, 0]}>
      <group position={[0, -spec.height * 0.45, 0]}>
        <LegoStatic id={id} />
      </group>
    </group>
  );
}

function LegoBoard({
  board,
  hover,
  floatPiece,
  fall,
  locateRef,
}: {
  board: Board;
  hover: Square | null;
  floatPiece: Held | null;
  fall: Square | null;
  locateRef: MutableRefObject<(x: number, y: number) => Square | null>;
}) {
  useLegoLook();
  const squares = useMemo(() => {
    const list: Square[] = [];
    for (let rank = 0; rank < 8; rank++) for (let file = 0; file < 8; file++) list.push(squareAt(file, rank));
    return list;
  }, []);
  return (
    <Canvas camera={{ position: [0, 9.2, 8.4], fov: 32 }} gl={{ antialias: true }}>
      <color attach="background" args={["#17140f"]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 9, 6]} intensity={1.15} />
      <HitBridge locateRef={locateRef} />
      {squares.map((sq) => {
        const [x, , z] = squareToWorld(sq);
        const hot = hover === sq && floatPiece;
        return (
          <mesh key={sq} position={[x, 0.04, z]}>
            <boxGeometry args={[0.98, 0.08, 0.98]} />
            <meshStandardMaterial
              color={hot ? "#ffe14a" : isLightSquare(sq) ? "#f3ead6" : "#8d7044"}
              emissive={hot ? "#ffe14a" : "#000000"}
              emissiveIntensity={hot ? 0.45 : 0}
            />
          </mesh>
        );
      })}
      <Suspense fallback={null}>
        {(Object.entries(board) as [Square, Spot][]).map(([sq, spot]) => (
          <Stand key={`${spot.c}${spot.t}${sq}`} id={pieceChar(spot.c, spot.t)} color={spot.c} sq={sq} lift={fall === sq} />
        ))}
        {hover && floatPiece ? <FloatGuy id={pieceChar(floatPiece.color, floatPiece.type)} color={floatPiece.color} sq={hover} /> : null}
      </Suspense>
    </Canvas>
  );
}

function GuyColumn({ side, lg, onDown }: { side: Color; lg: boolean; onDown: (e: ReactPointerEvent, color: Color, type: PieceSymbol) => void }) {
  useLegoLook();
  return (
    <div className="flex w-[112px] flex-col gap-1">
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-mist">{side === "w" ? "White" : "Black"}</p>
      {lg ? (
        <div className="relative h-[528px] w-[112px]">
          <Canvas orthographic camera={{ position: [0, 0, 12], zoom: 80 }} gl={{ alpha: true }} className="pointer-events-none">
            <ambientLight intensity={0.85} />
            <directionalLight position={[2, 4, 3]} intensity={1.1} />
            <Suspense fallback={null}>
              {KINDS.map((type, i) => {
                const id = pieceChar(side, type);
                return (
                  <group key={type} position={[0, 2.5 - i, 0]} scale={0.58}>
                    <group position={[0, -LEGO_CHARS[id].height * 0.45, 0]} rotation={[0, side === "w" ? Math.PI : 0, 0]}>
                      <LegoStatic id={id} />
                    </group>
                  </group>
                );
              })}
            </Suspense>
          </Canvas>
          <div className="absolute inset-0 flex flex-col">
            {KINDS.map((type) => (
              <button
                key={type}
                type="button"
                data-setup-piece={`${side}${type}`}
                onPointerDown={(e) => onDown(e, side, type)}
                className="flex flex-1 touch-none select-none items-end justify-center pb-1 text-[10px] leading-tight text-ivory"
              >
                <span className="rounded-full bg-black/55 px-1.5 py-0.5">{guyName(side, type, true)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        KINDS.map((type) => (
          <button
            key={type}
            type="button"
            data-setup-piece={`${side}${type}`}
            onPointerDown={(e) => onDown(e, side, type)}
            className="flex min-h-14 touch-none select-none flex-col items-center justify-center rounded-md border border-line bg-panel px-1 py-1 text-ivory hover:border-gold-line"
          >
            <PieceMark kind={type} tone={side} className="size-8" />
            <span className="mt-0.5 text-center text-[10px] leading-tight text-mist">{KIND_NAME[type]}</span>
          </button>
        ))
      )}
    </div>
  );
}

/**
 * Build the opening by hand. Drag a piece from the left: it hangs over the board,
 * the square under it glows yellow, and letting go drops it onto that square.
 */
export function PieceSetup({
  lg,
  onBack,
  onReady,
}: {
  lg: boolean;
  onBack: () => void;
  onReady: (fen: string, seat: "w" | "b") => void;
}) {
  const [board, setBoard] = useState<Board>(readBoard);
  const [hover, setHover] = useState<Square | null>(null);
  const [ghost, setGhost] = useState<(Held & { x: number; y: number }) | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fall, setFall] = useState<Square | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [step, setStep] = useState<"board" | "side">("board");
  const held = useRef<Held | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const locateRef = useRef<(x: number, y: number) => Square | null>(() => null);
  const fen = useMemo(() => setupFen(board), [board]);
  const kings = kingCount(board);

  useEffect(() => {
    hydrateCast();
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(board));
    } catch {
      /* private mode */
    }
  }, [board]);

  useEffect(() => {
    if (lg) return;
    locateRef.current = (x, y) => {
      const rect = boardRef.current?.getBoundingClientRect();
      return rect ? fromRect(rect, x, y) : null;
    };
  }, [lg]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
      setHover(locateRef.current(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      const piece = held.current;
      held.current = null;
      setDragging(false);
      setGhost(null);
      setHover(null);
      if (!piece) return;
      const sq = locateRef.current(e.clientX, e.clientY);
      if (!sq) return;
      if (piece.type === "p" && (sq[1] === "1" || sq[1] === "8")) {
        setNote("Pawns can't stand on the end rows.");
        return;
      }
      setNote(null);
      setBoard((prev) => ({ ...prev, [sq]: { c: piece.color, t: piece.type } }));
      setFall(sq);
      window.setTimeout(() => setFall((cur) => (cur === sq ? null : cur)), 460);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging]);

  function begin(e: ReactPointerEvent, color: Color, type: PieceSymbol) {
    if (held.current) return;
    e.preventDefault();
    held.current = { color, type };
    setGhost({ color, type, x: e.clientX, y: e.clientY });
    setHover(locateRef.current(e.clientX, e.clientY));
    setDragging(true);
  }

  function onBoardDown(e: ReactPointerEvent) {
    if (held.current) return;
    const sq = locateRef.current(e.clientX, e.clientY);
    if (!sq || !board[sq]) return;
    const spot = board[sq];
    e.preventDefault();
    setBoard((prev) => {
      const next = { ...prev };
      delete next[sq];
      return next;
    });
    begin(e, spot.c, spot.t);
  }

  if (step === "side" && fen) {
    return (
      <div className="fixed inset-0 z-[120] grid place-items-center bg-ink/80 p-4">
        <div className="w-full max-w-md rounded-xl border border-line bg-panel p-6">
          <button type="button" className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#e7c56a]" onClick={() => setStep("board")}>
            Back
          </button>
          <h2 className="font-display text-2xl text-ivory">Which side do you want?</h2>
          <p className="mt-2 text-sm text-mist">White moves first. The other side is who you play.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" data-setup-seat="w" className="rounded-lg border border-line bg-[#ece3d0] px-3 py-4 text-[#1c1712]" onClick={() => onReady(fen, "w")}>
              <span className="block text-lg font-semibold">White</span>
              <span className="text-xs">You move first</span>
            </button>
            <button type="button" data-setup-seat="b" className="rounded-lg border border-line bg-[#1c1712] px-3 py-4 text-[#ece3d0]" onClick={() => onReady(fen, "b")}>
              <span className="block text-lg font-semibold">Black</span>
              <span className="text-xs">They move first</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#12110e] text-ivory" data-piece-setup>
      <style>{".piece-fall{animation:piece-fall .42s cubic-bezier(.2,.8,.3,1) both}@keyframes piece-fall{from{transform:translateY(-88px)}to{transform:translateY(0)}}"}</style>
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <button type="button" className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e7c56a]" onClick={onBack}>
          Back
        </button>
        <h1 className="font-display text-2xl">Set the board</h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setBoard({})}>
            Clear
          </Button>
          <Button type="button" variant="solid" size="sm" data-setup-done disabled={!fen} onClick={() => fen && setStep("side")}>
            Done
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 gap-2 px-2">
        <aside className="flex shrink-0 gap-2 overflow-y-auto pb-2">
          <GuyColumn side="w" lg={lg} onDown={begin} />
          <GuyColumn side="b" lg={lg} onDown={begin} />
        </aside>
        <div className="relative min-w-0 flex-1" onPointerDown={onBoardDown}>
          {lg ? (
            <LegoBoard board={board} hover={hover} floatPiece={ghost} fall={fall} locateRef={locateRef} />
          ) : (
            <div className="grid h-full place-items-center p-2">
              <div
                ref={boardRef}
                className="grid aspect-square w-full max-w-[min(100%,70vh)] grid-cols-8 grid-rows-8 overflow-hidden rounded-md border border-[#3a3228]"
              >
                {Array.from({ length: 8 }, (_, row) =>
                  Array.from({ length: 8 }, (_, file) => {
                    const sq = squareAt(file, 7 - row);
                    const spot = board[sq];
                    const hot = hover === sq && ghost;
                    const light = isLightSquare(sq);
                    return (
                      <div
                        key={sq}
                        className="relative grid place-items-center"
                        style={{ background: hot ? "#ffe14a" : light ? "#f3ead6" : "#8d7044" }}
                      >
                        {spot ? (
                          <span className={fall === sq ? "piece-fall grid place-items-center" : "grid place-items-center"}>
                            <PieceMark kind={spot.t} tone={spot.c} className="size-8 sm:size-11" />
                          </span>
                        ) : null}
                      </div>
                    );
                  }),
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="px-4 py-2 text-sm text-mist">
        Drag a piece over the board. The square glows yellow, then he falls onto it. One white king ({kings.w}) and one black king ({kings.b}). Every other piece, as many as you want.
        {note ? <span className="mt-1 block text-danger">{note}</span> : null}
        {!fen && !note ? <span className="mt-1 block text-[#e7c56a]">Need one king on each side before Done.</span> : null}
      </p>
      {ghost ? (
        <div className="pointer-events-none fixed z-[80]" style={{ left: ghost.x, top: ghost.y - 28, transform: "translate(-50%, -100%)" }}>
          <PieceMark kind={ghost.type} tone={ghost.color} className="size-14 drop-shadow-lg" />
        </div>
      ) : null}
    </div>
  );
}
