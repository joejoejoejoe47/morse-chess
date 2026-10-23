/**
 * Classic and Parlor: two free 3D chess sets made from real models, each with its own board.
 *
 *  - Classic (/classic): "Chess" by Verfassen,
 *    https://sketchfab.com/3d-models/chess-e54c2d04d4f74823b69ba4a794fb4500 (CC BY 4.0).
 *  - Parlor (/parlor): "chess" by maliakshay394,
 *    https://sketchfab.com/3d-models/chess-1d60dfc2eeaa4ec9a07a19f9f941acb2 (CC BY 4.0).
 *
 * Each model was split into a board file (squares lined up with the game's 1-unit squares, a1
 * dark at -x/+z, the playing surface at y = 0) and a pieces file with one reusable mesh per
 * colour and type, named `w_p` … `b_k` and standing on y = 0. Compressed with meshopt.
 * See public/classic/CREDITS.md and public/parlor/CREDITS.md.
 *
 * Pieces keep who they are between moves: a moved piece slides (a knight hops) to its new
 * square, castling moves both pieces, a promoted pawn turns into its new piece, and a captured
 * piece sinks and fades just as the attacker arrives.
 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { asset } from "@/lib/base";
import { useResilientGLTF } from "@/lib/resilient-gltf";
import { squareToWorld } from "@/lib/chess/board-math";
import { LoadGuard, Later } from "@/components/chess/load-guard";

export type HeirloomId = "cl" | "pa";

type SetLook = {
  board: string;
  pieces: string;
  camera: { w: [number, number, number]; b: [number, number, number] };
  zoom: { min: number; max: number };
  background: string;
  fog: [number, number];
  floorY: number;
  floor: string;
  env: number;
};

export const HEIRLOOM: Record<HeirloomId, SetLook> = {
  cl: {
    board: asset("/classic/board.glb"),
    pieces: asset("/classic/pieces.glb"),
    camera: { w: [0, 12.4, 10.6], b: [0, 12.4, -10.6] },
    zoom: { min: 7, max: 24 },
    background: "#14110e",
    fog: [26, 60],
    floorY: -0.44,
    floor: "#3a2a1d",
    env: 0.62,
  },
  pa: {
    board: asset("/parlor/board.glb"),
    pieces: asset("/parlor/pieces.glb"),
    camera: { w: [0, 12.8, 11.2], b: [0, 12.8, -11.2] },
    zoom: { min: 7, max: 24 },
    background: "#1b1d24",
    fog: [30, 70],
    floorY: -13.85,
    floor: "#2b2723",
    env: 0.5,
  },
};

/** The board model sits this high, so the game's see-through square marks (y 0.12) lie just above it. */
const TOP = 0.1;

export function heirloomUrls(id: HeirloomId) {
  return [HEIRLOOM[id].board, HEIRLOOM[id].pieces];
}

/** Soft studio reflections so the lacquer and wood read as real materials. */
function StudioLight({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const tex = pmrem.fromScene(room, 0.04).texture;
    const before = { env: scene.environment, envI: scene.environmentIntensity };
    scene.environment = tex;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = before.env;
      scene.environmentIntensity = before.envI;
      tex.dispose();
      pmrem.dispose();
      room.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
    };
  }, [gl, scene, intensity]);
  return null;
}

function BoardModel({ url }: { url: string }) {
  const { scene } = useResilientGLTF(url);
  const board = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.receiveShadow = true;
        o.castShadow = false;
        // Clicks go to the game's square planes, never to the model.
        o.raycast = () => undefined;
      }
    });
    return root;
  }, [scene]);
  return <primitive object={board} position={[0, TOP, 0]} />;
}

