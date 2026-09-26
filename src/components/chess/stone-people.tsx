import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useGLTF } from "@react-three/drei";
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
    scale: 0.76,
  },
  q: {
    w: "/units/rogue-hooded.glb",
    b: "/units/skeleton-rogue.glb",
    show: ["Knife", "Knife_Offhand", "Rogue_Cape", "Rogue_Head_Hooded", "Skeleton_Rogue_Hood", "Skeleton_Rogue_Cape", "Skeleton_Rogue_Head"],
    scale: 0.72,
  },
  b: {
    w: "/units/mage.glb",
    b: "/units/skeleton-mage.glb",
    show: ["2H_Staff", "Mage_Hat", "Mage_Cape", "Skeleton_Mage_Hat"],
    scale: 0.7,
  },
  n: {
    w: "/units/barbarian.glb",
    b: "/units/skeleton-warrior.glb",
    show: ["1H_Axe", "Barbarian_Round_Shield", "Barbarian_Hat", "Skeleton_Warrior_Helmet"],
    scale: 0.72,
  },
  r: {
    w: "/units/knight.glb",
    b: "/units/knight.glb",
    show: ["1H_Sword", "Rectangle_Shield", "Knight_Helmet"],
    scale: 0.84,
    darkTint: "#3e3832",
  },
  p: {
    w: "/units/rogue.glb",
    b: "/units/skeleton-minion.glb",
    show: ["Knife", "Rogue_Cape", "Skeleton_Minion_Cloak"],
    scale: 0.62,
  },
};

const TOY_CLIPS = {
  idle: "Idle",
  walk: "Walking_A",
  attack: "1H_Melee_Attack_Slice_Horizontal",
  death: "Death_A",
};

const LIFE_CLIPS = {
  idle: "Idle",
  walk: "Walk",
  attack: "SwordSlash",
  death: "Death",
};

const LIFE: Record<PieceSymbol, { w: string; b: string; scale: number; darkTint?: string }> = {
  k: { w: "/life/Knight_Golden_Male.glb", b: "/life/Knight_Male.glb", scale: 0.7 },
  q: { w: "/life/Knight_Golden_Female.glb", b: "/life/Soldier_Female.glb", scale: 0.66 },
  b: { w: "/life/Wizard.glb", b: "/life/Wizard.glb", scale: 0.66 },
  n: { w: "/life/Viking_Male.glb", b: "/life/Ninja_Male.glb", scale: 0.66 },
  r: { w: "/life/BlueSoldier_Male.glb", b: "/life/Soldier_Male.glb", scale: 0.68 },
  p: { w: "/life/Casual_Female.glb", b: "/life/Soldier_Female.glb", scale: 0.56 },
};

type Clips = { idle: string; walk: string; attack: string; death: string };

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
  clips,
  gait,
}: {
  url: string;
  show: string[];
  scale: number;
  tint?: string;
  clips: Clips;
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
        const copies = src.map((mat) => {
          const copy = mat.clone();
          const colored = copy as THREE.MeshStandardMaterial;
          if (tintColor && colored.color) colored.color.multiply(tintColor);
          return copy;
        });
        mesh.material = copies.length === 1 ? copies[0] : copies;
      }
      if (PROP.test(obj.name) && !BODY.test(obj.name) && !allow.has(obj.name)) obj.visible = false;
    });
    return next;
  }, [scene, allow, tint]);
  const ref = useRef<THREE.Group>(null);
  const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone]);
  const actions = useMemo(() => {
    const map: Record<string, THREE.AnimationAction> = {};
    for (const clip of animations) map[clip.name] = mixer.clipAction(clip);
    return map;
  }, [animations, mixer]);
  const mode = useRef<Gait["act"]>("idle");
  const breath = useRef(Math.random() * Math.PI * 2);
  const rate = useRef(0.75 + Math.random() * 0.7);

  useEffect(() => {
    const idle = actions.Idle;
    if (!idle) return;
    idle.reset();
    idle.time = Math.random() * idle.getClip().duration;
    idle.play();
    return () => {
      mixer.stopAllAction();
    };
  }, [actions, mixer]);

  useFrame(({ clock }, raw) => {
    mixer.update(Math.min(raw, 0.05));
    const want = gait.current.act;
    if (want !== mode.current) {
      const prev = actions[clipName(clips, mode.current)];
      const next = actions[clipName(clips, want)];
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
      for (const name of ["root", "hips", "Bone", "Hips"]) {
        const bone = clone.getObjectByName(name);
        if (!bone) continue;
        bone.position.x = 0;
        bone.position.z = 0;
      }
    }
    if (gait.current.fade < 0.99) paint(clone, gait.current.fade);
  });

  return (
    <group ref={ref} scale={scale}>
      <primitive object={clone} />
    </group>
  );
}

function clipName(clips: Clips, act: Gait["act"]) {
  if (act === "walk") return clips.walk;
  if (act === "attack") return clips.attack;
  if (act === "death") return clips.death;
  return clips.idle;
}

export function StonePerson({
  type,
  white,
  life,
  gait,
}: {
  type: PieceSymbol;
  white: boolean;
  cast: PeopleCast;
  life?: boolean;
  gait: MutableRefObject<Gait>;
}) {
  const look = life ? LIFE[type] : LOOK[type];
  return (
    <WarUnit
      url={white ? look.w : look.b}
      show={life ? [] : LOOK[type].show}
      scale={look.scale}
      tint={!white ? look.darkTint : undefined}
      clips={life ? LIFE_CLIPS : TOY_CLIPS}
      gait={gait}
    />
  );
}

export function WarCorpse({
  type,
  white,
  cast,
  life,
  delay,
  onDone,
}: {
  type: PieceSymbol;
  white: boolean;
  cast: PeopleCast;
  life?: boolean;
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
  return <StonePerson type={type} white={white} cast={cast} life={life} gait={gait} />;
}
