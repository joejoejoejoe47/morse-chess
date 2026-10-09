import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import type { PieceSymbol } from "chess.js";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { asset } from "@/lib/base";
import type { Gait } from "@/components/chess/stone-people";

const MALE_RANGER = asset("/units/fantasy/male-ranger.gltf");
const FEMALE_RANGER = asset("/units/fantasy/female-ranger.gltf");
const MALE_PEASANT = asset("/units/fantasy/male-peasant.gltf");
const FEMALE_PEASANT = asset("/units/fantasy/female-peasant.gltf");
const HEAD_KING = asset("/units/fantasy/king.gltf");
const HEAD_QUEEN = asset("/units/fantasy/queen.gltf");
const HEAD_PAWN = asset("/units/fantasy/pawn.gltf");
const RA_ANIMS = asset("/units/fantasy/anims.glb");
const RA_SWORD = asset("/avatars/swords/devil.glb");

// Official Quaternius Modular Character Outfits (Fantasy): rangers and peasants.
const RA_URL: Record<PieceSymbol, string> = {
  k: MALE_RANGER,
  q: FEMALE_RANGER,
  b: FEMALE_PEASANT,
  n: MALE_RANGER,
  r: MALE_PEASANT,
  p: MALE_PEASANT,
};

const RA_HEAD: Record<PieceSymbol, string> = {
  k: HEAD_KING,
  q: HEAD_QUEEN,
  b: HEAD_QUEEN,
  n: HEAD_KING,
  r: HEAD_KING,
  p: HEAD_PAWN,
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

useGLTF.preload(MALE_RANGER);
useGLTF.preload(FEMALE_RANGER);
useGLTF.preload(MALE_PEASANT);
useGLTF.preload(FEMALE_PEASANT);
useGLTF.preload(HEAD_KING);
useGLTF.preload(HEAD_QUEEN);
useGLTF.preload(HEAD_PAWN);
useGLTF.preload(RA_ANIMS);
useGLTF.preload(RA_SWORD);

function isFaceMesh(name: string) {
  return /^(Eyes|Eyebrows|Hair_|SuperHero_|Superhero_)/.test(name);
}

function graftFace(outfit: THREE.Object3D, donor: THREE.Object3D) {
  let skeleton: THREE.Skeleton | null = null;
  let host: THREE.Object3D = outfit;
  outfit.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton) return;
    skeleton = mesh.skeleton;
    if (mesh.parent) host = mesh.parent;
  });
  if (!skeleton) return;
  const bones = skeleton;
  donor.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !isFaceMesh(mesh.name)) return;
    const copy = mesh.clone();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    copy.material = mats.map((mat) => mat.clone());
    copy.skeleton = bones;
    copy.bind(bones, copy.bindMatrix);
    copy.frustumCulled = false;
    copy.castShadow = false;
    host.add(copy);
  });
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

