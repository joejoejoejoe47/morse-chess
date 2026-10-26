import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import type { PieceSymbol } from "chess.js";
import { SculptedPiece } from "@/components/chess/sculpted-piece";
import { StonePerson, type Gait } from "@/components/chess/stone-people";
import { LEGO_CHARS, LEGO_ROSTER, LegoWorld, type LegoCharId } from "@/components/chess/lego-board";
import { SkyArenaWorld } from "@/components/chess/sky-arena-board";
import { asset } from "@/lib/base";

export type Look = "2d" | "3d" | "an" | "lg";
export type Sky = "table" | "lego" | "arena";

const GLYPH: Record<PieceSymbol, string> = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" };

export type StageUnit = {
  r: number;
  f: number;
  side: "w" | "b";
  kind: PieceSymbol;
  label?: string;
  hidden?: boolean;
  ball?: boolean;
};

function spot(r: number, f: number, rows: number, cols: number, y = 0.14): [number, number, number] {
  return [f - (cols - 1) / 2, y, (rows - 1) / 2 - r];
}

function Person({ type, white }: { type: PieceSymbol; white: boolean }) {
  const gait = useRef<Gait>({ phase: Math.random() * 8, amp: 0.15, act: "idle", fade: 0 });
  return <StonePerson type={type} white={white} cast="stone" gait={gait} />;
}

function LegoFig({ id }: { id: LegoCharId }) {
  const gltf = useGLTF(asset(`/lego/chars/${LEGO_CHARS[id].file}`));
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  return <primitive object={scene} scale={LEGO_CHARS[id].height} />;
}

function PieceMesh({ unit, look }: { unit: StageUnit; look: Look }) {
  const white = unit.side === "w";
  const color = white ? "w" : "b";
  if (unit.hidden) {
    if (look === "lg") {
      return (
        <Suspense fallback={null}>
          <LegoFig id={LEGO_ROSTER.b.p} />
        </Suspense>
      );
    }
    if (look === "an") return <Person type="p" white={false} />;
    return (
      <group scale={0.92}>
        <SculptedPiece type="p" color="b" />
      </group>
    );
  }
  if (look === "2d") {
    return (
      <Html center position={[0, 0.35, 0]} style={{ pointerEvents: "none" }} zIndexRange={[8, 0]}>
        <span className="font-display text-3xl leading-none drop-shadow" style={{ color: white ? "#fffaf0" : "#1a120c" }}>
          {unit.label ?? GLYPH[unit.kind]}
        </span>
      </Html>
    );
  }
  if (look === "lg") {
    return (
      <Suspense fallback={null}>
        <group position={[0, 0.02, 0]}>
          <LegoFig id={LEGO_ROSTER[color][unit.kind]} />
        </group>
      </Suspense>
    );
  }
  if (look === "an") {
    return (
      <group rotation={[0, white ? 0 : Math.PI, 0]}>
        <Person type={unit.kind} white={white} />
      </group>
    );
  }
  return (
    <group rotation={[0, white ? 0 : Math.PI, 0]} scale={0.92}>
      <SculptedPiece type={unit.kind} color={color} />
    </group>
  );
}

function Deck({
  rows,
  cols,
  paint,
  onPick,
  units,
  look,
  ball,
}: {
  rows: number;
  cols: number;
  paint: (r: number, f: number) => { bg: string };
  onPick: (r: number, f: number) => void;
  units: StageUnit[];
  look: Look;
  ball: { r: number; f: number } | null;
}) {
  const squares = [];
  for (let r = 0; r < rows; r++) {
    for (let f = 0; f < cols; f++) {
      const [x, , z] = spot(r, f, rows, cols, 0);
      squares.push(
        <mesh key={`${r}:${f}`} position={[x, 0.08, z]} receiveShadow onClick={(e) => { e.stopPropagation(); onPick(r, f); }}>
          <boxGeometry args={[0.96, 0.08, 0.96]} />
          <meshStandardMaterial color={paint(r, f).bg} roughness={0.55} metalness={0.04} />
        </mesh>,
      );
    }
  }
  return (
    <group>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[cols + 0.8, 0.08, rows + 0.8]} />
        <meshStandardMaterial color="#3c261c" roughness={0.7} />
      </mesh>
      {squares}
      {units.map((unit) => (
        <group key={`${unit.side}${unit.kind}${unit.r}:${unit.f}${unit.label ?? ""}`} position={spot(unit.r, unit.f, rows, cols)} onClick={(e) => { e.stopPropagation(); onPick(unit.r, unit.f); }}>
          <PieceMesh unit={unit} look={look} />
          {unit.ball ? (
            <mesh position={[0.18, 0.55, 0.12]}>
              <sphereGeometry args={[0.12, 16, 12]} />
              <meshStandardMaterial color="#f4f4f4" roughness={0.35} />
            </mesh>
          ) : null}
        </group>
      ))}
      {ball ? (
        <mesh position={spot(ball.r, ball.f, rows, cols, 0.22)}>
          <sphereGeometry args={[0.14, 18, 14]} />
          <meshStandardMaterial color="#f7f7f7" roughness={0.3} />
        </mesh>
      ) : null}
    </group>
  );
}

