/** Per-chapter atmosphere for the boss arenas (chapters 2-5). Pure procedural meshes, no assets. */
import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { BossPiece } from "./pieces3d";

/** Ch2 Mirror Citadel: floating crystal shards and two tall mirror pillars. */
export function MirrorFx() {
  const g = useRef<THREE.Group>(null);
  const shards = useMemo(
    () => Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2;
      const r = 7.5 + (i % 3) * 1.6;
      return { x: Math.cos(a) * r, y: 1.6 + (i % 5) * 0.8, z: Math.sin(a) * r - 1.5, s: 0.25 + (i % 4) * 0.12, sp: 0.3 + (i % 3) * 0.2 };
    }),
    [],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    g.current?.children.forEach((m, i) => {
      const d = shards[i];
      m.position.y = d.y + Math.sin(t * d.sp + i) * 0.3;
      m.rotation.y = t * d.sp;
      m.rotation.x = t * d.sp * 0.6;
    });
  });
  return (
    <group>
      <group ref={g}>
        {shards.map((d, i) => (
          <mesh key={i} position={[d.x, d.y, d.z]} scale={[d.s, d.s * 2.2, d.s]}>
            <octahedronGeometry args={[1, 0]} />
            <meshPhysicalMaterial color="#cfe8ff" emissive="#4a7ab8" emissiveIntensity={0.5} metalness={0.2} roughness={0.05} transmission={0.6} thickness={0.5} transparent opacity={0.85} />
          </mesh>
        ))}
      </group>
      {[-6.2, 6.2].map((x) => (
        <group key={x} position={[x, 0, -1]}>
          <mesh position={[0, 2.6, 0]} rotation={[0, x < 0 ? 0.5 : -0.5, 0]}>
            <boxGeometry args={[0.12, 5, 2.2]} />
            <meshStandardMaterial color="#e8f2ff" metalness={1} roughness={0.04} envMapIntensity={2} />
          </mesh>
          <mesh position={[0, 5.3, 0]}>
            <octahedronGeometry args={[0.4, 0]} />
            <meshStandardMaterial color="#bfe4ff" emissive="#7ab8ff" emissiveIntensity={1.4} />
          </mesh>
          <pointLight position={[0, 4.5, 0.6]} color="#9fd0ff" intensity={8} distance={8} />
        </group>
      ))}
      <Sparkles count={70} scale={[18, 7, 14]} position={[0, 3, -2]} size={3} speed={0.2} color="#d8f0ff" />
    </group>
  );
}

/** Ch3 Siege Ramparts: burning braziers, drifting embers and broken battlements. */
export function SiegeFx() {
  const flames = useRef<THREE.Group>(null);
  const spots: [number, number][] = [[-5.6, 4.6], [5.6, 4.6], [-5.6, -4.6], [5.6, -4.6]];
  useFrame(({ clock }) => {
    flames.current?.children.forEach((m, i) => {
      const k = 1 + Math.sin(clock.elapsedTime * 9 + i * 1.7) * 0.15;
      m.scale.set(k, 1 + Math.sin(clock.elapsedTime * 7 + i) * 0.25, k);
    });
  });
  return (
    <group>
      {spots.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.32, 0.22, 1.1, 10]} />
            <meshStandardMaterial color="#3a2a22" metalness={0.6} roughness={0.5} />
          </mesh>
          <pointLight position={[0, 1.6, 0]} color="#ff7a2a" intensity={7} distance={7} />
        </group>
      ))}
      <group ref={flames}>
        {spots.map(([x, z], i) => (
          <mesh key={i} position={[x, 1.35, z]}>
            <coneGeometry args={[0.28, 0.8, 10]} />
            <meshBasicMaterial color="#ffb040" transparent opacity={0.9} />
          </mesh>
        ))}
      </group>
      {/* crumbling rampart segments */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-8 + i * 2, 0.7 + (i % 2) * 0.3, -7.2]} rotation={[0, 0, (i % 3 - 1) * 0.06]} castShadow>
          <boxGeometry args={[1.7, 1.4 + (i % 2) * 0.6, 0.9]} />
          <meshStandardMaterial color="#5a5058" roughness={0.95} />
        </mesh>
      ))}
      <Sparkles count={90} scale={[16, 8, 14]} position={[0, 3, -1]} size={3.5} speed={0.9} color="#ff9a40" />
    </group>
  );
}

