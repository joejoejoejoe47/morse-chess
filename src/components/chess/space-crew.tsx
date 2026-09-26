import { useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { PieceSymbol } from "chess.js";
import * as THREE from "three";

type Gait = { phase: number; amp: number; act: "idle" | "walk" | "attack" | "death"; fade: number };

type Weapon = "blue" | "red" | "gun" | "staff" | "rifle";
type Head = "face" | "helm" | "hood" | "visor";

type CrewLook = {
  tall: number;
  skin: string;
  top: string;
  legs: string;
  hair?: string;
  head: Head;
  helm?: string;
  visor?: string;
  cape?: string;
  eyes?: string;
  weapon: Weapon;
};

const CREW: Record<string, CrewLook> = {
  "w-k": { tall: 1.28, skin: "#e4b48a", top: "#2d6ec4", legs: "#c6a36a", hair: "#6a4328", head: "face", weapon: "blue" },
  "w-q": { tall: 1.3, skin: "#e4b48a", top: "#f4f1ea", legs: "#f4f1ea", hair: "#4a3428", head: "face", weapon: "gun" },
  "w-b": { tall: 1.24, skin: "#d7b08a", top: "#c4a36a", legs: "#8d6a3e", hair: "#d9d3c4", head: "hood", helm: "#c4a36a", weapon: "staff" },
  "w-n": { tall: 1.22, skin: "#d2a278", top: "#6b4a32", legs: "#3d3a36", hair: "#2a2a2a", head: "face", weapon: "gun" },
  "w-n2": { tall: 1.22, skin: "#e4b48a", top: "#f7f4ee", legs: "#f7f4ee", hair: "#6a4328", head: "face", weapon: "gun" },
  "w-r": { tall: 1.34, skin: "#d8dde6", top: "#e7eef8", legs: "#d5dbe6", head: "helm", helm: "#f2f5fb", visor: "#2f6ec4", weapon: "rifle" },
  "w-p": { tall: 0.92, skin: "#e4b48a", top: "#d7c09a", legs: "#c6a36a", hair: "#6a4328", head: "face", weapon: "blue" },
  "b-k": { tall: 1.4, skin: "#c9c3b4", top: "#1a1c22", legs: "#14161c", head: "hood", helm: "#12141a", eyes: "#f0d15a", cape: "#101218", weapon: "staff" },
  "b-q": { tall: 1.42, skin: "#2a2a2a", top: "#1c1c1c", legs: "#141414", head: "helm", helm: "#161616", visor: "#ff2a2a", cape: "#0c0c0c", weapon: "red" },
  "b-b": { tall: 1.24, skin: "#b7b2a6", top: "#221e24", legs: "#16141a", head: "hood", helm: "#1a161c", weapon: "staff" },
  "b-n": { tall: 1.24, skin: "#c8b8a4", top: "#3a1218", legs: "#1a1a1a", head: "helm", helm: "#2a1014", visor: "#ff3030", weapon: "red" },
  "b-n2": { tall: 1.24, skin: "#d5d0c8", top: "#20242c", legs: "#12141a", hair: "#d9dbe2", head: "hood", helm: "#1a1e26", weapon: "red" },
  "b-r": { tall: 1.36, skin: "#8d93a0", top: "#2a2e36", legs: "#1a1e26", head: "helm", helm: "#323844", visor: "#9aa3b2", weapon: "rifle" },
  "b-p": { tall: 0.9, skin: "#f2f4f8", top: "#f7f8fb", legs: "#e6e8ee", head: "visor", helm: "#f4f6fa", visor: "#2f6dff", weapon: "gun" },
};

function keyOf(type: PieceSymbol, white: boolean, wing: "a" | "b") {
  if (type === "n") return `${white ? "w" : "b"}-n${wing === "b" ? "2" : ""}`;
  return `${white ? "w" : "b"}-${type}`;
}

function Mat({
  color,
  emissive,
  clip,
  metal = 0.15,
  rough = 0.62,
}: {
  color: string;
  emissive?: string;
  clip: THREE.Plane | null;
  metal?: number;
  rough?: number;
}) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={emissive ?? "#000000"}
      emissiveIntensity={emissive ? 1.6 : 0}
      metalness={metal}
      roughness={rough}
      clippingPlanes={clip ? [clip] : []}
    />
  );
}