export function VariantStage({
  rows,
  cols,
  paint,
  onPick,
  units,
  look,
  sky,
  ball = null,
}: {
  rows: number;
  cols: number;
  paint: (r: number, f: number) => { bg: string; fg: string; text: string };
  onPick: (r: number, f: number) => void;
  units: StageUnit[];
  look: Look;
  sky: Sky;
  ball?: { r: number; f: number } | null;
}) {
  const span = Math.max(rows, cols);
  const cam: [number, number, number] = [0, span * 1.05, span * 0.78];
  return (
    <div className="h-full w-full">
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: cam, fov: 34, near: 0.1, far: 400 }} gl={{ antialias: true, alpha: false }}>
        <color attach="background" args={[sky === "table" ? "#14110e" : "#87a0c4"]} />
        {sky === "table" ? (
          <>
            <hemisphereLight args={["#ffe7c2", "#2a2118", 0.7]} />
            <directionalLight position={[6, 12, 8]} intensity={1.3} castShadow />
          </>
        ) : null}
        {sky === "lego" ? <LegoWorld /> : null}
        {sky === "arena" ? <SkyArenaWorld squaresBottom={0.02} plinth={false} /> : null}
        <Deck rows={rows} cols={cols} paint={paint} onPick={onPick} units={units} look={look} ball={ball} />
        <OrbitControls target={[0, 0, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={4} maxDistance={span * 3} />
      </Canvas>
    </div>
  );
}

export function ShopPreview({
  kind,
  look,
  onShot,
}: {
  kind: "av" | "lg";
  look: Look;
  onShot?: (dataUrl: string) => void;
}) {
  const [armed, setArmed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  function shoot() {
    const canvas = box.current?.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    try {
      onShot?.(canvas.toDataURL("image/jpeg", 0.72));
    } catch {
      /* ignore */
    }
    setArmed(false);
  }
  return (
    <div ref={box} className="relative h-72 overflow-hidden rounded-md border border-[#6d5a32] bg-[#14110e]">
      <Canvas shadows camera={{ position: [1.4, 1.5, 2.8], fov: 34 }} gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}>
        <color attach="background" args={["#241910"]} />
        <hemisphereLight args={["#ffe7c2", "#2a2118", 0.8]} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        {look === "lg" ? <LegoWorld /> : null}
        {look === "an" && kind === "av" ? <SkyArenaWorld squaresBottom={-0.2} plinth={false} /> : null}
        <group>
          {look === "2d" ? (
            <Html center>
              <span className="font-display text-7xl text-[#f6e7c1]">{kind === "lg" ? "▦" : "♔"}</span>
            </Html>
          ) : null}
          {look === "3d" && kind === "av" ? <SculptedPiece type="k" color="w" /> : null}
          {look === "3d" && kind === "lg" ? (
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[1.6, 0.08, 1.6]} />
              <meshStandardMaterial color="#6c6e68" />
            </mesh>
          ) : null}
          {look === "an" && kind === "av" ? <Person type="k" white /> : null}
          {look === "lg" ? (
            <Suspense fallback={null}>
              <group position={[0, 0.05, 0]}>
                <LegoFig id={kind === "av" ? "cap" : "hulk"} />
              </group>
            </Suspense>
          ) : null}
        </group>
        <OrbitControls enablePan target={[0, 0.4, 0]} />
      </Canvas>
      <div className="pointer-events-none absolute inset-3 border border-[#e6c56a]/70" />
      {onShot ? (
        <button
          type="button"
          onClick={() => (armed ? shoot() : setArmed(true))}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-[#d6ad4f] bg-[#1b140a]/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#f0d68a]"
        >
          {armed ? "Screenshot" : "Frame the cover"}
        </button>
      ) : null}
    </div>
  );
}
