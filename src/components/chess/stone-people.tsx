import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { PieceSymbol } from "chess.js";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export type PeopleCast = "stone" | "pipe" | "ring";
export type Gait = { phase: number; amp: number };

const PROP = /sword|shield|axe|knife|crossbow|throw|spell|wand|staff|mug|cape|helmet|hat|hood|cloak|badge/i;

const LOOK: Record<
  PieceSymbol,
  { w: string; b: string; show: string[]; scale: number }
> = {
  k: {
    w: "/units/knight.glb",
    b: "/units/skeleton-warrior.glb",
    show: ["1H_Sword", "Knight_Helmet", "Knight_Cape", "Skeleton_Warrior_Helmet", "Skeleton_Warrior_Cloak"],
    scale: 0.62,
  },
  q: {
    w: "/units/rogue-hooded.glb",
    b: "/units/skeleton-rogue.glb",
    show: ["Knife", "Knife_Offhand", "Rogue_Cape", "Skeleton_Rogue_Hood", "Skeleton_Rogue_Cape"],
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
    show: ["1H_Axe", "Barbarian_Hat", "Barbarian_Cape", "Skeleton_Warrior_Helmet"],
    scale: 0.58,
  },
  r: {
    w: "/units/barbarian.glb",
    b: "/units/skeleton-warrior.glb",
    show: ["2H_Axe", "Barbarian_Hat", "Skeleton_Warrior_Helmet", "Skeleton_Warrior_Cloak"],
    scale: 0.64,
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

function WarUnit({
  url,
  show,
  scale,
  gait,
}: {
  url: string;
  show: string[];
  scale: number;
  gait: MutableRefObject<Gait>;
}) {
  const { scene, animations } = useGLTF(url);
  const allow = useMemo(() => new Set(show), [show]);
  const clone = useMemo(() => {
    const next = cloneSkeleton(scene);
    next.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
      if (PROP.test(obj.name) && !allow.has(obj.name)) obj.visible = false;
    });
    return next;
  }, [scene, allow]);
  const ref = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, ref);
  const mode = useRef<"walk" | "idle">("idle");

  useEffect(() => {
    const idle = actions.Idle;
    idle?.reset().fadeIn(0.15).play();
    return () => {
      idle?.fadeOut(0.1);
    };
  }, [actions]);

  useFrame(() => {
    const want = gait.current.amp > 0.22 ? "walk" : "idle";
    if (want !== mode.current) {
      const next = want === "walk" ? actions.Walking_A : actions.Idle;
      const prev = mode.current === "walk" ? actions.Walking_A : actions.Idle;
      prev?.fadeOut(0.12);
      next?.reset().fadeIn(0.12).play();
      mode.current = want;
    }
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
  });

  return (
    <group ref={ref} scale={scale}>
      <primitive object={clone} />
    </group>
  );
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
  return <WarUnit url={white ? look.w : look.b} show={look.show} scale={look.scale} gait={gait} />;
}
