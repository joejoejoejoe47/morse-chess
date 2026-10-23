/**
 * Lego Universe: the board on the balcony of the Avengers Tower at dusk,
 * played with LEGO Marvel figures (heroes = white, villains = black).
 *
 * Every figure is an existing, free LEGO model made by someone else (Sketchfab CC-BY 4.0,
 * LDraw Official Model Repository CC BY 2.0, Printables CC0, and the user's own Dr. Doom file).
 * We only regrouped each model's own parts (body / head / arms / legs) around joint pivots,
 * normalised the size (uniform scale) and compressed it, so the figures can be animated here by
 * rotating those parts and moving the whole figure: idle sway, walking, and a real attack for
 * every character (wind-up, then the strike lands exactly when the victim breaks apart).
 * Figures never dip below the board: every frame the figure's bounding box is clamped to the
 * board top. In the sky: the SHIELD Helicarrier (LDraw OMR, CC BY 2.0) and Dr. Doom's tower (Sohan's tower, CC BY-SA 4.0,
 * recoloured); the city is Kenney (CC0).
 * See public/lego/CREDITS.md for the full list.
 */
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import * as THREE from "three";
import { asset } from "@/lib/base";
import { squareToWorld } from "@/lib/chess/board-math";
import { BuildBaseplate, BuiltLego, loadPaletteMeta, type PaletteItem } from "@/lib/lego-build";
import { activeLegoBuild, type LegoBuild } from "@/lib/server/lego-builder";
import { playLegoBeam, playLegoExplode, playLegoHit, playLegoMagic, playLegoWhoosh, primeLegoExplode } from "@/lib/lego-sfx";
import { useResilientGLTF } from "@/lib/resilient-gltf";
import { LoadGuard, Later } from "@/components/chess/load-guard";

export const LEGO_BOARD_ID = "lego-universe";
/** White's default camera: low enough to see the figures and the tower behind the board. */
export const LEGO_CAMERA = { w: [0, 8.4, 12.2] as [number, number, number], b: [0, 8.4, -12.2] as [number, number, number] };
export const LEGO_ZOOM = { min: 6.5, max: 20 } as const;

const CITY_URL = asset("/lego/city.glb");
/** Sky backdrops (credited models; see public/lego/CREDITS.md). */
const HERO_BASE_URL = asset("/lego/sky/helicarrier.glb");
const DOOM_TOWER_URL = asset("/lego/sky/doom-tower.glb");

// ── roster ─────────────────────────────────────────────────────────────────

type Gait = "walk" | "stomp" | "swing" | "fly" | "glide" | "portal";
type Attack = "smash" | "webkick" | "repulsor" | "spell" | "punch" | "pounce" | "blast" | "kick" | "whirl" | "skystrike" | "bomb";
export type Trick = "flip" | "roll" | "spin";

export type LegoCharId =
  | "cap"
  | "hulk"
  | "spiderman"
  | "ironman"
  | "panther"
  | "strange"
  | "agent"
  | "doom"
  | "widow"
  | "skeleton"
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
  /** Effect colour for beams / portals / blasts / trails. */
  fx: string;
  /**
   * Rig fixes for models whose arm node also carries something that is not the arm
   * (a held gun, a beard, a stray brick), which would pull the shoulder joint off the body.
   * move: meshes of that material go to another part; jointMat: only meshes of that
   * material place the joint; mirror: the joint is the other arm's, mirrored across the body.
   */
  rig?: RigFix;
};

type RigFix = {
  move?: { from: PartName; mat: string; to: PartName }[];
  jointMat?: Partial<Record<PartName, string>>;
  mirror?: ("armL" | "armR")[];
};

export const LEGO_CHARS: Record<LegoCharId, CharSpec> = {
  hulk: { file: "hulk.glb", role: "Smash Giant", height: 0.94, gait: "stomp", attack: "smash", fx: "#8cff6a" },
  spiderman: { file: "spiderman.glb", role: "Web Slinger", height: 0.84, gait: "swing", attack: "webkick", fx: "#f4f4f4" },
  ironman: { file: "ironman.glb", role: "Iron Flyer", height: 0.86, gait: "fly", attack: "repulsor", fx: "#9ef3ff" },
  // the good king: the Captain America minifig (OMR 76042) with the official LDraw Cap head and torso prints
  cap: { file: "captain-america.glb", role: "Star Captain (good king minifig)", height: 0.92, gait: "walk", attack: "punch", fx: "#7fb2ff" },
  panther: { file: "blackpanther.glb", role: "Shadow Cat", height: 0.96, gait: "walk", attack: "pounce", fx: "#b18cff" },
  strange: { file: "wizard.glb", role: "Wizard (good queen minifig)", height: 1.0, gait: "portal", attack: "spell", fx: "#ff9a2a",
    // the beard sat in the right-arm node (it swung off with the arm); snake and magnifier stay in the hands
    rig: { move: [{ from: "armR", mat: "White", to: "body" }], jointMat: { armL: "Blue", armR: "Blue" } } },
  agent: { file: "space-police.glb", role: "Hero pawn (Space Police officer)", height: 0.72, gait: "walk", attack: "punch", fx: "#7fb2ff",
    // the hand pushed the shoulder joint forward, off the body; take the arm pivot from the sleeve only
    rig: { jointMat: { armL: "Black", armR: "Black" } } },
  doom: { file: "doom-bigbrick.glb?v=81e5b3ee", role: "Iron Tyrant", height: 1.0, gait: "walk", attack: "blast", fx: "#5dff6a" },
  widow: { file: "widow.glb", role: "Spy Queen (villain queen minifig)", height: 0.86, gait: "walk", attack: "kick", fx: "#ff5a5a",
    // the pistol stretched the right arm's box, pulling its shoulder up and forward off the body;
    // the shoulder now mirrors the clean left one
    rig: { mirror: ["armR"] } },
  skeleton: { file: "skeleton.glb", role: "Villain rook (Skeleton minifig)", height: 0.9, gait: "walk", attack: "whirl", fx: "#e8e8e8" },
  blacktron: { file: "blacktron.glb", role: "Villain bishop (Blacktron minifig)", height: 0.86, gait: "walk", attack: "skystrike", fx: "#ff3b3b",
    // the hand pushed the shoulder joint forward, off the body; take the arm pivot from the sleeve only
    rig: { jointMat: { armL: "Black", armR: "Black" } } },
  goblin: { file: "insectoid.glb", role: "Bomb Glider (villain knight, Insectoids minifig)", height: 0.86, gait: "glide", attack: "bomb", fx: "#a6ff3b",
    // the hand pushed the shoulder joint forward, off the body; take the arm pivot from the sleeve only
    rig: { jointMat: { armL: "Green", armR: "Green" } } },
  doombot: { file: "gigabot.glb", role: "Tyrant Bot (villain pawn, Insectoids Gigabot robot)", height: 0.72, gait: "walk", attack: "punch", fx: "#5dff6a",
    // a stray brick on the far side sits in the right-arm node; its shoulder mirrors the clean left one
    rig: { mirror: ["armR"], jointMat: { armL: "Dark_Grey" } } },
};

export const LEGO_ROSTER: Record<Color, Record<PieceSymbol, LegoCharId>> = {
  w: { k: "cap", q: "strange", r: "hulk", b: "ironman", n: "spiderman", p: "agent" },
  b: { k: "doom", q: "widow", r: "skeleton", b: "blacktron", n: "goblin", p: "doombot" },
};

const charUrl = (id: LegoCharId) => asset(`/lego/chars/${LEGO_CHARS[id].file}`);

// ── math ───────────────────────────────────────────────────────────────────

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
/** Fast start, soft stop (a strike). */
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 2;
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/** Top of the painted squares (BoardSquares: box at y=0.08, 0.08 tall). Figures stand right on it. */
const BOARD_TOP = 0.12;
const STAND = BOARD_TOP;
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

const PART_NAMES = ["body", "head", "armL", "armR", "legL", "legR"] as const;
type PartName = (typeof PART_NAMES)[number];
type Parts = Record<PartName, THREE.Object3D | null>;

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
  twist?: number;
};

function applyPose(p: Parts, o: Pose) {
  p.legL?.rotation.set(o.legL ?? 0, 0, 0);
  p.legR?.rotation.set(o.legR ?? 0, 0, 0);
  p.armL?.rotation.set(o.armLx ?? 0, 0, o.armLz ?? 0);
  p.armR?.rotation.set(o.armRx ?? 0, 0, o.armRz ?? 0);
  p.head?.rotation.set(o.headX ?? 0, o.headY ?? 0, 0);
  p.body?.rotation.set(o.lean ?? 0, o.twist ?? 0, o.roll ?? 0);
}