/** GPU skinning drops these 65-bone men (only the unskinned sword draws). Pose on the CPU instead. */
function bakeSkin(src: THREE.SkinnedMesh, dst: THREE.BufferAttribute) {
  src.updateMatrixWorld(true);
  src.skeleton.update();
  const pos = src.geometry.attributes.position;
  const idx = src.geometry.attributes.skinIndex;
  const wt = src.geometry.attributes.skinWeight;
  const bones = src.skeleton.boneMatrices;
  const bind = src.bindMatrix.elements;
  const inv = src.bindMatrixInverse.elements;
  const pa = pos.array as Float32Array;
  const ia = idx.array as ArrayLike<number>;
  const wa = wt.array as Float32Array;
  const out = dst.array as Float32Array;
  const count = pos.count;
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const x = pa[i3];
    const y = pa[i3 + 1];
    const z = pa[i3 + 2];
    const bx = bind[0] * x + bind[4] * y + bind[8] * z + bind[12];
    const by = bind[1] * x + bind[5] * y + bind[9] * z + bind[13];
    const bz = bind[2] * x + bind[6] * y + bind[10] * z + bind[14];
    const bw = bind[3] * x + bind[7] * y + bind[11] * z + bind[15];
    const i4 = i * 4;
    let ax = 0;
    let ay = 0;
    let az = 0;
    let aw = 0;
    for (let k = 0; k < 4; k++) {
      const wgt = wa[i4 + k];
      if (!wgt) continue;
      const b = ia[i4 + k] * 16;
      ax += (bones[b] * bx + bones[b + 4] * by + bones[b + 8] * bz + bones[b + 12] * bw) * wgt;
      ay += (bones[b + 1] * bx + bones[b + 5] * by + bones[b + 9] * bz + bones[b + 13] * bw) * wgt;
      az += (bones[b + 2] * bx + bones[b + 6] * by + bones[b + 10] * bz + bones[b + 14] * bw) * wgt;
      aw += (bones[b + 3] * bx + bones[b + 7] * by + bones[b + 11] * bz + bones[b + 15] * bw) * wgt;
    }
    out[i3] = inv[0] * ax + inv[4] * ay + inv[8] * az + inv[12] * aw;
    out[i3 + 1] = inv[1] * ax + inv[5] * ay + inv[9] * az + inv[13] * aw;
    out[i3 + 2] = inv[2] * ax + inv[6] * ay + inv[10] * az + inv[14] * aw;
  }
  dst.needsUpdate = true;
}

function showBodies(root: THREE.Object3D) {
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) skinned.push(mesh);
  });
  const pairs: { src: THREE.SkinnedMesh; mesh: THREE.Mesh }[] = [];
  for (const src of skinned) {
    const geo = src.geometry.clone();
    geo.deleteAttribute("skinIndex");
    geo.deleteAttribute("skinWeight");
    const mesh = new THREE.Mesh(geo, src.material);
    mesh.name = src.name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.visible = src.visible;
    mesh.position.copy(src.position);
    mesh.quaternion.copy(src.quaternion);
    mesh.scale.copy(src.scale);
    src.parent?.add(mesh);
    src.visible = false;
    pairs.push({ src, mesh });
  }
  root.userData.pose = () => {
    root.updateMatrixWorld(true);
    for (const pair of pairs) {
      if (!pair.mesh.visible) continue;
      bakeSkin(pair.src, pair.mesh.geometry.attributes.position as THREE.BufferAttribute);
    }
  };
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
  const headFile = useGLTF(RA_HEAD[role]);
  const bladeFile = useGLTF(RA_SWORD);
  const scene = useMemo(() => {
    const obj = cloneSkeleton(gltf.scene);
    graftFace(obj, headFile.scene);
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.visible = true;
      if (mesh.geometry.getAttribute("color")) {
        mesh.geometry = mesh.geometry.clone();
        mesh.geometry.deleteAttribute("color");
      }
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = list.map((mat) => {
        const copy = mat.clone() as THREE.MeshStandardMaterial;
        copy.vertexColors = false;
        copy.transparent = false;
        copy.opacity = 1;
        copy.depthWrite = true;
        copy.side = THREE.DoubleSide;
        copy.alphaTest = 0;
        copy.color.set("#ffffff");
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
    showBodies(obj);
    return obj;
  }, [gltf.scene, headFile.scene, bladeFile.scene, url, team, role]);
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
    const moving = want === "walk" || want === "attack" || want === "death";
    if (want !== mode.current) {
      mode.current = want;
      seq.current = 0;
      scene.userData.hold = 0;
      if (want === "attack") playNamed(RA_ATTACK[role][0], true);
      else if (want === "walk") playNamed("Walk_Normal_Loop", false);
      else if (want === "death") playNamed("Hit_Knockback", true);
      else playNamed("Idle_Shield_Loop", false);
    }
    const pose = scene.userData.pose as (() => void) | undefined;
    if (moving || (scene.userData.hold as number) < 3) {
      pose?.();
      scene.userData.hold = ((scene.userData.hold as number) || 0) + 1;
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
