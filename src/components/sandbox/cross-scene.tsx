import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { CanvasTexture, Color, Group } from "three";
import type { Mesh } from "three";

export type Team = "W" | "E" | "N" | "S";
export type Kind = "k" | "q" | "r" | "b" | "n" | "p";

export type Unit = {
  id: string;
  team: Team;
  kind: Kind;
  x: number;
  z: number;
  alive: boolean;
  shake: number;
};

export const TEAM_COLOR: Record<Team, string> = {
  W: "#e0b15a",
  E: "#6ea8ff",
  N: "#7dce86",
  S: "#d46a6a",
};

export const TEAM_NAME: Record<Team, string> = {
  W: "You",
  E: "East",
  N: "North",
  S: "South",
};

const MODEL: Record<Kind, string> = {
  k: "/units/knight.glb",
  q: "/units/mage.glb",
  r: "/units/barbarian.glb",
  b: "/units/rogue-hooded.glb",
  n: "/units/knight.glb",
  p: "/units/rogue.glb",
};

const ORDER: Kind[] = ["r", "n", "b", "q", "k", "b", "n", "r"];

export function inCenter(x: number, z: number) {
  return (x === -1 || x === 0) && (z === -1 || z === 0);
}

export function cellKey(x: number, z: number) {
  return inCenter(x, z) ? "center" : `${x},${z}`;
}

function onBoard(x: number, z: number) {
  const center = x >= -4 && x <= 3 && z >= -4 && z <= 3;
  const west = x >= -12 && x <= -5 && z >= -4 && z <= 3;
  const east = x >= 4 && x <= 11 && z >= -4 && z <= 3;
  const south = z >= -12 && z <= -5 && x >= -4 && x <= 3;
  const north = z >= 4 && z <= 11 && x >= -4 && x <= 3;
  return center || west || east || south || north;
}

export function startUnits(): Unit[] {
  const units: Unit[] = [];
  const add = (team: Team, x: number, z: number, kind: Kind) => {
    units.push({ id: `${team}-${units.length}`, team, kind, x, z, alive: true, shake: 0 });
  };
  for (let i = 0; i < 8; i++) {
    add("W", -12, -4 + i, ORDER[i]);
    add("W", -11, -4 + i, "p");
    add("E", 11, -4 + i, ORDER[i]);
    add("E", 10, -4 + i, "p");
    add("S", -4 + i, -12, ORDER[i]);
    add("S", -4 + i, -11, "p");
    add("N", -4 + i, 11, ORDER[i]);
    add("N", -4 + i, 10, "p");
  }
  return units;
}

function forward(team: Team): [number, number] {
  if (team === "W") return [1, 0];
  if (team === "E") return [-1, 0];
  if (team === "S") return [0, 1];
  return [0, -1];
}

function occupied(units: Unit[], x: number, z: number, ignore?: string) {
  return units.find((u) => u.alive && u.id !== ignore && cellKey(u.x, u.z) === cellKey(x, z));
}