/**
 * Joint pivots. In the converted models a part's node pivot is not always at its joint: the "body"
 * pivots on the floor at the figure's origin while the torso sits higher and a little behind it, and on
 * a few figures a head, arm or leg node sits beside its own mesh. Rotating such a node about the wrong
 * point slid that part off the figure (the torso scooting off the legs). Each part's pivot is moved to
 * its real joint, worked out from its own mesh: the waist (bottom centre of the torso), the neck (bottom
 * centre of the head), the hips (top centre of each leg) and the shoulders (near the top of each arm).
 * The node's children are shifted back by the same amount, so at rest nothing moves and the geometry is
 * untouched; only node positions change.
 */
const matName = (o: THREE.Object3D) => {
  const m = (o as THREE.Mesh).material;
  return m && !Array.isArray(m) ? m.name.trim() : "";
};

function setJointPivots(root: THREE.Object3D, rig?: RigFix) {
  root.updateMatrixWorld(true);
  const partNames = new Set<string>(PART_NAMES);
  // meshes that ride in the wrong part go to the right one (world placement kept)
  for (const mv of rig?.move ?? []) {
    const from = root.getObjectByName(mv.from);
    const to = root.getObjectByName(mv.to);
    if (!from || !to) continue;
    const hits: THREE.Object3D[] = [];
    from.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && matName(o) === mv.mat) hits.push(o);
    });
    for (const o of hits) to.attach(o);
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const joints = {} as Record<PartName, THREE.Vector3 | undefined>;
  const bodyMid = new THREE.Vector3();
  for (const n of PART_NAMES) {
    const node = root.getObjectByName(n);
    if (!node || !node.parent) continue;
    box.makeEmpty();
    const only = rig?.jointMat?.[n];
    const add = (o: THREE.Object3D) => {
      for (const c of o.children) {
        if (partNames.has(c.name)) continue;
        if (!only) box.expandByObject(c);
        else if ((c as THREE.Mesh).isMesh && matName(c) === only) box.expandByObject(c, true);
        else add(c);
      }
    };
    add(node);
    if (box.isEmpty()) continue;
    const joint = box.getCenter(new THREE.Vector3());
    box.getSize(size);
    if (n === "body") bodyMid.copy(joint);
    if (n === "body" || n === "head") joint.y = box.min.y;
    else if (n === "legL" || n === "legR") joint.y = box.max.y;
    else joint.y = box.max.y - size.y * 0.2;
    joints[n] = joint;
  }
  for (const n of rig?.mirror ?? []) {
    const other = joints[n === "armL" ? "armR" : "armL"];
    if (other) joints[n] = new THREE.Vector3(2 * bodyMid.x - other.x, other.y, other.z);
  }
  for (const n of PART_NAMES) {
    const node = root.getObjectByName(n);
    const joint = joints[n];
    if (!node || !node.parent || !joint) continue;
    // world -> the node's parent space, and the shift seen from inside the node
    const inParent = node.parent.worldToLocal(joint.clone());
    const shiftWorld = joint.clone().sub(node.getWorldPosition(new THREE.Vector3()));
    const shiftLocal = node.worldToLocal(node.getWorldPosition(new THREE.Vector3()).add(shiftWorld));
    node.position.copy(inParent);
    for (const c of node.children) c.position.sub(shiftLocal);
    root.updateMatrixWorld(true);
  }
}

/** A figure's own copy: cloned nodes and materials (so a hit flash only lights this one). */
function useFigure(id: LegoCharId) {
  const gltf = useResilientGLTF(charUrl(id));
  return useMemo(() => {
    const root = gltf.scene.clone(true);
    const mats: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      if (!Array.isArray(m.material)) {
        const c = (m.material as THREE.MeshStandardMaterial).clone();
        m.material = c;
        mats.push(c);
      }
    });
    setJointPivots(root, LEGO_CHARS[id].rig);
    // uniform scale only: the figure keeps its LEGO proportions
    root.scale.setScalar(LEGO_CHARS[id].height);
    const parts = {} as Parts;
    const rest = {} as Record<PartName, THREE.Vector3 | null>;
    for (const n of PART_NAMES) {
      parts[n] = root.getObjectByName(n) ?? null;
      rest[n] = parts[n]?.position.clone() ?? null;
    }
    return { root, parts, rest, mats };
  }, [gltf, id]);
}

const _box = new THREE.Box3();
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _vs = new THREE.Vector3();

/** The board top in world space, and the world scale of `space` (the army's parent group). */
function floorOf(space: THREE.Object3D | null) {
  if (!space) return { y: BOARD_TOP, s: 1 };
  _va.set(0, BOARD_TOP, 0);
  space.localToWorld(_va);
  space.getWorldScale(_vs);
  return { y: _va.y, s: _vs.y || 1 };
}

/**
 * Never let a figure sink: lift `fig` so the lowest point of `root` (its world bounding box,
 * after scale, pose and any spin) is on or above the board top. Runs every animation frame,
 * so it also catches landing ease / bounce overshoot.
 */
function keepOnBoard(fig: THREE.Object3D, root: THREE.Object3D) {
  const space = fig.parent?.parent ?? null;
  fig.updateWorldMatrix(true, true);
  _box.setFromObject(root);
  if (_box.isEmpty()) return;
  const f = floorOf(space);
  const d = f.y - _box.min.y;
  if (d > 1e-5) {
    fig.position.y += d / f.s;
    fig.updateWorldMatrix(false, true);
  }
}

/** The standing pose loop. `t` in seconds, `seed` de-syncs neighbours. */
function idlePose(gait: Gait, t: number, seed: number): { pose: Pose; y: number } {
  const w = t * 1.7 + seed * 6.28;
  const sway = Math.sin(w);
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
    // steps into a standing portal, shrinking (uniformly) into it, and steps out of the other one
    const out = u < 0.5;
    pos.copy(out ? a : b);
    scale = out ? 1 - ease(span(u, 0.12, 0.45)) : ease(span(u, 0.55, 0.88));
    pose = { armLx: -2.2, armRx: -2.2, armLz: 0.35, armRz: -0.35, headX: -0.2 };
    return { pos, pose, flip, scale, spin: (out ? span(u, 0.12, 0.45) : 1 - span(u, 0.55, 0.88)) * 6 };
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

/** A standing portal ring (Dr. Strange), facing `yaw`. Opens and closes smoothly. */
function VPortal({ at, yaw, open, color }: { at: THREE.Vector3; yaw: number; open: number; color: string }) {
  const ref = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const cur = useRef(0);
  useFrame((_, dt) => {
    cur.current += (open - cur.current) * (1 - Math.exp(-10 * dt));
    const g = ref.current;
    if (!g) return;
    g.visible = cur.current > 0.01;
    g.scale.setScalar(Math.max(0.001, cur.current));
    if (spin.current) spin.current.rotation.z += dt * 3;
  });
  return (
    <group ref={ref} position={[at.x, BOARD_TOP + 0.47, at.z]} rotation={[0, yaw, 0]} raycast={noRaycast} visible={false}>
      <group ref={spin}>
        <mesh>
          <torusGeometry args={[0.42, 0.035, 8, 40]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <mesh>
          <ringGeometry args={[0.26, 0.4, 40, 1]} />
          <meshBasicMaterial color={color} transparent opacity={0.45} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} position={[Math.cos(i) * 0.45, Math.sin(i) * 0.45, 0]}>
            <sphereGeometry args={[0.035, 6, 6]} />
            <meshBasicMaterial color="#ffe1a8" toneMapped={false} />
          </mesh>
        ))}
      </group>
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
  // flips turn round the figure's middle, not its feet
  const mid = spec.height * 0.45;
  useEffect(() => {
    root.position.y = -mid;
  }, [root, mid]);
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
      f.position.y = STAND + mid + m.pos.y;
      f.rotation.set(m.flip, (spec.gait === "portal" ? m.spin : 0) + yawTo(a, b), 0);
      f.scale.setScalar(Math.max(0.001, m.scale));
      f.visible = m.scale > 0.01;
      applyPose(parts, m.pose);
      if (spec.gait === "portal") {
        const open = u > 0.03 && u < 0.95 ? 1 : 0;
        if (open !== portal) setPortal(open);
      }
    } else {
      const idle = idlePose(spec.gait, now, seed);
      g.position.set(b.x, 0, b.z);
      f.position.y = STAND + mid + idle.y;
      f.rotation.set(0, restYaw(color), 0);
      f.scale.setScalar(1);
      f.visible = true;
      applyPose(parts, idle.pose);
      if (portal) setPortal(0);
    }
    keepOnBoard(f, root);
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
        <group ref={fig}>
          <primitive object={root} />
        </group>
      </group>
      {spec.gait === "portal" && moving ? (
        <>
          <VPortal at={a} yaw={yawTo(a, b)} open={portal} color={spec.fx} />
          <VPortal at={b} yaw={yawTo(a, b)} open={portal} color={spec.fx} />
        </>
      ) : null}
    </>
  );
}

