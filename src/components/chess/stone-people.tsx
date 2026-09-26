import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { PieceSymbol } from "chess.js";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { SpaceCrew } from "@/components/chess/space-crew";

export type PeopleCast = "stone" | "pipe" | "ring" | "wars" | "mario" | "lotr";
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

type CastLook = Record<PieceSymbol, { w: string; b: string; show: string[]; scale: number; darkTint?: string }>;

const WARS: CastLook = {
  k: { w: "/units/knight.glb", b: "/units/skeleton-warrior.glb", show: ["1H_Sword", "Knight_Helmet", "Knight_Cape", "Skeleton_Warrior_Helmet", "Skeleton_Warrior_Cloak"], scale: 0.78 },
  q: { w: "/units/rogue-hooded.glb", b: "/units/skeleton-rogue.glb", show: ["Knife", "Knife_Offhand", "Rogue_Head_Hooded", "Rogue_Cape", "Skeleton_Rogue_Hood", "Skeleton_Rogue_Cape"], scale: 0.7, darkTint: "#6a3040" },
  b: { w: "/units/mage.glb", b: "/units/skeleton-mage.glb", show: ["2H_Staff", "Mage_Hat", "Mage_Cape", "Skeleton_Mage_Hat"], scale: 0.68, darkTint: "#304060" },
  n: { w: "/units/barbarian.glb", b: "/units/skeleton-minion.glb", show: ["1H_Axe", "Barbarian_Hat", "Barbarian_Round_Shield", "Skeleton_Minion_Cloak"], scale: 0.74 },
  r: { w: "/units/rogue.glb", b: "/units/knight.glb", show: ["Knife", "Rogue_Cape", "1H_Sword", "Rectangle_Shield"], scale: 0.82, darkTint: "#2a3344" },
  p: { w: "/units/mage.glb", b: "/units/skeleton-warrior.glb", show: ["Mage_Cape", "1H_Sword"], scale: 0.52, darkTint: "#402028" },
};

const MARIO: CastLook = {
  k: { w: "/units/knight.glb", b: "/units/barbarian.glb", show: ["1H_Sword", "Knight_Helmet", "Knight_Cape", "1H_Axe", "Barbarian_Hat"], scale: 0.8 },
  q: { w: "/units/rogue-hooded.glb", b: "/units/skeleton-rogue.glb", show: ["Knife", "Knife_Offhand", "Rogue_Head_Hooded", "Rogue_Cape", "Skeleton_Rogue_Hood"], scale: 0.7, darkTint: "#3a2010" },
  b: { w: "/units/mage.glb", b: "/units/skeleton-mage.glb", show: ["2H_Staff", "Mage_Hat", "Mage_Cape", "Skeleton_Mage_Hat"], scale: 0.66, darkTint: "#204020" },
  n: { w: "/units/barbarian.glb", b: "/units/knight.glb", show: ["1H_Axe", "Barbarian_Round_Shield", "Barbarian_Hat", "1H_Sword", "Knight_Helmet"], scale: 0.72, darkTint: "#503018" },
  r: { w: "/units/rogue.glb", b: "/units/skeleton-warrior.glb", show: ["Knife", "Rogue_Cape", "1H_Sword", "Skeleton_Warrior_Helmet", "Skeleton_Warrior_Cloak"], scale: 0.84, darkTint: "#2a4018" },
  p: { w: "/units/rogue-hooded.glb", b: "/units/skeleton-minion.glb", show: ["Rogue_Head_Hooded", "Rogue_Cape", "Skeleton_Minion_Cloak", "1H_Sword"], scale: 0.5, darkTint: "#402010" },
};

