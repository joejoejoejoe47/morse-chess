import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { asset } from "@/lib/base";
import { RaPawn, raUnitUrl } from "@/components/chess/ra-men";
import type { Gait } from "@/components/chess/stone-people";
import {
  PITCH,
  TEAM_COLOR,
  TEAM_NAME,
  TEAMS,
  YOU,
  boardCells,
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

function SlowSun() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const dayC = useMemo(() => new THREE.Color("#9ec0e4"), []);
  const nightC = useMemo(() => new THREE.Color("#12182c"), []);
  const dawnC = useMemo(() => new THREE.Color("#e39258"), []);
  const sky = useMemo(() => new THREE.Color("#9ec0e4"), []);
  useFrame(({ clock, scene }) => {
    // A full day is four minutes. Noon and midnight last the same stretch.
    const ang = (clock.elapsedTime / 240) * Math.PI * 2 + Math.PI / 2;
    const elev = Math.sin(ang);
    const day = THREE.MathUtils.smoothstep(elev, -0.04, 0.04);
    const glow = Math.exp(-((elev - 0.02) ** 2) * 28);
    sky.copy(nightC).lerp(dayC, day);
    sky.lerp(dawnC, glow * 0.8);
    if (scene.background instanceof THREE.Color) scene.background.copy(sky);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(sky);
      scene.fog.near = 48 + day * 10;
      scene.fog.far = 120 + day * 20;
    }
    if (sun.current) {
      sun.current.position.set(Math.cos(ang) * 48, 6 + Math.max(elev, -0.15) * 36, Math.sin(ang) * 22);
      sun.current.intensity = 0.08 + day * 2.05;
      sun.current.color.set(glow > 0.25 ? "#ffb06a" : "#fff4d4");
    }
    if (hemi.current) hemi.current.intensity = 0.18 + day * 0.45;
  });
  return (
    <>
      <color attach="background" args={["#9ec0e4"]} />
      <fog attach="fog" args={["#9ec0e4", 36, 84]} />
      <hemisphereLight ref={hemi} args={["#d5e7f8", "#3d6a32", 0.45]} />
      <ambientLight intensity={0.18} />
      <directionalLight ref={sun} position={[20, 24, 8]} intensity={1.8} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-far={80} shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={24} shadow-camera-bottom={-24} />
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
    const ground = new THREE.PlaneGeometry(110, 110, 160, 160);
    ground.rotateX(-Math.PI / 2);
    const pos = ground.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const wild = new THREE.Color("#ffffff");
    const rock = new THREE.Color("#d7c4a4");
    const light = new THREE.Color("#f4ead2");
    const dark = new THREE.Color("#7ea85f");
    const plaza = new THREE.Color("#f0e0bc");
    const tint = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, groundY(x, z));
      const cell = pickCell(x, z);
      tint.copy(wild);
      if (cell === "forum") tint.copy(plaza);
      else if (cell) {
        const [a, b] = cell.split(",").map(Number);
        tint.copy(((a ?? 0) + (b ?? 0)) % 2 === 0 ? light : dark);
        const [cx, , cz] = worldOf(cell);
        const edge = Math.max(Math.abs(x - cx), Math.abs(z - cz)) / (PITCH * 0.5);
        tint.lerp(wild, THREE.MathUtils.smoothstep(edge, 0.86, 1));
      } else {
        const rim = THREE.MathUtils.smoothstep(Math.hypot(x, z), 16, 34);
        tint.lerp(rock, rim);
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.11, 12]} />
        <meshBasicMaterial color={TEAM_COLOR[unit.team]} transparent opacity={0.9} />
      </mesh>
      <group scale={0.2}>
        <RaPawn gait={gait} url={raUnitUrl(unit.type)} team="blue" role={unit.type} tint={TEAM_COLOR[unit.team]} />
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
    cells.forEach((id, i) => {
      const [x, , z] = worldOf(id);
      const flowers = ["#f2d0dc", "#f6e7a8", "#ffffff", "#e7b0c4", "#d7e4f6"];
      grass.push({ x: x + 0.28, y: 0, z: z + 0.18, rot: i * 0.7, s: 0.28 });
      const spot = { x: x - 0.34, y: 0, z: z - 0.22, rot: i * 1.3, s: id === "forum" ? 0.85 : 0.42, color: flowers[i % flowers.length] };
      if (i % 5 === 0) tree.push({ ...spot, color: undefined, s: 0.7 });
      else if (i % 5 === 1) pine.push({ ...spot, color: undefined, s: 0.62 });
      else bush.push(spot);
    });
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2 + (i % 5) * 0.17;
      const rad = 18 + (i % 8) * 2.4;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad * 0.86;
      if (onBoard(x, z)) continue;
      const spot = { x, y: 0, z, rot: i, s: 2.8 + (i % 4) * 0.7 };
      if (i % 2 === 0) tree.push(spot);
      else pine.push(spot);
    }
    const lift = (list: Spot[]) => list.map((spot) => ({ ...spot, y: groundY(spot.x, spot.z) }));
    return { tree: lift(tree), pine: lift(pine), bush: lift(bush), grass: lift(grass) };
  }, [cells]);
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
      <OrbitControls target={[0, 0.35, 0]} maxPolarAngle={1.15} minDistance={7} maxDistance={32} enablePan={false} />
    </>
  );
}

