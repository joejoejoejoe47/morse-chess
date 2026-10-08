import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import type { PieceSymbol } from "chess.js";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { asset } from "@/lib/base";
import type { Gait } from "@/components/chess/stone-people";

const RA_KING = asset("/units/fantasy/king.gltf");
const RA_BISHOP = asset("/units/fantasy/bishop.gltf");
const RA_KNIGHT = asset("/units/fantasy/knight.gltf");
const RA_ROOK = asset("/units/fantasy/rook.gltf");
const RA_PAWN = asset("/units/fantasy/pawn.gltf");
const RA_ANIMS = asset("/units/fantasy/anims.glb");
const RA_SWORD = asset("/avatars/swords/devil.glb");

const RA_URL: Record<PieceSymbol, string> = {
  k: RA_KING,
  q: RA_KING,
  b: RA_BISHOP,
  n: RA_KNIGHT,
  r: RA_ROOK,
  p: RA_PAWN,
};

const RA_ATTACK: Record<PieceSymbol, string[]> = {
  k: ["Sword_Heavy_Combo"],
  b: ["Melee_Hook"],
  n: ["Sword_Dash", "Sword_Regular_B"],
  r: ["Melee_Hook"],
  q: ["Sword_Regular_Combo"],
  p: ["Sword_Regular_A"],
};

useGLTF.preload(RA_KING);
useGLTF.preload(RA_BISHOP);
useGLTF.preload(RA_KNIGHT);
useGLTF.preload(RA_ROOK);
useGLTF.preload(RA_PAWN);
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
      mesh.frustumCulled = false;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = list.map((mat) => {
        const copy = mat.clone() as THREE.MeshStandardMaterial;
        if (/hair|brow/i.test(copy.name)) copy.color.set("#1a140f");
        if (/ranger|peasant/i.test(copy.name)) copy.color.set(team === "blue" ? "#1d4ed8" : "#dc2626");
        return copy;
      });
    });
    if (role === "k") {
      const hood = obj.getObjectByName("Male_Ranger_Head_Hood");
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
    return obj;
  }, [gltf.scene, bladeFile.scene, url, team, role]);
  const anims = useGLTF(RA_ANIMS);
  const { actions, mixer } = useAnimations(anims.animations, scene);
  const mode = useRef("");
  const seq = useRef(0);
  const breathAt = useRef(Math.random() * Math.PI * 2);
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
  useFrame(({ clock }) => {
    const base = (scene.userData.fit as number) || scene.scale.x || 1;
    const breath = 1 + Math.sin(clock.elapsedTime * 1.45 + breathAt.current) * 0.016;
    scene.scale.set(base, base * breath, base);
    if (gait.current.fade < 0.995) paint(scene, gait.current.fade);
    const act = gait.current.act;
    const want = act === "attack" ? "attack" : act === "walk" || act === "charge" ? "walk" : act === "death" ? "death" : "idle";
    if (want === mode.current) return;
    mode.current = want;
    seq.current = 0;
    if (want === "attack") playNamed(RA_ATTACK[role][0], true);
    else if (want === "walk") playNamed("Walk_Carry_Loop", false);
    else if (want === "death") playNamed("Hit_Knockback", true);
    else playNamed("Idle_No_Loop", false);
  });
  return <primitive object={scene} />;
}