const LOTR: CastLook = {
  k: { w: "/units/knight.glb", b: "/units/skeleton-warrior.glb", show: ["1H_Sword", "Knight_Helmet", "Knight_Cape", "Skeleton_Warrior_Helmet", "Skeleton_Warrior_Cloak"], scale: 0.8 },
  q: { w: "/units/rogue-hooded.glb", b: "/units/skeleton-rogue.glb", show: ["Knife", "Knife_Offhand", "Rogue_Head_Hooded", "Rogue_Cape", "Skeleton_Rogue_Hood", "Skeleton_Rogue_Cape"], scale: 0.72, darkTint: "#3a2820" },
  b: { w: "/units/mage.glb", b: "/units/skeleton-mage.glb", show: ["2H_Staff", "Mage_Hat", "Mage_Cape", "Skeleton_Mage_Hat"], scale: 0.7, darkTint: "#241c18" },
  n: { w: "/units/barbarian.glb", b: "/units/knight.glb", show: ["1H_Axe", "Barbarian_Hat", "Barbarian_Round_Shield", "1H_Sword", "Knight_Helmet", "Rectangle_Shield"], scale: 0.74, darkTint: "#1a1816" },
  r: { w: "/units/rogue.glb", b: "/units/skeleton-minion.glb", show: ["Knife", "Rogue_Cape", "1H_Sword", "Skeleton_Minion_Cloak"], scale: 0.86, darkTint: "#2a2420" },
  p: { w: "/units/mage.glb", b: "/units/skeleton-warrior.glb", show: ["Mage_Cape", "1H_Sword", "Skeleton_Warrior_Cloak"], scale: 0.54, darkTint: "#201814" },
};

const CASTS: Record<"wars" | "mario" | "lotr", CastLook> = { wars: WARS, mario: MARIO, lotr: LOTR };

const PARTY: Record<PieceSymbol, { w: string; b: string; h: number }> = {
  k: { w: "/party/w-k.png", b: "/party/b-k.png", h: 1.42 },
  q: { w: "/party/w-q.png", b: "/party/b-q.png", h: 1.38 },
  b: { w: "/party/w-b.png", b: "/party/b-b.png", h: 1.36 },
  n: { w: "/party/w-n.png", b: "/party/b-n.png", h: 1.22 },
  r: { w: "/party/w-r.png", b: "/party/b-r.png", h: 1.32 },
  p: { w: "/party/w-p.png", b: "/party/b-p.png", h: 0.92 },
};
for (const row of Object.values(PARTY)) {
  useTexture.preload(row.w);
  useTexture.preload(row.b);
}

const TOY_CLIPS = {
  idle: "Idle",
  walk: "Walking_A",
  attack: "1H_Melee_Attack_Slice_Horizontal",
  death: "Death_A",
};

type Clips = { idle: string; walk: string; attack: string; death: string };

const URLS = [
  ...new Set([
    ...Object.values(LOOK).flatMap((row) => [row.w, row.b]),
    ...Object.values(CASTS).flatMap((set) => Object.values(set).flatMap((row) => [row.w, row.b])),
  ]),
];
for (const url of URLS) useGLTF.preload(url);

function findNamed(root: THREE.Object3D, test: RegExp): THREE.Object3D | null {
  const hits: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (hits.length === 0 && test.test(obj.name)) hits.push(obj);
  });
  return hits[0] ?? null;
}