// ── captures ───────────────────────────────────────────────────────────────

export type Fight = {
  id: string;
  type: PieceSymbol;
  color: Color;
  from: Square;
  to: Square;
  victimType: PieceSymbol;
  victimSq: Square;
  /** The bishops' aerial tricks after a capture (Blacktron and Iron Man): always 1 or 2, never 3. */
  tricks: Trick[];
};

/** Per attack: wind-up and strike seconds, ranged or not, and how far the strike lunges. */
const MOVES: Record<Attack, { wind: number; strike: number; ranged: boolean; lunge: number; shake: number }> = {
  punch: { wind: 0.32, strike: 0.16, ranged: false, lunge: 0.28, shake: 0.05 },
  smash: { wind: 0.42, strike: 0.42, ranged: false, lunge: 0.35, shake: 0.16 },
  webkick: { wind: 0.5, strike: 0.38, ranged: true, lunge: 0, shake: 0.07 },
  repulsor: { wind: 0.5, strike: 0.22, ranged: true, lunge: 0, shake: 0.06 },
  spell: { wind: 0.75, strike: 0.22, ranged: true, lunge: 0, shake: 0.07 },
  pounce: { wind: 0.36, strike: 0.34, ranged: false, lunge: 0.42, shake: 0.09 },
  blast: { wind: 0.7, strike: 0.2, ranged: true, lunge: 0, shake: 0.13 },
  kick: { wind: 0.36, strike: 0.2, ranged: false, lunge: 0.3, shake: 0.06 },
  whirl: { wind: 0.32, strike: 0.45, ranged: false, lunge: 0.38, shake: 0.07 },
  skystrike: { wind: 0.32, strike: 0.18, ranged: false, lunge: 0.2, shake: 0.06 },
  bomb: { wind: 0.38, strike: 0.6, ranged: true, lunge: 0, shake: 0.11 },
};

const RECOVER = 0.4;
const BREAK = 1.5;
const trickTime = (n: number) => (n >= 2 ? 2.7 : 2.15);
/** Both bishops knock the piece out, then fly up, do their tricks and land on the square. */
const TRICK_FLYERS: ReadonlySet<LegoCharId> = new Set<LegoCharId>(["blacktron", "ironman"]);

/** Everything about a capture that does not change frame to frame. */
function fightPlan(f: Fight, pitch: number) {
  const atkId = LEGO_ROSTER[f.color][f.type];
  const atk = LEGO_CHARS[atkId];
  const mv = MOVES[atk.attack];
  const from = v3(f.from, pitch);
  const vic = v3(f.victimSq, pitch);
  const dest = v3(f.to, pitch);
  const d = vic.clone().sub(from);
  const dist = d.length();
  const dir = dist > 1e-4 ? d.clone().divideScalar(dist) : new THREE.Vector3(0, 0, 1);
  let near = from.clone();
  let lunge = 0;
  if (atk.attack === "webkick") {
    if (dist > 0.6) near = from.clone().addScaledVector(dir, dist - 0.55);
  } else if (!mv.ranged) {
    const gap = dist - 0.6 - mv.lunge;
    if (gap > 0) near = from.clone().addScaledVector(dir, gap);
    lunge = Math.min(mv.lunge, Math.max(0, near.distanceTo(vic) - 0.56));
  }
  const spot = near.clone().addScaledVector(dir, lunge);
  const approach = !mv.ranged && near.distanceTo(from) > 0.05 ? moveTime(atk.gait === "portal" ? "walk" : atk.gait, near.distanceTo(from)) : 0.3;
  const impact = approach + mv.wind + mv.strike;
  const flight = TRICK_FLYERS.has(atkId);
  const finish = flight ? trickTime(f.tricks.length) : spot.distanceTo(dest) > 0.05 ? moveTime(atk.gait, spot.distanceTo(dest)) : 0;
  const total = Math.max(impact + RECOVER + finish, impact + BREAK + 0.1);
  return { atkId, atk, mv, from, vic, dest, dir, near, lunge, spot, approach, impact, flight, finish, total };
}

export const LEGO_FIGHT_SECONDS = (f: Fight, pitch: number) => fightPlan(f, pitch).total;

type Frame = { pose: Pose; lunge: number; y: number; spin: number };
const ZERO: Frame = { pose: {}, lunge: 0, y: 0, spin: 0 };

/**
 * The attacker's body during an attack. `ph` is the wind-up, the strike (which ends on impact)
 * or the recovery; `u` runs 0..1 through it. `lunge` is a fraction of the attack's lunge distance.
 */
function attackFrame(a: Attack, ph: "wind" | "strike", u: number): Frame {
  const w = ease(u);
  const k = easeOut(u);
  const arc = Math.sin(Math.PI * clamp01(u));
  if (ph === "wind") {
    switch (a) {
      case "smash":
        return { pose: { armLx: -2.9 * w, armRx: -2.9 * w, armLz: 0.3 * w, armRz: -0.3 * w, lean: -0.25 * w, legL: 0.25 * w, legR: 0.25 * w, headX: -0.2 * w }, lunge: 0, y: 0, spin: 0 };
      case "webkick":
        return { pose: { armRx: -2.1 * w, armLx: -0.3 * w, lean: -0.1 * w, legL: -0.2 * w }, lunge: 0, y: 0, spin: 0 };
      case "repulsor":
        return { pose: { armRx: -1.57 * w, armLx: 0.45 * w, armLz: 0.2 * w, lean: -0.08 * w, legL: -0.2 * w, legR: 0.1 * w }, lunge: 0, y: 0.3 * w, spin: 0 };
      case "spell": {
        const ang = u * Math.PI * 3;
        return {
          pose: { armLx: w * (-1.3 + 0.35 * Math.sin(ang)), armRx: w * (-1.3 + 0.35 * Math.sin(ang + Math.PI)), armLz: 0.45 * w, armRz: -0.45 * w, headX: -0.1 * w },
          lunge: 0,
          y: 0.06 * w,
          spin: 0,
        };
      }
      case "pounce":
        return { pose: { lean: 0.45 * w, armLx: 0.7 * w, armRx: 0.7 * w, legL: -0.3 * w, legR: 0.3 * w, headX: -0.3 * w }, lunge: 0, y: 0, spin: 0 };
      case "blast":
        return { pose: { armLx: -1.45 * w, armRx: -1.45 * w, armLz: -0.15 * w, armRz: 0.15 * w, lean: -0.12 * w, headX: 0.1 * w }, lunge: 0, y: 0, spin: 0 };
      case "kick":
        return { pose: { lean: -0.2 * w, legR: 0.6 * w, armLx: -0.9 * w, armRx: 0.5 * w, twist: 0.25 * w }, lunge: 0, y: 0.05 * w, spin: 0 };
      case "whirl":
        return { pose: { armLz: 1.35 * w, armRz: -1.35 * w, lean: 0.1 * w, twist: -0.6 * w }, lunge: 0, y: 0, spin: 0 };
      case "bomb":
        return { pose: { armRx: 1.0 * w, armLx: -0.6 * w, lean: -0.15 * w, twist: 0.3 * w }, lunge: 0, y: 0, spin: 0 };
      default: // punch, skystrike
        return { pose: { armRx: 0.75 * w, armLx: -1.0 * w, armLz: 0.15 * w, lean: -0.12 * w, twist: 0.35 * w, legL: -0.25 * w, legR: 0.2 * w }, lunge: 0, y: 0, spin: 0 };
    }
  }
  switch (a) {
    case "smash": {
      const down = ease(span(u, 0.55, 1));
      return {
        pose: { armLx: -2.9 + 2.5 * down, armRx: -2.9 + 2.5 * down, armLz: 0.3, armRz: -0.3, lean: -0.25 + 0.75 * down, legL: -0.4 * arc, legR: -0.4 * arc },
        lunge: k,
        y: 0.45 * arc,
        spin: 0,
      };
    }
    case "webkick":
      return { pose: { armRx: -2.6, armLx: 0.6 * k, legR: -1.55 * k, legL: 0.5 * k, lean: -0.35 * k }, lunge: 0, y: 0, spin: 0 };
    case "repulsor":
      return { pose: { armRx: -1.57, armLx: 0.45, armLz: 0.2, lean: -0.08 - 0.14 * arc, legL: -0.2, legR: 0.1 }, lunge: 0, y: 0.3, spin: 0 };
    case "spell":
      return { pose: { armLx: -1.3 - 0.35 * k, armRx: -1.3 - 0.35 * k, armLz: 0.45 - 0.3 * k, armRz: -0.45 + 0.3 * k, lean: 0.18 * k }, lunge: 0, y: 0.06, spin: 0 };
    case "pounce": {
      const up = ease(span(u, 0, 0.5));
      const down = ease(span(u, 0.5, 1));
      return {
        pose: { armLx: 0.7 - 3.3 * up + 2.4 * down, armRx: 0.7 - 3.3 * up + 2.4 * down, armLz: 0.4 * down, armRz: -0.4 * down, lean: 0.45 - 0.2 * up + 0.3 * down, legL: -0.5 * arc, legR: -0.5 * arc },
        lunge: k,
        y: 0.38 * arc,
        spin: 0,
      };
    }
    case "blast":
      return { pose: { armLx: -1.45, armRx: -1.45, armLz: -0.15, armRz: 0.15, lean: -0.12 - 0.15 * arc }, lunge: 0, y: 0, spin: 0 };
    case "kick":
      return { pose: { lean: -0.2 - 0.2 * k, legR: 0.6 - 2.3 * k, armLx: -0.9, armRx: 0.5 - 0.3 * k, twist: 0.25 - 0.5 * k }, lunge: k, y: 0.05 + 0.08 * arc, spin: 0 };
    case "whirl":
      return { pose: { armLz: 1.35, armRz: -1.35, lean: 0.1, twist: -0.6 + 0.6 * k, legL: 0.3 * Math.sin(u * 12), legR: -0.3 * Math.sin(u * 12) }, lunge: k, y: 0.1 * arc, spin: Math.PI * 4 * k };
    case "bomb": {
      const t = easeOut(span(u, 0, 0.3));
      return { pose: { armRx: 1.0 - 3.4 * t, armLx: -0.6, lean: -0.15 + 0.35 * t, twist: 0.3 - 0.6 * t }, lunge: 0, y: 0, spin: 0 };
    }
    case "skystrike":
      return { pose: { armRx: 0.75 - 3.35 * k, armLx: -1.0 + 0.5 * k, lean: -0.12 + 0.3 * k, twist: 0.35 - 0.6 * k, legL: -0.4 * k }, lunge: k, y: 0.1 * arc, spin: 0 };
    default: // punch
      return { pose: { armRx: 0.75 - 2.45 * k, armLx: -1.0 + 0.5 * k, lean: -0.12 + 0.42 * k, twist: 0.35 - 0.7 * k, legL: -0.45 * k, legR: 0.35 * k }, lunge: k, y: 0, spin: 0 };
  }
}