export function SpaceCrew({
  type,
  white,
  wing = "a",
  clip = null,
  gait,
  flip = false,
}: {
  type: PieceSymbol;
  white: boolean;
  wing?: "a" | "b";
  clip?: THREE.Plane | null;
  gait: MutableRefObject<Gait>;
  flip?: boolean;
}) {
  const look = CREW[keyOf(type, white, wing)] ?? CREW["w-p"];
  const rig = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const fall = useRef(0);
  const air = useRef(0);
  const s = look.tall;

  useFrame(({ clock }, raw) => {
    if (!rig.current) return;
    const act = gait.current.act;
    const dead = act === "death";
    const dt = Math.min(raw, 0.05);
    if (dead) fall.current = Math.min(1, fall.current + dt / 0.42);
    else fall.current = 0;
    if (flip && act === "attack") air.current = Math.min(1, air.current + dt / 0.72);
    else air.current = 0;
    const k = 1 - (1 - fall.current) ** 3;
    const walk = act === "walk" ? 1 : 0;
    const swing = Math.sin(gait.current.phase) * walk;
    const bob = dead
      ? Math.sin(k * Math.PI) * 0.28
      : walk
        ? Math.abs(Math.sin(gait.current.phase)) * 0.04
        : Math.sin(clock.elapsedTime * 1.6) * 0.012;
    if (dead) {
      rig.current.rotation.x = -k * (Math.PI * 0.95);
      rig.current.position.z = -k * 0.7;
      rig.current.position.y = bob;
    } else if (flip && act === "attack") {
      rig.current.rotation.x = -air.current * Math.PI * 2;
      rig.current.position.y = Math.sin(air.current * Math.PI) * 1.15;
      rig.current.position.z = air.current * 0.2;
    } else {
      rig.current.rotation.x = 0;
      rig.current.position.y = bob;
      rig.current.position.z = 0;
    }
    rig.current.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        mat.transparent = gait.current.fade < 0.99;
        mat.opacity = gait.current.fade;
      }
    });
    if (legL.current) legL.current.rotation.x = swing * 0.7;
    if (legR.current) legR.current.rotation.x = -swing * 0.7;
    if (arm.current) arm.current.rotation.x = act === "attack" ? -1.35 : -swing * 0.55;
  });

  return (
    <group ref={rig} scale={s}>
      <group ref={legL} position={[-0.12, 0.42, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.28, 4, 8]} />
          <Mat color={look.legs} clip={clip} />
        </mesh>
      </group>
      <group ref={legR} position={[0.12, 0.42, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.28, 4, 8]} />
          <Mat color={look.legs} clip={clip} />
        </mesh>
      </group>
      <mesh position={[0, 0.72, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.28, 6, 10]} />
        <Mat color={look.top} clip={clip} metal={look.head === "helm" || look.head === "visor" ? 0.45 : 0.08} />
      </mesh>
      {look.cape ? (
        <mesh position={[0, 0.7, -0.12]} castShadow>
          <boxGeometry args={[0.42, 0.7, 0.04]} />
          <Mat color={look.cape} clip={clip} rough={0.9} />
        </mesh>
      ) : null}
      <mesh position={[-0.24, 0.78, 0]} rotation={[0, 0, 0.4]} castShadow>
        <capsuleGeometry args={[0.05, 0.22, 4, 8]} />
        <Mat color={look.top} clip={clip} />
      </mesh>
      <group ref={arm} position={[0.24, 0.86, 0]}>
        <mesh position={[0.02, -0.16, 0.08]} rotation={[0.4, 0, -0.3]} castShadow>
          <capsuleGeometry args={[0.05, 0.22, 4, 8]} />
          <Mat color={look.top} clip={clip} />
        </mesh>
        <Weapon kind={look.weapon} clip={clip} />
      </group>
      <group position={[0, 1.12, 0]}>
        {look.head === "hood" ? (
          <mesh castShadow>
            <sphereGeometry args={[0.16, 16, 12]} />
            <Mat color={look.helm ?? look.top} clip={clip} />
          </mesh>
        ) : (
          <mesh castShadow>
            <sphereGeometry args={[0.15, 16, 12]} />
            <Mat color={look.head === "face" ? look.skin : look.helm ?? "#eee"} clip={clip} metal={look.head === "face" ? 0 : 0.4} />
          </mesh>
        )}
        {look.head === "face" && look.hair ? (
          <mesh position={[0, 0.06, 0]}>
            <sphereGeometry args={[0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <Mat color={look.hair} clip={clip} />
          </mesh>
        ) : null}
        {look.visor ? (
          <mesh position={[0, 0.02, 0.12]}>
            <boxGeometry args={[0.16, 0.045, 0.04]} />
            <Mat color={look.visor} emissive={look.visor} clip={clip} />
          </mesh>
        ) : null}
        {look.eyes ? (
          <>
            <mesh position={[-0.05, 0.02, 0.12]}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <Mat color={look.eyes} emissive={look.eyes} clip={clip} />
            </mesh>
            <mesh position={[0.05, 0.02, 0.12]}>
              <sphereGeometry args={[0.02, 8, 8]} />
              <Mat color={look.eyes} emissive={look.eyes} clip={clip} />
            </mesh>
          </>
        ) : null}
      </group>
    </group>
  );
}

function Weapon({ kind, clip }: { kind: Weapon; clip: THREE.Plane | null }) {
  if (kind === "gun" || kind === "rifle") {
    return (
      <group position={[0.08, -0.28, 0.22]} rotation={[1.15, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.06, 0.08, kind === "rifle" ? 0.34 : 0.2]} />
          <Mat color="#4a4e55" clip={clip} metal={0.6} rough={0.35} />
        </mesh>
      </group>
    );
  }
  if (kind === "staff") {
    return (
      <group position={[0.06, -0.2, 0.16]}>
        <mesh>
          <cylinderGeometry args={[0.025, 0.025, 0.85, 8]} />
          <Mat color="#6b4a2a" clip={clip} />
        </mesh>
        <mesh position={[0, 0.46, 0]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <Mat color="#ffb15a" emissive="#ff6a1a" clip={clip} />
        </mesh>
      </group>
    );
  }
  const color = kind === "red" ? "#ff2a2a" : "#7ecbff";
  return (
    <mesh position={[0.04, -0.34, 0.16]} rotation={[0.2, 0, 0.1]}>
      <boxGeometry args={[0.03, 0.46, 0.03]} />
      <Mat color={color} emissive={color} clip={clip} />
    </mesh>
  );
}
