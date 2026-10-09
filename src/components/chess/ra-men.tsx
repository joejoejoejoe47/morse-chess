import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import type { PieceSymbol } from "chess.js";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { asset } from "@/lib/base";
import type { Gait } from "@/components/chess/stone-people";

const KING = asset("/units/fantasy/king.gltf");
const QUEEN = asset("/units/fantasy/queen.gltf");
const BISHOP = asset("/units/fantasy/bishop.gltf");
const KNIGHT = asset("/units/fantasy/knight.gltf");
const ROOK = asset("/units/fantasy/rook.gltf");
const PAWN = asset("/units/fantasy/pawn.gltf");
const RA_ANIMS = asset("/units/fantasy/anims.glb");
const RA_SWORD = asset("/avatars/swords/devil.glb");

// Headed rangers and peasants — the same men the preview draws. Do not swap in a
// headless outfit and hide the skinned mesh; that leaves only the sword.
const RA_URL: Record<PieceSymbol, string> = {
  k: KING,
  q: QUEEN,
  b: BISHOP,
  n: KNIGHT,
  r: ROOK,
  p: PAWN,
};

const RA_ATTACK: Record<PieceSymbol, string[]> = {
  k: ["Sword_Heavy_Combo"],
  b: ["Sword_Regular_Combo"],
  n: ["Sword_Dash", "Sword_Regular_B"],
  r: ["Sword_Regular_B", "Sword_Regular_C"],
  q: ["Sword_Regular_Combo"],
  p: ["Sword_Regular_A"],
};

const ARM = /^(clavicle_|upperarm_|lowerarm_|hand_|index_|middle_|ring_|pinky_|thumb_)/;

function normalWalk(clips: THREE.AnimationClip[]) {
  const walk = clips.find((clip) => clip.name === "Walk_Carry_Loop");
  const idle = clips.find((clip) => clip.name === "Idle_No_Loop");
  if (!walk || !idle) return null;
  const still = new Map(idle.tracks.map((track) => [track.name, track]));
  const tracks = walk.tracks.map((track) => {
    if (!ARM.test(track.name)) return track.clone();
    const pose = still.get(track.name);
    if (!pose) return track.clone();
    const size = track.getValueSize();
    const values = new Float32Array(track.times.length * size);
    for (let i = 0; i < track.times.length; i++) {
      for (let k = 0; k < size; k++) values[i * size + k] = pose.values[k] ?? 0;
    }
    return track.ValueTypeName === "quaternion"
      ? new THREE.QuaternionKeyframeTrack(track.name, track.times, values)
      : new THREE.VectorKeyframeTrack(track.name, track.times, values);
  });
  return new THREE.AnimationClip("Walk_Normal_Loop", walk.duration, tracks);
}

useGLTF.preload(KING);
useGLTF.preload(QUEEN);
useGLTF.preload(BISHOP);
useGLTF.preload(KNIGHT);
useGLTF.preload(ROOK);
useGLTF.preload(PAWN);
useGLTF.preload(RA_ANIMS);
useGLTF.preload(RA_SWORD);
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

export function raUnitUrl(type: PieceSymbol) {
  return RA_URL[type];
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
}) {
  const gltf = useGLTF(url);
  const bladeFile = useGLTF(RA_SWORD);
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
      mesh.material = list.map((mat) => {
        const copy = mat.clone() as THREE.MeshStandardMaterial;
        copy.vertexColors = false;
        copy.transparent = false;
        copy.opacity = 1;
        copy.depthWrite = true;
        copy.side = THREE.DoubleSide;
        copy.alphaTest = 0;
        if (mesh.isSkinnedMesh) copy.skinning = true;
        if (/hair|brow/i.test(copy.name)) copy.color.set("#1a140f");
        else if (/ranger|peasant/i.test(copy.name)) {
          copy.emissive = new THREE.Color(team === "blue" ? "#2563eb" : "#dc2626");
          copy.emissiveIntensity = 0.45;
          if (copy.map) copy.emissiveMap = copy.map;
        }
        return copy;
      });
    });
    if (role === "k" || role === "q") {
      const hood =
        obj.getObjectByName("Male_Ranger_Head_Hood") || obj.getObjectByName("Female_Ranger_Head_Hood");
      if (hood) hood.visible = false;
    }
    const hand = obj.getObjectByName("hand_r");
    const source = bladeFile.scene.getObjectByName("1H_Sword") ?? bladeFile.scene;
    if (hand && source) {
      const blade = source.clone(true);
      blade.name = "Blade";
      blade.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.frustumCulled = false;
        }
      });
      blade.rotation.set(0, 0, 0);
      blade.position.set(0, 0, 0);
      blade.scale.set(1, 1, 1);
      blade.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(blade).getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z, 0.001);
      blade.scale.setScalar(0.48 / longest);
      if (size.x >= size.y && size.x >= size.z) blade.rotation.z = Math.PI / 2;
      else if (size.z >= size.y && size.z >= size.x) blade.rotation.x = -Math.PI / 2;
      blade.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(blade);
      const center = box.getCenter(new THREE.Vector3());
      blade.position.set(-center.x, -box.min.y, -center.z);
      hand.add(blade);
    }
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(1.52 / (size.y || 1));
    obj.updateMatrixWorld(true);
    obj.position.y -= new THREE.Box3().setFromObject(obj).min.y;
    obj.userData.fit = obj.scale.x || 1;
    widenBones(obj);
    return obj;
  }, [gltf.scene, bladeFile.scene, url, team, role]);
  const anims = useGLTF(RA_ANIMS);
  const clips = useMemo(() => {
    const walk = normalWalk(anims.animations);
    return walk ? [...anims.animations, walk] : anims.animations;
  }, [anims.animations]);
  const { actions, mixer } = useAnimations(clips, scene);
  const mode = useRef("");
  const seq = useRef(0);
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
    next.fadeIn(0.1).play();
  };
  useEffect(() => {
    const onDone = (event: { action: THREE.AnimationAction }) => {
      if (gait.current.act !== "attack") return;
      const chain = RA_ATTACK[role];
      if (event.action.getClip().name !== chain[seq.current]) return;
      seq.current += 1;
      if (seq.current >= chain.length) return;
      playNamed(chain[seq.current], true);
    };
    mixer.addEventListener("finished", onDone);
    return () => mixer.removeEventListener("finished", onDone);
  }, [mixer, role, actions, gait]);
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
      seq.current = 0;
      scene.userData.hold = 0;
      if (want === "attack") playNamed(RA_ATTACK[role][0], true);
      else if (want === "walk") playNamed("Walk_Normal_Loop", false);
      else if (want === "death") playNamed("Hit_Knockback", true);
      else playNamed("Idle_Shield_Loop", false);
    }
  });
  return <primitive object={scene} />;
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
    const fall = 1.5;
    const lie = 2.2;
    const fade = 1.4;
    if (t < delay) {
      gait.current.act = "idle";
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
