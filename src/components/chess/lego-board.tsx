/**
 * Lego Universe: the board on the balcony of a tall Avengers-style tower at dusk,
 * played with LEGO Marvel figures (heroes = white, villains = black).
 *
 * Every figure is an existing, free LEGO model made by someone else (Sketchfab CC-BY 4.0
 * and LDraw Official Model Repository CC BY 2.0). We only regrouped each model's own parts
 * (body / head / arms / legs) around joint pivots, stood seated legs up, normalised the size
 * and compressed it, so the figures can be animated procedurally here: idle bob and arm
 * swing, walking, character moves (Hulk smash, Spider-Man swing, Iron Man flight and
 * repulsors, Dr. Strange portals, Doom energy blasts, Thanos snap) and a fall on capture.
 * The city and tower are Kenney "City Kit (Commercial)" buildings (CC0).
 * See public/lego/CREDITS.md for the full list.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import * as THREE from "three";
import { asset } from "@/lib/base";
import { squareToWorld } from "@/lib/chess/board-math";

export const LEGO_BOARD_ID = "lego-universe";
/** White's default camera: low enough to see the figures and the tower behind the board. */
export const LEGO_CAMERA = { w: [0, 8.4, 12.2] as [number, number, number], b: [0, 8.4, -12.2] as [number, number, number] };
export const LEGO_ZOOM = { min: 6.5, max: 20 } as const;

const CITY_URL = asset("/lego/city.glb");

// ── roster ─────────────────────────────────────────────────────────────────

type Gait = "walk" | "stomp" | "hop" | "swing" | "fly" | "glide" | "portal";
type Attack = "smash" | "web" | "repulsor" | "portal" | "blast" | "snap" | "lunge" | "punch" | "charge" | "zap";

export type LegoCharId =
  | "hulk"
  | "spiderman"
  | "ironman"
  | "cap"
  | "strange"
  | "agent"
  | "doom"
  | "thanos"
  | "venom"
  | "blacktron"
  | "goblin"
  | "doombot";

type CharSpec = {
  file: string;
  /** Who it plays. Stand-ins are named after the character they stand in for. */
  role: string;
  height: number;
  gait: Gait;
  attack: Attack;
  /** Effect colour for beams / portals / blasts. */
  fx: string;
};

export const LEGO_CHARS: Record<LegoCharId, CharSpec> = {
  hulk: { file: "hulk.glb", role: "Hulk", height: 0.94, gait: "stomp", attack: "smash", fx: "#8cff6a" },
  spiderman: { file: "spiderman.glb", role: "Spider-Man", height: 0.84, gait: "swing", attack: "web", fx: "#f4f4f4" },
  ironman: { file: "ironman.glb", role: "Iron Man", height: 0.86, gait: "fly", attack: "repulsor", fx: "#9ef3ff" },
  cap: { file: "captain-america-bh.glb", role: "Black Panther (stand-in: Captain America BrickHeadz)", height: 1.12, gait: "hop", attack: "charge", fx: "#7fb2ff" },
  strange: { file: "wizard.glb", role: "Dr. Strange (stand-in: Wizard minifig)", height: 1.02, gait: "portal", attack: "portal", fx: "#ff9a2a" },
  agent: { file: "space-police.glb", role: "Hero pawn (Space Police officer)", height: 0.72, gait: "walk", attack: "punch", fx: "#7fb2ff" },
  doom: { file: "black-knight.glb", role: "Dr. Doom (stand-in: Black Knight minifig)", height: 1.02, gait: "walk", attack: "blast", fx: "#5dff6a" },
  thanos: { file: "thanos-bh.glb", role: "Thanos BrickHeadz", height: 1.1, gait: "hop", attack: "snap", fx: "#c77dff" },
  venom: { file: "venom-bh.glb", role: "Venom BrickHeadz", height: 1.04, gait: "hop", attack: "lunge", fx: "#e8e8e8" },
  blacktron: { file: "blacktron.glb", role: "Villain bishop (Blacktron minifig)", height: 0.86, gait: "walk", attack: "zap", fx: "#ff3b3b" },
  goblin: { file: "insectoid.glb", role: "Green Goblin (stand-in: Insectoids minifig)", height: 0.86, gait: "glide", attack: "zap", fx: "#a6ff3b" },
  doombot: { file: "gigabot.glb", role: "Doombot (stand-in: Insectoids Gigabot robot)", height: 0.72, gait: "walk", attack: "punch", fx: "#5dff6a" },
};

export const LEGO_ROSTER: Record<Color, Record<PieceSymbol, LegoCharId>> = {
  w: { k: "cap", q: "strange", r: "hulk", b: "ironman", n: "spiderman", p: "agent" },
  b: { k: "doom", q: "thanos", r: "venom", b: "blacktron", n: "goblin", p: "doombot" },
};

const charUrl = (id: LegoCharId) => asset(`/lego/chars/${LEGO_CHARS[id].file}`);

/** Team plates under the figures: LEGO blue for the heroes, dark green/black for Doom's side. */
const TEAM = {
  w: { plate: "#1e5aa8", rim: "#f2cd37" },
  b: { plate: "#1b2a24", rim: "#4b9f4a" },
} as const;

