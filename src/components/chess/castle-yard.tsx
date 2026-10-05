import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { arenaNight } from "@/components/chess/arena-bowl";
import { asset } from "@/lib/base";

useGLTF.preload(asset("/boards/castle.glb"));
useGLTF.preload(asset("/units/rogue.glb"));
useGLTF.preload(asset("/units/skeleton-minion.glb"));
useGLTF.preload(asset("/glade/trees.glb"));

function WallLantern({ x, y, z }: { x: number; y: number; z: number }) {
  const yaw = Math.atan2(-x, -z);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const night = arenaNight.value;
    if (glow.current) glow.current.emissiveIntensity = 0.25 + night * 2.8;
    if (light.current) light.current.intensity = night * 7;
  });
  return (
    <group position={[x, y, z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.15, -0.22]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.42]} />
        <meshStandardMaterial color="#3a2a1c" roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.02, 0.02]}>
        <boxGeometry args={[0.22, 0.28, 0.22]} />
        <meshStandardMaterial ref={glow} color="#ffc27a" emissive="#ff8a1a" emissiveIntensity={0.4} roughness={0.4} />
      </mesh>
      <pointLight ref={light} position={[0, 0, 0.2]} color="#ffb15a" distance={16} decay={2} intensity={0} />
    </group>
  );
}

export function CastleYard() {
  const maps = useTexture({
    map: asset("/glade/ground/diff.jpg"),
    normalMap: asset("/glade/ground/nor.jpg"),
    roughnessMap: asset("/glade/ground/rough.jpg"),
  });
  const castleGltf = useGLTF(asset("/boards/castle.glb"));
  const treesGltf = useGLTF(asset("/glade/trees.glb"));
  const lightPawn = useGLTF(asset("/units/rogue.glb"));
  const darkPawn = useGLTF(asset("/units/skeleton-minion.glb"));

  const field = useMemo(() => {
    for (const tex of [maps.map, maps.normalMap, maps.roughnessMap]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(16, 16);
    }
    maps.map.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.PlaneGeometry(140, 140);
    ground.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: 1,
      metalness: 0,
    });
    return { ground, mat };
  }, [maps.map, maps.normalMap, maps.roughnessMap]);

  const castle = useMemo(() => {
    const root = castleGltf.scene.clone(true);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const scale = 22 / Math.max(size.x, size.z, 0.001);
    root.scale.setScalar(scale);
    const fitted = new THREE.Box3().setFromObject(root);
    const fittedSize = fitted.getSize(new THREE.Vector3());
    root.position.set(0, -fitted.min.y, -fittedSize.z * 0.42 - 12);
    return root;
  }, [castleGltf.scene]);

  const trees = useMemo(() => {
    const spots = [
      [-16, -6],
      [16, -8],
      [-18, 10],
      [18, 12],
      [-8, 16],
      [9, 16],
    ];
    return spots.map(([x, z], i) => {
      const tree = treesGltf.scene.clone(true);
      tree.scale.setScalar(1.4 + (i % 3) * 0.25);
      tree.position.set(x, 0, z);
      tree.rotation.y = i;
      return tree;
    });
  }, [treesGltf.scene]);

  const pawns = useMemo(() => {
    const rows: { x: number; z: number; dark: boolean; rot: number }[] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      rows.push({
        x: Math.sin(a) * 11.5,
        z: Math.cos(a) * 11.5,
        dark: i % 2 === 1,
        rot: Math.atan2(-Math.sin(a), -Math.cos(a)),
      });
    }
    return rows;
  }, []);

  const lanterns = useMemo(() => {
    const spots: { x: number; y: number; z: number }[] = [];
    const box = new THREE.Box3().setFromObject(castle);
    const size = box.getSize(new THREE.Vector3());
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const y = box.min.y + size.y * 0.42;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      spots.push({
        x: cx + Math.sin(a) * (size.x * 0.38),
        y,
        z: cz + Math.cos(a) * (size.z * 0.38),
      });
    }
    return spots;
  }, [castle]);

  useEffect(
    () => () => {
      field.ground.dispose();
      field.mat.dispose();
    },
    [field],
  );

  return (
    <group>
      <mesh geometry={field.ground} material={field.mat} receiveShadow />
      <primitive object={castle} />
      {trees.map((tree, i) => (
        <primitive key={i} object={tree} />
      ))}
      {lanterns.map((spot, i) => (
        <WallLantern key={i} x={spot.x} y={spot.y} z={spot.z} />
      ))}
      {pawns.map((pawn, i) => (
        <YardPawn
          key={i}
          url={pawn.dark ? darkPawn : lightPawn}
          x={pawn.x}
          z={pawn.z}
          rot={pawn.rot}
        />
      ))}
    </group>
  );
}

function YardPawn({
  url,
  x,
  z,
  rot,
}: {
  url: { scene: THREE.Group; animations: THREE.AnimationClip[] };
  x: number;
  z: number;
  rot: number;
}) {
  const clone = useMemo(() => {
    const next = cloneSkeleton(url.scene);
    next.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    next.scale.setScalar(0.55);
    return next;
  }, [url.scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone]);
  useEffect(() => {
    const idle = url.animations.find((clip) => /idle/i.test(clip.name));
    if (!idle) return;
    const action = mixer.clipAction(idle);
    action.play();
    return () => {
      mixer.stopAllAction();
    };
  }, [mixer, url.animations]);
  useFrame((_, delta) => {
    mixer.update(Math.min(delta, 0.05));
  });
  return <primitive object={clone} position={[x, 0, z]} rotation={[0, rot, 0]} />;
}
