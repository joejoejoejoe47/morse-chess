import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { asset } from "@/lib/base";
import { StonePerson, type Gait } from "@/components/chess/stone-people";
import {
  PITCH,
  TEAM_COLOR,
  TEAM_NAME,
  TEAMS,
  YOU,
  botMove,
  canAlly,
  groundY,
  legalMoves,
  newGame,
  onBoard,
  pickCell,
  play,
  spreadOn,
  worldOf,
  type CrossState,
  type Move,
  type Team,
  type Unit,
} from "@/lib/sandbox/cross-rules";

const WALK_SPEED = 2.6;

function walkMs(from: [number, number, number], to: [number, number, number]) {
  const dist = Math.hypot(to[0] - from[0], to[2] - from[2]);
  return Math.max(360, (dist / WALK_SPEED) * 1000);
}
const TREE = asset("/nature/tree.glb");
const PINE = asset("/nature/pine.glb");
const BUSH = asset("/nature/bush.glb");
const GRASS = asset("/nature/grass.glb");
const BOWL = asset("/arena/coliseum.glb");

useGLTF.preload(TREE);
useGLTF.preload(PINE);
useGLTF.preload(BUSH);
useGLTF.preload(GRASS);
useGLTF.preload(BOWL);

type Slide = { from: [number, number, number]; to: [number, number, number]; start: number; until: number };
type Shake = { ids: [string, string]; start: number; until: number };
type Spot = { x: number; y: number; z: number; rot: number; s: number; color?: string };

const FACE: Record<Team, number> = { s: 0, n: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 };
const SEAT_ANGLE: Record<Team, number> = { s: 0, w: 90, n: 180, e: 270 };
const CAM: Record<Team, [number, number, number]> = {
  s: [0, 16, -20],
  n: [0, 16, 20],
  w: [-20, 16, 0],
  e: [20, 16, 0],
};

function screenEdge(team: Team, me: Team): "bottom" | "left" | "top" | "right" {
  const rel = (SEAT_ANGLE[team] - SEAT_ANGLE[me] + 360) % 360;
  if (rel === 90) return "left";
  if (rel === 180) return "top";
  if (rel === 270) return "right";
  return "bottom";
}

function SlowSun() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const rays = useRef<THREE.Group>(null);
  const gold = useMemo(() => new THREE.Color("#f6c56b"), []);
  const noon = useMemo(() => new THREE.Color("#f3e2b0"), []);
  const dusk = useMemo(() => new THREE.Color("#c47a3a"), []);
  const late = useMemo(() => new THREE.Color("#6a4030"), []);
  const sky = useMemo(() => new THREE.Color("#f6c56b"), []);
  useFrame(({ clock, scene }) => {
    // A full day is four minutes, but the sun stays up. Night is a short warm dusk.
    const ang = (clock.elapsedTime / 240) * Math.PI * 2 + 0.9;
    const elev = Math.sin(ang) * 0.5 + 0.48;
    const day = THREE.MathUtils.smoothstep(elev, 0.02, 0.22);
    const glow = Math.exp(-((elev - 0.62) ** 2) * 10);
    sky.copy(late).lerp(gold, day);
    sky.lerp(noon, day * 0.35);
    sky.lerp(dusk, glow * 0.55);
    if (scene.background instanceof THREE.Color) scene.background.copy(sky);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(sky);
      scene.fog.near = 28 + day * 18;
      scene.fog.far = 70 + day * 50;
    }
    const x = Math.cos(ang) * 18;
    const y = 10 + Math.max(elev, 0.05) * 28;
    const z = 16 + Math.sin(ang) * 6;
    if (sun.current) {
      sun.current.position.set(x, y, z);
      sun.current.intensity = 0.55 + day * 1.85;
      sun.current.color.set(glow > 0.2 ? "#ffd39a" : "#fff1cf");
    }
    if (hemi.current) hemi.current.intensity = 0.35 + day * 0.4;
    if (rays.current) {
      rays.current.position.set(x * 0.35, y * 0.45, z * 0.35);
      rays.current.visible = day > 0.35;
    }
  });
  return (
    <>
      <color attach="background" args={["#f6c56b"]} />
      <fog attach="fog" args={["#f0c56a", 34, 92]} />
      <hemisphereLight ref={hemi} args={["#ffe6b0", "#3f6a28", 0.55]} />
      <ambientLight intensity={0.34} color="#ffe7c2" />
      <directionalLight ref={sun} position={[12, 26, 16]} intensity={2.1} color="#ffe1a8" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-far={80} shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={24} shadow-camera-bottom={-24} />
      <group ref={rays}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[(i - 2.5) * 2.4, -6, i % 2]} rotation={[0.15, 0, (i - 2.5) * 0.08]} raycast={() => null}>
            <planeGeometry args={[1.6, 34]} />
            <meshBasicMaterial color="#ffe7b8" transparent opacity={0.07} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </>
  );
}

