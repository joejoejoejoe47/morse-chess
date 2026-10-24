"use client";
import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Group } from "three";

export type Piece = {
  id: string;
  side: "w" | "b";
  kind: "k" | "q" | "r" | "b" | "n" | "p";
  file: number;
  rank: number;
  alive: boolean;
};

const AN: Record<Piece["kind"], string> = {
  k: "/avatars/king-an.glb",
  q: "/units/mage.glb",
  r: "/units/barbarian.glb",
  b: "/units/rogue-hooded.glb",
  n: "/units/knight.glb",
  p: "/units/rogue.glb",
};

export const VIEWS = {
  table: { pos: [0, 6.5, 8.5] as [number, number, number], target: [0, 0.6, 0] as [number, number, number] },
  white: { pos: [0, 3.2, 7.2] as [number, number, number], target: [0, 0.4, 0] as [number, number, number] },
  black: { pos: [0, 3.2, -7.2] as [number, number, number], target: [0, 0.4, 0] as [number, number, number] },
  side: { pos: [8.5, 3.4, 0.2] as [number, number, number], target: [0, 0.5, 0] as [number, number, number] },
  wide: { pos: [0, 9, 14] as [number, number, number], target: [0, 0.2, 0] as [number, number, number] },
};

function CastleRoom() {
  const gltf = useGLTF("/sandbox/princess-aurora-castle.glb");
  const clone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return <primitive object={clone} position={[0, -1.2, 0]} scale={1.6} />;
}

function WoodenBoard() {
  const gltf = useGLTF("/sandbox/wooden-chess-board.glb");
  const clone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return <primitive object={clone} position={[0, 0.02, 0]} scale={2.4} />;
}

function AnGuy({ piece }: { piece: Piece }) {
  const url = AN[piece.kind];
  const gltf = useGLTF(url);
  const ref = useRef<Group>(null);
  const pos = useRef({ x: (piece.file - 3.5) * 0.9, z: (piece.rank - 3.5) * 0.9 });
  useFrame((_, dt) => {
    const node = ref.current;
    if (!node) return;
    const tx = (piece.file - 3.5) * 0.9;
    const tz = (piece.rank - 3.5) * 0.9;
    const dx = tx - pos.current.x;
    const dz = tz - pos.current.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.01) {
      const step = Math.min(1, dt / 0.55);
      pos.current.x += dx * step;
      pos.current.z += dz * step;
      node.lookAt(tx, 0, tz);
    }
    node.position.set(pos.current.x, 0.35, pos.current.z);
  });
  const scale = piece.kind === "k" ? 0.42 : piece.kind === "p" ? 0.34 : 0.38;
  return (
    <group ref={ref} rotation={[0, piece.side === "b" ? Math.PI : 0, 0]}>
      <primitive object={gltf.scene.clone(true)} scale={scale} />
    </group>
  );
}

export function CastleScene({
  pieces,
  view,
}: {
  pieces: Piece[];
  view: keyof typeof VIEWS;
}) {
  const cam = VIEWS[view];
  return (
    <Canvas camera={{ position: cam.pos, fov: 40 }} shadows>
      <color attach="background" args={["#1a1410"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 8, 3]} intensity={1.15} castShadow />
      <Suspense fallback={null}>
        <CastleRoom />
        <WoodenBoard />
        {pieces
          .filter((p) => p.alive)
          .map((p) => (
            <AnGuy key={p.id} piece={p} />
          ))}
      </Suspense>
      <OrbitControls target={cam.target} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}

useGLTF.preload("/sandbox/princess-aurora-castle.glb");
useGLTF.preload("/sandbox/wooden-chess-board.glb");
useGLTF.preload("/avatars/king-an.glb");
useGLTF.preload("/units/mage.glb");
useGLTF.preload("/units/barbarian.glb");
useGLTF.preload("/units/rogue-hooded.glb");
useGLTF.preload("/units/knight.glb");
useGLTF.preload("/units/rogue.glb");