// ── math ───────────────────────────────────────────────────────────────────

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/** Top of the painted squares (BoardSquares: box at y=0.08, 0.08 tall). */
const BOARD_TOP = 0.12;
const PLATE_H = 0.05;
const STAND = BOARD_TOP + PLATE_H;
const v3 = (sq: string, pitch: number) => {
  const [x, , z] = squareToWorld(sq, pitch);
  return new THREE.Vector3(x, 0, z);
};
const yawTo = (a: THREE.Vector3, b: THREE.Vector3) => Math.atan2(b.x - a.x, b.z - a.z);
const restYaw = (color: Color) => (color === "w" ? Math.PI : 0);
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};
function noRaycast() {
  return null;
}

// ── figures ────────────────────────────────────────────────────────────────

type Parts = {
  body: THREE.Object3D | null;
  head: THREE.Object3D | null;
  armL: THREE.Object3D | null;
  armR: THREE.Object3D | null;
  legL: THREE.Object3D | null;
  legR: THREE.Object3D | null;
};

type Pose = {
  legL?: number;
  legR?: number;
  armLx?: number;
  armRx?: number;
  armLz?: number;
  armRz?: number;
  headY?: number;
  headX?: number;
  lean?: number;
  roll?: number;
};

function applyPose(p: Parts, o: Pose) {
  p.legL?.rotation.set(o.legL ?? 0, 0, 0);
  p.legR?.rotation.set(o.legR ?? 0, 0, 0);
  p.armL?.rotation.set(o.armLx ?? 0, 0, o.armLz ?? 0);
  p.armR?.rotation.set(o.armRx ?? 0, 0, o.armRz ?? 0);
  p.head?.rotation.set(o.headX ?? 0, o.headY ?? 0, 0);
  p.body?.rotation.set(o.lean ?? 0, 0, o.roll ?? 0);
}