function PaintedHill({ onCell }: { onCell: (id: string) => void }) {
  const maps = useTexture({
    map: asset("/glade/ground/diff.jpg"),
    normalMap: asset("/glade/ground/nor.jpg"),
    roughnessMap: asset("/glade/ground/rough.jpg"),
  });
  const geo = useMemo(() => {
    for (const tex of [maps.map, maps.normalMap, maps.roughnessMap]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(28, 28);
    }
    maps.map.colorSpace = THREE.SRGBColorSpace;
    const steps = 46;
    const span = steps * PITCH;
    const segs = steps * 2;
    const ground = new THREE.PlaneGeometry(span * 2, span * 2, segs, segs);
    ground.rotateX(-Math.PI / 2);
    const pos = ground.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const wild = new THREE.Color("#7fbf4e");
    const far = new THREE.Color("#c6b06a");
    const light = new THREE.Color("#86c456");
    const dark = new THREE.Color("#6eae46");
    const plaza = new THREE.Color("#e4c98a");
    const gutter = new THREE.Color("#3d5a28");
    const pond = new THREE.Color("#8ecfc4");
    const tint = new THREE.Color();
    const ponds = [
      [18, 9],
      [-18, 9],
      [18, -9],
      [-18, -9],
      [11, 24],
      [-11, 24],
      [11, -24],
      [-11, -24],
    ];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, groundY(x, z));
      const cell = pickCell(x, z);
      tint.copy(wild);
      const wet = ponds.some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.7);
      if (cell === "forum") {
        const edge = Math.max(Math.abs(x), Math.abs(z)) / (PITCH * 0.98);
        tint.copy(edge > 0.9 ? gutter : plaza);
      } else if (cell) {
        const [a, b] = cell.split(",").map(Number);
        tint.copy(((a ?? 0) + (b ?? 0)) % 2 === 0 ? light : dark);
        const [cx, , cz] = worldOf(cell);
        const edge = Math.max(Math.abs(x - cx), Math.abs(z - cz)) / (PITCH * 0.5);
        if (edge > 0.93) tint.copy(gutter);
      } else if (wet) {
        tint.copy(pond);
      } else {
        const rim = THREE.MathUtils.smoothstep(Math.hypot(x, z), 18, 40);
        tint.lerp(far, rim * 0.55);
      }
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    ground.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    ground.computeVertexNormals();
    return ground;
  }, [maps]);
  return (
    <mesh
      geometry={geo}
      receiveShadow
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        const id = pickCell(event.point.x, event.point.z);
        if (id) onCell(id);
      }}
    >
      <meshStandardMaterial map={maps.map} normalMap={maps.normalMap} roughnessMap={maps.roughnessMap} roughness={0.92} metalness={0} vertexColors />
    </mesh>
  );
}