/** Ease from the end of the strike back to a relaxed stance (the lunge distance is kept). */
function recoverFrame(a: Attack, u: number): Frame {
  const end = attackFrame(a, "strike", 1);
  const k = 1 - ease(u);
  const pose: Pose = {};
  for (const [key, val] of Object.entries(end.pose)) pose[key as keyof Pose] = (val ?? 0) * k;
  return { pose, lunge: end.lunge, y: end.y * k, spin: end.spin };
}

/** Stud pitch of the debris: real LEGO proportions (8 mm pitch, 9.6 mm brick, 3.2 mm plate, 4.8 mm studs). */
const STUD = 0.08;
/** [width, depth, plate?] in studs: standard bricks and plates. */
const DEBRIS_KINDS: [number, number, boolean][] = [
  [1, 2, false],
  [2, 2, false],
  [2, 4, false],
  [1, 1, false],
  [1, 2, true],
  [2, 2, true],
  [1, 4, true],
  [2, 3, true],
];
const debrisH = (plate: boolean) => (plate ? STUD * 0.4 : STUD * 1.2);
let debrisGeos: THREE.BufferGeometry[] | null = null;
/** Standard LEGO bricks (1x1, 1x2, 2x2, 2x4) and plates (1x2, 2x2, 1x4, 2x3), studs on top. */
function debrisGeometry() {
  if (!debrisGeos) {
    debrisGeos = DEBRIS_KINDS.map(([w, d, plate]) => {
      const h = debrisH(plate);
      const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(w * STUD - 0.002, h, d * STUD - 0.002)];
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < d; j++) {
          const s = new THREE.CylinderGeometry(STUD * 0.3, STUD * 0.3, STUD * 0.18, 14);
          s.translate((i - (w - 1) / 2) * STUD, h / 2 + STUD * 0.09, (j - (d - 1) / 2) * STUD);
          parts.push(s);
        }
      }
      const g = mergeGeometries(parts) ?? parts[0];
      g.computeBoundingBox();
      return g;
    });
  }
  return debrisGeos;
}

function rng(seed: number) {
  let s = Math.floor(seed * 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** A character's own colours, most-used first (by triangle count), near-duplicates merged. */
function useCharColors(id: LegoCharId) {
  const gltf = useResilientGLTF(charUrl(id));
  return useMemo(() => {
    const weight = new Map<string, number>();
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const c = (m.material as THREE.MeshStandardMaterial).color;
      if (!c) return;
      const n = m.geometry.index ? m.geometry.index.count : (m.geometry.getAttribute("position")?.count ?? 0);
      const hex = `#${c.getHexString()}`;
      weight.set(hex, (weight.get(hex) ?? 0) + n);
    });
    const sorted = [...weight.entries()].sort((x, y) => y[1] - x[1]);
    const out: { color: string; w: number }[] = [];
    const tmp = new THREE.Color();
    const tmp2 = new THREE.Color();
    for (const [hex, w] of sorted) {
      tmp.set(hex);
      const twin = out.find((o) => {
        tmp2.set(o.color);
        return Math.abs(tmp.r - tmp2.r) + Math.abs(tmp.g - tmp2.g) + Math.abs(tmp.b - tmp2.b) < 0.12;
      });
      if (twin) twin.w += w;
      else if (out.length < 6) out.push({ color: hex, w });
    }
    return out.length ? out : [{ color: "#888888", w: 1 }];
  }, [gltf]);
}

const BURST_PIECES = 64;
const BURST_LIFE = 2.9;

export type Burst = { id: string; victim: LegoCharId; at: THREE.Vector3; dir: THREE.Vector3; seed: number; delay: number; limit: number };

/**
 * The captured figure blows apart into a big burst of real studded LEGO bricks and plates in its
 * own colours: they fly out and up, spin, bounce on the board (never through it), settle flat and
 * fade after a couple of seconds. A white flash, a shockwave ring and a brick clatter go with it.
 */
function BrickBurst({ burst }: { burst: Burst }) {
  return (
    <LoadGuard fallback={<BurstBody burst={burst} colors={PLAIN_BURST} />}>
      <CharBurst burst={burst} />
    </LoadGuard>
  );
}

/** Grey bricks for a burst whose figure model could not load (same burst, same sound). */
const PLAIN_BURST = [
  { color: "#a0a5a9", w: 3 },
  { color: "#6c6e68", w: 2 },
  { color: "#d7d7d7", w: 1 },
];

function CharBurst({ burst }: { burst: Burst }) {
  const colors = useCharColors(burst.victim);
  return <BurstBody burst={burst} colors={colors} />;
}

