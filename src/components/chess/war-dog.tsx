import { useMemo, useRef, useState, type MutableRefObject } from "react";
import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Square } from "chess.js";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { KingCrown } from "@/components/chess/sculpted-piece";
import { squareToWorld } from "@/lib/chess/board-math";
import { asset } from "@/lib/base";
import type { TeamView } from "@/lib/avatar/catalog";

const DOG = asset("/avatars/husky.glb");
useGLTF.preload(DOG);

type DogAct = "idle" | "run" | "bite";

function fitDog(source: THREE.Object3D) {
  const obj = cloneSkeleton(source);
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
  });
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(0.78 / (size.y || 1));
  obj.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(obj);
  const center = grounded.getCenter(new THREE.Vector3());
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= grounded.min.y;
  return obj;
}

export function WarDog({
  act = "idle",
  pace = null,
}: {
  act?: DogAct;
  pace?: MutableRefObject<{ act: string }> | null;
}) {
  const gltf = useGLTF(DOG);
  const scene = useMemo(() => fitDog(gltf.scene), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, scene);
  const mode = useRef("");
  useFrame(() => {
    const raw = pace?.current.act;
    const want: DogAct = pace
      ? raw === "attack"
        ? "bite"
        : raw === "walk" || raw === "charge"
          ? "run"
          : "idle"
      : act;
    if (want === mode.current) return;
    mode.current = want;
    const list = Object.values(actions).filter((clip): clip is THREE.AnimationAction => Boolean(clip));
    const named = (clip: THREE.AnimationAction) => clip.getClip().name;
    const next =
      want === "bite"
        ? list.find((clip) => /^Attack$/i.test(named(clip)))
        : want === "run"
          ? list.find((clip) => /^Gallop$/i.test(named(clip))) || list.find((clip) => /^Walk$/i.test(named(clip)))
          : list.find((clip) => /^Idle$/i.test(named(clip)));
    list.forEach((clip) => {
      if (clip !== next && clip.isRunning()) clip.fadeOut(0.12);
    });
    if (!next) return;
    next.reset();
    next.setLoop(want === "bite" ? THREE.LoopOnce : THREE.LoopRepeat, want === "bite" ? 1 : Infinity);
    next.clampWhenFinished = want === "bite";
    next.fadeIn(0.08).play();
  });
  return <primitive object={scene} />;
}

/** Sits the chosen crown on the ranger king's head. Parent must contain the pawn. */
export function RaCrown({ crownId, team }: { crownId: string; team: TeamView }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const group = ref.current;
    const host = group?.parent;
    if (!group || !host) return;
    const head = host.getObjectByName("head") || host.getObjectByName("Head");
    if (!head) return;
    const pos = new THREE.Vector3();
    head.getWorldPosition(pos);
    host.worldToLocal(pos);
    const halo = crownId === "halo";
    group.position.set(pos.x, pos.y + (halo ? 0.18 : 0.04), pos.z);
    group.scale.setScalar(halo ? 1.05 : 0.85);
  });
  return (
    <group ref={ref}>
      <KingCrown id={crownId} team={team} />
    </group>
  );
}

function Shatter() {
  const bits = useMemo(
    () =>
      Array.from({ length: 16 }, () => ({
        v: new THREE.Vector3((Math.random() - 0.5) * 3.4, 1.4 + Math.random() * 2.4, (Math.random() - 0.5) * 3.4),
        p: new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.35 + Math.random() * 0.4, (Math.random() - 0.5) * 0.25),
        s: 0.05 + Math.random() * 0.09,
        color: Math.random() > 0.45 ? "#d8c7b0" : "#9f1d1d",
      })),
    [],
  );
  const ref = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (born.current == null) born.current = clock.elapsedTime;
    const t = clock.elapsedTime - born.current;
    const group = ref.current;
    if (!group) return;
    group.children.forEach((child, i) => {
      const bit = bits[i];
      child.position.set(bit.p.x + bit.v.x * t, bit.p.y + bit.v.y * t - 5 * t * t, bit.p.z + bit.v.z * t);
      child.rotation.x = t * 7;
      child.rotation.y = t * 5;
    });
  });
  return (
    <group ref={ref}>
      {bits.map((bit, i) => (
        <mesh key={i} position={bit.p} scale={bit.s}>
          <boxGeometry args={[1, 0.55, 0.7]} />
          <meshStandardMaterial color={bit.color} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** The husky sprints off the king and bites the captured man apart. */
export function DogCharge({
  from,
  to,
  pitch,
  onDone,
}: {
  from: Square;
  to: Square;
  pitch: number;
  onDone: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const done = useRef(false);
  const bit = useRef(false);
  const [phase, setPhase] = useState<DogAct>("run");
  const [bits, setBits] = useState(false);
  useFrame(({ clock }) => {
    if (born.current == null) born.current = clock.elapsedTime;
    const age = clock.elapsedTime - born.current;
    const run = 0.62;
    const t = Math.min(1, age / run);
    const a = squareToWorld(from, pitch);
    const b = squareToWorld(to, pitch);
    const ease = 1 - (1 - t) ** 2;
    if (ref.current) {
      ref.current.position.set(a[0] + (b[0] - a[0]) * ease, 0, a[2] + (b[2] - a[2]) * ease);
      ref.current.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]);
    }
    if (t >= 1 && phase !== "bite") setPhase("bite");
    if (age > run + 0.12 && !bit.current) {
      bit.current = true;
      setBits(true);
    }
    if (age > run + 1.7 && !done.current) {
      done.current = true;
      onDone();
    }
  });
  return (
    <group ref={ref}>
      <WarDog act={phase} />
      {bits ? <Shatter /> : null}
    </group>
  );
}