/** Ch4 Fogged Marsh: low drifting mist sheets, dead trees and green will-o'-wisps. */
export function MarshFx() {
  const mist = useRef<THREE.Group>(null);
  const wisps = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    mist.current?.children.forEach((m, i) => {
      m.position.x = Math.sin(t * 0.08 + i * 1.3) * 3;
      m.rotation.z = t * 0.02 * (i % 2 ? 1 : -1);
    });
    wisps.current?.children.forEach((m, i) => {
      m.position.y = 1.4 + Math.sin(t * 1.3 + i * 2) * 0.5;
      m.position.x = Math.cos(t * 0.3 + i * 1.6) * (6.5 + i * 0.4);
      m.position.z = Math.sin(t * 0.3 + i * 1.6) * (5.5 + i * 0.3) - 1;
    });
  });
  return (
    <group>
      <group ref={mist}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[0, 0.25 + i * 0.12, -2 + (i % 3) * 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[30, 18]} />
            <meshBasicMaterial color="#9fe0c8" transparent opacity={0.035} depthWrite={false} />
          </mesh>
        ))}
      </group>
      {[[-7, -3], [7.4, -2], [-6.4, 3.6], [6.8, 4.2], [0, -8]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, i, 0.08 * (i % 2 ? 1 : -1)]}>
          <mesh position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.08, 0.2, 2.8, 6]} />
            <meshStandardMaterial color="#2a2a26" roughness={1} />
          </mesh>
          <mesh position={[0.35, 2.3, 0]} rotation={[0, 0, -0.9]}>
            <cylinderGeometry args={[0.03, 0.07, 1, 5]} />
            <meshStandardMaterial color="#2a2a26" roughness={1} />
          </mesh>
          <mesh position={[-0.3, 1.9, 0]} rotation={[0, 0, 1]}>
            <cylinderGeometry args={[0.03, 0.06, 0.8, 5]} />
            <meshStandardMaterial color="#2a2a26" roughness={1} />
          </mesh>
        </group>
      ))}
      <group ref={wisps}>
        {Array.from({ length: 5 }, (_, i) => (
          <group key={i}>
            <mesh>
              <sphereGeometry args={[0.13, 12, 12]} />
              <meshBasicMaterial color="#8affc8" />
            </mesh>
            <pointLight color="#5affb0" intensity={3} distance={4} />
          </group>
        ))}
      </group>
    </group>
  );
}

/** Ch5 Core Colosseum: golden orbit rings over the arena; they turn red and spin faster in phase 2. */
export function CoreFx({ phase }: { phase: number }) {
  const rings = useRef<THREE.Group>(null);
  const hot = phase === 2;
  useFrame((_, dt) => {
    rings.current?.children.forEach((m, i) => {
      m.rotation.z += dt * (hot ? 1.2 : 0.25) * (i % 2 ? -1 : 1);
      m.rotation.x += dt * 0.05 * (i + 1);
    });
  });
  return (
    <group>
      <group ref={rings} position={[0, 7.5, -5]}>
        {[3.2, 4.2, 5.2].map((r, i) => (
          <mesh key={r} rotation={[Math.PI / 2 + i * 0.3, 0, 0]}>
            <torusGeometry args={[r, 0.06, 8, 96]} />
            <meshStandardMaterial color={hot ? "#ff5a3a" : "#ffd86b"} emissive={hot ? "#ff2a10" : "#c08a20"} emissiveIntensity={hot ? 2 : 1.2} metalness={1} roughness={0.2} />
          </mesh>
        ))}
      </group>
      <pointLight position={[0, 7.5, -5]} color={hot ? "#ff4a2a" : "#ffd86b"} intensity={hot ? 30 : 16} distance={20} />
      <Sparkles count={hot ? 140 : 60} scale={[18, 9, 16]} position={[0, 4, -2]} size={hot ? 4 : 3} speed={hot ? 1.4 : 0.4} color={hot ? "#ff7a40" : "#ffd86b"} />
    </group>
  );
}

/** Raid: the Iron Colossus towers over a giant anvil arena, flanked by two queen statues and forge fire. */
export function RaidFx() {
  const eye = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (eye.current) eye.current.color.setHSL(0.03, 1, 0.45 + Math.sin(clock.elapsedTime * 2) * 0.12);
  });
  return (
    <group>
      <Suspense fallback={null}>
        <group position={[-7.7, -0.6, -4.6]} scale={3.3} rotation={[0, 0.55, 0]}>
          <BossPiece kind="k" ink="#2a1410" />
        </group>
        {[-1, 1].map((sx) => (
          <group key={sx} position={[sx < 0 ? -3.6 : 7.7, -0.6, sx < 0 ? -9.5 : -4.6]} scale={sx < 0 ? 2.4 : 3.1} rotation={[0, -sx * 0.55, 0]}>
            <BossPiece kind="q" ink="#3a1a12" />
          </group>
        ))}
      </Suspense>
      <mesh position={[-7.4, 3.3, -4.0]}>
        <sphereGeometry args={[0.55, 20, 16]} />
        <meshBasicMaterial ref={eye} color="#ff4a1a" />
      </mesh>
      <pointLight position={[-6.4, 3.4, -3.0]} color="#ff5a2a" intensity={60} distance={22} />
      <pointLight position={[0, 9, -4]} color="#ffb07a" intensity={25} distance={18} />
      {/* the anvil plinth under the giant board */}
      <mesh position={[0, -0.9, 0]} receiveShadow>
        <boxGeometry args={[12.5, 1.2, 12.5]} />
        <meshStandardMaterial color="#1e1416" metalness={0.7} roughness={0.45} />
      </mesh>
      <mesh position={[0, -1.6, 0]}>
        <boxGeometry args={[14.5, 0.4, 14.5]} />
        <meshStandardMaterial color="#4a1a0a" emissive="#ff3a10" emissiveIntensity={0.5} roughness={0.8} />
      </mesh>
      <Sparkles count={120} scale={[24, 10, 22]} position={[0, 4, -3]} size={4} speed={1} color="#ff8a40" />
    </group>
  );
}