export function legalMoves(units: Unit[], unit: Unit, allies: Partial<Record<Team, Team>>): { x: number; z: number }[] {
  if (!unit.alive) return [];
  const [fx, fz] = forward(unit.team);
  const rx = -fz;
  const rz = fx;
  const out: { x: number; z: number }[] = [];
  const push = (x: number, z: number, capture: boolean) => {
    if (!onBoard(x, z)) return;
    const foe = occupied(units, x, z, unit.id);
    if (foe) {
      if (!capture) return;
      if (foe.team === unit.team) return;
      if (allies[unit.team] === foe.team) return;
      out.push({ x, z });
      return;
    }
    if (!capture) out.push({ x, z });
  };
  const ray = (dx: number, dz: number, max: number) => {
    for (let step = 1; step <= max; step++) {
      const x = unit.x + dx * step;
      const z = unit.z + dz * step;
      if (!onBoard(x, z)) break;
      const foe = occupied(units, x, z, unit.id);
      if (foe) {
        if (foe.team !== unit.team && allies[unit.team] !== foe.team) out.push({ x, z });
        break;
      }
      out.push({ x, z });
    }
  };
  if (unit.kind === "p") {
    const nx = unit.x + fx;
    const nz = unit.z + fz;
    if (onBoard(nx, nz) && !occupied(units, nx, nz, unit.id)) out.push({ x: nx, z: nz });
    push(unit.x + fx + rx, unit.z + fz + rz, true);
    push(unit.x + fx - rx, unit.z + fz - rz, true);
  } else if (unit.kind === "n") {
    for (const [a, b] of [
      [1, 2],
      [2, 1],
      [-1, 2],
      [-2, 1],
      [1, -2],
      [2, -1],
      [-1, -2],
      [-2, -1],
    ]) {
      const x = unit.x + a;
      const z = unit.z + b;
      if (!onBoard(x, z)) continue;
      const foe = occupied(units, x, z, unit.id);
      if (!foe || (foe.team !== unit.team && allies[unit.team] !== foe.team)) out.push({ x, z });
    }
  } else if (unit.kind === "k") {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const x = unit.x + dx;
        const z = unit.z + dz;
        if (!onBoard(x, z)) continue;
        const foe = occupied(units, x, z, unit.id);
        if (!foe || (foe.team !== unit.team && allies[unit.team] !== foe.team)) out.push({ x, z });
      }
    }
  } else if (unit.kind === "r") {
    ray(1, 0, 16);
    ray(-1, 0, 16);
    ray(0, 1, 16);
    ray(0, -1, 16);
  } else if (unit.kind === "b") {
    ray(1, 1, 16);
    ray(1, -1, 16);
    ray(-1, 1, 16);
    ray(-1, -1, 16);
  } else {
    ray(1, 0, 16);
    ray(-1, 0, 16);
    ray(0, 1, 16);
    ray(0, -1, 16);
    ray(1, 1, 16);
    ray(1, -1, 16);
    ray(-1, 1, 16);
    ray(-1, -1, 16);
  }
  return out;
}

function attacks(units: Unit[], from: Unit, tx: number, tz: number, allies: Partial<Record<Team, Team>>) {
  return legalMoves(units, from, allies).some((m) => cellKey(m.x, m.z) === cellKey(tx, tz));
}

export function kingOf(units: Unit[], team: Team) {
  return units.find((u) => u.alive && u.team === team && u.kind === "k");
}

export function inCheck(units: Unit[], team: Team, allies: Partial<Record<Team, Team>>) {
  const king = kingOf(units, team);
  if (!king) return true;
  return units.some((u) => u.alive && u.team !== team && allies[team] !== u.team && attacks(units, u, king.x, king.z, allies));
}

export function teamLost(units: Unit[], team: Team, allies: Partial<Record<Team, Team>>) {
  const mine = units.filter((u) => u.alive && u.team === team);
  if (!mine.some((u) => u.kind === "k")) return true;
  if (mine.length === 1) return true;
  if (mine.every((u) => u.kind === "k" || u.kind === "p")) return true;
  const moves = mine.flatMap((u) => legalMoves(units, u, allies).map((m) => ({ u, m })));
  if (inCheck(units, team, allies) && moves.length === 0) return true;
  return false;
}

function paintGrid() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext("2d");
  if (!g) return c;
  g.fillStyle = "#3d6b34";
  g.fillRect(0, 0, 1024, 1024);
  const cell = 1024 / 28;
  const origin = 2;
  const paint = (ox: number, oz: number) => {
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 8; z++) {
        const mid = x >= 3 && x <= 4 && z >= 3 && z <= 4 && ox === 12 && oz === 12;
        g.fillStyle = mid ? "#8a5a28" : (x + z) % 2 === 0 ? "#cbb98a" : "#6d5340";
        g.fillRect((origin + ox + x) * cell, (origin + oz + z) * cell, cell - 1, cell - 1);
      }
    }
  };
  paint(12, 12);
  paint(0, 12);
  paint(20, 12);
  paint(12, 0);
  paint(12, 20);
  g.strokeStyle = "#f2e2b0";
  g.lineWidth = 4;
  g.strokeRect(origin * cell, origin * cell, 24 * cell, 24 * cell);
  return c;
}

