/**
 * The boss arena in 3D: the chapter's board, its hazards (gears, stone walls, glass pawns, fog,
 * the collapsing rim) and both armies, with the chapter's landmark looming behind the boss.
 */
import { Suspense, useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import { boardById } from "@/lib/chess/board-skins";
import { Shards, type Burst } from "@/components/games/bg-board-3d";
import { fileOf, onRim, rankOf, type Move, type State } from "./engine";
import type { Chapter } from "./data";
import { ArmyPiece, BossPiece, preloadArmy } from "./pieces3d";
import { Citadel, Colosseum, Foundry, Gear, Marsh, Ramparts } from "./world-map";

preloadArmy();

export const world = (i: number): [number, number, number] => [fileOf(i) - 3.5, 0, 3.5 - rankOf(i)];

type Props = {
  s: State;
  chapter: Chapter;
  sel: number | null;
  targets: Move[];
  last: { from: number; to: number } | null;
  checkSq: number;
  fog: Set<number>;
  levels: Record<string, number>;
  veterans: Set<string>;
  bursts: Burst[];
  onBurstDone: (id: number) => void;
  onTap: (sq: number) => void;
  narrow: boolean;
};

function Board({ chapter, s }: { chapter: Chapter; s: State }) {
  const skin = boardById(chapter.board);
  return (
    <group>
      {Array.from({ length: 64 }, (_, i) => {
        const [x, , z] = world(i);
        const light = (fileOf(i) + rankOf(i)) % 2 === 1;
        const rim = s.phase === 2 && onRim(i);
        return (
          <mesh key={i} position={[x, -0.06, z]} receiveShadow>
            <boxGeometry args={[1, 0.12, 1]} />
            <meshStandardMaterial
              color={rim ? (light ? "#7a2a14" : "#3a0c06") : light ? skin.lightSq : skin.darkSq}
              metalness={skin.sqMetal}
              roughness={skin.sqRough}
              emissive={rim ? "#ff3a10" : "#000000"}
              emissiveIntensity={rim ? 0.35 : 0}
            />
          </mesh>
        );
      })}
      {/* frame */}
      {[[0, 4.3, 9.2, 0.6], [0, -4.3, 9.2, 0.6], [4.3, 0, 0.6, 8], [-4.3, 0, 0.6, 8]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, -0.1, z]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.3, d]} />
          <meshStandardMaterial color={skin.table} metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      {[[4.3, 4.3], [-4.3, 4.3], [4.3, -4.3], [-4.3, -4.3]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.12, z]}>
          <octahedronGeometry args={[0.22]} />
          <meshStandardMaterial color="#ffd86b" metalness={1} roughness={0.2} emissive="#a06a00" emissiveIntensity={0.5} />
        </mesh>
      ))}
      <mesh position={[0, -0.26, 0]} receiveShadow>
        <boxGeometry args={[9.6, 0.1, 9.6]} />
        <meshStandardMaterial color={skin.felt} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Walls({ s }: { s: State }) {
  return (
    <group>
      {Object.entries(s.walls).map(([k, hp]) => {
        const [x, , z] = world(+k);
        return (
          <group key={k} position={[x, 0, z]} data-wall={k}>
            {[0, 1, 2].map((row) => (
              <mesh key={row} position={[0, 0.2 + row * 0.36, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.92 - row * 0.04, 0.34, 0.92 - row * 0.04]} />
                <meshStandardMaterial color={row % 2 ? "#57505a" : "#4a4448"} roughness={0.95} />
              </mesh>
            ))}
            {hp < 2 ? (
              <mesh position={[0.1, 0.6, 0.47]} rotation={[0, 0, 0.6]}>
                <boxGeometry args={[0.05, 0.7, 0.02]} />
                <meshBasicMaterial color="#ff6a30" />
              </mesh>
            ) : null}
            {[-0.3, 0, 0.3].map((dx) => (
              <mesh key={dx} position={[dx, 1.18, 0]} castShadow>
                <boxGeometry args={[0.2, 0.2, 0.84]} />
                <meshStandardMaterial color="#4a4448" roughness={0.95} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function GearTiles({ squares, ply, every }: { squares: number[]; ply: number; every: number }) {
  const soon = every - (ply % every) <= 2;
  return (
    <group>
      {squares.map((q, i) => {
        const [x, , z] = world(q);
        return (
          <group key={q} position={[x, 0.005, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <Gear r={0.46} teeth={10} thick={0.03} speed={(i % 2 ? -1 : 1) * (soon ? 1.6 : 0.35)} color={soon ? "#ffb040" : "#c08a3a"} />
          </group>
        );
      })}
      {soon ? <pointLight position={[0, 1, 0]} color="#ff9a3a" intensity={6} distance={4} /> : null}
    </group>
  );
}

function FogTiles({ fog }: { fog: Set<number> }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    ref.current?.children.forEach((m, i) => {
      m.position.y = 0.45 + Math.sin(clock.elapsedTime * 0.8 + i) * 0.05;
    });
  });
  return (
    <group ref={ref}>
      {[...fog].map((q) => {
        const [x, , z] = world(q);
        return (
          <mesh key={q} position={[x, 0.45, z]}>
            <boxGeometry args={[1.02, 0.9, 1.02]} />
            <meshStandardMaterial color="#a8d8c8" transparent opacity={0.78} roughness={1} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function Mover({ to, children, onClick }: { to: [number, number, number]; children: React.ReactNode; onClick: (e: { stopPropagation: () => void }) => void }) {
  const g = useRef<THREE.Group>(null);
  const first = useRef(true);
  useFrame((_, dt) => {
    const o = g.current;
    if (!o) return;
    if (first.current) {
      o.position.set(...to);
      first.current = false;
      return;
    }
    const k = Math.min(1, dt * 9);
    const d = Math.hypot(to[0] - o.position.x, to[2] - o.position.z);
    o.position.x += (to[0] - o.position.x) * k;
    o.position.z += (to[2] - o.position.z) * k;
    o.position.y = d > 0.05 ? Math.min(0.5, d * 0.25) : o.position.y * (1 - k);
  });
  return (
    <group ref={g} onClick={onClick}>
      {children}
    </group>
  );
}

function Backdrop({ chapter }: { chapter: Chapter }) {
  const Land = [Foundry, Citadel, Ramparts, Marsh, Colosseum][chapter.n - 1];
  return (
    <group>
      <group position={[0, -0.3, -9.5]} scale={2.6}>
        <Land dim={false} />
      </group>
      <group position={[-9, -0.3, -5]} scale={1.6} rotation={[0, 0.6, 0]}>
        <Land dim={false} />
      </group>
      <group position={[9, -0.3, -5]} scale={1.6} rotation={[0, -0.6, 0]}>
        <Land dim={false} />
      </group>
      {chapter.n === 1 ? (
        <>
          <Gear position={[-6.5, 4, -9]} r={2.4} teeth={18} speed={0.15} />
          <Gear position={[6.8, 3.2, -8.6]} r={1.7} teeth={14} speed={-0.22} color="#d9a04a" />
          <Gear position={[-3.2, 6.6, -11]} r={1.3} teeth={12} speed={0.3} color="#a06a2a" />
        </>
      ) : null}
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[40, 48]} />
        <meshStandardMaterial color={chapter.sky} roughness={0.95} />
      </mesh>
      <Sparkles count={50} scale={[22, 8, 22]} position={[0, 4, -2]} size={2.4} speed={0.3} color={chapter.glow} opacity={0.7} />
    </group>
  );
}

export function Arena3D(p: Props) {
  const { s, chapter } = p;
  const targetSet = useMemo(() => new Map(p.targets.map((m) => [m.to, m])), [p.targets]);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    document.body.style.cursor = hover != null ? "pointer" : "";
    return () => { document.body.style.cursor = ""; };
  }, [hover]);
  const dist = p.narrow ? 21.5 : 12.4;
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: p.narrow ? [0, dist * 0.95, dist * 0.5] : [0, dist * 0.86, dist * 0.7], fov: p.narrow ? 46 : 40, near: 0.1, far: 200 }} gl={{ antialias: true, preserveDrawingBuffer: true }} data-arena3d={chapter.n}>
      <color attach="background" args={[chapter.sky]} />
      <fog attach="fog" args={[chapter.sky, 18, 48]} />
      <Stars radius={80} depth={30} count={1400} factor={3} fade speed={0.4} />
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#fff2d6", "#2a1a3a", 0.55]} />
      <directionalLight position={[5, 13, 7]} intensity={1.8} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} />
      <pointLight position={[-6, 5, -5]} intensity={22} color="#b58cff" distance={24} />
      <pointLight position={[6, 4, -6]} intensity={18} color={chapter.glow} distance={22} />
      <Backdrop chapter={chapter} />
      <Board chapter={chapter} s={s} />
      {chapter.rules.gears ? <GearTiles squares={chapter.rules.gears} ply={s.ply} every={chapter.rules.gearEvery ?? 8} /> : null}
      <Walls s={s} />
      {/* click targets */}
      {Array.from({ length: 64 }, (_, i) => {
        const [x, , z] = world(i);
        const t = targetSet.get(i);
        const isLast = p.last && (p.last.from === i || p.last.to === i);
        const isSel = p.sel === i;
        const perk = t && (t.kind === "shield-wall" || t.kind === "phase-leap" || t.kind === "ricochet");
        const cap = t && (s.board[i] || t.kind === "ep");
        return (
          <group key={i} position={[x, 0.006, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={(e) => { e.stopPropagation(); p.onTap(i); }} onPointerOver={() => setHover(i)} onPointerOut={() => setHover((h) => (h === i ? null : h))}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial color={isSel ? "#ffd86b" : p.checkSq === i ? "#ff2a2a" : isLast ? "#f2c94c" : "#ffffff"} transparent opacity={isSel ? 0.45 : p.checkSq === i ? 0.55 : isLast ? 0.25 : hover === i ? 0.08 : 0} depthWrite={false} />
            </mesh>
            {t ? (
              t.kind === "wall" ? (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.4, 0]}>
                  <ringGeometry args={[0.32, 0.44, 32]} />
                  <meshBasicMaterial color="#ff7a3a" transparent opacity={0.95} side={THREE.DoubleSide} />
                </mesh>
              ) : cap ? (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
                  <ringGeometry args={[0.38, 0.47, 32]} />
                  <meshBasicMaterial color={perk ? "#b370ff" : "#ffe08a"} transparent opacity={0.95} />
                </mesh>
              ) : (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
                  <circleGeometry args={[perk ? 0.17 : 0.13, 24]} />
                  <meshBasicMaterial color={perk ? "#b370ff" : "#ffe08a"} transparent opacity={0.92} />
                </mesh>
              )
            ) : null}
          </group>
        );
      })}
      <Suspense fallback={null}>
        {s.board.map((pc, i) => {
          if (!pc) return null;
          if (pc.c === "b" && p.fog.has(i)) return null;
          const tap = (e: { stopPropagation: () => void }) => { e.stopPropagation(); p.onTap(i); };
          return (
            <Mover key={pc.id} to={world(i)} onClick={tap}>
              {pc.c === "w" ? (
                <ArmyPiece kind={pc.k} look={{ level: p.levels[pc.id] ?? 1, veteran: p.veterans.has(pc.id) }} yaw={Math.PI} />
              ) : (
                <BossPiece kind={pc.k} ink={chapter.bossInk} glass={!!pc.glass} />
              )}
            </Mover>
          );
        })}
      </Suspense>
      {p.fog.size ? <FogTiles fog={p.fog} /> : null}
      {p.bursts.map((b) => (
        <Shards key={b.id} burst={b} onDone={() => p.onBurstDone(b.id)} />
      ))}
      <OrbitControls target={[0, 0, 0.6]} enablePan={false} minDistance={8} maxDistance={24} maxPolarAngle={Math.PI * 0.42} minPolarAngle={0.15} />
    </Canvas>
  );
}