function BurstBody({ burst, colors }: { burst: Burst; colors: { color: string; w: number }[] }) {
  const { at, dir, seed, delay, limit } = burst;
  const height = LEGO_CHARS[burst.victim].height;
  const geos = debrisGeometry();
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const start = useRef<number | null>(null);
  const boomed = useRef(false);
  const bits = useMemo(() => {
    const r = rng(seed);
    const total = colors.reduce((n, c) => n + c.w, 0);
    const pick = () => {
      let x = r() * total;
      for (const c of colors) if ((x -= c.w) <= 0) return c.color;
      return colors[0].color;
    };
    return Array.from({ length: BURST_PIECES }, (_, i) => {
      const a = (i / BURST_PIECES) * Math.PI * 2 * 3 + r() * 0.9;
      const sp = 0.7 + r() * 1.6;
      const kind = Math.floor(r() * DEBRIS_KINDS.length);
      const [w, d, plate] = DEBRIS_KINDS[kind];
      const hy = r();
      return {
        geo: kind,
        // the figure's dominant colours are the ones you see most, like its own bricks
        color: i < colors.length ? colors[i].color : pick(),
        pos: new THREE.Vector3(at.x + Math.cos(a) * 0.08 * r(), STAND + 0.05 + hy * height * 0.9, at.z + Math.sin(a) * 0.08 * r()),
        vel: new THREE.Vector3(Math.cos(a) * sp + dir.x * 0.9, 1.6 + r() * 2.8 + hy * 0.8, Math.sin(a) * sp + dir.z * 0.9),
        rot: new THREE.Euler(r() * 6, r() * 6, r() * 6),
        ang: new THREE.Vector3((r() - 0.5) * 18, (r() - 0.5) * 12, (r() - 0.5) * 18),
        half: new THREE.Vector3((w * STUD) / 2, debrisH(plate) / 2 + STUD * 0.18, (d * STUD) / 2),
        resting: false,
      };
    });
  }, [colors, seed, dir, at, height]);
  const mats = useMemo(() => bits.map((b) => new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.32, transparent: true })), [bits]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame((state, dt) => {
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current - delay;
    if (group.current) group.current.visible = t >= 0;
    if (t < 0) return;
    if (!boomed.current) {
      boomed.current = true;
      playLegoExplode();
    }
    if (light.current) light.current.intensity = 16 * (1 - span(t, 0, 0.35));
    if (ring.current) {
      const k = span(t, 0, 0.5);
      ring.current.visible = k < 1;
      ring.current.scale.setScalar(0.2 + k * 2.6);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.85;
    }
    const step = Math.min(dt, 1 / 30);
    const fade = 1 - span(t, BURST_LIFE - 0.7, BURST_LIFE);
    bits.forEach((b, i) => {
      const m = refs.current[i];
      if (!m) return;
      if (!b.resting) {
        b.vel.y -= 9.8 * step;
        b.pos.addScaledVector(b.vel, step);
        b.rot.x += b.ang.x * step;
        b.rot.y += b.ang.y * step;
        b.rot.z += b.ang.z * step;
      } else {
        // lying on the board: settle flat on a face, no more spinning
        const flat = (x: number) => Math.round(x / (Math.PI / 2)) * (Math.PI / 2);
        b.rot.x += (flat(b.rot.x) - b.rot.x) * Math.min(1, step * 14);
        b.rot.z += (flat(b.rot.z) - b.rot.z) * Math.min(1, step * 14);
        b.vel.multiplyScalar(Math.max(0, 1 - step * 8));
        b.pos.x += b.vel.x * step;
        b.pos.z += b.vel.z * step;
      }
      // stay over the board, bouncing back off its edge
      for (const ax of ["x", "z"] as const) {
        if (Math.abs(b.pos[ax]) > limit) {
          b.pos[ax] = Math.sign(b.pos[ax]) * limit;
          b.vel[ax] *= -0.4;
        }
      }
      m.position.copy(b.pos);
      m.rotation.copy(b.rot);
      m.updateMatrix();
      const e = m.matrix.elements;
      const ext = Math.abs(e[1]) * b.half.x + Math.abs(e[5]) * b.half.y + Math.abs(e[9]) * b.half.z;
      if (b.pos.y - ext < BOARD_TOP) {
        b.pos.y = BOARD_TOP + ext;
        m.position.y = b.pos.y;
        if (b.vel.y < 0) {
          b.vel.y = -b.vel.y * 0.38;
          b.vel.x *= 0.65;
          b.vel.z *= 0.65;
          b.ang.multiplyScalar(0.55);
          if (b.vel.y < 0.35) {
            b.vel.y = 0;
            b.resting = true;
          }
        }
      }
      // fade out without shrinking (the bricks keep their shape)
      mats[i].opacity = fade;
      m.visible = fade > 0.01;
    });
  });
  return (
    <group ref={group} raycast={noRaycast} visible={false}>
      {bits.map((b, i) => (
        <mesh key={i} ref={(m) => (refs.current[i] = m)} geometry={geos[b.geo]} material={mats[i]} castShadow raycast={noRaycast} />
      ))}
      <mesh ref={ring} position={[at.x, BOARD_TOP + 0.01, at.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <ringGeometry args={[0.36, 0.46, 48]} />
        <meshBasicMaterial color="#fff4d6" transparent opacity={0.85} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <pointLight ref={light} position={[at.x, STAND + height * 0.5, at.z]} color="#fff1cf" intensity={0} distance={5} />
    </group>
  );
}

/** Points a unit beam group (two open cylinders, height 1) from a to b. */
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
function aimBeam(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, width: number) {
  _dir.copy(b).sub(a);
  const len = Math.max(0.001, _dir.length());
  g.position.copy(a).add(b).multiplyScalar(0.5);
  g.quaternion.setFromUnitVectors(_up, _dir.divideScalar(len));
  g.scale.set(width, len, width);
}

function BeamMesh({ color, innerRef }: { color: string; innerRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group ref={innerRef} visible={false} raycast={noRaycast}>
      <mesh>
        <cylinderGeometry args={[1, 1, 1, 10, 1, true]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[2.6, 2.6, 1, 12, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

const TRAIL = 30;

function FightScene({ fight, pitch }: { fight: Fight; pitch: number }) {
  const P = useMemo(() => fightPlan(fight, pitch), [fight, pitch]);
  const { atk, mv, from, vic, dest, dir, near, spot } = P;
  const move = atk.attack;
  const victimColor: Color = fight.color === "w" ? "b" : "w";
  const vicId = LEGO_ROSTER[victimColor][fight.victimType];
  const vSpec = LEGO_CHARS[vicId];
  const A = useFigure(P.atkId);
  const V = useFigure(vicId);
  const camera = useThree((s) => s.camera);
  const aMid = atk.height * 0.45;

  const aOuter = useRef<THREE.Group>(null);
  const aFig = useRef<THREE.Group>(null);
  const vOuter = useRef<THREE.Group>(null);
  const vFig = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Group>(null);
  const orb = useRef<THREE.Mesh>(null);
  const mandala = useRef<THREE.Group>(null);
  const shock = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.PointLight>(null);
  const trail = useRef<THREE.InstancedMesh>(null);
  const start = useRef<number | null>(null);
  const fired = useRef(new Set<string>());
  const shake = useRef({ amp: 0, off: new THREE.Vector3() });
  const trailPts = useRef<THREE.Vector3[]>([]);
  const [portalOpen, setPortalOpen] = useState(0);

  const seed = useMemo(() => hash(fight.id), [fight.id]);
  const faceYaw = yawTo(from, vic);
  const side = useMemo(() => new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(seed < 0.5 ? 1 : -1), [dir, seed]);
  const portalAt = useMemo(() => vic.clone().addScaledVector(dir, 0.55), [vic, dir]);

  useEffect(() => {
    A.root.position.y = -aMid;
  }, [A.root, aMid]);
  // take the shake back off the camera if the fight ends mid-shake
  useEffect(
    () => () => {
      camera.position.sub(shake.current.off);
      shake.current.off.set(0, 0, 0);
    },
    [camera],
  );

  useFrame((state, dt) => {
    const now = state.clock.elapsedTime;
    if (start.current === null) start.current = now;
    const t = now - start.current;
    const ag = aOuter.current;
    const af = aFig.current;
    const vg = vOuter.current;
    const vf = vFig.current;
    if (!ag || !af || !vg || !vf) return;
    const space = ag.parent;
    const once = (k: string, fn: () => void) => {
      if (!fired.current.has(k)) {
        fired.current.add(k);
        fn();
      }
    };
    const tWind = P.approach;
    const tStrike = tWind + mv.wind;
    const tHit = P.impact;
    const tFinish = tHit + RECOVER;
    let flying = false;

    // ── attacker ──
    let yaw = faceYaw;
    let pitchX = 0;
    let roll = 0;
    let fr: Frame = ZERO;
    let pos = from;
    if (t < tWind) {
      const u = t / tWind;
      if (near.distanceTo(from) > 0.05 && !mv.ranged) {
        const m = travel(atk.gait === "portal" ? "walk" : atk.gait, from, near, u, now);
        pos = m.pos.clone().setY(0);
        yaw = yawTo(from, near);
        fr = { pose: m.pose, lunge: 0, y: m.pos.y, spin: 0 };
        pitchX = m.flip;
      } else {
        yaw = restYaw(fight.color) + (((faceYaw - restYaw(fight.color) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * ease(u);
        fr = { ...idlePose(atk.gait, now, seed), lunge: 0, spin: 0 };
        pos = near;
      }
    } else if (t < tStrike) {
      fr = attackFrame(move, "wind", (t - tWind) / mv.wind);
      pos = near;
    } else if (t < tHit) {
      const u = (t - tStrike) / mv.strike;
      fr = attackFrame(move, "strike", u);
      pos = near;
      if (move === "webkick" && near.distanceTo(from) > 0.05) {
        // zip along the web line into a flying kick
        const k = ease(u);
        pos = from.clone().lerp(near, k);
        fr = { ...fr, y: Math.sin(Math.PI * k) * (0.35 + from.distanceTo(near) * 0.08) };
        pitchX = -0.25 * Math.sin(Math.PI * k);
      }
    } else if (t < tFinish || P.finish <= 0) {
      fr = recoverFrame(move, span(t, tHit, tFinish));
      pos = near;
      if (t >= tFinish) fr = { ...idlePose(atk.gait, now, seed), lunge: fr.lunge, spin: 0 };
    } else if (P.flight) {
      // the bishops: up into the sky, 1 or 2 tricks with trails, swoop down onto the square
      // (Iron Man keeps his own flight look: arms back like the fly gait, repulsor-coloured trail)
      flying = true;
      const u = clamp01((t - tFinish) / P.finish);
      const H = 3.2;
      const up = easeOut(span(u, 0.04, 0.32));
      const down = ease(span(u, 0.72, 0.97));
      const along = ease(span(u, 0.12, 0.95));
      const p = spot.clone().lerp(dest, along).addScaledVector(side, Math.sin(Math.PI * span(u, 0.1, 0.95)) * 1.4);
      p.y = H * (up - down);
      const u2 = Math.min(1, u + 0.01);
      const q = spot.clone().lerp(dest, ease(span(u2, 0.12, 0.95))).addScaledVector(side, Math.sin(Math.PI * span(u2, 0.1, 0.95)) * 1.4);
      yaw = q.distanceTo(p.clone().setY(0)) > 1e-4 ? Math.atan2(q.x - p.x, q.z - p.z) : yawTo(spot, dest);
      if (u > 0.97) yaw = yawTo(spot, dest);
      pos = p.clone().setY(0);
      const cruise = Math.sin(Math.PI * span(u, 0.06, 0.94));
      pitchX = 0.9 * cruise;
      const land = span(u, 0.94, 1);
      fr = {
        pose:
          u < 0.05
            ? { lean: 0.3, armLx: 0.6, armRx: 0.6, legL: -0.3, legR: -0.3 }
            : P.atkId === "ironman"
              ? { armLx: 0.55 * cruise, armRx: 0.55 * cruise, armLz: 0.25 * cruise, armRz: -0.25 * cruise, legL: 0.3 * Math.sin(Math.PI * land), lean: 0.2 * Math.sin(Math.PI * land) }
              : { armLx: -2.9 * cruise, armRx: -2.9 * cruise, legL: 0.25 * cruise + 0.3 * Math.sin(Math.PI * land), legR: 0.15 * cruise, lean: 0.2 * Math.sin(Math.PI * land) },
        lunge: 0,
        y: p.y,
        spin: 0,
      };
      const n = fight.tricks.length;
      fight.tricks.forEach((trick, i) => {
        const a0 = 0.34 + (0.36 / n) * i;
        const k = ease(span(u, a0, a0 + 0.36 / n - 0.02));
        if (k > 0 && k < 1) once(`trick${i}`, () => playLegoWhoosh());
        if (trick === "flip") pitchX += Math.PI * 2 * k;
        else if (trick === "roll") roll += Math.PI * 2 * k;
        else yaw += Math.PI * 2 * k;
      });
      once("takeoff", () => playLegoWhoosh(true));
      if (u >= 0.97) once("land", () => {
        playLegoHit();
        shake.current.amp = Math.max(shake.current.amp, 0.06);
      });
    } else {
      const u = clamp01((t - tFinish) / P.finish);
      const m = travel(atk.gait, spot, dest, u, now);
      pos = m.pos.clone().setY(0);
      yaw = yawTo(spot, dest) + (atk.gait === "portal" ? m.spin : 0);
      pitchX = m.flip;
      fr = { pose: m.pose, lunge: 0, y: m.pos.y, spin: 0 };
      af.scale.setScalar(Math.max(0.001, m.scale));
      af.visible = m.scale > 0.01;
      const open = atk.gait === "portal" && u > 0.03 && u < 0.95 ? 1 : 0;
      if (open !== portalOpen) setPortalOpen(open);
    }
    if (t < tFinish || P.flight || P.finish <= 0) {
      af.scale.setScalar(1);
      af.visible = true;
    }
    ag.position.set(pos.x, 0, pos.z).addScaledVector(dir, fr.lunge * P.lunge);
    af.position.set(0, STAND + aMid + fr.y, 0);
    af.rotation.set(0, yaw + fr.spin, 0);
    if (pitchX) af.rotateX(pitchX);
    if (roll) af.rotateZ(roll);
    applyPose(A.parts, fr.pose);
    keepOnBoard(af, A.root);

    // hand position (end of the right arm) in the army's space
    const hand = _hand;
    if (A.parts.armR) {
      hand.set(0, -0.3, 0.06);
      A.parts.armR.localToWorld(hand);
      if (space) space.worldToLocal(hand);
    } else hand.set(ag.position.x + dir.x * 0.25, STAND + atk.height * 0.6, ag.position.z + dir.z * 0.25);
    const target = _target.set(vic.x, STAND + vSpec.height * 0.45, vic.z);

    // ── effects ──
    const wU = span(t, tStrike - mv.wind, tStrike);
    const sU = span(t, tStrike, tHit);
    let beamOn = false;
    let beamW = 0.04;
    if (move === "webkick" && t > tWind + mv.wind * 0.35 && t < tHit) {
      beamOn = true;
      beamW = 0.012;
    }
    if ((move === "repulsor" || move === "blast") && t >= tStrike && t < tHit + 0.18) {
      beamOn = true;
      beamW = move === "blast" ? 0.075 : 0.04;
    }
    if (move === "spell" && t >= tStrike && t < tHit + 0.12) {
      beamOn = true;
      beamW = 0.03;
    }
    if (beam.current) {
      beam.current.visible = beamOn;
      if (beamOn) aimBeam(beam.current, hand, target, beamW);
    }
    if (orb.current) {
      // charge ball in the hands (Iron Man, Doom), the pumpkin bomb (Goblin), the zap (Blacktron)
      let s = 0;
      const o = orb.current;
      o.position.copy(hand);
      if ((move === "repulsor" || move === "blast") && t >= tWind && t < tHit + 0.1) {
        s = (move === "blast" ? 0.16 : 0.08) * ease(wU) * (1 + 0.15 * Math.sin(now * 40));
        if (move === "blast" && A.parts.armL) {
          // between both hands
          _va.set(0, -0.3, 0.06);
          A.parts.armL.localToWorld(_va);
          if (space) space.worldToLocal(_va);
          o.position.lerp(_va, 0.5);
        }
      } else if (move === "bomb" && t >= tStrike && t < tHit) {
        const k = span(sU, 0.2, 1);
        if (k > 0) {
          o.position.lerpVectors(hand, target, k);
          o.position.y += Math.sin(Math.PI * k) * 0.7;
          s = 0.07;
        } else s = sU > 0 ? 0.07 : 0;
      } else if (move === "skystrike" && t >= tHit - 0.06 && t < tHit + 0.12) s = 0.1;
      o.visible = s > 0.001;
      o.scale.setScalar(Math.max(0.001, s));
    }
    if (mandala.current) {
      const m = mandala.current;
      const open = move === "spell" ? ease(span(t, tWind, tWind + 0.3)) * (1 - span(t, tHit + 0.15, tHit + 0.45)) : 0;
      m.visible = open > 0.01;
      m.scale.setScalar(Math.max(0.001, open));
      m.position.set(ag.position.x + dir.x * 0.32, STAND + atk.height * 0.55, ag.position.z + dir.z * 0.32);
      m.rotation.set(0, faceYaw, now * 2.5);
    }
    if (move === "spell") {
      const open = t > tWind && t < tHit + 1.2 ? 1 : 0;
      if (open !== portalOpen && (t < tFinish || atk.gait !== "portal")) setPortalOpen(open);
    }
    const hitT = t - tHit;
    if (shock.current) {
      const k = span(hitT, 0, 0.5);
      const on = (move === "smash" || move === "blast" || move === "bomb" || move === "pounce") && hitT > 0 && k < 1;
      shock.current.visible = on;
      shock.current.position.set(vic.x, BOARD_TOP + 0.015, vic.z);
      shock.current.scale.setScalar(0.2 + k * 1.8);
      (shock.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
    }
    if (flash.current) {
      flash.current.position.copy(target);
      flash.current.intensity = hitT > 0 ? 9 * (1 - span(hitT, 0, 0.3)) : 0;
    }

    // ── sounds and the hit ──
    if (t >= tStrike) {
      once("swing", () => {
        if (move === "repulsor" || move === "blast") playLegoBeam(move === "blast");
        else if (move === "spell") playLegoMagic();
        else playLegoWhoosh(move === "smash" || move === "pounce");
      });
    }
    if (move === "spell" && t >= tWind) once("chant", () => playLegoMagic());
    if (hitT >= 0) {
      // no synth thud here: the victim's BrickBurst plays the explosion clip at this very moment
      once("hit", () => {
        shake.current.amp = Math.max(shake.current.amp, mv.shake);
      });
    }

    // ── victim ──
    const vYaw = yawTo(vic, from);
    if (hitT < 0) {
      vg.position.set(vic.x, 0, vic.z);
      const turn = ease(t / Math.max(0.3, Math.min(tStrike, 0.8)));
      vf.position.set(0, STAND, 0);
      vf.rotation.set(0, restYaw(victimColor) + (((vYaw - restYaw(victimColor) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * turn, 0);
      const k = ease(span(t, tStrike - 0.15, tHit));
      applyPose(V.parts, { armLx: -1.2 * k, armRx: -1.2 * k, armLz: 0.2 * k, armRz: -0.2 * k, headX: 0.15 * k, lean: -0.1 * k });
      for (const n of PART_NAMES) if (V.parts[n] && V.rest[n]) V.parts[n]!.position.copy(V.rest[n]!);
      keepOnBoard(vf, V.root);
    } else {
      // the strike lands: the figure is gone that very frame; its BrickBurst takes its place
      vf.visible = false;
    }
    // hit flash on the victim
    const glow = hitT < 0 ? span(t, tHit - 0.14, tHit) : 0;
    for (const m of V.mats) {
      if (!m.emissive) continue;
      m.emissive.setRGB(glow, glow, glow);
      m.emissiveIntensity = glow > 0 ? 1.2 : 1;
    }

    // ── trail behind the flying bishop ──
    const pts = trailPts.current;
    if (flying) {
      af.getWorldPosition(_va);
      if (space) space.worldToLocal(_va);
      pts.unshift(_va.clone());
    } else if (pts.length) pts.pop();
    if (pts.length > TRAIL) pts.length = TRAIL;
    if (trail.current) {
      const o = _obj;
      for (let i = 0; i < TRAIL; i++) {
        const p = pts[i];
        if (p) {
          o.position.copy(p);
          o.scale.setScalar(0.09 * (1 - i / TRAIL));
        } else {
          o.position.set(0, -50, 0);
          o.scale.setScalar(0.001);
        }
        o.updateMatrix();
        trail.current.setMatrixAt(i, o.matrix);
      }
      trail.current.instanceMatrix.needsUpdate = true;
    }

    // ── camera shake (added on top of wherever the camera is, then taken back off) ──
    const sh = shake.current;
    camera.position.sub(sh.off);
    sh.off.set(0, 0, 0);
    if (sh.amp > 0.002) {
      sh.off.set((Math.random() - 0.5) * 2 * sh.amp, (Math.random() - 0.5) * 2 * sh.amp, (Math.random() - 0.5) * 2 * sh.amp);
      camera.position.add(sh.off);
      sh.amp *= Math.exp(-dt * 9);
    } else sh.amp = 0;
  });

  const portalYaw = yawTo(from, dest);
  return (
    <>
      <group ref={aOuter}>
        <group ref={aFig}>
          <primitive object={A.root} />
        </group>
      </group>
      <group ref={vOuter}>
        <group ref={vFig}>
          <primitive object={V.root} />
        </group>
      </group>
      <BeamMesh color={atk.fx} innerRef={beam} />
      <mesh ref={orb} visible={false} raycast={noRaycast}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color={move === "bomb" ? "#ff8a1f" : atk.fx} toneMapped={false} />
      </mesh>
      {move === "spell" ? (
        <group ref={mandala} visible={false} raycast={noRaycast}>
          <mesh>
            <torusGeometry args={[0.22, 0.012, 6, 40]} />
            <meshBasicMaterial color={atk.fx} toneMapped={false} />
          </mesh>
          <mesh>
            <torusGeometry args={[0.15, 0.01, 6, 36]} />
            <meshBasicMaterial color="#ffd27a" toneMapped={false} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]}>
              <boxGeometry args={[0.44, 0.008, 0.008]} />
              <meshBasicMaterial color={atk.fx} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ) : null}
      {move === "spell" ? <VPortal at={portalAt} yaw={faceYaw} open={portalOpen} color={atk.fx} /> : null}
      {atk.gait === "portal" && spot.distanceTo(dest) > 0.05 ? (
        <>
          <VPortal at={spot} yaw={portalYaw} open={portalOpen} color={atk.fx} />
          <VPortal at={dest} yaw={portalYaw} open={portalOpen} color={atk.fx} />
        </>
      ) : null}
      <mesh ref={shock} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={noRaycast}>
        <ringGeometry args={[0.36, 0.44, 40]} />
        <meshBasicMaterial color={move === "smash" ? "#d8ffd0" : atk.fx} transparent opacity={0.8} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <pointLight ref={flash} color={atk.fx} intensity={0} distance={3.5} />
      {P.flight ? (
        <instancedMesh ref={trail} args={[undefined, undefined, TRAIL]} raycast={noRaycast} frustumCulled={false}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshBasicMaterial color={atk.fx} transparent opacity={0.55} toneMapped={false} depthWrite={false} />
        </instancedMesh>
      ) : null}
    </>
  );
}
const _hand = new THREE.Vector3();
const _target = new THREE.Vector3();
const _obj = new THREE.Object3D();

// ── the army ───────────────────────────────────────────────────────────────

type P = { sq: Square; type: PieceSymbol; color: Color };

/** A random 1 OR 2 aerial tricks for a bishop's capture flight (never 3). */
function pickTricks(): Trick[] {
  const all: Trick[] = ["flip", "roll", "spin"];
  const n = Math.random() < 0.5 ? 1 : 2;
  const out: Trick[] = [];
  while (out.length < n) {
    const t = all[Math.floor(Math.random() * all.length)];
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Draws the standard 3D chess piece (type and colour) at the origin, for a figure that will not load. */
export type LegoStandInRender = (type: PieceSymbol, color: Color) => ReactNode;

/** A plain rounded piece in the team colour: the last resort if no standard piece is passed in. */
function PlainStandIn({ type, color }: { type: PieceSymbol; color: Color }) {
  const h = type === "k" || type === "q" ? 0.62 : type === "p" ? 0.38 : 0.5;
  const c = color === "w" ? "#eeeae0" : "#2c2c30";
  return (
    <group>
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.3, 0.1, 24]} />
        <meshStandardMaterial color={c} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.1 + (h - 0.2) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.19, h - 0.2, 20]} />
        <meshStandardMaterial color={c} roughness={0.35} />
      </mesh>
      <mesh position={[0, h - 0.04, 0]} castShadow>
        <sphereGeometry args={[0.13, 20, 14]} />
        <meshStandardMaterial color={c} roughness={0.35} />
      </mesh>
    </group>
  );
}

/** What stands on a square when that figure's model failed to load after its retries. */
function StandIn({
  type,
  color,
  sq,
  pitch,
  onClick,
  render,
}: {
  type: PieceSymbol;
  color: Color;
  sq: Square;
  pitch: number;
  onClick?: () => void;
  render?: LegoStandInRender;
}) {
  const at = useMemo(() => v3(sq, pitch), [sq, pitch]);
  return (
    <group
      position={[at.x, STAND, at.z]}
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick();
      }}
    >
      {render ? render(type, color) : <PlainStandIn type={type} color={color} />}
    </group>
  );
}

export function LegoArmy({
  fen,
  lastMove,
  pitch = 1,
  onSquare,
  standIn,
}: {
  fen: string;
  lastMove: { from: string; to: string } | null;
  pitch?: number;
  onSquare: (sq: Square) => void;
  /** The standard 3D piece, drawn in place of any figure whose model will not load. */
  standIn?: LegoStandInRender;
}) {
  useEffect(() => primeLegoExplode(), []);
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
  const [bursts, setBursts] = useState<Burst[]>([]);
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
    if (!was) {
      setBursts([]);
      return;
    }
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
      tricks: pickTricks(),
    };
    setFight(f);
    const plan = fightPlan(f, pitch);
    const burst: Burst = {
      id: f.id,
      victim: LEGO_ROSTER[victim.color][victim.type],
      at: plan.vic.clone(),
      dir: plan.dir.clone(),
      seed: hash(f.id),
      delay: plan.impact,
      limit: pitch * 4 + 0.15,
    };
    setBursts((list) => [...list.filter((x) => x.id !== burst.id), burst]);
    window.setTimeout(() => setBursts((list) => list.filter((x) => x !== burst)), (plan.impact + BURST_LIFE + 0.5) * 1000);
    const secs = plan.total;
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
          <LoadGuard
            key={`${p.color}${p.type}${p.sq}`}
            fallback={<StandIn type={p.type} color={p.color} sq={p.sq} pitch={pitch} onClick={() => onSquare(p.sq)} render={standIn} />}
            loading={<Later><StandIn type={p.type} color={p.color} sq={p.sq} pitch={pitch} onClick={() => onSquare(p.sq)} render={standIn} /></Later>}
          >
              <SquareFigure
                id={LEGO_ROSTER[p.color][p.type]}
                color={p.color}
                sq={p.sq}
                spawnFrom={!fight && fought !== moveKey && lastMove?.to === p.sq ? (lastMove.from as Square) : p.sq}
                pitch={pitch}
                onClick={() => onSquare(p.sq)}
              />
          </LoadGuard>
        ),
      )}
      {fight ? (
        <LoadGuard key={fight.id} fallback={<StandIn type={fight.type} color={fight.color} sq={fight.to} pitch={pitch} render={standIn} />} loading={null}>
          <FightScene fight={fight} pitch={pitch} />
        </LoadGuard>
      ) : null}
      {bursts.map((b) => (
        <Suspense key={b.id} fallback={null}>
          <BrickBurst burst={b} />
        </Suspense>
      ))}
    </>
  );
}

// ── the world: the board floating in the dusk sky, the city far below ─────

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

/** World units per builder stud (a LEGO stud on this board is 0.25). */
const BUILD_WORLD_SCALE = 0.25;
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
  const gltf = useResilientGLTF(CITY_URL);
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

/**
 * A whole LDraw set placed in the sky as a backdrop (LDU, y up, feet at y=0 in the file).
 * The files carry no normals (they were simplified for size), so the loader shades them flat,
 * which is how LEGO plastic looks anyway.
 */
function useBackdrop(url: string, pos: [number, number, number], yaw: number, scale: number) {
  const gltf = useResilientGLTF(url);
  return useMemo(() => {
    const t = gltf.scene.clone(true);
    t.position.set(...pos);
    t.rotation.y = yaw;
    t.scale.setScalar(scale);
    t.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.raycast = noRaycast;
    });
    return t;
    // pos/yaw/scale are module constants
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf]);
}