function Scatter({ url, spots }: { url: string; spots: Spot[] }) {
  const gltf = useGLTF(url);
  const parts = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const height = Math.max(0.001, new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y);
    const geos: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of list) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.roughness = Math.max(mat.roughness, 0.78);
          mat.metalness = 0;
        }
      }
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (mat) geos.push({ geo, mat });
    });
    return { geos, height };
  }, [gltf.scene]);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    refs.current.forEach((mesh) => {
      if (!mesh) return;
      spots.forEach((spot, i) => {
        dummy.position.set(spot.x, spot.y, spot.z);
        dummy.rotation.set(0, spot.rot, 0);
        dummy.scale.setScalar(spot.s / parts.height);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (spot.color) {
          if (!mesh.instanceColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3), 3);
          mesh.setColorAt(i, new THREE.Color(spot.color));
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [spots, parts.height]);
  if (!spots.length) return null;
  return (
    <group>
      {parts.geos.map((part, index) => (
        <instancedMesh key={index} ref={(node) => { refs.current[index] = node; }} args={[part.geo, part.mat, spots.length]} frustumCulled={false} raycast={() => null} />
      ))}
    </group>
  );
}

function Nature({ spots }: { spots: { tree: Spot[]; pine: Spot[]; bush: Spot[]; grass: Spot[] } }) {
  return (
    <group>
      <Scatter url={TREE} spots={spots.tree} />
      <Scatter url={PINE} spots={spots.pine} />
      <Scatter url={BUSH} spots={spots.bush} />
      <Scatter url={GRASS} spots={spots.grass} />
    </group>
  );
}

function RisingBowl({ color, progress, need, takes }: { color: string; progress: number; need: number; takes: number }) {
  const gltf = useGLTF(BOWL);
  const model = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = list.map((mat) => {
        const copy = mat.clone();
        if (copy instanceof THREE.MeshStandardMaterial) {
          copy.emissive = new THREE.Color(color);
          copy.emissiveIntensity = 0.18 + Math.min(3, takes) * 0.16;
        }
        return copy;
      });
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const fit = 2.15 / Math.max(size.x, size.z, 0.001);
    root.scale.setScalar(fit);
    root.position.y -= box.min.y * fit;
    return root;
  }, [gltf.scene, color, takes]);
  const grown = 0.16 + 0.84 * Math.min(1, progress / Math.max(need, 1));
  return (
    <group scale={grown * 0.62} position={[0, groundY(0, 0), 0]}>
      <primitive object={model} />
    </group>
  );
}

function Ranger({
  unit,
  slide,
  shake,
  partner,
  index,
  count,
  onPick,
}: {
  unit: Unit;
  slide?: Slide;
  shake: Shake | null;
  partner: [number, number, number] | null;
  index: number;
  count: number;
  onPick: (id: string) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const gait = useRef<Gait>({ phase: 0, amp: 0, act: "idle", fade: 1 });
  const [ox, oz] = spreadOn(unit.cell, index, count);
  const home = worldOf(unit.cell);
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const now = performance.now();
    let x = home[0] + ox;
    let z = home[2] + oz;
    let walking = false;
    if (slide && now < slide.until) {
      const span = Math.max(1, slide.until - slide.start);
      const k = Math.min(1, (now - slide.start) / span);
      const e = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;
      x = slide.from[0] + (slide.to[0] - slide.from[0]) * e;
      z = slide.from[2] + (slide.to[2] - slide.from[2]) * e;
      walking = true;
      group.rotation.y = Math.atan2(slide.to[0] - slide.from[0], slide.to[2] - slide.from[2]);
    } else if (shake && partner && shake.ids.includes(unit.id) && now < shake.until) {
      const span = Math.max(1, shake.until - shake.start);
      const k = Math.min(1, (now - shake.start) / span);
      const wave = Math.sin(k * Math.PI);
      x = x + (partner[0] - x) * 0.42 * wave;
      z = z + (partner[2] - z) * 0.42 * wave;
      group.rotation.y = Math.atan2(partner[0] - home[0], partner[2] - home[2]);
    } else {
      group.rotation.y = FACE[unit.team];
    }
    group.position.set(x, groundY(x, z), z);
    gait.current.act = walking ? "walk" : "idle";
  });
  return (
    <group ref={ref} onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onPick(unit.id); }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[0.07, 12]} />
        <meshBasicMaterial color={TEAM_COLOR[unit.team]} transparent opacity={0.95} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.56, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <group scale={0.3}>
        <StonePerson type={unit.type} white cast="stone" gait={gait} sword={false} />
      </group>
    </group>
  );
}

