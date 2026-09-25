import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { PieceSymbol } from "chess.js";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export type PeopleCast = "stone" | "pipe" | "ring";
export type Gait = { phase: number; amp: number; act: "idle" | "walk" | "attack" | "death"; fade: number };

const PROP = /sword|shield|axe|knife|crossbow|throw|spell|wand|staff|mug|cape|helmet|hat|hood|cloak|badge/i;
const BODY = /head|body|arm|leg|eyes|jaw|skull/i;

const LOOK: Record<
  PieceSymbol,
  { w: string; b: string; show: string[]; scale: number; darkTint?: string }
> = {
  k: {
    w: "/units/knight.glb",
    b: "/units/skeleton-warrior.glb",
    show: ["1H_Sword", "Knight_Helmet", "Knight_Cape", "Skeleton_Warrior_Helmet", "Skeleton_Warrior_Cloak"],
    scale: 0.64,
  },
  q: {
    w: "/units/rogue-hooded.glb",
    b: "/units/skeleton-rogue.glb",
    show: ["Knife", "Knife_Offhand", "Rogue_Cape", "Rogue_Head_Hooded", "Skeleton_Rogue_Hood", "Skeleton_Rogue_Cape", "Skeleton_Rogue_Head"],
    scale: 0.58,
  },
  b: {
    w: "/units/mage.glb",
    b: "/units/skeleton-mage.glb",
    show: ["2H_Staff", "Mage_Hat", "Mage_Cape", "Skeleton_Mage_Hat"],
    scale: 0.56,
  },
  n: {
    w: "/units/barbarian.glb",
    b: "/units/skeleton-warrior.glb",
    show: ["1H_Axe", "Barbarian_Round_Shield", "Barbarian_Hat", "Skeleton_Warrior_Helmet"],
    scale: 0.58,
  },
  r: {
    w: "/units/knight.glb",
    b: "/units/knight.glb",
    show: ["1H_Sword", "Rectangle_Shield", "Knight_Helmet"],
    scale: 0.74,
    darkTint: "#3e3832",
  },
  p: {
    w: "/units/rogue.glb",
    b: "/units/skeleton-minion.glb",
    show: ["Knife", "Rogue_Cape", "Skeleton_Minion_Cloak"],
    scale: 0.42,
  },
};

const URLS = [...new Set(Object.values(LOOK).flatMap((row) => [row.w, row.b]))];
for (const url of URLS) useGLTF.preload(url);

function paint(root: THREE.Object3D, opacity: number) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      mat.transparent = opacity < 0.99;
      mat.opacity = opacity;
      mat.depthWrite = opacity > 0.2;
    }
  });
}

function WarUnit({
  url,
  show,
  scale,
  tint,
  gait,
}: {
  url: string;
  show: string[];
  scale: number;
  tint?: string;
  gait: MutableRefObject<Gait>;
}) {
  const { scene, animations } = useGLTF(url);
  const allow = useMemo(() => new Set(show), [show]);
  const clone = useMemo(() => {
    const next = cloneSkeleton(scene);
    const tintColor = tint ? new THREE.Color(tint) : null;
    next.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mesh.material = src.map((mat) => {
          const copy = mat.clone();
          const colored = copy as THREE.MeshStandardMaterial;
          if (tintColor && colored.color) colored.color.multiply(tintColor);
          return copy;
        });
      }
      if (PROP.test(obj.name) && !BODY.test(obj.name) && !allow.has(obj.name)) obj.visible = false;
    });
    return next;
  }, [scene, allow, tint]);
  const ref = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, clone);
  const mode = useRef<Gait["act"]>("idle");
  const breath = useRef(Math.random() * Math.PI * 2);
  const rate = useRef(0.75 + Math.random() * 0.7);

  useEffect(() => {
    const idle = actions.Idle;
    if (!idle) return;
    idle.reset();
    idle.time = Math.random() * idle.getClip().duration;
    idle.fadeIn(0.15).play();
    return () => {
      idle.fadeOut(0.1);
    };
  }, [actions]);

  useFrame(({ clock }) => {
    const want = gait.current.act;
    if (want !== mode.current) {
      const prev = actions[clipFor(mode.current)];
      const next = actions[clipFor(want)];
      prev?.fadeOut(0.1);
      if (next) {
        const once = want === "attack" || want === "death";
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
        next.clampWhenFinished = once;
        next.reset();
        if (want === "idle") next.time = breath.current % next.getClip().duration;
        next.fadeIn(0.08).play();
      }
      mode.current = want;
    }
    if (ref.current && want === "idle") {
      const puff = 1 + Math.sin(clock.elapsedTime * rate.current + breath.current) * 0.02;
      ref.current.scale.set(scale, scale * puff, scale);
    } else if (ref.current) {
      ref.current.scale.set(scale, scale, scale);
    }
    if (want === "walk") {
      const root = clone.getObjectByName("root");
      if (root) {
        root.position.x = 0;
        root.position.z = 0;
      }
      const hips = clone.getObjectByName("hips");
      if (hips) {
        hips.position.x = 0;
        hips.position.z = 0;
      }
    }
    paint(clone, gait.current.fade);
  });

  return (
    <group ref={ref} scale={scale}>
      <primitive object={clone} />
    </group>
  );
}

function clipFor(act: Gait["act"]) {
  if (act === "walk") return "Walking_A";
  if (act === "attack") return "1H_Melee_Attack_Slice_Horizontal";
  if (act === "death") return "Death_A";
  return "Idle";
}

export function StonePerson({
  type,
  white,
  gait,
}: {
  type: PieceSymbol;
  white: boolean;
  cast: PeopleCast;
  gait: MutableRefObject<Gait>;
}) {
  const look = LOOK[type];
  return (
    <WarUnit
      url={white ? look.w : look.b}
      show={look.show}
      scale={look.scale}
      tint={!white ? look.darkTint : undefined}
      gait={gait}
    />
  );
}

export function WarCorpse({
  type,
  white,
  cast,
  delay,
  onDone,
}: {
  type: PieceSymbol;
  white: boolean;
  cast: PeopleCast;
  delay: number;
  onDone: () => void;
}) {
  const gait = useRef<Gait>({ phase: 0, amp: 0, act: "idle", fade: 1 });
  const born = useRef<number | null>(null);
  const done = useRef(false);
  const [show, setShow] = useState(true);

  useFrame(({ clock }) => {
    if (born.current == null) born.current = clock.elapsedTime;
    const age = clock.elapsedTime - born.current;
    if (age > delay) gait.current.act = "death";
    const fadeAt = delay + 1.7;
    if (age > fadeAt) {
      const u = Math.min(1, (age - fadeAt) / 2.4);
      gait.current.fade = 1 - u;
      if (u >= 1 && !done.current) {
        done.current = true;
        setShow(false);
        onDone();
      }
    }
  });

  if (!show) return null;
  return <StonePerson type={type} white={white} cast={cast} gait={gait} />;
}