function useFigure(id: LegoCharId) {
  const gltf = useGLTF(charUrl(id));
  return useMemo(() => {
    const root = gltf.scene.clone(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    root.scale.setScalar(LEGO_CHARS[id].height);
    const get = (n: string) => root.getObjectByName(n) ?? null;
    const parts: Parts = { body: get("body"), head: get("head"), armL: get("armL"), armR: get("armR"), legL: get("legL"), legR: get("legR") };
    return { root, parts };
  }, [gltf, id]);
}

/** The standing pose loop. `t` in seconds, `seed` de-syncs neighbours. */
function idlePose(gait: Gait, t: number, seed: number): { pose: Pose; y: number } {
  const w = t * 1.7 + seed * 6.28;
  const sway = Math.sin(w);
  if (gait === "hop") return { pose: { roll: Math.sin(w * 0.5) * 0.05, armLz: 0.1 + sway * 0.12, armRz: -0.1 - sway * 0.12 }, y: Math.max(0, Math.sin(w)) * 0.012 };
  return {
    pose: {
      armLx: sway * 0.16,
      armRx: -sway * 0.16,
      armLz: 0.06,
      armRz: -0.06,
      headY: Math.sin(t * 0.55 + seed * 9) * 0.32,
      lean: gait === "stomp" ? 0.1 + Math.sin(w) * 0.03 : 0,
      roll: gait === "stomp" ? Math.sin(w * 0.5) * 0.04 : 0,
    },
    y: (Math.sin(w * 1.2) * 0.5 + 0.5) * 0.014,
  };
}

/** Where a figure is, and how it holds itself, `u` (0..1) of the way along a move. */
function travel(gait: Gait, a: THREE.Vector3, b: THREE.Vector3, u: number, t: number) {
  const pos = new THREE.Vector3();
  const dist = a.distanceTo(b);
  let pose: Pose = {};
  let flip = 0;
  let scale = 1;
  const e = ease(u);
  if (gait === "portal") {
    const sink = 1.15;
    pos.copy(u < 0.5 ? a : b);
    pos.y = u < 0.5 ? -sink * ease(u / 0.42) : -sink * (1 - ease((u - 0.58) / 0.42));
    pose = { armLx: -2.6, armRx: -2.6, armLz: 0.35, armRz: -0.35, headX: -0.2 };
    return { pos, pose, flip, scale, spin: u * 9 };
  }
  pos.lerpVectors(a, b, gait === "fly" || gait === "glide" || gait === "swing" ? e : u);
  if (gait === "fly" || gait === "glide") {
    const h = gait === "fly" ? 0.9 : 0.5;
    pos.y = h * ease(u / 0.25) * (1 - ease((u - 0.75) / 0.25)) + Math.sin(t * 6) * 0.03 * Math.sin(u * Math.PI);
    pose = gait === "fly" ? { lean: 0.45 * Math.sin(u * Math.PI), armLx: 0.55, armRx: 0.55, armLz: 0.25, armRz: -0.25 } : { lean: 0.25, armLx: -0.5, armRx: -0.5, legL: -0.2, legR: -0.2 };
  } else if (gait === "swing") {
    pos.y = Math.max(0, 4 * (0.7 + dist * 0.12) * u * (1 - u));
    flip = dist > 1.2 ? ease(span(u, 0.3, 0.75)) * Math.PI * 2 : 0;
    pose = { armRx: -2.9, armLx: -0.4, legL: -0.6 * Math.sin(u * Math.PI), legR: -0.2 };
  } else if (gait === "hop") {
    const hops = Math.max(1, Math.round(dist * 1.3));
    pos.y = Math.abs(Math.sin(u * Math.PI * hops)) * 0.22;
    pose = { lean: 0.12, armLz: 0.5, armRz: -0.5 };
    scale = 1 + Math.sin(u * Math.PI * hops * 2) * 0.04;
  } else {
    const k = gait === "stomp" ? 7 : 11;
    const s = Math.sin(t * k);
    const amp = gait === "stomp" ? 0.55 : 0.75;
    pos.y = Math.abs(s) * (gait === "stomp" ? 0.05 : 0.03);
    pose = { legL: s * amp, legR: -s * amp, armLx: -s * 0.65, armRx: s * 0.65, lean: gait === "stomp" ? 0.25 : 0.06, roll: gait === "stomp" ? s * 0.08 : 0 };
  }
  return { pos, pose, flip, scale, spin: 0 };
}

function moveTime(gait: Gait, dist: number) {
  if (gait === "portal") return 1.3;
  if (gait === "fly" || gait === "glide") return 0.9 + dist * 0.16;
  if (gait === "swing") return 0.8 + dist * 0.14;
  if (gait === "stomp") return Math.max(0.6, dist * 0.42);
  return Math.max(0.5, dist * 0.36);
}

function TeamPlate({ color }: { color: Color }) {
  return (
    <group raycast={noRaycast}>
      <mesh position={[0, BOARD_TOP + PLATE_H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.38, 0.38, PLATE_H, 28]} />
        <meshStandardMaterial color={TEAM[color].plate} roughness={0.35} />
      </mesh>
      <mesh position={[0, BOARD_TOP + PLATE_H - 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.33, 0.37, 32]} />
        <meshStandardMaterial color={TEAM[color].rim} emissive={TEAM[color].rim} emissiveIntensity={0.25} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** A portal ring (Dr. Strange) lying on the board. */
function Portal({ at, open, color }: { at: THREE.Vector3; open: number; color: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 3;
  });
  if (open <= 0.001) return null;
  return (
    <group ref={ref} position={[at.x, BOARD_TOP + 0.02, at.z]} scale={open} raycast={noRaycast}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.035, 8, 40]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.26, 0.4, 40, 1]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[Math.cos(i) * 0.45, 0.04, Math.sin(i) * 0.45]}>
          <sphereGeometry args={[0.035, 6, 6]} />
          <meshBasicMaterial color="#ffe1a8" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** A figure standing on (or moving to) a square. */
function SquareFigure({
  id,
  color,
  sq,
  spawnFrom,
  pitch,
  onClick,
}: {
  id: LegoCharId;
  color: Color;
  sq: Square;
  spawnFrom: Square;
  pitch: number;
  onClick: () => void;
}) {
  const spec = LEGO_CHARS[id];
  const { root, parts } = useFigure(id);
  const outer = useRef<THREE.Group>(null);
  const fig = useRef<THREE.Group>(null);
  const a = useMemo(() => v3(spawnFrom, pitch), [spawnFrom, pitch]);
  const b = useMemo(() => v3(sq, pitch), [sq, pitch]);
  const moving = spawnFrom !== sq;
  const dur = moveTime(spec.gait, a.distanceTo(b));
  const start = useRef<number | null>(null);
  const seed = useMemo(() => hash(`${color}${sq}${id}`), [color, sq, id]);
  const [portal, setPortal] = useState(0);
  useFrame((state) => {
    const g = outer.current;
    const f = fig.current;
    if (!g || !f) return;
    const now = state.clock.elapsedTime;
    if (start.current === null) start.current = now;
    const u = moving ? span(now - start.current, 0, dur) : 1;
    if (u < 1) {
      const m = travel(spec.gait, a, b, u, now);
      g.position.set(m.pos.x, 0, m.pos.z);
      f.position.y = STAND + m.pos.y;
      f.rotation.set(m.flip, (spec.gait === "portal" ? m.spin : 0) + yawTo(a, b), 0);
      f.scale.setScalar(m.scale);
      applyPose(parts, m.pose);
      if (spec.gait === "portal") setPortal(Math.sin(u * Math.PI) > 0.05 ? 1 : 0);
    } else {
      const idle = idlePose(spec.gait, now, seed);
      g.position.set(b.x, 0, b.z);
      f.position.y = STAND + idle.y;
      f.rotation.set(0, restYaw(color), 0);
      f.scale.setScalar(1);
      applyPose(parts, idle.pose);
      if (portal) setPortal(0);
    }
  });
  return (
    <>
      <group
        ref={outer}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <TeamPlate color={color} />
        <group ref={fig}>
          <primitive object={root} />
        </group>
      </group>
      {spec.gait === "portal" && moving ? (
        <>
          <Portal at={a} open={portal} color={spec.fx} />
          <Portal at={b} open={portal} color={spec.fx} />
        </>
      ) : null}
    </>
  );
}

// ── captures ───────────────────────────────────────────────────────────────

type Fight = {
  id: string;
  type: PieceSymbol;
  color: Color;
  from: Square;
  to: Square;
  victimType: PieceSymbol;
  victimSq: Square;
};

const RANGED: Attack[] = ["repulsor", "portal", "blast", "snap", "zap", "web"];

function fightTiming(attack: Attack, gait: Gait, dist: number) {
  const ranged = RANGED.includes(attack);
  const approach = ranged ? 0.35 : moveTime(gait, Math.max(0.2, dist - 0.62));
  const strike = attack === "portal" || attack === "snap" ? 1.1 : 0.85;
  const fall = 1.0;
  const finish = moveTime(gait, ranged ? dist : 0.62) * (gait === "portal" ? 1 : 0.8);
  return { approach, strike, fall, finish, total: approach + strike + fall * 0.6 + finish };
}

export const LEGO_FIGHT_SECONDS = (attackerId: LegoCharId, dist: number) => {
  const s = LEGO_CHARS[attackerId];
  return fightTiming(s.attack, s.gait, dist).total;
};

/** A thin glowing beam from a to b. */
function Beam({ from, to, color, width = 0.05 }: { from: THREE.Vector3; to: THREE.Vector3; color: string; width?: number }) {
  const mid = useMemo(() => from.clone().add(to).multiplyScalar(0.5), [from, to]);
  const q = useMemo(() => {
    const dir = to.clone().sub(from).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }, [from, to]);
  const len = from.distanceTo(to);
  return (
    <group position={mid} quaternion={q} raycast={noRaycast}>
      <mesh>
        <cylinderGeometry args={[width, width, len, 8, 1, true]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[width * 2.6, width * 2.6, len, 10, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** LEGO bricks popping off a captured figure. */
function BrickBurst({ at, colors, seed }: { at: THREE.Vector3; colors: string[]; seed: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const start = useRef<number | null>(null);
  const bits = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + seed * 3;
        const sp = 1.1 + ((i * 37) % 10) / 9;
        return { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2.2 + ((i * 53) % 10) / 6, spin: 4 + (i % 5), color: colors[i % colors.length], big: i % 3 === 0 };
      }),
    [colors, seed],
  );
  useFrame((state) => {
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current;
    bits.forEach((b, i) => {
      const m = refs.current[i];
      if (!m) return;
      const y = Math.max(BOARD_TOP + 0.03, at.y + b.vy * t - 4.9 * t * t);
      m.position.set(at.x + b.vx * t * 0.45, y, at.z + b.vz * t * 0.45);
      m.rotation.set(t * b.spin, t * b.spin * 0.7, 0);
      const fade = 1 - span(t, 1.0, 1.5);
      m.scale.setScalar(Math.max(0.001, fade));
    });
  });
  return (
    <group raycast={noRaycast}>
      {bits.map((b, i) => (
        <mesh key={i} ref={(m) => (refs.current[i] = m)} castShadow>
          <boxGeometry args={b.big ? [0.12, 0.07, 0.06] : [0.06, 0.05, 0.06]} />
          <meshStandardMaterial color={b.color} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Shockwave({ at, t }: { at: THREE.Vector3; t: number }) {
  if (t <= 0 || t >= 1) return null;
  return (
    <mesh position={[at.x, BOARD_TOP + 0.02, at.z]} rotation={[-Math.PI / 2, 0, 0]} scale={0.2 + t * 1.8} raycast={noRaycast}>
      <ringGeometry args={[0.36, 0.44, 40]} />
      <meshBasicMaterial color="#d8ffd0" transparent opacity={(1 - t) * 0.8} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function FightScene({ fight, pitch }: { fight: Fight; pitch: number }) {
  const atkId = LEGO_ROSTER[fight.color][fight.type];
  const victimColor: Color = fight.color === "w" ? "b" : "w";
  const vicId = LEGO_ROSTER[victimColor][fight.victimType];
  const atk = LEGO_CHARS[atkId];
  const A = useFigure(atkId);
  const V = useFigure(vicId);
  const from = useMemo(() => v3(fight.from, pitch), [fight.from, pitch]);
  const vic = useMemo(() => v3(fight.victimSq, pitch), [fight.victimSq, pitch]);
  const dest = useMemo(() => v3(fight.to, pitch), [fight.to, pitch]);
  const ranged = RANGED.includes(atk.attack);
  const near = useMemo(() => {
    if (ranged) return from.clone();
    const d = vic.clone().sub(from);
    const len = d.length();
    return len < 0.7 ? from.clone() : from.clone().add(d.multiplyScalar((len - 0.62) / len));
  }, [from, vic, ranged]);
  const T = useMemo(() => fightTiming(atk.attack, atk.gait, from.distanceTo(vic)), [atk, from, vic]);
  const hitAt = T.approach + T.strike * 0.55;
  const start = useRef<number | null>(null);
  const aOuter = useRef<THREE.Group>(null);
  const aFig = useRef<THREE.Group>(null);
  const vOuter = useRef<THREE.Group>(null);
  const vFig = useRef<THREE.Group>(null);
  const [fx, setFx] = useState({ beam: false, portal: 0, shock: 0, burst: false, gone: false, vPortal: 0 });
  const seed = useMemo(() => hash(fight.id), [fight.id]);
  const vicColors = useMemo(() => {
    const out: string[] = [];
    V.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && m.color && out.length < 6) out.push(`#${m.color.getHexString()}`);
    });
    return out.length ? out : ["#888888"];
  }, [V.root]);
  const hand = useMemo(() => {
    const face = yawTo(near, vic);
    const h = near.clone();
    h.y = STAND + atk.height * (atk.attack === "repulsor" ? 1.05 : 0.6);
    h.x += Math.sin(face) * 0.22;
    h.z += Math.cos(face) * 0.22;
    return h;
  }, [near, vic, atk]);
  const target = useMemo(() => new THREE.Vector3(vic.x, STAND + 0.32, vic.z), [vic]);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (start.current === null) start.current = now;
    const t = now - start.current;
    const ag = aOuter.current;
    const af = aFig.current;
    const vg = vOuter.current;
    const vf = vFig.current;
    if (!ag || !af || !vg || !vf) return;
    const face = yawTo(near, vic);
    const next = { ...fx };
    // attacker
    if (t < T.approach) {
      const u = t / T.approach;
      if (ranged) {
        ag.position.set(from.x, 0, from.z);
        af.position.y = STAND;
        af.rotation.set(0, restYaw(fight.color) + (face - restYaw(fight.color)) * ease(u), 0);
        applyPose(A.parts, idlePose(atk.gait, now, seed).pose);
      } else {
        const m = travel(atk.gait === "portal" ? "walk" : atk.gait, from, near, u, now);
        ag.position.set(m.pos.x, 0, m.pos.z);
        af.position.y = STAND + m.pos.y;
        af.rotation.set(m.flip, yawTo(from, near), 0);
        af.scale.setScalar(m.scale);
        applyPose(A.parts, m.pose);
      }
    } else if (t < T.approach + T.strike) {
      const u = (t - T.approach) / T.strike;
      ag.position.set(near.x, 0, near.z);
      af.rotation.set(0, face, 0);
      af.scale.setScalar(1);
      let y = 0;
      let pose: Pose = {};
      switch (atk.attack) {
        case "smash": {
          const up = ease(span(u, 0, 0.45));
          const down = ease(span(u, 0.45, 0.6));
          const lift = up - down;
          pose = { armLx: -2.9 * up + 2.3 * down, armRx: -2.9 * up + 2.3 * down, lean: -0.2 * up + 0.55 * down, legL: -0.3 * lift, legR: -0.3 * lift };
          y = Math.sin(span(u, 0.1, 0.55) * Math.PI) * 0.35;
          next.shock = span(u, 0.55, 1);
          break;
        }
        case "web": {
          pose = { armRx: -1.55, armLx: -0.3, lean: 0.1 };
          next.beam = u > 0.1 && u < 0.7;
          y = u > 0.6 ? Math.sin(span(u, 0.6, 1) * Math.PI) * 0.35 : 0;
          break;
        }
        case "repulsor": {
          y = 0.35 * ease(span(u, 0, 0.3));
          pose = { armRx: -1.57, armLx: 0.35, lean: -0.08 };
          next.beam = u > 0.35 && u < 0.85;
          break;
        }
        case "portal": {
          pose = { armLx: -2.2, armRx: -2.2, armLz: 0.5, armRz: -0.5, headX: -0.25 };
          next.vPortal = ease(span(u, 0.05, 0.35));
          break;
        }
        case "blast": {
          const charge = span(u, 0, 0.4);
          pose = { armRx: -1.57 * ease(charge), armLx: -1.2 * ease(charge), lean: -0.05 };
          next.beam = u > 0.42 && u < 0.85;
          break;
        }
        case "snap": {
          pose = { armRx: -2.8 * ease(span(u, 0, 0.4)), headX: -0.15 };
          next.beam = false;
          next.shock = u > 0.5 ? span(u, 0.5, 1) : 0;
          break;
        }
        case "lunge": {
          const l = Math.sin(span(u, 0.15, 0.7) * Math.PI);
          ag.position.lerpVectors(near, vic, l * 0.45);
          y = l * 0.25;
          pose = { lean: 0.5 * l, armLz: 0.9 * l, armRz: -0.9 * l };
          break;
        }
        case "charge": {
          const l = Math.sin(span(u, 0.2, 0.65) * Math.PI);
          ag.position.lerpVectors(near, vic, l * 0.4);
          y = l * 0.18;
          pose = { lean: 0.35 * l, armLz: 0.6, armRz: -0.6 };
          break;
        }
        case "zap": {
          pose = { armRx: -1.57 * ease(span(u, 0, 0.3)), lean: -0.05 };
          next.beam = u > 0.32 && u < 0.75;
          break;
        }
        default: {
          const jab = Math.sin(span(u, 0.3, 0.7) * Math.PI);
          pose = { armRx: -0.6 - 1.2 * jab, armLx: 0.4 * jab, lean: 0.25 * jab, legL: -0.4 * jab, legR: 0.3 * jab };
          ag.position.lerpVectors(near, vic, jab * 0.15);
        }
      }
      af.position.y = STAND + y;
      applyPose(A.parts, pose);
    } else {
      next.beam = false;
      const tf = t - T.approach - T.strike;
      const startFinish = T.fall * 0.6;
      if (tf < startFinish) {
        ag.position.set(near.x, 0, near.z);
        af.position.y = STAND;
        af.rotation.set(0, face, 0);
        applyPose(A.parts, idlePose(atk.gait, now, seed).pose);
      } else {
        const u = clamp01((tf - startFinish) / T.finish);
        const m = travel(atk.gait, near, dest, u, now);
        ag.position.set(m.pos.x, 0, m.pos.z);
        af.position.y = STAND + m.pos.y;
        af.rotation.set(m.flip, near.distanceTo(dest) > 0.05 ? yawTo(near, dest) + (atk.gait === "portal" ? m.spin : 0) : face, 0);
        af.scale.setScalar(m.scale);
        applyPose(A.parts, near.distanceTo(dest) > 0.05 ? m.pose : idlePose(atk.gait, now, seed).pose);
        next.portal = atk.gait === "portal" && near.distanceTo(dest) > 0.05 ? (Math.sin(u * Math.PI) > 0.05 ? 1 : 0) : 0;
      }
      if (atk.attack === "portal") next.vPortal = 1 - span(tf, 0.7, 1.0);
    }
    // victim
    vg.position.set(vic.x, 0, vic.z);
    const dt = t - hitAt;
    const away = yawTo(near, vic);
    if (dt < 0) {
      vf.position.set(0, STAND, 0);
      vf.rotation.set(0, restYaw(victimColor) + (yawTo(vic, near) - restYaw(victimColor)) * ease(t / Math.max(0.3, hitAt)), 0);
      applyPose(V.parts, { armLx: -0.4, armRx: -0.4, headX: -0.1 });
    } else if (atk.attack === "portal") {
      const u = span(dt, 0, 0.9);
      vf.position.set(0, STAND - u * 1.25, 0);
      vf.rotation.set(0, yawTo(vic, near) + u * 10, 0);
      applyPose(V.parts, { armLx: -2.8, armRx: -2.8, armLz: 0.4, armRz: -0.4 });
      if (u >= 1) next.gone = true;
    } else if (atk.attack === "snap") {
      const u = span(dt, 0, 0.8);
      vf.position.set(0, STAND, 0);
      vf.scale.set(1 - u * 0.9, 1 - u, 1 - u * 0.9);
      vf.rotation.set(0, yawTo(vic, near) + u * 2, 0);
      next.burst = dt > 0.05;
      if (u >= 1) next.gone = true;
    } else {
      // knocked back, tips over away from the attacker, bounces, then pops into bricks
      const u = span(dt, 0, 0.45);
      const back = ease(span(dt, 0, 0.35)) * 0.42;
      const dir = new THREE.Vector3(Math.sin(away), 0, Math.cos(away));
      vg.position.set(vic.x + dir.x * back, 0, vic.z + dir.z * back);
      const hop = Math.sin(span(dt, 0, 0.3) * Math.PI) * (atk.attack === "smash" ? 0.45 : 0.18);
      const bounce = dt > 0.45 ? Math.abs(Math.sin(span(dt, 0.45, 0.65) * Math.PI)) * 0.06 : 0;
      vf.position.set(0, STAND + hop + bounce - u * 0.02, 0);
      // rotate in the victim's facing frame: tip backward (it faces the attacker)
      vf.rotation.set(0, yawTo(vic, near), 0);
      vf.rotateX(-ease(u) * (Math.PI / 2));
      applyPose(V.parts, { armLx: -2.4 * ease(u), armRx: -2.1 * ease(u), legL: 0.3 * u, legR: -0.2 * u, headX: -0.3 });
      next.burst = dt > 0.62;
      const pop = span(dt, 0.62, 0.8);
      vf.scale.setScalar(Math.max(0.001, 1 - pop));
      if (pop >= 1) next.gone = true;
    }
    if (
      next.beam !== fx.beam ||
      Math.abs(next.portal - fx.portal) > 0.01 ||
      Math.abs(next.vPortal - fx.vPortal) > 0.02 ||
      Math.abs(next.shock - fx.shock) > 0.02 ||
      next.burst !== fx.burst ||
      next.gone !== fx.gone
    )
      setFx(next);
  });

  const beamColor = atk.fx;
  return (
    <>
      <group ref={aOuter}>
        <TeamPlate color={fight.color} />
        <group ref={aFig}>
          <primitive object={A.root} />
        </group>
      </group>
      {fx.gone ? null : (
        <group ref={vOuter}>
          <group ref={vFig}>
            <primitive object={V.root} />
          </group>
        </group>
      )}
      {fx.beam ? <Beam from={hand} to={target} color={beamColor} width={atk.attack === "web" ? 0.015 : 0.04} /> : null}
      {fx.beam && atk.attack !== "web" ? <pointLight position={hand} color={beamColor} intensity={3} distance={3} /> : null}
      {atk.attack === "portal" ? <Portal at={vic} open={fx.vPortal} color={atk.fx} /> : null}
      {atk.gait === "portal" ? (
        <>
          <Portal at={near} open={fx.portal} color={atk.fx} />
          <Portal at={dest} open={fx.portal} color={atk.fx} />
        </>
      ) : null}
      {atk.attack === "smash" || atk.attack === "snap" ? <Shockwave at={atk.attack === "smash" ? vic : near} t={fx.shock} /> : null}
      {fx.burst ? <BrickBurst at={new THREE.Vector3(vic.x, STAND + 0.2, vic.z)} colors={vicColors} seed={seed} /> : null}
    </>
  );
}

// ── the army ───────────────────────────────────────────────────────────────

type P = { sq: Square; type: PieceSymbol; color: Color };

export function LegoArmy({
  fen,
  lastMove,
  pitch = 1,
  onSquare,
}: {
  fen: string;
  lastMove: { from: string; to: string } | null;
  pitch?: number;
  onSquare: (sq: Square) => void;
}) {
  const pieces = useMemo(() => {
    const out: P[] = [];
    new Chess(fen).board().forEach((row, r) =>
      row.forEach((p, f) => {
        if (p) out.push({ sq: `${"abcdefgh"[f]}${8 - r}` as Square, type: p.type, color: p.color });
      }),
    );
    return out;
  }, [fen]);
  const prev = useRef<P[] | null>(null);
  const seen = useRef("");
  const [fight, setFight] = useState<Fight | null>(null);
  const [fought, setFought] = useState("");
  const moveKey = lastMove ? `${fen}|${lastMove.from}${lastMove.to}` : "";
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    const before = prev.current;
    prev.current = pieces;
    if (!before || !lastMove) return;
    const key = `${fen}|${lastMove.from}${lastMove.to}`;
    if (seen.current === key) return;
    seen.current = key;
    // a new position ends any fight still playing
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setFight(null);
    const mover = pieces.find((p) => p.sq === lastMove.to);
    if (!mover) return;
    // only a real move forward (the mover stood on `from`), not a jump back in History
    const was = before.find((p) => p.sq === lastMove.from && p.color === mover.color);
    if (!was) return;
    let victim = before.find((p) => p.sq === lastMove.to && p.color !== mover.color);
    if (!victim && mover.type === "p" && lastMove.from[0] !== lastMove.to[0]) {
      const beside = `${lastMove.to[0]}${lastMove.from[1]}` as Square;
      victim = before.find((p) => p.sq === beside && p.type === "p" && p.color !== mover.color && !pieces.some((q) => q.sq === beside));
    }
    if (!victim) return;
    // the attacker keeps the shape it had before a promotion
    const f: Fight = {
      id: key,
      type: was.type,
      color: mover.color,
      from: lastMove.from as Square,
      to: lastMove.to as Square,
      victimType: victim.type,
      victimSq: victim.sq,
    };
    setFight(f);
    const a = v3(f.from, pitch);
    const b = v3(f.victimSq, pitch);
    const secs = LEGO_FIGHT_SECONDS(LEGO_ROSTER[f.color][f.type], a.distanceTo(b));
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setFought(f.id);
      setFight((cur) => (cur?.id === f.id ? null : cur));
    }, secs * 1000 + 80);
  }, [pieces, lastMove, fen, pitch]);

  return (
    <>
      {pieces.map((p) =>
        fight && p.sq === fight.to && p.color === fight.color ? null : (
          <SquareFigure
            key={`${p.color}${p.type}${p.sq}`}
            id={LEGO_ROSTER[p.color][p.type]}
            color={p.color}
            sq={p.sq}
            spawnFrom={!fight && fought !== moveKey && lastMove?.to === p.sq ? (lastMove.from as Square) : p.sq}
            pitch={pitch}
            onClick={() => onSquare(p.sq)}
          />
        ),
      )}
      {fight ? <FightScene key={fight.id} fight={fight} pitch={pitch} /> : null}
    </>
  );
}

// ── the world: balcony of the tower, city at dusk ─────────────────────────

function DuskSky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {},
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vDir;
          void main(){
            float h = vDir.y;
            vec3 top = vec3(0.07,0.10,0.28);
            vec3 mid = vec3(0.33,0.28,0.55);
            vec3 hor = vec3(1.0,0.56,0.32);
            vec3 low = vec3(0.16,0.12,0.2);
            vec3 c = h > 0.0 ? mix(hor, mix(mid, top, smoothstep(0.25,0.8,h)), smoothstep(0.0,0.25,h)) : mix(hor, low, smoothstep(0.0,0.12,-h));
            // sun glow toward -z +x (behind the city, in front of black's camera)
            vec3 sunDir = normalize(vec3(0.35, 0.06, 1.0));
            float s = max(dot(normalize(vDir), sunDir), 0.0);
            c += vec3(1.0,0.62,0.3) * pow(s, 18.0) * 0.9 + vec3(1.0,0.9,0.7) * pow(s, 400.0);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} raycast={noRaycast} renderOrder={-10}>
      <sphereGeometry args={[320, 32, 16]} />
    </mesh>
  );
}

