import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import type { PieceSymbol } from "chess.js";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { asset } from "@/lib/base";
import type { Gait } from "@/components/chess/stone-people";

const COURT = asset("/ra/court.glb");
const KING = asset("/ra/king.glb");
const QUEEN = asset("/ra/queen.glb");
const BISHOP = asset("/ra/bishop.glb");
const KNIGHT = asset("/ra/knight.glb");
const PAWN = asset("/ra/pawn.glb");

/** Quaternius clip each piece's fight is timed to. The new models do not share that skeleton,
 *  so the body follows the clip's beats (lunges, spins, slams) and the armored king also plays his own fight idle. */
const RA_BEAT: Record<PieceSymbol, string> = {
  k: "Sword_Heavy_Combo",
  n: "Sword_Dash",
  q: "Sword_Regular_Combo",
  r: "Sword_Regular_B",
  b: "Sword_Regular_C",
  p: "Sword_Regular_A",
};

const RA_URL: Record<PieceSymbol, string> = {
  k: KING,
  q: QUEEN,
  b: BISHOP,
  n: KNIGHT,
  r: PAWN,
  p: PAWN,
};

const HEIGHT: Record<PieceSymbol, number> = {
  k: 1.28,
  q: 1.16,
  b: 1.05,
  n: 1.12,
  r: 1.46,
  p: 0.92,
};

export function courtFightMs(type: PieceSymbol) {
  if (type === "k") return 6400;
  if (type === "n") return 5200;
  if (type === "r") return 4800;
  if (type === "q") return 4200;
  if (type === "b") return 3800;
  return 3000;
}

useGLTF.preload(COURT);
useGLTF.preload(KING);
useGLTF.preload(QUEEN);
useGLTF.preload(BISHOP);
useGLTF.preload(KNIGHT);
useGLTF.preload(PAWN);

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

/** 65 bones need a 20×20 float texture, which some GPUs drop. A 32×32 power-of-two texture still skins. */
function widenBones(root: THREE.Object3D) {
  const seen = new Set<THREE.Skeleton>();
  root.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton || seen.has(mesh.skeleton)) return;
    seen.add(mesh.skeleton);
    const skeleton = mesh.skeleton;
    skeleton.computeBoneTexture = () => {
      const size = 32;
      const data = new Float32Array(size * size * 4);
      const src = skeleton.boneMatrices;
      if (src) data.set(src.subarray(0, Math.min(src.length, skeleton.bones.length * 16)));
      const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
      tex.needsUpdate = true;
      skeleton.boneMatrices = data;
      skeleton.boneTexture = tex;
      return skeleton;
    };
  });
}

function plant(obj: THREE.Object3D, height: number) {
  obj.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(height / (size.y || 1));
  obj.updateMatrixWorld(true);
  obj.position.y -= new THREE.Box3().setFromObject(obj).min.y;
  obj.userData.fit = obj.scale.x || 1;
}

/** Court floor (top of the carpet) sits just under the chessboard, in the open aisle. */
export function CourtRoom() {
  const gltf = useGLTF(COURT);
  const scene = useMemo(() => {
    const obj = gltf.scene.clone(true);
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    });
    return obj;
  }, [gltf.scene]);
  return <primitive object={scene} position={[1.2, -0.344, 3.1]} />;
}

export function raUnitUrl(type: PieceSymbol) {
  return RA_URL[type];
}