function Portrait({ team, active, edge, mine }: { team: Team; active: boolean; edge: "top" | "bottom" | "left" | "right"; mine: boolean }) {
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
        {mine ? "My turn" : TEAM_NAME[team]}
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
    const botSeat = table ? table.seats[state.turn].startsWith("bot-hill") : state.turn !== myTeam;
    const host = table ? TEAMS.find((team) => !table.seats[team].startsWith("bot-hill")) : myTeam;
    if (!botSeat || (table && host !== myTeam)) return;
    const id = window.setTimeout(() => {
      const move = botMove(state);
      if (move) applyRef.current(state, move, "dominate");
    }, 640);
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

  return (
    <div className="fixed inset-0 bg-[#102016] text-ivory">
      <Canvas shadows camera={{ position: [0, 18, 15.5], fov: 28 }} dpr={[1, 1.5]}>
        <Suspense fallback={null}>
          <Field state={state} slides={slides} shake={shake} selected={selected} moves={moves} onCell={onCell} onUnit={onUnit} />
        </Suspense>
      </Canvas>
      <div className="pointer-events-none absolute left-1/2 top-3 w-[min(68vw,18rem)] -translate-x-1/2">
        <div className="rounded-full bg-black/55 px-4 py-2 text-center text-sm text-white backdrop-blur-sm">
          <span className="uppercase tracking-[0.18em]">{state.turn === myTeam ? "Your turn" : `${TEAM_NAME[state.turn]}'s turn`}</span>
          {state.forum.owner ? (
            <span className="mt-0.5 block text-xs text-white/80">
              Colosseum {state.forum.progress}/{need} · {TEAM_NAME[state.forum.owner]}
            </span>
          ) : (
            <span className="mt-0.5 block text-xs text-white/70">Hold the center square to raise the colosseum</span>
          )}
        </div>
      </div>
      <Portrait team="n" edge="top" active={state.turn === "n"} mine={myTeam === "n"} />
      <Portrait team="s" edge="bottom" active={state.turn === "s"} mine={myTeam === "s"} />
      <Portrait team="w" edge="left" active={state.turn === "w"} mine={myTeam === "w"} />
      <Portrait team="e" edge="right" active={state.turn === "e"} mine={myTeam === "e"} />
      <button type="button" onClick={onHome} className="absolute left-4 top-4 rounded-full bg-black/45 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-white backdrop-blur-sm">
        Lounge
      </button>
      <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-sm text-white backdrop-blur-sm">
        <img src={asset("/morse-coin.png")} alt="" className="size-5" />
        {coins.toLocaleString()}
      </div>
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