function findHand(root: THREE.Object3D): THREE.Object3D | null {
  return findNamed(root, /hand/i) && findNamed(root, /hand.*r|r.*hand/i);
}

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
  sword = false,
  clash = false,
  clip = null,
}: {
  url: string;
  show: string[];
  scale: number;
  tint?: string;
  clips: Clips;
  gait: MutableRefObject<Gait>;
  sword?: boolean;
  clash?: boolean;
  clip?: THREE.Plane | null;
}) {
  const { scene, animations } = useGLTF(url);
  const donor = useGLTF("/units/knight.glb");
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
          if (clip) {
            colored.clippingPlanes = [clip];
            colored.clipShadows = true;
          }
          return copy;
        });
        mesh.material = copies.length === 1 ? copies[0] : copies;
      }
      if (PROP.test(obj.name) && !BODY.test(obj.name) && !allow.has(obj.name)) obj.visible = false;
    });
    if (sword) {
      let found = false;
      next.traverse((obj) => {
        if (/sword/i.test(obj.name)) {
          obj.visible = true;
          found = true;
        }
      });
      if (!found) {
        const blade = donor.scene.getObjectByName("1H_Sword") ?? findNamed(donor.scene, /sword/i);
        const hand = findHand(next);
        if (blade && hand) {
          const copy = blade.clone(true);
          copy.visible = true;
          copy.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const copies = src.map((mat) => mat.clone());
            mesh.material = copies.length === 1 ? copies[0] : copies;
          });
          copy.position.copy(blade.position);
          copy.quaternion.copy(blade.quaternion);
          copy.scale.copy(blade.scale);
          hand.add(copy);
        }
      }
    }
    return next;
  }, [scene, allow, tint, sword, donor.scene, clip]);
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
  const fall = useRef(0);

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
        const duel = clash && want === "attack";
        next.timeScale = duel ? 0.7 : 1;
        next.setLoop(duel ? THREE.LoopRepeat : once ? THREE.LoopOnce : THREE.LoopRepeat, duel ? 2 : once ? 1 : Infinity);
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
    if (!ref.current) return;
    if (want === "death") {
      fall.current = Math.min(1, fall.current + Math.min(raw, 0.05) / 0.48);
      const k = 1 - (1 - fall.current) ** 3;
      ref.current.rotation.x = k * (Math.PI / 2);
      ref.current.position.y = k * 0.04;
    } else {
      fall.current = 0;
      ref.current.rotation.x = 0;
      ref.current.position.y = 0;
    }
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

function PictureSprite({
  src,
  h,
  gait,
  clip = null,
}: {
  src: string;
  h: number;
  gait: MutableRefObject<Gait>;
  clip?: THREE.Plane | null;
}) {
  const tex = useTexture(src);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const rig = useRef<THREE.Group>(null);
  const fall = useRef(0);
  const img = tex.image as { width?: number; height?: number };
  const aspect = img?.width && img?.height ? img.width / img.height : 0.66;

  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
  }, [tex]);

  useFrame(({ clock }, raw) => {
    const fade = gait.current.fade;
    if (mat.current) {
      mat.current.opacity = fade;
      mat.current.depthWrite = fade > 0.25;
    }
    if (!rig.current || !mesh.current) return;
    const dead = gait.current.act === "death";
    if (dead) fall.current = Math.min(1, fall.current + Math.min(raw, 0.05) / 0.48);
    else fall.current = 0;
    const k = 1 - (1 - fall.current) ** 3;
    const walk = gait.current.act === "walk";
    const bob = dead ? 0 : walk ? Math.abs(Math.sin(clock.elapsedTime * 8)) * 0.08 : Math.sin(clock.elapsedTime * 1.7) * 0.02;
    rig.current.rotation.x = k * (Math.PI / 2);
    rig.current.position.y = bob;
    mesh.current.rotation.z = gait.current.act === "attack" ? 0.28 : 0;
  });

  return (
    <group ref={rig}>
      <mesh ref={mesh} position={[0, h * 0.5, 0]}>
        <planeGeometry args={[h * aspect, h]} />
        <meshBasicMaterial
          ref={mat}
          map={tex}
          transparent
          side={THREE.DoubleSide}
          alphaTest={0.05}
          clippingPlanes={clip ? [clip] : []}
        />
      </mesh>
    </group>
  );
}

function PartySprite({
  type,
  white,
  gait,
  clip = null,
}: {
  type: PieceSymbol;
  white: boolean;
  gait: MutableRefObject<Gait>;
  clip?: THREE.Plane | null;
}) {
  const row = PARTY[type];
  return <PictureSprite src={white ? row.w : row.b} h={row.h} gait={gait} clip={clip} />;
}