function ease(t: number) {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/** One fight per piece. Kings are the long one, knights the next. Beats follow the Quaternius clip named in RA_BEAT. */
function poseFight(role: PieceSymbol, age: number, group: THREE.Group, sword: THREE.Object3D | null) {
  group.position.set(0, 0, 0);
  group.rotation.set(0, 0, 0);
  const slash = (turns: number, dip: number) => {
    if (!sword) return;
    const rest = sword.userData.rest as THREE.Euler | undefined;
    if (rest) sword.rotation.copy(rest);
    sword.rotateZ(turns);
    sword.rotateX(dip);
  };
  if (role === "k") {
    // Heavy combo: circle, lunge, reverse cut, leap smash, spinning finish.
    if (age < 0.8) {
      const u = ease(age / 0.8);
      group.rotation.y = u * Math.PI * 2;
      group.position.y = Math.sin(u * Math.PI) * 0.16;
    } else if (age < 1.7) {
      const u = ease((age - 0.8) / 0.9);
      group.position.z = Math.sin(u * Math.PI) * 0.62;
      group.rotation.x = -Math.sin(u * Math.PI) * 0.4;
    } else if (age < 2.7) {
      const u = (age - 1.7) / 1;
      group.rotation.y = Math.PI + u * Math.PI * 1.4;
      group.position.x = Math.sin(u * Math.PI) * 0.42;
    } else if (age < 4.1) {
      const u = (age - 2.7) / 1.4;
      group.position.y = Math.sin(Math.min(1, u) * Math.PI) * 0.86;
      group.position.z = Math.sin(Math.min(1, u) * Math.PI) * 0.48;
      group.rotation.x = -Math.sin(Math.min(1, u) * Math.PI) * 0.7;
    } else if (age < 5.4) {
      const u = (age - 4.1) / 1.3;
      group.rotation.y = u * Math.PI * 4;
      group.position.z = Math.sin(u * Math.PI) * 0.55;
    } else {
      const u = ease((age - 5.4) / 1);
      group.position.z = Math.sin(u * Math.PI) * 0.9;
      group.rotation.x = -Math.sin(u * Math.PI) * 0.55;
    }
    slash(Math.sin(age * 3.2) * 1.1, -0.4);
    return;
  }
  if (role === "n") {
    // Dash combo: charge, two cuts, leap thrust.
    if (age < 0.45) {
      group.position.z = -0.25 * (1 - age / 0.45);
      group.rotation.x = 0.25;
    } else if (age < 1.3) {
      const u = (age - 0.45) / 0.85;
      group.position.z = Math.sin(u * Math.PI) * 0.7;
      group.rotation.y = Math.sin(u * Math.PI * 2) * 0.8;
    } else if (age < 2.3) {
      const u = (age - 1.3) / 1;
      group.rotation.y = -Math.sin(u * Math.PI) * 1.4;
      group.position.x = Math.sin(u * Math.PI) * 0.35;
    } else if (age < 3.6) {
      const u = (age - 2.3) / 1.3;
      group.position.y = Math.sin(Math.min(1, u) * Math.PI) * 0.55;
      group.position.z = Math.sin(Math.min(1, u) * Math.PI) * 0.5;
    } else {
      const u = ease((age - 3.6) / 1.4);
      group.position.z = Math.sin(u * Math.PI) * 0.8;
      group.rotation.x = -0.45 * Math.sin(u * Math.PI);
    }
    slash(Math.sin(age * 6) * 1.6, Math.sin(age * 3) * 0.6);
    return;
  }
  if (role === "q") {
    const u = age / 4.2;
    group.rotation.y = u * Math.PI * 3;
    group.position.z = Math.sin(age * 2.2) * 0.28;
    group.position.y = Math.abs(Math.sin(age * 1.6)) * 0.12;
    group.rotation.x = Math.sin(age * 2.2) * -0.25;
    slash(Math.sin(age * 2.4) * 0.9, -0.2);
    return;
  }
  if (role === "r") {
    // Heavy pounds. The club arm swings on its own.
    const u = age % 1.15;
    group.position.y = u < 0.45 ? (u / 0.45) * 0.28 : (1 - (u - 0.45) / 0.7) * 0.28;
    group.rotation.x = u < 0.45 ? -0.35 * (u / 0.45) : 0.55 * ((u - 0.45) / 0.7);
    group.position.z = Math.max(0, group.rotation.x) * 0.45;
    return;
  }
  if (role === "b") {
    if (age < 1.1) {
      const u = age / 1.1;
      group.rotation.x = -Math.sin(u * Math.PI) * 0.7;
      group.position.y = Math.sin(u * Math.PI) * 0.2;
    } else if (age < 2.2) {
      const u = (age - 1.1) / 1.1;
      group.rotation.y = u * Math.PI * 2;
      group.position.x = Math.sin(u * Math.PI) * 0.3;
    } else {
      const u = (age - 2.2) / 1.4;
      group.rotation.x = -Math.sin(Math.min(1, u) * Math.PI) * 0.85;
      group.position.z = Math.sin(Math.min(1, u) * Math.PI) * 0.4;
    }
    return;
  }
  // Pawn: three fast jabs, Quaternius Sword_Regular_A rhythm.
  const jab = age % 0.7;
  group.position.z = Math.sin((jab / 0.7) * Math.PI) * 0.38;
  group.rotation.x = -Math.sin((jab / 0.7) * Math.PI) * 0.35;
  slash(Math.sin(age * 9) * 0.8, 0);
}

function swingLooseArm(root: THREE.Object3D, age: number, act: string) {
  root.traverse((node) => {
    const bone = node as THREE.Bone;
    if (!bone.isBone) return;
    if (!/rightarm|right.?fore/i.test(bone.name)) return;
    if (!bone.userData.rest) bone.userData.rest = bone.quaternion.clone();
    bone.quaternion.copy(bone.userData.rest as THREE.Quaternion);
    if (act === "attack") bone.rotateX(Math.sin(age * 8) * 0.9);
    else if (act === "walk") bone.rotateX(Math.sin(age * 6) * 0.25);
  });
}

export function RaPawn({
  gait,
  url,
  team,
  role,
}: {
  gait: React.MutableRefObject<Gait>;
  url: string;
  team: "blue" | "red";
  role: PieceSymbol;
  tint?: string;
}) {
  const file = RA_URL[role] || url;
  const gltf = useGLTF(file);
  const swordRef = useRef<THREE.Object3D | null>(null);
  const scene = useMemo(() => {
    const obj = cloneSkeleton(gltf.scene);
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.visible = true;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // Keep a single Material (not a one-item array) — Three skips array materials when the
      // geometry has no groups, which made every RA piece except the procedural rook vanish.
      const copies = list.map((mat) => {
        const copy = mat.clone() as THREE.MeshStandardMaterial;
        copy.transparent = false;
        copy.opacity = 1;
        copy.depthWrite = true;
        copy.side = THREE.DoubleSide;
        if (team === "red") copy.color.multiplyScalar(0.78);
        return copy;
      });
      mesh.material = copies.length === 1 ? copies[0] : copies;
    });
    const sword = obj.getObjectByName("Sword");
    if (sword) {
      sword.userData.rest = sword.rotation.clone();
      swordRef.current = sword;
    }
    plant(obj, HEIGHT[role]);
    widenBones(obj);
    return obj;
  }, [gltf.scene, role, team]);
  const clips = gltf.animations;
  const { actions } = useAnimations(clips, scene);
  const mode = useRef("");
  const attackAt = useRef(0);
  const flourish = useRef<THREE.Group>(null);
  const playNamed = (name: string, once: boolean) => {
    const list = Object.values(actions).filter((clip): clip is THREE.AnimationAction => Boolean(clip));
    const next = list.find((clip) => clip.getClip().name === name);
    list.forEach((clip) => {
      if (clip !== next && clip.isRunning()) clip.fadeOut(0.12);
    });
    if (!next) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(0.12).play();
  };
  useFrame(() => {
    const base = (scene.userData.fit as number) || 1;
    scene.scale.setScalar(base);
    if (gait.current.fade < 0.995) paint(scene, gait.current.fade);
    else if (scene.userData.faded) {
      paint(scene, 1);
      scene.userData.faded = 0;
    }
    if (gait.current.fade < 0.995) scene.userData.faded = 1;
    const act = gait.current.act;
    const want = act === "attack" ? "attack" : act === "walk" || act === "charge" ? "walk" : act === "death" ? "death" : "idle";
    if (want !== mode.current) {
      mode.current = want;
      attackAt.current = performance.now();
      if (clips.length) {
        if (want === "attack" || want === "idle") playNamed("FIGHTIDLE_Root", false);
        else if (want === "walk") playNamed("WALK_player_Root", false);
        else playNamed("FIGHTIDLE_Root", false);
      }
    }
    const age = (performance.now() - attackAt.current) / 1000;
    const group = flourish.current;
    if (!group) return;
    if (want === "attack") poseFight(role, age, group, swordRef.current);
    else if (want === "death") {
      group.position.set(0, 0, 0);
      group.rotation.set(Math.min(1.4, age * 1.6), 0, age * 0.4);
    } else if (want === "walk" && !clips.length) {
      group.position.set(0, Math.abs(Math.sin(gait.current.phase)) * 0.05, 0);
      group.rotation.set(0, 0, Math.sin(gait.current.phase) * 0.06);
    } else {
      group.position.set(0, Math.sin(age * 1.6) * 0.015, 0);
      group.rotation.set(0, 0, 0);
    }
    if (!clips.length && role === "p") swingLooseArm(scene, age, want);
  });
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.26, 0.36, 22]} />
        <meshBasicMaterial color={team === "blue" ? "#f4efe4" : "#141414"} />
      </mesh>
      <group ref={flourish}>
        {role === "r" ? <ScarTroll gait={gait} team={team} /> : <primitive object={scene} />}
      </group>
    </>
  );
}