/** The room around a set: background, haze, a floor, the reflections and the board model. */
export function HeirloomWorld({ id }: { id: HeirloomId }) {
  const look = HEIRLOOM[id];
  return (
    <>
      <color attach="background" args={[look.background]} />
      <fog attach="fog" args={[look.background, look.fog[0], look.fog[1]]} />
      <StudioLight intensity={look.env} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, look.floorY, 0]} receiveShadow raycast={() => undefined}>
        <circleGeometry args={[60, 48]} />
        <meshStandardMaterial color={look.floor} roughness={0.9} metalness={0} />
      </mesh>
      <BoardModel url={look.board} />
      <PortraitFit id={id} />
    </>
  );
}

/** On a tall phone screen the default camera crops the outer files; back the camera off until all 8 files fit. */
function PortraitFit({ id }: { id: HeirloomId }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target?: THREE.Vector3; update?: () => void } | null;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const portrait = width / Math.max(1, height) < 1.05;
  useEffect(() => {
    if (!portrait || !(camera instanceof THREE.PerspectiveCamera)) return;
    const target = controls?.target ?? new THREE.Vector3(0, 0.2, 0);
    const offset = camera.position.clone().sub(target);
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (width / Math.max(1, height));
    // Half the board width (8 files + a little of the frame) must fit at the near edge of the board.
    const nearEdge = 4.4 * Math.cos(Math.atan2(offset.y, Math.hypot(offset.x, offset.z)));
    const need = Math.min(HEIRLOOM[id].zoom.max, 4.5 / halfH + nearEdge);
    if (offset.length() >= need) return;
    offset.setLength(need);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    controls?.update?.();
    // Only when the set or the screen shape changes, never while the player is orbiting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, portrait, Boolean(controls)]);
  return null;
}

type Unit = {
  id: string;
  sq: Square;
  from: Square;
  type: PieceSymbol;
  color: Color;
  /** Changes whenever this unit starts a new move or dies. */
  seq: number;
  snap: boolean;
  dead: boolean;
  /** Seconds a captured piece waits before fading (the attacker is still on its way). */
  wait: number;
};

function fileRank(sq: string): [number, number] {
  return [sq.charCodeAt(0) - 97, Number(sq[1]) - 1];
}

function distance(a: string, b: string) {
  const [af, ar] = fileRank(a);
  const [bf, br] = fileRank(b);
  return Math.hypot(af - bf, ar - br);
}

export function slideTime(type: PieceSymbol, dist: number) {
  if (dist <= 0) return 0;
  return type === "n" ? 0.62 : Math.min(0.95, 0.38 + 0.09 * dist);
}

function readFen(fen: string) {
  const out: { sq: Square; type: PieceSymbol; color: Color }[] = [];
  new Chess(fen).board().forEach((row, r) =>
    row.forEach((p, f) => {
      if (p) out.push({ sq: `${"abcdefgh"[f]}${8 - r}` as Square, type: p.type, color: p.color });
    }),
  );
  return out;
}

let unitIds = 0;

/**
 * The pieces for a new position, keeping each piece's identity from the last one so it can
 * move instead of popping. Anything that changed by more than one move just snaps into place.
 */
export function nextUnits(
  prev: Unit[],
  fen: string,
  lastMove: { from: string; to: string } | null,
  seq: number,
): Unit[] {
  const now = readFen(fen);
  const alive = prev.filter((u) => !u.dead);
  const used = new Set<string>();
  const out: Unit[] = [];
  const fresh: typeof now = [];
  for (const p of now) {
    const keep = alive.find((u) => !used.has(u.id) && u.sq === p.sq && u.type === p.type && u.color === p.color);
    if (keep) {
      used.add(keep.id);
      out.push(keep);
    } else {
      fresh.push(p);
    }
  }
  const jump = alive.length === 0 || fresh.length > 2;
  const left = () => alive.filter((u) => !used.has(u.id));
  for (const p of fresh) {
    let pick: Unit | undefined;
    if (!jump) {
      const same = left().filter((u) => u.color === p.color && u.type === p.type);
      pick =
        same.find((u) => u.sq === lastMove?.from) ??
        same.sort((a, b) => distance(a.sq, p.sq) - distance(b.sq, p.sq))[0] ??
        left().find((u) => u.color === p.color && u.type === "p" && u.sq === lastMove?.from);
    }
    if (pick) {
      used.add(pick.id);
      out.push({ ...pick, sq: p.sq, from: pick.sq, type: p.type, seq, snap: false });
    } else {
      out.push({ id: `h${++unitIds}`, sq: p.sq, from: p.sq, type: p.type, color: p.color, seq, snap: true, dead: false, wait: 0 });
    }
  }
  if (!jump) {
    const attacker = out.find((u) => u.seq === seq && !u.snap && u.sq === lastMove?.to);
    const travel = attacker ? slideTime(attacker.type, distance(attacker.from, attacker.sq)) : 0;
    for (const u of left()) {
      out.push({ ...u, dead: true, seq, wait: Math.max(0.12, travel * 0.62) });
    }
  }
  return out;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const FADE = 0.55;

function SetPiece({
  unit,
  template,
  selected,
  onSquare,
}: {
  unit: Unit;
  template: THREE.Object3D;
  selected: boolean;
  onSquare: (sq: Square) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const body = useMemo(() => template.clone(true), [template]);
  const fading = useMemo(() => {
    if (!unit.dead) return null;
    const mats: THREE.Material[] = [];
    body.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const list = (Array.isArray(o.material) ? o.material : [o.material]).map((m: THREE.Material) => {
        const c = m.clone();
        c.transparent = true;
        mats.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? list : list[0];
      o.castShadow = false;
    });
    return mats;
  }, [body, unit.dead]);
  useEffect(() => () => fading?.forEach((m) => m.dispose()), [fading]);

  const run = useRef<{ seq: number; start: number; from: THREE.Vector3; lift: number } | null>(null);
  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g) return;
    const t0 = clock.elapsedTime;
    const [tx, , tz] = squareToWorld(unit.sq, 1);
    if (!run.current || run.current.seq !== unit.seq) {
      const first = !run.current;
      const [fx, , fz] = squareToWorld(unit.from, 1);
      run.current = {
        seq: unit.seq,
        start: t0,
        // Continue from wherever the piece is now, so a quick reply never makes it jump.
        from: first || unit.snap ? new THREE.Vector3(fx, TOP, fz) : g.position.clone().setY(TOP),
        lift: run.current?.lift ?? 0,
      };
      if (first || unit.snap) g.position.set(tx, TOP, tz);
    }
    const r = run.current;
    const age = t0 - r.start;
    if (unit.dead) {
      const k = Math.min(1, Math.max(0, (age - unit.wait) / FADE));
      g.position.set(tx, TOP - 0.35 * k * k, tz);
      g.scale.setScalar(1 - 0.12 * k);
      fading?.forEach((m) => {
        m.opacity = 1 - k;
        m.depthWrite = k < 0.5;
      });
      g.visible = k < 1;
      return;
    }
    const dist = Math.hypot(tx - r.from.x, tz - r.from.z);
    const dur = slideTime(unit.type, dist);
    const t = dur > 0 ? Math.min(1, age / dur) : 1;
    const e = ease(t);
    const arc = unit.type === "n" ? 0.95 : 0.12 + 0.07 * Math.min(4, dist);
    r.lift += ((selected ? 0.24 : 0) - r.lift) * (1 - Math.exp(-14 * dt));
    g.position.set(
      r.from.x + (tx - r.from.x) * e,
      TOP + (dist > 0 ? arc * Math.sin(Math.PI * t) : 0) + r.lift,
      r.from.z + (tz - r.from.z) * e,
    );
  });

  return (
    <group
      ref={group}
      onClick={
        unit.dead
          ? undefined
          : (e) => {
              e.stopPropagation();
              onSquare(unit.sq);
            }
      }
      onPointerOver={
        unit.dead
          ? undefined
          : (e) => {
              e.stopPropagation();
              document.body.style.cursor = "pointer";
            }
      }
      onPointerOut={unit.dead ? undefined : () => (document.body.style.cursor = "default")}
    >
      <primitive object={body} />
    </group>
  );
}