function Field({
  state,
  slides,
  shake,
  selected,
  moves,
  onCell,
  onUnit,
}: {
  state: CrossState;
  slides: Record<string, Slide>;
  shake: Shake | null;
  selected: string | null;
  moves: Move[];
  onCell: (id: string) => void;
  onUnit: (id: string) => void;
}) {
  const cells = useMemo(() => boardCells(), []);
  const spots = useMemo(() => {
    const tree: Spot[] = [];
    const pine: Spot[] = [];
    const bush: Spot[] = [];
    const grass: Spot[] = [];
    const seeds: [number, number, "tree" | "pine" | "bush", number][] = [
      [10.5, 16.5, "pine", 1.15],
      [15, 12.5, "tree", 1.45],
      [18.5, 7, "pine", 0.95],
      [22, 15, "tree", 1.7],
      [13, 21, "pine", 1.2],
      [24, 5.5, "tree", 1.25],
      [8.5, 23, "bush", 0.42],
      [26, 11, "pine", 1.05],
      [19, 20, "tree", 1.55],
      [28, 18, "pine", 0.9],
      [16, 26, "tree", 1.35],
      [23, 24, "bush", 0.38],
    ];
    for (const [sx, sz, kind, size] of seeds) {
      for (const [mx, mz] of [
        [sx, sz],
        [-sx, sz],
        [sx, -sz],
        [-sx, -sz],
      ]) {
        if (onBoard(mx, mz)) continue;
        const spot = { x: mx, y: 0, z: mz, rot: 0, s: size };
        if (kind === "tree") tree.push(spot);
        else if (kind === "pine") pine.push(spot);
        else bush.push(spot);
        grass.push({ x: mx + 0.8, y: 0, z: mz - 0.6, rot: 0.4, s: 0.22 });
      }
    }
    const lift = (list: Spot[]) => list.map((spot) => ({ ...spot, y: groundY(spot.x, spot.z) }));
    return { tree: lift(tree), pine: lift(pine), bush: lift(bush), grass: lift(grass) };
  }, []);
  const targets = new Set(moves.filter((move) => move.unitId === selected).map((move) => move.to));
  const holders = state.units.filter((unit) => unit.team === state.forum.owner && unit.cell === "forum").length;
  const need = holders >= 2 ? 9 : 10;
  const byCell = new Map<string, Unit[]>();
  for (const unit of state.units) {
    const list = byCell.get(unit.cell) ?? [];
    list.push(unit);
    byCell.set(unit.cell, list);
  }
  return (
    <>
      <SlowSun />
      <PaintedHill onCell={onCell} />
      <Nature spots={spots} />
      {[...targets].map((id) => {
        const [x, , z] = worldOf(id);
        return (
          <mesh key={id} position={[x, groundY(x, z) + 0.08, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[0.18, 0.28, 18]} />
            <meshBasicMaterial color="#f6e7a2" />
          </mesh>
        );
      })}
      {state.forum.owner ? (
        <RisingBowl color={TEAM_COLOR[state.forum.owner]} progress={state.forum.progress} need={need} takes={state.forum.takes} />
      ) : null}
      {state.units.map((unit) => {
        const mates = byCell.get(unit.cell) ?? [unit];
        const partnerId = shake?.ids.find((id) => id !== unit.id);
        const partnerUnit = partnerId ? state.units.find((u) => u.id === partnerId) : undefined;
        return (
          <Ranger
            key={unit.id}
            unit={unit}
            slide={slides[unit.id]}
            shake={shake}
            partner={partnerUnit ? worldOf(partnerUnit.cell) : null}
            index={mates.findIndex((mate) => mate.id === unit.id)}
            count={mates.length}
            onPick={onUnit}
          />
        );
      })}
      <OrbitControls target={[0, 0.4, 0]} maxPolarAngle={1.15} minDistance={8} maxDistance={42} enablePan={false} />
    </>
  );
}

function Portrait({ team, active, edge, mine, ai }: { team: Team; active: boolean; edge: "top" | "bottom" | "left" | "right"; mine: boolean; ai?: boolean }) {
  const place =
    edge === "bottom"
      ? "bottom-4 left-1/2 -translate-x-1/2"
      : edge === "top"
        ? "top-20 left-1/2 -translate-x-1/2"
        : edge === "left"
          ? "left-3 top-1/2 -translate-y-1/2"
          : "right-3 top-1/2 -translate-y-1/2";
  return (
    <div className={`pointer-events-none absolute ${place} flex flex-col items-center gap-1`}>
      <img
        src={asset("/avatars/ra-preview.png")}
        alt=""
        className="size-16 rounded-full object-cover shadow-lg"
        style={{
          boxShadow: active ? `0 0 0 3px ${TEAM_COLOR[team]}, 0 0 18px ${TEAM_COLOR[team]}` : "0 8px 18px rgba(0,0,0,0.35)",
          outline: `3px solid ${TEAM_COLOR[team]}`,
          transform: active ? "scale(1.08)" : undefined,
        }}
      />
      <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-white">
        {mine && active ? "My turn" : mine ? "You" : ai ? "AI" : TEAM_NAME[team]}
      </span>
    </div>
  );
}

export type HillMove = { unitId: string; to: string; choice?: "dominate" | "ally"; turn?: Team; over?: boolean };

export type HillTable = {
  gameId: string;
  seats: Record<Team, string>;
  pull: () => Promise<{ revision: number; moves: HillMove[]; turn: Team }>;
  push: (revision: number, move: HillMove) => Promise<{ ok: boolean; revision: number; moves: HillMove[] }>;
};

function replayMoves(moves: HillMove[]) {
  let next = newGame();
  for (const move of moves) {
    const result = play(next, move, move.choice);
    if (result.state !== next) next = result.state;
  }
  return next;
}

function MeadowPanel({
  coins,
  state,
  myTeam,
  need,
  onHome,
}: {
  coins: number;
  state: CrossState;
  myTeam: Team;
  need: number;
  onHome: () => void;
}) {
  const pct = state.forum.owner ? Math.min(100, Math.round((state.forum.progress / Math.max(need, 1)) * 100)) : 0;
  const ally = state.ally[myTeam];
  return (
    <aside className="absolute left-3 top-3 z-10 w-[min(16rem,42vw)] space-y-2 text-[#efe6d2]">
      <button
        type="button"
        onClick={onHome}
        className="w-full rounded-md border border-[#6d5b3c] bg-[#241c14]/90 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.22em] shadow-lg"
      >
        Lounge
      </button>
      <section className="rounded-md border border-[#6d5b3c] bg-[#1c1712]/90 p-3 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded bg-[#2a2418] text-lg" aria-hidden>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M8 13c.8 1 2 1.6 4 1.6s3.2-.6 4-1.6" />
              <path d="M7 11.5 4.5 9l2-2 2.2 2.2M17 11.5 19.5 9l-2-2-2.2 2.2" />
            </svg>
          </span>
          <h2 className="text-[11px] uppercase tracking-[0.2em]">Alliances</h2>
        </div>
        <ul className="mt-3 space-y-1.5">
          {TEAMS.map((team) => {
            const mine = team === myTeam;
            const fallen = state.out.includes(team);
            const friend = ally === team;
            const note = mine ? "You" : fallen ? "Fallen" : friend ? "Allied" : "At war";
            return (
              <li key={team} className="flex items-center justify-between gap-2 rounded bg-black/25 px-2 py-1.5">
                <span className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-sm" style={{ background: TEAM_COLOR[team] }} />
                  {TEAM_NAME[team]}
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-[#d9c7a2]">{note}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="rounded-md border border-[#6d5b3c] bg-[#1c1712]/90 p-3 shadow-lg backdrop-blur-sm">
        <h2 className="text-[11px] uppercase tracking-[0.18em]">Colosseum construction</h2>
        <div className="mt-2 h-12 overflow-hidden rounded bg-[#c4a574]">
          <div className="grid h-full place-items-center text-[10px] uppercase tracking-[0.16em] text-[#3a2a16]">
            {state.forum.owner ? TEAM_NAME[state.forum.owner] : "The center square"}
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
          <div className="h-full rounded-full bg-[#e6b422]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-[#f3e2a8]">{pct}% complete</p>
        <p className="text-[11px] text-[#cbbfaa]">{state.forum.owner ? `${state.forum.progress} of ${need} turns` : "Hold the center to begin"}</p>
      </section>
      <section className="rounded-md border border-[#6d5b3c] bg-[#1c1712]/90 p-3 shadow-lg backdrop-blur-sm">
        <h2 className="text-[11px] uppercase tracking-[0.18em]">Overall score</h2>
        <p className="mt-1 flex items-center gap-2 font-display text-2xl text-[#f6e27a]">
          <img src={asset("/morse-coin.png")} alt="" className="size-6" />
          {coins.toLocaleString()}
        </p>
        <svg viewBox="0 0 120 36" className="mt-1 h-8 w-full" aria-hidden>
          <polyline points="0,30 18,26 36,28 54,18 72,20 90,10 120,6" fill="none" stroke="#e6b422" strokeWidth="2" />
        </svg>
      </section>
    </aside>
  );
}

export function CrossGame({
  onHome,
  onAgain,
  myTeam = YOU,
  coins = 0,
  table = null,
}: {
  onHome: () => void;
  onAgain: () => void | Promise<boolean | void>;
  myTeam?: Team;
  coins?: number;
  table?: HillTable | null;
}) {
  const [state, setState] = useState<CrossState>(() => newGame());
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Move | null>(null);
  const [slides, setSlides] = useState<Record<string, Slide>>({});
  const [shake, setShake] = useState<Shake | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(0);
  const rev = useRef(0);
  const seen = useRef(0);
  const applyRef = useRef<(current: CrossState, move: Move, choice?: "dominate" | "ally") => void>(() => {});
  const moves = useMemo(() => (state.turn === myTeam && !state.winner ? legalMoves(state, myTeam) : []), [state, myTeam]);

  function apply(current: CrossState, move: Move, choice?: "dominate" | "ally") {
    const unit = current.units.find((item) => item.id === move.unitId);
    if (!unit) return;
    const result = play(current, move, choice);
    if (result.prompt) {
      setPending(move);
      return;
    }
    if (result.state === current) return;
    const moved = result.state.units.find((item) => item.id === move.unitId);
    const from = worldOf(unit.cell);
    const to = worldOf(moved?.cell ?? move.to);
    const ms = walkMs(from, to);
    const start = performance.now();
    setSlides({ [move.unitId]: { from, to, start, until: start + ms } });
    setShake(result.shake ? { ids: result.shake, start, until: start + Math.max(ms, 1300) } : null);
    setState(result.state);
    setSelected(null);
    setPending(null);
    setBusy(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setBusy(false), ms + 40);
    if (table) {
      const sent = rev.current;
      void table.push(sent, { unitId: move.unitId, to: move.to, choice, turn: result.state.turn, over: Boolean(result.state.winner) }).then((res) => {
        if (res.ok) {
          rev.current = res.revision;
          seen.current = res.moves.length;
        } else rev.current = -1;
      });
    }
  }

  applyRef.current = apply;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!table) return;
    let live = true;
    const tick = async () => {
      try {
        const snap = await table.pull();
        if (!live || snap.revision === rev.current) return;
        const prev = seen.current;
        rev.current = snap.revision;
        seen.current = snap.moves.length;
        const next = replayMoves(snap.moves);
        if (snap.moves.length > prev) {
          const mv = snap.moves[snap.moves.length - 1];
          const before = replayMoves(snap.moves.slice(0, -1));
          const unit = before.units.find((item) => item.id === mv.unitId);
          const landed = next.units.find((item) => item.id === mv.unitId);
          if (unit) {
            const from = worldOf(unit.cell);
            const to = worldOf(landed?.cell ?? mv.to);
            const ms = walkMs(from, to);
            const start = performance.now();
            setSlides({ [mv.unitId]: { from, to, start, until: start + ms } });
            setBusy(true);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setBusy(false), ms + 40);
          }
        }
        setState(next);
        setPending(null);
      } catch {
        /* keep the last board */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 900);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [table]);

  useEffect(() => {
    if (busy || pending || state.winner) return;
    const botSeat = table ? Boolean(table.seats[state.turn]?.startsWith("bot-hill")) : state.turn !== myTeam;
    const host = table ? TEAMS.find((team) => !table.seats[team]?.startsWith("bot-hill")) : myTeam;
    if (!botSeat || (table && host !== myTeam)) return;
    const id = window.setTimeout(() => {
      const move = botMove(state);
      if (move) applyRef.current(state, move, "dominate");
    }, 520);
    return () => window.clearTimeout(id);
  }, [busy, pending, state, table, myTeam]);

  function onCell(id: string) {
    if (busy || state.winner || state.turn !== myTeam || !selected) return;
    if (moves.some((move) => move.unitId === selected && move.to === id)) apply(state, { unitId: selected, to: id });
  }

  function onUnit(id: string) {
    if (busy || state.winner || state.turn !== myTeam) return;
    const unit = state.units.find((item) => item.id === id);
    if (!unit) return;
    if (unit.team === myTeam) {
      setSelected(id);
      return;
    }
    if (selected && moves.some((move) => move.unitId === selected && move.to === unit.cell)) {
      apply(state, { unitId: selected, to: unit.cell });
    }
  }

  function again() {
    void Promise.resolve(onAgain()).then((ok) => {
      if (ok === false) setNote("The other armies are still fighting.");
    });
  }

  const holders = state.units.filter((unit) => unit.team === state.forum.owner && unit.cell === "forum").length;
  const need = holders >= 2 ? 9 : 10;
  const won = state.winner === myTeam;
  const lost = Boolean(state.winner && state.winner !== myTeam) || state.out.includes(myTeam);
  const aiSeat = (team: Team) => (table ? Boolean(table.seats[team]?.startsWith("bot-hill")) : team !== myTeam);
  const aiCount = TEAMS.filter((team) => aiSeat(team)).length;
  const turnName = state.turn === myTeam ? "Your turn" : aiSeat(state.turn) ? "AI's turn" : `${TEAM_NAME[state.turn]}'s turn`;

  return (
    <div className="fixed inset-0 bg-[#102016] text-ivory">
      <Canvas shadows camera={{ position: CAM[myTeam], fov: 32 }} dpr={[1, 1.5]}>
        <Suspense fallback={null}>
          <Field state={state} slides={slides} shake={shake} selected={selected} moves={moves} onCell={onCell} onUnit={onUnit} />
        </Suspense>
      </Canvas>
      <div className="pointer-events-none absolute left-1/2 top-3 w-[min(68vw,18rem)] -translate-x-1/2">
        <div className="rounded-full bg-black/55 px-4 py-2 text-center text-sm text-white backdrop-blur-sm">
          <span className="uppercase tracking-[0.18em]">{turnName}</span>
          {aiCount > 0 ? <span className="mt-0.5 block text-xs text-[#f3e2a8]">Playing the AI</span> : null}
          {state.forum.owner ? (
            <span className="mt-0.5 block text-xs text-white/80">
              Colosseum {state.forum.progress}/{need} · {TEAM_NAME[state.forum.owner]}
            </span>
          ) : (
            <span className="mt-0.5 block text-xs text-white/70">Hold the center. Sliders stop at 8 squares.</span>
          )}
        </div>
      </div>
      <Portrait team="n" edge={screenEdge("n", myTeam)} active={state.turn === "n"} mine={myTeam === "n"} ai={aiSeat("n")} />
      <Portrait team="s" edge={screenEdge("s", myTeam)} active={state.turn === "s"} mine={myTeam === "s"} ai={aiSeat("s")} />
      <Portrait team="w" edge={screenEdge("w", myTeam)} active={state.turn === "w"} mine={myTeam === "w"} ai={aiSeat("w")} />
      <Portrait team="e" edge={screenEdge("e", myTeam)} active={state.turn === "e"} mine={myTeam === "e"} ai={aiSeat("e")} />
      <MeadowPanel
        coins={coins}
        state={state}
        myTeam={myTeam}
        need={need}
        onHome={onHome}
      />
      {pending ? (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/35 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#1a140c]/95 p-5 text-center shadow-2xl">
            <p className="font-display text-2xl text-white">The center is occupied</p>
            <p className="mt-2 text-sm text-white/75">Dominate the square, or shake hands and ally. You can ally with only one army.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" className="flex-1 rounded-xl bg-[#8d2d2d] px-4 py-3 text-sm font-medium text-white" onClick={() => apply(state, pending, "dominate")}>
                Dominate the square
              </button>
              <button
                type="button"
                disabled={!canAlly(state, pending)}
                className="flex-1 rounded-xl bg-[#2f6a45] px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
                onClick={() => apply(state, pending, "ally")}
              >
                Make allies
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {won ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-end bg-cover bg-center p-6" style={{ backgroundImage: `url(${asset("/sandbox/victory.jpg")})` }}>
          <div className="mb-6 w-full max-w-md rounded-2xl bg-black/55 p-5 text-center backdrop-blur-sm">
            <p className="font-display text-4xl text-white">Victory</p>
            <p className="mt-2 text-sm text-white/80">{state.reason}</p>
            {note ? <p className="mt-2 text-sm text-[#f3e2a8]">{note}</p> : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black" onClick={again}>Another game</button>
              <button type="button" className="flex-1 rounded-xl border border-white/40 px-4 py-3 text-sm text-white" onClick={onHome}>Return home</button>
            </div>
          </div>
        </div>
      ) : null}
      {lost && !won ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/72 p-6 text-center">
          <p className="font-display text-[clamp(4rem,12vw,7rem)] leading-none text-white">DEFEAT</p>
          <p className="mt-3 max-w-md text-sm text-white/75">{state.reason || "Your king is gone."}</p>
          {note ? <p className="mt-2 text-sm text-[#f3e2a8]">{note}</p> : null}
          <div className="mt-6 flex w-full max-w-md flex-col gap-2 sm:flex-row">
            <button type="button" className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black" onClick={again}>Start new game</button>
            <button type="button" className="flex-1 rounded-xl border border-white/40 px-4 py-3 text-sm text-white" onClick={onHome}>Return to lounge</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
