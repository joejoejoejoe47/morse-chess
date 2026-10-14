/**
 * Rocco's special cool board: a city HDRI backdrop, a painted chess grid, and
 * modern 3D dudes (red team vs black team) that fight on every capture.
 *
 *  - queen: backflip, ignites a lightsaber, slices the enemy in half
 *  - king:  force-choke, lifts the enemy into the air, then drops him
 *  - everyone else: draws a pistol, shoots, the enemy falls to the ground
 *
 * AN / 3D style uses the animated "Suit" man (Quaternius, CC-BY 4.0), which
 * ships real Gun_Shoot / Death / Roll / Sword_Slash / HitRecieve clips.
 * RA style uses the realistic three.js "Soldier" (Mixamo rig) with Idle/Walk
 * clips; his fight moves are procedural. See public/rocco/CREDITS.md.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, useGLTF } from "@react-three/drei";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { asset } from "@/lib/base";
import { squareToWorld } from "@/lib/chess/board-math";

export const ROCCO_BOARD_ID = "rocco";

const CITY_HDR = asset("/rocco/city.hdr");

type Act = "idle" | "walk" | "aim" | "shoot" | "death" | "hit" | "flip" | "slash";
export type RoccoRig = "suit" | "soldier";

const RIGS: Record<RoccoRig, { url: string; face: number; clips: Partial<Record<Act, string>> }> = {
  suit: {
    url: asset("/rocco/suit.glb"),
    face: 0,
    clips: {
      idle: "CharacterArmature|Idle",
      walk: "CharacterArmature|Walk",
      aim: "CharacterArmature|Idle_Gun_Pointing",
      shoot: "CharacterArmature|Gun_Shoot",
      death: "CharacterArmature|Death",
      hit: "CharacterArmature|HitRecieve",
      flip: "CharacterArmature|Roll",
      slash: "CharacterArmature|Sword_Slash",
    },
  },
  soldier: {
    url: asset("/rocco/soldier.glb"),
    face: Math.PI,
    clips: { idle: "Idle", walk: "Walk" },
  },
};

const ONE_SHOT: Act[] = ["shoot", "death", "flip", "slash"];
const HEIGHT: Record<PieceSymbol, number> = { k: 1.02, q: 0.96, r: 0.92, b: 0.9, n: 0.9, p: 0.78 };
const RED = "#c3161f";
const BLACK = "#161616";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/** Top surface of the painted squares (BoardSquares: box at y=0.08, 0.08 tall). Feet stand here. */
export const BOARD_TOP = 0.12;
const v3 = (sq: string, pitch: number) => {
  const [x, , z] = squareToWorld(sq, pitch);
  return new THREE.Vector3(x, BOARD_TOP, z);
};
const yawTo = (a: THREE.Vector3, b: THREE.Vector3) => Math.atan2(b.x - a.x, b.z - a.z);
const restYaw = (color: Color) => (color === "w" ? Math.PI : 0);

// ── world ────────────────────────────────────────────────────────────────

export function RoccoWorld() {
  return (
    <>
      <Environment files={CITY_HDR} background backgroundBlurriness={0.02} environmentIntensity={0.85} />
      {/* plinth under the painted grid */}
      <mesh position={[0, -0.24, 0]} receiveShadow castShadow>
        <boxGeometry args={[9.4, 0.4, 9.4]} />
        <meshStandardMaterial color="#1b1b1f" metalness={0.65} roughness={0.32} />
      </mesh>
      {/* red / black trim */}
      <mesh position={[0, -0.02, 4.62]}>
        <boxGeometry args={[9.3, 0.06, 0.12]} />
        <meshStandardMaterial color={RED} emissive={RED} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, -0.02, -4.62]}>
        <boxGeometry args={[9.3, 0.06, 0.12]} />
        <meshStandardMaterial color="#050505" emissive="#3a3a3a" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, -0.46, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[30, 64]} />
        <meshStandardMaterial color="#2a2b2f" roughness={0.85} metalness={0.1} />
      </mesh>
    </>
  );
}

// ── one dude ────────────────────────────────────────────────────────────────