function useUnits(fen: string, lastMove: { from: string; to: string } | null) {
  const cache = useRef<{ key: string; units: Unit[]; seq: number }>({ key: "", units: [], seq: 0 });
  const key = `${fen}|${lastMove ? lastMove.from + lastMove.to : ""}`;
  if (cache.current.key !== key) {
    const seq = cache.current.seq + 1;
    cache.current = { key, seq, units: nextUnits(cache.current.units, fen, lastMove, seq) };
  }
  return cache.current.units;
}

function SetPieces({
  id,
  fen,
  lastMove,
  selected,
  onSquare,
}: {
  id: HeirloomId;
  fen: string;
  lastMove: { from: string; to: string } | null;
  selected: string | null;
  onSquare: (sq: Square) => void;
}) {
  const { scene } = useResilientGLTF(HEIRLOOM[id].pieces);
  const templates = useMemo(() => {
    const map = new Map<string, THREE.Object3D>();
    for (const c of ["w", "b"]) {
      for (const t of ["p", "n", "b", "r", "q", "k"]) {
        const node = scene.getObjectByName(`${c}_${t}`);
        if (!node) continue;
        const copy = node.clone(true);
        copy.position.set(0, 0, 0);
        copy.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        map.set(`${c}${t}`, copy);
      }
    }
    return map;
  }, [scene]);
  const units = useUnits(fen, lastMove);
  return (
    <>
      {units.map((u) => {
        const template = templates.get(`${u.color}${u.type}`);
        if (!template) return null;
        return <SetPiece key={u.id} unit={u} template={template} selected={!u.dead && selected === u.sq} onSquare={onSquare} />;
      })}
    </>
  );
}

