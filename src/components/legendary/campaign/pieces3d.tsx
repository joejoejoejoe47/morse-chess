/**
 * Army pieces in 3D: the Morse Chess Staunton GLBs re-finished by level (wood > bronze > silver >
 * obsidian > glowing gold), with battle scars (Lv4+), a banner (Lv6+), an aura (Lv8+) and the
 * golden crown of a Veteran of the King's File. Boss pieces get their arena's dark finish.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { asset } from "@/lib/base";
import type { Kind } from "./engine";
import { looksFor, tierFor } from "./data";

const FILE: Record<"w" | "b", Record<Kind, string>> = {
  w: { k: "/pieces/01_king_light.glb", q: "/pieces/03_queen_light.glb", b: "/pieces/05_bishop_light.glb", n: "/pieces/07_knight_light.glb", r: "/pieces/09_rook_light.glb", p: "/pieces/11_pawn_light.glb" },
  b: { k: "/pieces/02_king_dark.glb", q: "/pieces/04_queen_dark.glb", b: "/pieces/06_bishop_dark.glb", n: "/pieces/08_knight_dark.glb", r: "/pieces/10_rook_dark.glb", p: "/pieces/12_pawn_dark.glb" },
};
export const PIECE_HEIGHT: Record<Kind, number> = { k: 1.12, q: 1.04, b: 0.9, n: 0.84, r: 0.86, p: 0.66 };
const RADIUS: Record<Kind, number> = { k: 0.22, q: 0.22, b: 0.19, n: 0.2, r: 0.21, p: 0.18 };

export function preloadArmy() {
  for (const c of ["w", "b"] as const) for (const k of Object.keys(FILE[c]) as Kind[]) useGLTF.preload(asset(FILE[c][k]));
}

export type Finish = { color: string; metal: number; rough: number; emissive?: string; glow?: number; opacity?: number };

export function finishForLevel(level: number): Finish {
  const t = tierFor(level);
  return { color: t.color, metal: t.metal, rough: t.rough, emissive: t.emissive, glow: t.glow };
}

function useFinishedModel(kind: Kind, side: "w" | "b", finish: Finish, yaw: number) {
  const gltf = useGLTF(asset(FILE[side][kind]));
  return useMemo(() => {
    const obj = cloneSkeleton(gltf.scene);
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = list.map(() => {
        const m = new THREE.MeshStandardMaterial({
          color: finish.color,
          metalness: finish.metal,
          roughness: finish.rough,
          emissive: new THREE.Color(finish.emissive ?? "#000000"),
          emissiveIntensity: finish.glow ?? 0,
          transparent: (finish.opacity ?? 1) < 1,
          opacity: finish.opacity ?? 1,
          depthWrite: (finish.opacity ?? 1) >= 1,
        });
        return m;
      });
      mesh.material = next.length === 1 ? next[0] : next;
    });
    obj.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(PIECE_HEIGHT[kind] / (size.y || 1));
    obj.updateMatrixWorld(true);
    obj.position.y -= new THREE.Box3().setFromObject(obj).min.y;
    obj.rotation.y = yaw;
    return obj;
  }, [gltf.scene, kind, finish.color, finish.metal, finish.rough, finish.emissive, finish.glow, finish.opacity, yaw]);
}

/** Thin dark slashes on the body: battle scars. */
function Scars({ kind }: { kind: Kind }) {
  const r = RADIUS[kind] * 0.98;
  const h = PIECE_HEIGHT[kind];
  const cuts = [
    { a: 0.5, y: 0.38, tilt: 0.7, l: 0.16 },
    { a: 2.3, y: 0.3, tilt: -0.6, l: 0.13 },
    { a: 4.2, y: 0.46, tilt: 0.5, l: 0.11 },
  ];
  return (
    <group>
      {cuts.map((c, i) => (
        <mesh key={i} position={[Math.sin(c.a) * r, h * c.y, Math.cos(c.a) * r]} rotation={[0, c.a, c.tilt]}>
          <boxGeometry args={[0.018, c.l, 0.012]} />
          <meshStandardMaterial color="#2a0c08" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** A small war banner on a pole behind the piece, waving. */
function Banner({ kind, color = "#5b1fa8" }: { kind: Kind; color?: string }) {
  const cloth = useRef<THREE.Mesh>(null);
  const h = PIECE_HEIGHT[kind] + 0.28;
  useFrame(({ clock }) => {
    if (cloth.current) cloth.current.rotation.y = Math.sin(clock.elapsedTime * 2.2 + kind.charCodeAt(0)) * 0.25;
  });
  return (
    <group position={[-RADIUS[kind] - 0.06, 0, -0.08]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, h, 6]} />
        <meshStandardMaterial color="#d9b25a" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0, h, 0]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color="#ffd86b" metalness={1} roughness={0.2} emissive="#a06a00" emissiveIntensity={0.4} />
      </mesh>
      <mesh ref={cloth} position={[0.09, h - 0.12, 0]}>
        <planeGeometry args={[0.17, 0.2]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.8} emissive="#2a0a50" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.09, h - 0.03, 0.002]}>
        <planeGeometry args={[0.17, 0.02]} />
        <meshStandardMaterial color="#ffd86b" side={THREE.DoubleSide} metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Glowing floor ring + rising motes. */
export function Aura({ color = "#ffd86b", size = 0.34, strength = 1 }: { color?: string; size?: number; strength?: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const motes = useRef<THREE.Group>(null);
  const seeds = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ a: (i / 7) * Math.PI * 2, s: 0.5 + ((i * 37) % 10) / 14 })), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) {
      ring.current.rotation.z = t * 0.6;
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (0.45 + Math.sin(t * 2.4) * 0.15) * strength;
    }
    motes.current?.children.forEach((m, i) => {
      const sd = seeds[i];
      const y = ((t * 0.35 * sd.s + i / 7) % 1) * 1.1;
      m.position.set(Math.sin(sd.a + t * 0.4) * size * 0.9, y, Math.cos(sd.a + t * 0.4) * size * 0.9);
      (m as THREE.Mesh).scale.setScalar(1 - y / 1.2);
    });
  });
  return (
    <group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[size * 0.78, size, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <group ref={motes}>
        {seeds.map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.018, 6, 6]} />
            <meshBasicMaterial color={color} transparent opacity={0.85 * strength} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** The golden crown of a Veteran of the King's File (and the Crowned Pawn skin). */
export function PawnCrown() {
  const spikes = 6;
  return (
    <group position={[0, PIECE_HEIGHT.p - 0.02, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.085, 0.075, 0.05, 18, 1, true]} />
        <meshStandardMaterial color="#ffd04a" metalness={1} roughness={0.18} emissive="#a06a00" emissiveIntensity={0.45} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: spikes }, (_, i) => {
        const a = (i / spikes) * Math.PI * 2;
        return (
          <group key={i} position={[Math.sin(a) * 0.08, 0.05, Math.cos(a) * 0.08]}>
            <mesh>
              <coneGeometry args={[0.018, 0.06, 6]} />
              <meshStandardMaterial color="#ffd04a" metalness={1} roughness={0.2} emissive="#a06a00" emissiveIntensity={0.45} />
            </mesh>
            <mesh position={[0, 0.034, 0]}>
              <sphereGeometry args={[0.012, 8, 8]} />
              <meshStandardMaterial color={i % 2 ? "#c0182a" : "#5b1fa8"} roughness={0.2} emissive={i % 2 ? "#600010" : "#30106a"} emissiveIntensity={0.6} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export type ArmyLook = { level: number; veteran?: boolean; perk?: boolean; crowned?: boolean; siege?: boolean };

/** One army piece (player, White) finished by its level. */
export function ArmyPiece({ kind, look, yaw = Math.PI }: { kind: Kind; look: ArmyLook; yaw?: number }) {
  const finish = finishForLevel(look.level);
  const obj = useFinishedModel(kind, "w", finish, yaw);
  const show = looksFor(look.level);
  const tier = tierFor(look.level);
  return (
    <group>
      <primitive object={obj} />
      {show.scars ? <Scars kind={kind} /> : null}
      {show.banner ? <Banner kind={kind} /> : null}
      {show.aura ? <Aura color={tier.ring} size={RADIUS[kind] + 0.16} strength={look.level >= 9 ? 1.2 : 0.8} /> : null}
      {(look.veteran || look.crowned) && kind === "p" ? <PawnCrown /> : null}
      {look.siege && kind === "r" && !show.aura ? <Aura color="#ff5a2a" size={RADIUS[kind] + 0.16} strength={0.9} /> : null}
    </group>
  );
}

/** A boss piece in the arena's colours; glass pawns are see-through. */
export function BossPiece({ kind, ink, glass = false, yaw = 0 }: { kind: Kind; ink: string; glass?: boolean; yaw?: number }) {
  const finish: Finish = glass
    ? { color: "#bfe4ff", metal: 0.1, rough: 0.04, emissive: "#4a8ac0", glow: 0.35, opacity: 0.5 }
    : { color: ink, metal: 0.72, rough: 0.28, emissive: "#000000", glow: 0 };
  const obj = useFinishedModel(kind, "b", finish, yaw);
  return <primitive object={obj} />;
}

/** Golden Bot Companion (Chapter 5 reward): hovers beside your army and cheers. */
export function GoldenBot({ position = [-4.9, 1.5, 2.4] as [number, number, number], excited = false }: { position?: [number, number, number]; excited?: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const o = g.current;
    if (!o) return;
    const t = clock.elapsedTime;
    o.position.y = position[1] + Math.sin(t * (excited ? 6 : 1.6)) * (excited ? 0.18 : 0.1);
    o.rotation.y = Math.sin(t * 0.7) * 0.5 + 0.5;
  });
  const gold = <meshStandardMaterial color="#ffd34a" metalness={0.75} roughness={0.22} emissive="#c08a10" emissiveIntensity={0.85} />;
  return (
    <group ref={g} position={position}>
      <mesh castShadow>
        <sphereGeometry args={[0.42, 32, 24]} />
        {gold}
      </mesh>
      <mesh position={[0, 0, 0.3]} scale={[1, 0.62, 0.5]}>
        <sphereGeometry args={[0.3, 24, 16]} />
        <meshStandardMaterial color="#160c22" roughness={0.1} metalness={0.4} />
      </mesh>
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} position={[x, 0.02, 0.44]}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color="#7af0ff" />
        </mesh>
      ))}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.22, 6]} />
        {gold}
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial color="#ff5a7a" />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.48, -0.05, 0]} rotation={[0, 0, sx * 0.5]}>
          <boxGeometry args={[0.1, 0.28, 0.1]} />
          {gold}
        </mesh>
      ))}
      <pointLight color="#ffd86b" intensity={4} distance={4} />
    </group>
  );
}