function Dude({
  rig,
  type,
  color,
  act,
  actKey = 0,
  clip,
}: {
  rig: RoccoRig;
  type: PieceSymbol;
  color: Color;
  act: Act;
  actKey?: number;
  clip?: THREE.Plane[];
}) {
  const def = RIGS[rig];
  const gltf = useGLTF(def.url);
  const built = useMemo(() => {
    const model = cloneSkeleton(gltf.scene);
    const mats: THREE.Material[] = [];
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const list = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        const mat = (m as THREE.MeshStandardMaterial).clone();
        if (rig === "suit") {
          if (mat.name === "Black") mat.color.set(color === "w" ? RED : BLACK);
          if (mat.name === "White") mat.color.set(color === "w" ? "#f2f2f2" : "#b0141c");
          mat.roughness = 0.6;
        } else if (mat.name !== "Vanguard_VisorMat") {
          mat.color.set(color === "w" ? "#ff5a5a" : "#4a4a4a");
        }
        mats.push(mat);
        return mat;
      });
      mesh.material = Array.isArray(mesh.material) ? list : list[0];
    });
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<Act, THREE.AnimationAction>();
    for (const [key, name] of Object.entries(def.clips) as [Act, string][]) {
      const c = gltf.animations.find((a) => a.name === name);
      if (c) actions.set(key, mixer.clipAction(c));
    }
    // Measure the feet in the idle pose (skinned vertices, after the armature
    // root offset), scale to the piece height, then shift so min.y sits at 0.
    // Parents place y=0 on BOARD_TOP.
    const idle = actions.get("idle");
    idle?.play();
    mixer.update(0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    idle?.stop();
    const tall = Math.max(0.001, box.max.y - box.min.y);
    const s = HEIGHT[type] / tall;
    model.scale.multiplyScalar(s);
    model.position.y -= box.min.y * s;
    model.rotation.y += def.face;
    model.updateMatrixWorld(true);
    const holder = new THREE.Group();
    holder.add(model);
    if (import.meta.env.DEV) {
      const check = new THREE.Box3().setFromObject(model, true);
      console.debug(`[rocco] ${rig} ${type} feet y=${check.min.y.toFixed(4)} head y=${check.max.y.toFixed(4)}`);
    }
    return { holder, mixer, actions, mats };
  }, [gltf, rig, type, color, def]);

  useEffect(() => {
    for (const m of built.mats) {
      m.clippingPlanes = clip ?? null;
      m.needsUpdate = true;
    }
  }, [built, clip]);

  const current = useRef<THREE.AnimationAction | null>(null);
  useEffect(() => {
    const next = built.actions.get(act) ?? built.actions.get("idle") ?? null;
    if (!next) return;
    next.reset();
    if (ONE_SHOT.includes(act) && built.actions.has(act)) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    next.play();
    if (current.current && current.current !== next) current.current.crossFadeTo(next, 0.18, false);
    current.current = next;
  }, [built, act, actKey]);

  useEffect(
    () => () => {
      built.mixer.stopAllAction();
      built.mats.forEach((m) => m.dispose());
    },
    [built],
  );

  useFrame((_, dt) => built.mixer.update(Math.min(dt, 0.05)));

  return (
    <>
      <primitive object={built.holder} />
      <RankMark type={type} y={HEIGHT[type] + 0.14} />
    </>
  );
}

/** Small gold token over each dude so you can tell the pieces apart. */
function RankMark({ type, y }: { type: PieceSymbol; y: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 1.2;
  });
  if (type === "p") return null;
  return (
    <group ref={ref} position={[0, y, 0]}>
      <mesh>
        {type === "k" ? (
          <octahedronGeometry args={[0.09]} />
        ) : type === "q" ? (
          <sphereGeometry args={[0.07, 16, 12]} />
        ) : type === "r" ? (
          <boxGeometry args={[0.1, 0.1, 0.1]} />
        ) : type === "b" ? (
          <coneGeometry args={[0.06, 0.14, 12]} />
        ) : (
          <tetrahedronGeometry args={[0.08]} />
        )}
        <meshStandardMaterial color="#f2c14e" emissive="#d99a1c" emissiveIntensity={0.7} metalness={0.8} roughness={0.25} />
      </mesh>
      {type === "k" || type === "q" ? (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
          <torusGeometry args={[0.1, 0.014, 8, 24]} />
          <meshStandardMaterial color="#f2c14e" emissive="#d99a1c" emissiveIntensity={0.6} metalness={0.8} roughness={0.25} />
        </mesh>
      ) : null}
    </group>
  );
}