/** The tower stands beside the board (to white's left), so neither player's camera is inside it. */
const TOWER_X = -16;
const TOWER_SCALE = 14;
const STREET_Y = -56;
const TOWER = "building-skyscraper-d";

const tinted = new Map<THREE.Material, THREE.Material>();
function duskTint(m: THREE.MeshStandardMaterial) {
  let t = tinted.get(m);
  if (!t) {
    const c = m.clone();
    c.color = new THREE.Color("#7d7f9c");
    c.emissive = new THREE.Color("#2a1e3a");
    t = c;
    tinted.set(m, t);
  }
  return t;
}

function useCityPieces() {
  const gltf = useGLTF(CITY_URL);
  return useMemo(() => {
    const out: Record<string, THREE.Object3D> = {};
    gltf.scene.children.forEach((c) => {
      out[c.name] = c;
    });
    return out;
  }, [gltf]);
}

/** Studs on the LEGO frame round the board. */
function StudFrame() {
  const geo = useMemo(() => new THREE.CylinderGeometry(0.1, 0.1, 0.07, 14), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6c6e68", roughness: 0.35 }), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i < 18; i++) {
      for (let j = 0; j < 18; j++) {
        const x = -4.25 + i * 0.5;
        const z = -4.25 + j * 0.5;
        if (Math.abs(x) < 4.1 && Math.abs(z) < 4.1) continue;
        out.push([x, z]);
      }
    }
    return out;
  }, []);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    spots.forEach(([x, z], i) => {
      o.position.set(x, 0.075, z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [spots]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <instancedMesh ref={ref} args={[geo, mat, spots.length]} castShadow receiveShadow raycast={noRaycast} />;
}

/** A big glowing "A" on the tower face. Simple bars, like a sign. */
function TowerSign() {
  return (
    <group position={[TOWER_X + 9.85, 3.4, 0]} rotation={[0, Math.PI / 2, 0]} scale={0.5} raycast={noRaycast}>
      <mesh position={[-1.15, 0, 0]} rotation={[0, 0, -0.38]}>
        <boxGeometry args={[0.7, 6.4, 0.3]} />
        <meshBasicMaterial color="#d8ecff" toneMapped={false} />
      </mesh>
      <mesh position={[1.15, 0, 0]} rotation={[0, 0, 0.38]}>
        <boxGeometry args={[0.7, 6.4, 0.3]} />
        <meshBasicMaterial color="#d8ecff" toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.6, 0]}>
        <boxGeometry args={[2.6, 0.6, 0.3]} />
        <meshBasicMaterial color="#d8ecff" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.1]}>
        <torusGeometry args={[4.3, 0.28, 8, 48]} />
        <meshBasicMaterial color="#9fd0ff" toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0, 3]} color="#bfe0ff" intensity={14} distance={14} />
    </group>
  );
}