/**
 * The player's own "Create Lego board" build, when one is in use: it replaces the balcony, the
 * tower and the city round the board (builder units are studs; a stud is 0.25 world units here).
 */
function useActiveBuild(): { build: LegoBuild; items: PaletteItem[] } | null {
  const [state, setState] = useState<{ build: LegoBuild; items: PaletteItem[] } | null>(null);
  useEffect(() => {
    let live = true;
    activeLegoBuild({ data: {} })
      .then(async (b) => {
        if (!live || !b || !b.pieces?.length) return;
        const items = await loadPaletteMeta();
        if (live) setState({ build: b, items });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return state;
}

export function LegoWorld() {
  const custom = useActiveBuild();
  // the scenery is never worth a crash page: without the city or tower, keep the sky and baseplate
  if (custom)
    return (
      <LoadGuard fallback={<LegoWorldBase />}>
        <CustomLegoWorld build={custom.build} items={custom.items} />
      </LoadGuard>
    );
  return (
    <LoadGuard fallback={<LegoWorldBase />}>
      <TowerLegoWorld />
    </LoadGuard>
  );
}

/** Sky, lights and the board's own baseplate: shared by the tower world and a custom build. */
function LegoWorldBase() {
  return (
    <>
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
    </>
  );
}

function CustomLegoWorld({ build, items }: { build: LegoBuild; items: PaletteItem[] }) {
  return (
    <group>
      <LegoWorldBase />
      <Suspense fallback={null}>
        <group position={[0, -0.001, 0]}>
          <BuildBaseplate scale={BUILD_WORLD_SCALE} />
          <BuiltLego pieces={build.pieces} items={items} scale={BUILD_WORLD_SCALE} />
        </group>
      </Suspense>
    </group>
  );
}

/** The board floats high over the city at dusk. */
const SKY_STREET_Y = -150;
/** Behind white (the heroes, +z): the SHIELD Helicarrier, broadside on, hanging in the sky. */
const HERO_BASE: { pos: [number, number, number]; yaw: number; scale: number } = { pos: [4.6, -20, 58], yaw: Math.PI / 2, scale: 0.022 };
/**
 * Behind black (Dr. Doom's side, -z): Dr. Doom's tower, Sohan's tower model recoloured in Doom's green and
 * steel (see CREDITS.md), turned three-quarters so its landing deck reaches toward the board.
 */
const DOOM_TOWER: { pos: [number, number, number]; yaw: number; scale: number } = { pos: [-6, -36, -70], yaw: -0.5, scale: 0.35 };

/** The heroes' Helicarrier behind white and Dr. Doom's tower behind black, both in the sky well clear of the board. */
function SkyBackdrops() {
  // own guard and Suspense: a slow or missing backdrop never holds up or replaces the rest of the world
  return (
    <LoadGuard fallback={null} loading={null}>
      <SkyBackdropModels />
    </LoadGuard>
  );
}

function SkyBackdropModels() {
  const hero = useBackdrop(HERO_BASE_URL, HERO_BASE.pos, HERO_BASE.yaw, HERO_BASE.scale);
  const tower = useBackdrop(DOOM_TOWER_URL, DOOM_TOWER.pos, DOOM_TOWER.yaw, DOOM_TOWER.scale);
  return (
    <>
      <primitive object={hero} />
      <primitive object={tower} />
      {/* fill light so the faces of the backdrops that look at the board are not black */}
      <directionalLight position={[0, 20, 0]} intensity={0.55} color="#e6dcff" />
    </>
  );
}

function TowerLegoWorld() {
  const city = useCityPieces();
  const blocks = useMemo(() => {
    const kinds = Object.keys(city).filter((k) => k !== "building-skyscraper-d");
    if (!kinds.length) return [];
    const out: THREE.Object3D[] = [];
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 70; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = 45 + rnd() * 140;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      const o = city[kind].clone(true);
      o.scale.setScalar(kind.includes("skyscraper") ? 5 + rnd() * 6 : 7 + rnd() * 5);
      o.position.set(x, SKY_STREET_Y, z);
      o.rotation.y = Math.floor(rnd() * 4) * (Math.PI / 2);
      // far below in the haze: everything gets the dusk tint
      o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (mesh.isMesh) mesh.material = duskTint(mesh.material as THREE.MeshStandardMaterial);
      });
      out.push(o);
    }
    return out;
  }, [city]);
  return (
    <group>
      <LegoWorldBase />
      {/* the board's floating deck */}
      <mesh position={[0, -0.25, 0]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[11, 0.5, 11]} />
        <meshStandardMaterial color="#4a4f5a" roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={noRaycast}>
        <planeGeometry args={[10.6, 10.6]} />
        <meshStandardMaterial color="#343944" roughness={0.45} metalness={0.4} />
      </mesh>
      <SkyBackdrops />
      {blocks.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
      <mesh position={[0, SKY_STREET_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <circleGeometry args={[300, 48]} />
        <meshStandardMaterial color="#2a2730" roughness={0.9} />
      </mesh>
    </group>
  );
}