// ── props: pistol + lightsaber ─────────────────────────────────────────────

function Pistol() {
  return (
    <group>
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[0.035, 0.045, 0.16]} />
        <meshStandardMaterial color="#222" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.05, 0.01]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.03, 0.08, 0.04]} />
        <meshStandardMaterial color="#111" roughness={0.7} />
      </mesh>
    </group>
  );
}

function Saber({ blade, hue }: { blade: number; hue: string }) {
  const len = 0.78;
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[0.02, 0.02, 0.14, 12]} />
        <meshStandardMaterial color="#c9c9cf" metalness={0.95} roughness={0.2} />
      </mesh>
      <group scale={[1, Math.max(0.001, blade), 1]} position={[0, 0.07, 0]}>
        <mesh position={[0, len / 2, 0]}>
          <cylinderGeometry args={[0.012, 0.014, len, 10]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <mesh position={[0, len / 2, 0]}>
          <cylinderGeometry args={[0.032, 0.036, len + 0.03, 12]} />
          <meshBasicMaterial color={hue} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <pointLight position={[0, len / 2, 0]} color={hue} intensity={blade * 3} distance={2.4} />
      </group>
    </group>
  );
}

// ── capture fight ───────────────────────────────────────────────────────────

type Fight = {
  id: string;
  type: PieceSymbol;
  color: Color;
  from: Square;
  to: Square;
  victimType: PieceSymbol;
  victimSq: Square;
};

const FIGHT_TIME: Record<"q" | "k" | "gun", number> = { q: 3.6, k: 3.6, gun: 2.9 };
const fightKind = (t: PieceSymbol) => (t === "q" ? "q" : t === "k" ? "k" : "gun");