export type HeirloomStandIn = (type: PieceSymbol, color: Color) => ReactNode;

/** The game's own pieces, used while a set's model is still loading or could not load. */
function StandInArmy({ fen, onSquare, render }: { fen: string; onSquare: (sq: Square) => void; render: HeirloomStandIn }) {
  const pieces = useMemo(() => readFen(fen), [fen]);
  return (
    <>
      {pieces.map((p) => {
        const [x, , z] = squareToWorld(p.sq, 1);
        return (
          <group
            key={`${p.color}${p.type}${p.sq}`}
            position={[x, TOP, z]}
            onClick={(e) => {
              e.stopPropagation();
              onSquare(p.sq);
            }}
          >
            {render(p.type, p.color)}
          </group>
        );
      })}
    </>
  );
}

export function HeirloomArmy({
  id,
  fen,
  lastMove,
  selected,
  onSquare,
  standIn,
}: {
  id: HeirloomId;
  fen: string;
  lastMove: { from: string; to: string } | null;
  selected: string | null;
  onSquare: (sq: Square) => void;
  standIn: HeirloomStandIn;
}) {
  const fallback = <StandInArmy fen={fen} onSquare={onSquare} render={standIn} />;
  return (
    <LoadGuard fallback={fallback} loading={<Later ms={900}>{fallback}</Later>}>
      <SetPieces id={id} fen={fen} lastMove={lastMove} selected={selected} onSquare={onSquare} />
    </LoadGuard>
  );
}

/** Small CC BY credit line shown under the board while a set is in use. */
export const HEIRLOOM_CREDIT: Record<HeirloomId, { title: string; author: string; url: string }> = {
  cl: {
    title: "Chess",
    author: "Verfassen",
    url: "https://sketchfab.com/3d-models/chess-e54c2d04d4f74823b69ba4a794fb4500",
  },
  pa: {
    title: "chess",
    author: "maliakshay394",
    url: "https://sketchfab.com/3d-models/chess-1d60dfc2eeaa4ec9a07a19f9f941acb2",
  },
};