function Hills() {
  const texture = useMemo(() => {
    const t = new CanvasTexture(paintGrid());
    t.colorSpace = "srgb";
    return t;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[42, 42]} />
        <meshStandardMaterial map={texture} roughness={0.9} />
      </mesh>
      {[
        [-14, -0.2, -10, 8, 1.2, 6],
        [13, -0.3, 9, 7, 1.4, 5],
        [-8, -0.2, 14, 6, 1, 4],
        [10, -0.15, -13, 5, 0.9, 5],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]} scale={[w, h, d]} receiveShadow>
          <sphereGeometry args={[1, 18, 12]} />
          <meshStandardMaterial color="#4e7a3e" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function Sun() {
  const light = useRef<Group>(null);
  const sun = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.035;
    const x = Math.cos(t) * 22;
    const y = Math.sin(t) * 14;
    if (sun.current) sun.current.position.set(x, Math.max(y, -2), 8);
  });
  return (
    <>
      <ambientLight intensity={0.28} />
      <directionalLight position={[10, 12, 6]} intensity={1.35} castShadow />
      <mesh ref={sun}>
        <sphereGeometry args={[0.7, 16, 16]} />
        <meshStandardMaterial emissive="#ffd27a" emissiveIntensity={2} color="#ffd27a" />
      </mesh>
    </>
  );
}

function Tree({ x, z }: { x: number; z: number }) {
  const gltf = useGLTF("/glade/trees.glb");
  const clone = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return <primitive object={clone} position={[x + 0.5, 0, z + 0.5]} scale={0.35} />;
}

function Grass({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x + 0.72, 0.08, z + 0.22]} castShadow>
      <coneGeometry args={[0.08, 0.28, 5]} />
      <meshStandardMaterial color="#6ea85a" />
    </mesh>
  );
}

function Walker({ unit, look }: { unit: Unit; look: string }) {
  const url = unit.team === "W" ? look : MODEL[unit.kind];
  const gltf = useGLTF(url);
  const ref = useRef<Group>(null);
  const pos = useRef({ x: unit.x + 0.5, z: unit.z + 0.5 });
  useFrame((_, dt) => {
    const node = ref.current;
    if (!node) return;
    const tx = unit.x + 0.5;
    const tz = unit.z + 0.5;
    const dx = tx - pos.current.x;
    const dz = tz - pos.current.z;
    const dist = Math.hypot(dx, dz);
    const step = Math.min(1, dt / 0.9);
    if (dist > 0.01) {
      pos.current.x += dx * step;
      pos.current.z += dz * step;
      node.lookAt(tx, 0, tz);
    }
    node.position.set(pos.current.x - 14, 0, pos.current.z - 14);
    const bob = unit.shake > 0 ? Math.sin(performance.now() / 80) * 0.08 : 0;
    node.position.y = bob;
  });
  const tint = new Color(TEAM_COLOR[unit.team]);
  return (
    <group ref={ref}>
      <primitive object={gltf.scene.clone(true)} scale={0.55} />
      <mesh position={[0, 1.35, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

export function CrossScene({
  units,
  look,
  owner,
  progress,
}: {
  units: Unit[];
  look: string;
  owner: Team | null;
  progress: number;
}) {
  const trees = useMemo(() => {
    const spots: { x: number; z: number }[] = [];
    for (let x = -12; x <= 11; x++) {
      for (let z = -12; z <= 11; z++) {
        if (!onBoard(x, z)) continue;
        if ((x * 3 + z * 7) % 5 !== 0) continue;
        if (inCenter(x, z)) continue;
        spots.push({ x, z });
      }
    }
    return spots;
  }, []);
  return (
    <Canvas camera={{ position: [8, 16, 18], fov: 42 }} shadows>
      <color attach="background" args={["#1b2430"]} />
      <fog attach="fog" args={["#1b2430", 28, 62]} />
      <Sun />
      <Suspense fallback={null}>
        <Hills />
        {trees.map((s) => (
          <group key={`${s.x},${s.z}`} position={[-14, 0, -14]}>
            <Tree x={s.x} z={s.z} />
            <Grass x={s.x} z={s.z} />
          </group>
        ))}
        {units
          .filter((u) => u.alive)
          .map((u) => (
            <Walker key={u.id} unit={u} look={look} />
          ))}
        {owner ? (
          <mesh position={[-14.5, 0.15 + progress * 0.08, -14.5]}>
            <cylinderGeometry args={[1.3, 1.6, 0.4 + progress * 0.18, 20]} />
            <meshStandardMaterial color={TEAM_COLOR[owner]} roughness={0.6} />
          </mesh>
        ) : null}
      </Suspense>
      <OrbitControls maxPolarAngle={Math.PI / 2.1} />
    </Canvas>
  );
}

useGLTF.preload("/units/knight.glb");
useGLTF.preload("/units/mage.glb");
useGLTF.preload("/units/barbarian.glb");
useGLTF.preload("/units/rogue.glb");
useGLTF.preload("/units/rogue-hooded.glb");
useGLTF.preload("/glade/trees.glb");