function FightScene({ fight, rig, pitch }: { fight: Fight; rig: RoccoRig; pitch: number }) {
  const { gl } = useThree();
  useEffect(() => {
    const was = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    return () => {
      gl.localClippingEnabled = was;
    };
  }, [gl]);

  const kind = fightKind(fight.type);
  const hasClips = rig === "suit";
  const start = useRef<number | null>(null);
  const from = useMemo(() => v3(fight.from, pitch), [fight.from, pitch]);
  const vic = useMemo(() => v3(fight.victimSq, pitch), [fight.victimSq, pitch]);
  const dest = useMemo(() => v3(fight.to, pitch), [fight.to, pitch]);
  const face = yawTo(from, vic);
  const vicFace = yawTo(vic, from);
  const victimColor: Color = fight.color === "w" ? "b" : "w";
  const cutY = HEIGHT[fight.victimType] * 0.52;

  const attacker = useRef<THREE.Group>(null);
  const victim = useRef<THREE.Group>(null);
  const top = useRef<THREE.Group>(null);
  const bottom = useRef<THREE.Group>(null);
  const gun = useRef<THREE.Group>(null);
  const saber = useRef<THREE.Group>(null);
  const flash = useRef<THREE.Mesh>(null);
  const tracer = useRef<THREE.Group>(null);
  const aura = useRef<THREE.Mesh>(null);
  const handGlow = useRef<THREE.PointLight>(null);
  const [blade, setBlade] = useState(0);
  const [aAct, setAAct] = useState<Act>(kind === "q" ? "flip" : "aim");
  const [vAct, setVAct] = useState<Act>("idle");
  const [split, setSplit] = useState(false);
  const topPlane = useMemo(() => [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)], []);
  const botPlane = useMemo(() => [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)], []);
  const localTop = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -cutY), [cutY]);
  const localBot = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), cutY), [cutY]);
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3() }), []);
  const acts = useRef({ a: aAct, v: vAct, blade: 0, split: false });

  const setA = (x: Act) => {
    if (acts.current.a !== x) {
      acts.current.a = x;
      setAAct(x);
    }
  };
  const setV = (x: Act) => {
    if (acts.current.v !== x) {
      acts.current.v = x;
      setVAct(x);
    }
  };

  useFrame((state) => {
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current;
    const A = attacker.current;
    const V = victim.current;
    if (!A || !V) return;
    const total = FIGHT_TIME[kind];
    const walkFrom = total - 0.6;
    A.position.copy(from);
    A.rotation.set(0, face, 0);
    V.position.copy(vic);
    V.rotation.set(0, vicFace, 0);
    if (flash.current) flash.current.visible = false;
    if (tracer.current) tracer.current.visible = false;
    const fall = (at: number) => {
      // procedural fall when the rig has no death clip
      if (!hasClips) V.rotation.x = -ease(span(t, at, at + 0.5)) * (Math.PI / 2);
      if (t >= at) setV("death");
    };

    if (kind === "gun") {
      if (gun.current) {
        gun.current.visible = t < walkFrom;
        gun.current.scale.setScalar(ease(span(t, 0, 0.35)));
      }
      const shots = [0.55, 0.85, 1.15];
      if (t >= 0.55 && t < walkFrom) setA("shoot");
      for (const s of shots) {
        if (t >= s && t < s + 0.07) {
          if (flash.current) flash.current.visible = true;
          if (tracer.current && gun.current) {
            gun.current.getWorldPosition(tmp.a);
            tmp.b.set(vic.x, BOARD_TOP + HEIGHT[fight.victimType] * 0.62, vic.z);
            tracer.current.visible = true;
            tracer.current.position.copy(tmp.a).lerp(tmp.b, 0.5);
            tracer.current.lookAt(tmp.b);
            tracer.current.scale.set(1, 1, tmp.a.distanceTo(tmp.b));
          }
        }
      }
      if (t >= 0.6 && t < 1.2) setV("hit");
      fall(1.2);
      if (t > 2.1) V.position.y = BOARD_TOP - ease(span(t, 2.1, walkFrom)) * 0.9;
    }

    if (kind === "q") {
      // backflip in place
      const u = span(t, 0, 1.0);
      A.position.y = BOARD_TOP + Math.sin(Math.PI * u) * 1.05;
      A.rotation.x = -ease(u) * Math.PI * 2;
      if (t >= 1.0) setA("idle");
      const b = ease(span(t, 1.0, 1.35)) * (1 - ease(span(t, 2.7, 3.0)));
      if (Math.abs(b - acts.current.blade) > 0.02 || (b === 0) !== (acts.current.blade === 0)) {
        acts.current.blade = b;
        setBlade(b);
      }
      // dash and slice
      const d = ease(span(t, 1.35, 1.7));
      const stop = vic.clone().sub(from).setLength(Math.max(0, from.distanceTo(vic) - 0.55 * pitch));
      A.position.x = from.x + stop.x * d;
      A.position.z = from.z + stop.z * d;
      if (t >= 1.5) setA(t < walkFrom ? "slash" : "walk");
      if (saber.current) {
        const swing = THREE.MathUtils.lerp(-1.5, 1.6, ease(span(t, 1.55, 1.8)));
        saber.current.rotation.set(0, t < 1.55 ? -1.5 : swing, 0);
        saber.current.visible = t >= 0.95 && t < 3.05;
      }
      if (t >= 1.75 && !acts.current.split) {
        acts.current.split = true;
        setSplit(true);
      }
      setV(t >= 1.75 ? "hit" : "idle");
      if (top.current && bottom.current) {
        const s = ease(span(t, 1.8, 2.5));
        top.current.position.set(s * 0.25, -s * (cutY - 0.12), -s * 0.25);
        top.current.rotation.set(-s * 1.3, 0, s * 0.5);
        bottom.current.rotation.set(-ease(span(t, 2.0, 2.6)) * (Math.PI / 2), 0, 0);
        const sink = ease(span(t, 2.7, walkFrom)) * 0.9;
        top.current.position.y -= sink;
        bottom.current.position.y = -sink;
        top.current.updateMatrixWorld(true);
        bottom.current.updateMatrixWorld(true);
        topPlane[0].copy(localTop).applyMatrix4(top.current.matrixWorld);
        botPlane[0].copy(localBot).applyMatrix4(bottom.current.matrixWorld);
      }
    }

    if (kind === "k") {
      setA(t < walkFrom ? "aim" : "walk");
      const lift = ease(span(t, 0.4, 1.3));
      const drop = span(t, 2.1, 2.4);
      const up = lift * 1.15 * (1 - drop * drop);
      V.position.y = BOARD_TOP + up + (t > 0.5 && t < 2.1 ? Math.sin(t * 47) * 0.015 : 0);
      V.rotation.z = t > 0.5 && t < 2.1 ? Math.sin(t * 9) * 0.06 : 0;
      setV(t > 0.4 && t < 2.4 ? "hit" : "idle");
      fall(2.4);
      if (t > 2.75) V.position.y = BOARD_TOP - ease(span(t, 2.75, walkFrom)) * 0.9;
      if (aura.current) {
        aura.current.visible = t > 0.35 && t < 2.15;
        aura.current.position.set(0, HEIGHT[fight.victimType] * 0.86, 0);
        aura.current.scale.setScalar(1 + Math.sin(t * 18) * 0.12);
      }
      if (handGlow.current) handGlow.current.intensity = t > 0.3 && t < 2.15 ? 2.5 + Math.sin(t * 25) : 0;
    }

    // walk onto the captured square
    if (t >= walkFrom) {
      const w = ease(span(t, walkFrom, total));
      const startAt = kind === "q" ? from.clone().add(vic.clone().sub(from).setLength(Math.max(0, from.distanceTo(vic) - 0.55 * pitch))) : from;
      A.position.set(THREE.MathUtils.lerp(startAt.x, dest.x, w), BOARD_TOP, THREE.MathUtils.lerp(startAt.z, dest.z, w));
      A.rotation.set(0, THREE.MathUtils.lerp(yawTo(startAt, dest) || face, restYaw(fight.color), ease(span(t, total - 0.15, total))), 0);
      setA("walk");
    }
  });

  const tall = HEIGHT[fight.type];
  return (
    <>
      <group ref={attacker}>
        <Dude rig={rig} type={fight.type} color={fight.color} act={aAct} actKey={aAct === "shoot" ? 1 : 0} />
        {kind === "gun" ? (
          <group ref={gun} position={[-0.13, tall * 0.62, 0.28]}>
            <Pistol />
            <mesh ref={flash} position={[0, 0.01, 0.17]} visible={false}>
              <sphereGeometry args={[0.06, 10, 8]} />
              <meshBasicMaterial color="#ffd36a" toneMapped={false} />
            </mesh>
          </group>
        ) : null}
        {kind === "q" ? (
          <group ref={saber} position={[-0.12, tall * 0.5, 0.18]} visible={false}>
            <group rotation={[Math.PI / 2, 0, 0]}>
              <Saber blade={blade} hue={fight.color === "w" ? "#ff2a2a" : "#9a3cff"} />
            </group>
          </group>
        ) : null}
        {kind === "k" ? (
          <pointLight ref={handGlow} position={[-0.15, tall * 0.7, 0.4]} color="#5ab8ff" intensity={0} distance={2.5} />
        ) : null}
      </group>
      <group ref={victim}>
        {split ? (
          <>
            <group ref={top}>
              <Dude rig={rig} type={fight.victimType} color={victimColor} act="hit" clip={topPlane} />
            </group>
            <group ref={bottom}>
              <Dude rig={rig} type={fight.victimType} color={victimColor} act="hit" clip={botPlane} />
            </group>
          </>
        ) : (
          <Dude rig={rig} type={fight.victimType} color={victimColor} act={vAct} />
        )}
        {kind === "k" ? (
          <mesh ref={aura} rotation={[Math.PI / 2, 0, 0]} visible={false}>
            <torusGeometry args={[0.09, 0.02, 8, 24]} />
            <meshBasicMaterial color="#7cc8ff" transparent opacity={0.8} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
        ) : null}
      </group>
      <group ref={tracer} visible={false}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 1, 6]} />
          <meshBasicMaterial color="#ffe9a0" toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}