export function LegoWorld() {
  const city = useCityPieces();
  const tower = useMemo(() => {
    const src = city[TOWER];
    if (!src) return null;
    const t = src.clone(true);
    t.scale.setScalar(TOWER_SCALE);
    t.position.set(TOWER_X, STREET_Y, 0);
    t.rotation.y = Math.PI / 2;
    t.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.receiveShadow = true;
    });
    return t;
  }, [city]);
  const blocks = useMemo(() => {
    const kinds = Object.keys(city).filter((k) => k !== TOWER);
    if (!kinds.length) return [];
    const out: THREE.Object3D[] = [];
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 70; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = 34 + rnd() * 120;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (Math.abs(z) < 24 && x < 10 && x > -44) continue;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      const sky = kind.includes("skyscraper");
      const o = city[kind].clone(true);
      // most of the city sits well below the balcony; a few towers rise to about its height
      o.scale.setScalar(sky ? 5 + rnd() * 6 : 7 + rnd() * 5);
      o.position.set(x, STREET_Y, z);
      o.rotation.y = Math.floor(rnd() * 4) * (Math.PI / 2);
      if (!sky) {
        // the plain low-detail blocks get a dusk tint so they sit back in the haze
        o.traverse((m) => {
          const mesh = m as THREE.Mesh;
          if (mesh.isMesh) mesh.material = duskTint(mesh.material as THREE.MeshStandardMaterial);
        });
      }
      out.push(o);
    }
    return out;
  }, [city]);
  return (
    <group>
      <DuskSky />
      <fog attach="fog" args={["#6a5a7a", 70, 260]} />
      <hemisphereLight args={["#ffd2b0", "#2b2440", 0.35]} />
      <directionalLight position={[10, 9, 24]} intensity={0.8} color="#ffb184" />
      {/* the board's LEGO baseplate */}
      <mesh position={[0, 0.02, 0]} receiveShadow castShadow raycast={noRaycast}>
        <boxGeometry args={[9.1, 0.08, 9.1]} />
        <meshStandardMaterial color="#6c6e68" roughness={0.4} />
      </mesh>
      <StudFrame />
      {/* the balcony: a deck jutting out of the tower, glass rail all round */}
      <mesh position={[-0.75, -0.25, 0]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[14.5, 0.5, 13]} />
        <meshStandardMaterial color="#4a4f5a" roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[-0.75, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[14.1, 12.6]} />
        <meshStandardMaterial color="#343944" roughness={0.45} metalness={0.4} />
      </mesh>
      {[
        [-0.75, 0.55, 6.45, 14.5, 1.1, 0.06],
        [-0.75, 0.55, -6.45, 14.5, 1.1, 0.06],
        [6.45, 0.55, 0, 0.06, 1.1, 13],
      ].map(([x, y, z, w, h, d], i) => (
        <group key={i}>
          <mesh position={[x, y, z]} raycast={noRaycast}>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color="#9fd8ff" transparent opacity={0.18} roughness={0.05} metalness={0.3} depthWrite={false} />
          </mesh>
          <mesh position={[x, y + h / 2 + 0.03, z]} raycast={noRaycast}>
            <boxGeometry args={[Math.max(w, 0.1), 0.06, Math.max(d, 0.1)]} />
            <meshStandardMaterial color="#d8dde4" metalness={0.7} roughness={0.25} />
          </mesh>
        </group>
      ))}
      {/* landing lights on the deck edge */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[6.0, 0.02, -5.6 + i * 1.4]} raycast={noRaycast}>
          <cylinderGeometry args={[0.09, 0.09, 0.04, 10]} />
          <meshBasicMaterial color="#ffd27a" toneMapped={false} />
        </mesh>
      ))}
      {tower ? <primitive object={tower} /> : null}
      <TowerSign />
      {blocks.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
      <mesh position={[0, STREET_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <circleGeometry args={[300, 48]} />
        <meshStandardMaterial color="#2a2730" roughness={0.9} />
      </mesh>
    </group>
  );
}