export function StonePerson({
  type,
  white,
  cast,
  sword,
  clash,
  wing = "a",
  clip = null,
  gait,
}: {
  type: PieceSymbol;
  white: boolean;
  cast: PeopleCast;
  sword?: boolean;
  clash?: boolean;
  wing?: "a" | "b";
  clip?: THREE.Plane | null;
  gait: MutableRefObject<Gait>;
}) {
  if (cast === "mario") return <PartySprite type={type} white={white} gait={gait} clip={clip} />;
  if (cast === "wars") {
    return <SpaceCrew type={type} white={white} wing={wing} clip={clip} gait={gait} />;
  }
  const themed = cast === "lotr";
  const look = themed ? CASTS[cast][type] : LOOK[type];
  return (
    <WarUnit
      url={white ? look.w : look.b}
      show={look.show}
      scale={look.scale}
      tint={!white ? look.darkTint : undefined}
      clips={TOY_CLIPS}
      gait={gait}
      sword={sword}
      clash={clash}
      clip={clip}
    />
  );
}

export type KillStyle = "sword" | "fire" | "shot" | "slice";

function HalfBody({
  side,
  gait,
  person,
}: {
  side: "left" | "right";
  gait: MutableRefObject<Gait>;
  person: {
    type: PieceSymbol;
    white: boolean;
    cast: PeopleCast;
    sword?: boolean;
    wing?: "a" | "b";
  };
}) {
  const group = useRef<THREE.Group>(null);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(side === "left" ? -1 : 1, 0, 0), 0), [side]);
  const t = useRef(0);

  useFrame((_, raw) => {
    if (!group.current) return;
    t.current = Math.min(1, t.current + Math.min(raw, 0.1) / 0.7);
    const k = t.current;
    const dir = side === "left" ? -1 : 1;
    group.current.position.x = dir * k * 0.36;
    group.current.position.y = -k * k * 0.42;
    group.current.rotation.z = dir * k * 1.2;
    const world = new THREE.Vector3();
    group.current.getWorldPosition(world);
    if (side === "left") {
      plane.normal.set(-1, 0, 0);
      plane.constant = world.x;
    } else {
      plane.normal.set(1, 0, 0);
      plane.constant = -world.x;
    }
  });

  return (
    <group ref={group}>
      <StonePerson
        type={person.type}
        white={person.white}
        cast={person.cast}
        sword={person.sword}
        wing={person.wing}
        clash={false}
        clip={plane}
        gait={gait}
      />
    </group>
  );
}

export function WarCorpse({
  type,
  white,
  cast,
  sword,
  clash,
  wing = "a",
  style = "sword",
  delay,
  onDone,
}: {
  type: PieceSymbol;
  white: boolean;
  cast: PeopleCast;
  sword?: boolean;
  clash?: boolean;
  wing?: "a" | "b";
  style?: KillStyle;
  delay: number;
  onDone: () => void;
}) {
  const gait = useRef<Gait>({ phase: 0, amp: 0, act: clash ? "attack" : "idle", fade: 1 });
  const born = useRef<number | null>(null);
  const done = useRef(false);
  const [show, setShow] = useState(true);
  const [split, setSplit] = useState(false);
  const splitOnce = useRef(false);

  useFrame(({ clock }) => {
    if (born.current == null) born.current = clock.elapsedTime;
    const age = clock.elapsedTime - born.current;
    if (age > delay) {
      gait.current.act = "death";
      if (style === "slice" && !splitOnce.current) {
        splitOnce.current = true;
        setSplit(true);
      }
    }
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
  if (split) {
    const person = { type, white, cast, sword, wing };
    return (
      <>
        <HalfBody side="left" gait={gait} person={person} />
        <HalfBody side="right" gait={gait} person={person} />
      </>
    );
  }
  return <StonePerson type={type} white={white} cast={cast} sword={sword} clash={clash} wing={wing} gait={gait} />;
}