// ── standing / walking dude on a square ─────────────────────────────────────

function SquareDude({
  rig,
  type,
  color,
  sq,
  spawnFrom,
  pitch,
  onClick,
}: {
  rig: RoccoRig;
  type: PieceSymbol;
  color: Color;
  sq: Square;
  spawnFrom: Square;
  pitch: number;
  onClick: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const a = useMemo(() => v3(spawnFrom, pitch), [spawnFrom, pitch]);
  const b = useMemo(() => v3(sq, pitch), [sq, pitch]);
  const moving = spawnFrom !== sq;
  const [act, setAct] = useState<Act>(moving ? "walk" : "idle");
  const start = useRef<number | null>(null);
  const dur = Math.max(0.45, a.distanceTo(b) * 0.32);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    if (start.current === null) start.current = state.clock.elapsedTime;
    const u = moving ? span(state.clock.elapsedTime - start.current, 0, dur) : 1;
    g.position.lerpVectors(a, b, u);
    g.rotation.y = u < 1 ? yawTo(a, b) : restYaw(color);
    if (u >= 1 && act !== "idle") setAct("idle");
  });
  return (
    <group
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Dude rig={rig} type={type} color={color} act={act} />
    </group>
  );
}

// ── the army ───────────────────────────────────────────────────────────────

