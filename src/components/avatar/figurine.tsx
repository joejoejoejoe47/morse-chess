import { useEffect, useMemo, useRef } from "react";
import { Billboard, useAnimations, useFBX, useGLTF, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  characterById,
  crownArt,
  mountById,
  swordById,
  type TeamView,
} from "@/lib/avatar/catalog";

function prep(source: THREE.Object3D, height: number, dark: boolean) {
  const obj = cloneSkeleton(source);
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((mat) => {
      const copy = mat.clone() as THREE.MeshStandardMaterial;
      if ("skinning" in copy) (copy as THREE.MeshStandardMaterial & { skinning?: boolean }).skinning = true;
      if (dark && copy.color) copy.color = copy.color.clone().multiplyScalar(0.38);
      return copy;
    });
    mesh.material = next.length === 1 ? next[0] : next;
  });
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(height / (size.y || 1));
  obj.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(obj);
  obj.position.y -= grounded.min.y;
  return obj;
}

function GlbBody({ url, height, dark }: { url: string; height: number; dark: boolean }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => prep(gltf.scene, height, dark), [gltf.scene, height, dark]);
  const { actions } = useAnimations(gltf.animations, scene);
  useEffect(() => {
    const list = Object.values(actions).filter((clip): clip is NonNullable<typeof clip> => Boolean(clip));
    const idle =
      list.find((clip) => /idle[_\s-]?neutral|\|idle$/i.test(clip.getClip().name)) ||
      list.find((clip) => /idle/i.test(clip.getClip().name)) ||
      null;
    idle?.reset().fadeIn(0.2).play();
    return () => {
      idle?.fadeOut(0.1);
    };
  }, [actions]);
  return <primitive object={scene} />;
}

function FbxBody({ url, height, dark }: { url: string; height: number; dark: boolean }) {
  const fbx = useFBX(url);
  const scene = useMemo(() => prep(fbx, height, dark), [fbx, height, dark]);
  return <primitive object={scene} />;
}

function Body({ url, kind, height, dark }: { url: string; kind: "glb" | "fbx"; height: number; dark: boolean }) {
  if (kind === "fbx") return <FbxBody url={url} height={height} dark={dark} />;
  return <GlbBody url={url} height={height} dark={dark} />;
}

function Medal({ src, position, size = 0.46 }: { src: string; position: [number, number, number]; size?: number }) {
  const tex = useTexture(src);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <Billboard position={position}>
      <mesh>
        <circleGeometry args={[size, 40]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

export function Figurine({
  characterId,
  mountId = "none",
  swordId = "none",
  crownId = "circlet",
  team = "w",
  attackId = "march",
  striking = false,
  dance = false,
}: {
  characterId: string;
  mountId?: string;
  swordId?: string;
  crownId?: string;
  team?: TeamView;
  attackId?: string;
  striking?: boolean;
  dance?: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const character = characterById(characterId);
  const mount = mountById(mountId);
  const sword = swordById(swordId);
  const dark = team === "b";
  const riding = Boolean(mount.url && mount.kind);

  useFrame(({ clock }) => {
    const group = ref.current;
    if (!group) return;
    const t = clock.elapsedTime;
    group.position.x = 0;
    group.position.z = 0;
    group.rotation.x = 0;
    group.rotation.z = 0;
    if (dance) {
      group.rotation.y = t * 2.4;
      group.position.y = Math.abs(Math.sin(t * 6)) * 0.18;
      return;
    }
    group.position.y = 0;
    if (!striking) {
      group.rotation.y = Math.sin(t * 0.7) * 0.18 + (team === "b" ? Math.PI : 0);
      return;
    }
    if (attackId === "slam") {
      group.position.y = Math.abs(Math.sin(t * 9)) * 0.42;
      group.rotation.y = team === "b" ? Math.PI : 0;
    } else if (attackId === "sweep") {
      group.rotation.y = Math.sin(t * 7) * 1.1;
    } else if (attackId === "charge") {
      group.position.z = Math.sin(t * 6) * 0.35;
      group.rotation.y = team === "b" ? Math.PI : 0;
    } else if (attackId === "bow") {
      group.rotation.x = Math.abs(Math.sin(t * 3)) * 0.45;
      group.rotation.y = team === "b" ? Math.PI : 0;
    } else if (attackId === "flash") {
      group.position.y = Math.sin(t * 14) * 0.08;
      group.rotation.y = t * 3;
    } else {
      group.rotation.y = t * 0.8;
    }
  });

  return (
    <group ref={ref}>
      {riding && mount.url && mount.kind ? (
        <Body url={mount.url} kind={mount.kind} height={mount.height ?? 1} dark={dark} />
      ) : null}
      <group position={[0, riding ? 0.72 : 0, 0]}>
        <Body url={character.url} kind={character.kind} height={riding ? character.height * 0.72 : character.height} dark={dark} />
        <Medal src={crownArt(crownId, team)} position={[0, (riding ? character.height * 0.72 : character.height) + 0.22, 0]} />
        {sword.portrait ? (
          <Medal src={sword.portrait} position={[0.62, 0.7, 0.1]} size={0.34} />
        ) : null}
      </group>
    </group>
  );
}

export function StauntonKnight({ white }: { white: boolean }) {
  const gltf = useGLTF("/avatars/knight-piece.glb");
  const scene = useMemo(() => {
    const obj = gltf.scene.clone(true);
    const tint = new THREE.Color(white ? "#f4efe4" : "#2a211c");
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mat = new THREE.MeshStandardMaterial({
        color: tint,
        roughness: white ? 0.35 : 0.5,
        metalness: white ? 0.18 : 0.08,
      });
      mesh.material = mat;
    });
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(0.92 / (size.y || 1));
    obj.updateMatrixWorld(true);
    const grounded = new THREE.Box3().setFromObject(obj);
    obj.position.y -= grounded.min.y;
    if (!white) obj.rotation.y = Math.PI;
    return obj;
  }, [gltf.scene, white]);
  return <primitive object={scene} />;
}

useGLTF.preload("/avatars/knight-piece.glb");
useGLTF.preload("/avatars/king-an.glb");
useGLTF.preload("/avatars/pirate.glb");
useGLTF.preload("/avatars/horse.glb");
