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
  YOU,
  boardCells,
  botMove,
  canAlly,
  legalMoves,
  newGame,
  onBoard,
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
type Spot = { x: number; z: number; rot: number; s: number };

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
    const ang = (clock.elapsedTime / 240) * Math.PI * 2 - Math.PI / 2;
    const elev = Math.sin(ang);
    const day = THREE.MathUtils.smoothstep(elev, -0.04, 0.04);
    const glow = Math.exp(-((elev - 0.02) ** 2) * 28);
    sky.copy(nightC).lerp(dayC, day);
    sky.lerp(dawnC, glow * 0.8);
    if (scene.background instanceof THREE.Color) scene.background.copy(sky);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(sky);
      scene.fog.near = 28 + day * 18;
      scene.fog.far = 70 + day * 30;
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

function Hills() {
  const maps = useTexture({
    map: asset("/glade/ground/diff.jpg"),
    normalMap: asset("/glade/ground/nor.jpg"),
    roughnessMap: asset("/glade/ground/rough.jpg"),
  });
  const geo = useMemo(() => {
    for (const tex of [maps.map, maps.normalMap, maps.roughnessMap]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(18, 18);
    }
    maps.map.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.PlaneGeometry(96, 96, 64, 64);
    ground.rotateX(-Math.PI / 2);
    const pos = ground.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const hill = Math.sin(x * 0.12) * Math.cos(z * 0.09) * 1.7 + Math.sin((x + z) * 0.05) * 2.4 + Math.cos(x * 0.2) * 0.35;
      pos.setY(i, onBoard(x, z) ? 0 : hill);
    }
    ground.computeVertexNormals();
    return ground;
  }, [maps]);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial map={maps.map} normalMap={maps.normalMap} roughnessMap={maps.roughnessMap} roughness={1} metalness={0} />
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
        dummy.position.set(spot.x, 0, spot.z);
        dummy.rotation.set(0, spot.rot, 0);
        dummy.scale.setScalar(spot.s / parts.height);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
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
    <group scale={grown} position={[0, 0.04, 0]}>
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
    group.position.set(x, 0, z);
    gait.current.act = walking ? "walk" : "idle";
  });
  return (
    <group ref={ref} onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onPick(unit.id); }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[0.2, 14]} />
        <meshBasicMaterial color={TEAM_COLOR[unit.team]} />
      </mesh>
      <RaPawn gait={gait} url={raUnitUrl(unit.type)} team="blue" role={unit.type} tint={TEAM_COLOR[unit.team]} />
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
      const corner = id === "forum" ? 0.95 : 0.4;
      grass.push({ x: x + 0.32, z: z + 0.22, rot: i * 0.7, s: id === "forum" ? 0.55 : 0.34 });
      const spot = { x: x - corner, z: z - corner * 0.55, rot: i * 1.3, s: id === "forum" ? 0.7 : 0.48 };
      if (i % 3 === 0) tree.push(spot);
      else if (i % 3 === 1) pine.push(spot);
      else bush.push(spot);
    });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const rad = 24 + (i % 4) * 2.4;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (onBoard(x, z)) continue;
      const spot = { x, z, rot: i, s: 2.4 + (i % 3) * 0.6 };
      if (i % 2 === 0) tree.push(spot);
      else pine.push(spot);
    }
    return { tree, pine, bush, grass };
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
      <Hills />
      <Nature spots={spots} />
      {cells.map((id) => {
        const [x, , z] = worldOf(id);
        const forum = id === "forum";
        const nums = id.split(",").map(Number);
        const light = id !== "forum" && ((nums[0] ?? 0) + (nums[1] ?? 0)) % 2 === 0;
        const hot = targets.has(id);
        const wide = forum ? PITCH * 2 - 0.08 : PITCH * 0.9;
        return (
          <mesh key={id} position={[x, 0.025, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onCell(id); }}>
            <planeGeometry args={[wide, wide]} />
            <meshStandardMaterial color={hot ? "#f4e7a4" : forum ? "#d7c4a2" : light ? "#d7e4b6" : "#5f9a52"} roughness={0.92} />
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
      <OrbitControls target={[0, 0, 0]} maxPolarAngle={Math.PI / 2.15} minDistance={8} maxDistance={42} enablePan={false} />
    </>
  );
}

function Portrait({ team, active, edge }: { team: Team; active: boolean; edge: "top" | "bottom" | "left" | "right" }) {
  const place =
    edge === "bottom"
      ? "bottom-4 left-1/2 -translate-x-1/2"
      : edge === "top"
        ? "top-16 left-1/2 -translate-x-1/2"
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
        {team === YOU ? "You" : TEAM_NAME[team]}
        {active ? " · turn" : ""}
      </span>
    </div>
  );
}

export function CrossGame({ onHome, onAgain }: { onHome: () => void; onAgain: () => void }) {
  const [state, setState] = useState<CrossState>(() => newGame());
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Move | null>(null);
  const [slides, setSlides] = useState<Record<string, Slide>>({});
  const [shake, setShake] = useState<Shake | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(0);
  const applyRef = useRef<(current: CrossState, move: Move, choice?: "dominate" | "ally") => void>(() => {});
  const moves = useMemo(() => (state.turn === YOU && !state.winner ? legalMoves(state, YOU) : []), [state]);

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
  }

  applyRef.current = apply;

  useEffect(() => {
    if (busy || pending || state.winner || state.turn === YOU) return;
    const id = window.setTimeout(() => {
      const move = botMove(state);
      if (move) applyRef.current(state, move, "dominate");
    }, 640);
    return () => window.clearTimeout(id);
  }, [busy, pending, state]);

  function onCell(id: string) {
    if (busy || state.winner || state.turn !== YOU || !selected) return;
    if (moves.some((move) => move.unitId === selected && move.to === id)) apply(state, { unitId: selected, to: id });
  }

  function onUnit(id: string) {
    if (busy || state.winner || state.turn !== YOU) return;
    const unit = state.units.find((item) => item.id === id);
    if (!unit) return;
    if (unit.team === YOU) {
      setSelected(id);
      return;
    }
    if (selected && moves.some((move) => move.unitId === selected && move.to === unit.cell)) {
      apply(state, { unitId: selected, to: unit.cell });
    }
  }

  const holders = state.units.filter((unit) => unit.team === state.forum.owner && unit.cell === "forum").length;
  const need = holders >= 2 ? 9 : 10;
  const won = state.winner === YOU;
  const lost = Boolean(state.winner && state.winner !== YOU) || state.out.includes(YOU);

  return (
    <div className="fixed inset-0 bg-[#102016] text-ivory">
      <Canvas shadows camera={{ position: [0, 18, 22], fov: 42 }} dpr={[1, 1.5]}>
        <Suspense fallback={null}>
          <Field state={state} slides={slides} shake={shake} selected={selected} moves={moves} onCell={onCell} onUnit={onUnit} />
        </Suspense>
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-4 pt-4">
        <div className="rounded-full bg-black/50 px-4 py-2 text-center text-sm text-white backdrop-blur-sm">
          <span className="uppercase tracking-[0.18em]">{state.turn === YOU ? "Your turn" : `${TEAM_NAME[state.turn]}'s turn`}</span>
          {state.forum.owner ? (
            <span className="mt-0.5 block text-xs text-white/80">
              Colosseum {state.forum.progress}/{need} · {TEAM_NAME[state.forum.owner]}
            </span>
          ) : (
            <span className="mt-0.5 block text-xs text-white/70">Hold the center square to raise the colosseum</span>
          )}
        </div>
      </div>
      <Portrait team="n" edge="top" active={state.turn === "n"} />
      <Portrait team="s" edge="bottom" active={state.turn === "s"} />
      <Portrait team="w" edge="left" active={state.turn === "w"} />
      <Portrait team="e" edge="right" active={state.turn === "e"} />
      <button type="button" onClick={onHome} className="absolute left-4 top-4 rounded-full bg-black/50 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-white">
        Lounge
      </button>
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
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black" onClick={onAgain}>Another game</button>
              <button type="button" className="flex-1 rounded-xl border border-white/40 px-4 py-3 text-sm text-white" onClick={onHome}>Return home</button>
            </div>
          </div>
        </div>
      ) : null}
      {lost && !won ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/72 p-6 text-center">
          <p className="font-display text-[clamp(4rem,12vw,7rem)] leading-none text-white">DEFEAT</p>
          <p className="mt-3 max-w-md text-sm text-white/75">{state.reason || "Your king is gone."}</p>
          <div className="mt-6 flex w-full max-w-md flex-col gap-2 sm:flex-row">
            <button type="button" className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black" onClick={onAgain}>Start new game</button>
            <button type="button" className="flex-1 rounded-xl border border-white/40 px-4 py-3 text-sm text-white" onClick={onHome}>Return to lounge</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