type P = { sq: Square; type: PieceSymbol; color: Color };

export function RoccoArmy({
  fen,
  lastMove,
  real,
  pitch = 1,
  onSquare,
}: {
  fen: string;
  lastMove: { from: string; to: string } | null;
  real: boolean;
  pitch?: number;
  onSquare: (sq: Square) => void;
}) {
  const rig: RoccoRig = real ? "soldier" : "suit";
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

  useEffect(() => {
    const before = prev.current;
    prev.current = pieces;
    if (!before || !lastMove) return;
    const key = `${fen}|${lastMove.from}${lastMove.to}`;
    if (seen.current === key) return;
    seen.current = key;
    const mover = pieces.find((p) => p.sq === lastMove.to);
    if (!mover) return;
    let victim = before.find((p) => p.sq === lastMove.to && p.color !== mover.color);
    if (!victim && mover.type === "p" && lastMove.from[0] !== lastMove.to[0]) {
      const beside = `${lastMove.to[0]}${lastMove.from[1]}` as Square;
      victim = before.find((p) => p.sq === beside && p.type === "p" && p.color !== mover.color && !pieces.some((q) => q.sq === beside));
    }
    if (!victim) return;
    const f: Fight = {
      id: key,
      type: mover.type,
      color: mover.color,
      from: lastMove.from as Square,
      to: lastMove.to as Square,
      victimType: victim.type,
      victimSq: victim.sq,
    };
    setFight(f);
    const timer = window.setTimeout(() => {
      setFought(f.id);
      setFight((cur) => (cur?.id === f.id ? null : cur));
    }, FIGHT_TIME[fightKind(f.type)] * 1000 + 60);
    return () => window.clearTimeout(timer);
  }, [pieces, lastMove, fen]);

  return (
    <>
      {pieces.map((p) =>
        fight && p.sq === fight.to && p.color === fight.color ? null : (
          <SquareDude
            key={`${p.color}${p.type}${p.sq}-${rig}`}
            rig={rig}
            type={p.type}
            color={p.color}
            sq={p.sq}
            spawnFrom={!fight && fought !== moveKey && lastMove?.to === p.sq ? (lastMove.from as Square) : p.sq}
            pitch={pitch}
            onClick={() => onSquare(p.sq)}
          />
        ),
      )}
      {fight ? <FightScene key={fight.id} fight={fight} rig={rig} pitch={pitch} /> : null}
    </>
  );
}

useGLTF.preload(RIGS.suit.url);