/** Stand-in rook. The giant scarred troll file was not in the upload. */
function ScarTroll({ gait, team }: { gait: React.MutableRefObject<Gait>; team: "blue" | "red" }) {
  const arm = useRef<THREE.Group>(null);
  const born = useRef(0);
  const mode = useRef("");
  const skin = team === "blue" ? "#7f8a6e" : "#3e4638";
  const scar = "#2a211c";
  const cloth = team === "blue" ? "#6a3a28" : "#241610";
  useFrame(() => {
    const act = gait.current.act;
    if (act !== mode.current) {
      mode.current = act;
      born.current = performance.now();
    }
    if (!arm.current) return;
    const age = (performance.now() - born.current) / 1000;
    const wind = act === "attack" ? Math.sin(age * 5.4) : act === "walk" ? Math.sin(gait.current.phase) * 0.35 : Math.sin(age * 1.4) * 0.08;
    arm.current.rotation.x = -0.55 + wind * (act === "attack" ? 1.35 : 0.5);
    arm.current.rotation.z = act === "attack" ? Math.sin(age * 5.4) * 0.35 : 0.15;
  });
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[-0.16, 0.28, 0]} castShadow>
        <capsuleGeometry args={[0.09, 0.28, 6, 8]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
      <mesh position={[0.16, 0.28, 0]} castShadow>
        <capsuleGeometry args={[0.09, 0.28, 6, 8]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.78, 0]} scale={[1.15, 1, 0.9]} castShadow>
        <sphereGeometry args={[0.34, 18, 14]} />
        <meshStandardMaterial color={skin} roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.7, 0.02]} rotation={[0.2, 0, 0.4]}>
        <boxGeometry args={[0.02, 0.28, 0.01]} />
        <meshStandardMaterial color={scar} roughness={1} />
      </mesh>
      <mesh position={[0.08, 0.86, 0.16]} rotation={[0.4, 0, -0.5]}>
        <boxGeometry args={[0.015, 0.22, 0.01]} />
        <meshStandardMaterial color={scar} roughness={1} />
      </mesh>
      <mesh position={[-0.1, 0.62, 0.18]} rotation={[0.3, 0, 0.8]}>
        <boxGeometry args={[0.018, 0.16, 0.01]} />
        <meshStandardMaterial color={scar} roughness={1} />
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.16, 12]} />
        <meshStandardMaterial color={cloth} roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.22, 0.02]} castShadow>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshStandardMaterial color={skin} roughness={0.86} />
      </mesh>
      <mesh position={[-0.08, 1.28, 0.14]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
      </mesh>
      <mesh position={[0.08, 1.28, 0.14]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
      </mesh>
      <mesh position={[0.12, 1.16, 0.12]} rotation={[0, 0, -0.6]}>
        <boxGeometry args={[0.012, 0.12, 0.008]} />
        <meshStandardMaterial color={scar} roughness={1} />
      </mesh>
      <mesh position={[-0.42, 0.95, 0]} rotation={[0.4, 0, 0.5]} castShadow>
        <capsuleGeometry args={[0.08, 0.34, 5, 8]} />
        <meshStandardMaterial color={skin} roughness={0.9} />
      </mesh>
      <group ref={arm} position={[0.42, 1.05, 0]}>
        <mesh position={[0.12, -0.18, 0]} rotation={[0.2, 0, -0.4]} castShadow>
          <capsuleGeometry args={[0.09, 0.36, 5, 8]} />
          <meshStandardMaterial color={skin} roughness={0.9} />
        </mesh>
        <mesh position={[0.28, -0.15, 0.05]} rotation={[0.3, 0, 0.4]} castShadow>
          <cylinderGeometry args={[0.045, 0.06, 0.85, 8]} />
          <meshStandardMaterial color="#6b4a2a" roughness={0.8} />
        </mesh>
        <mesh position={[0.46, -0.42, 0.12]} castShadow>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshStandardMaterial color="#5a3e22" roughness={0.75} />
        </mesh>
      </group>
    </group>
  );
}

export function RaCorpse({
  role,
  team,
  delay,
  onDone,
}: {
  role: PieceSymbol;
  team: "blue" | "red";
  delay: number;
  onDone: () => void;
}) {
  const gait = useRef<Gait>({ phase: 0, amp: 0, act: "idle", fade: 1 });
  const born = useRef<number | null>(null);
  const done = useRef(false);
  useFrame(({ clock }) => {
    if (born.current == null) born.current = clock.elapsedTime;
    const t = clock.elapsedTime - born.current;
    const fall = 1.1;
    const lie = 1.4;
    const fade = 1.1;
    if (t < delay) {
      gait.current.act = "attack";
      gait.current.phase += 0.08;
      gait.current.fade = 1;
      return;
    }
    gait.current.act = "death";
    const after = t - delay;
    if (after < fall + lie) {
      gait.current.fade = 1;
      return;
    }
    const k = (after - fall - lie) / fade;
    gait.current.fade = Math.max(0, 1 - k);
    if (k >= 1 && !done.current) {
      done.current = true;
      onDone();
    }
  });
  return <RaPawn gait={gait} url={raUnitUrl(role)} team={team} role={role} />;
}

export const COURT_BEATS = RA_BEAT;
