import { useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import * as THREE from "three";
import type { PieceSymbol, Square } from "chess.js";
import { piecesFromFen, type Placed, type Side } from "@/game/engine";
import type { GroundId } from "@/game/grounds";

export type Strike = {
  id: number;
  from: Square;
  to: Square;
  victim: Square | null;
  rookFrom?: Square;
  rookTo?: Square;
  attacker: PieceSymbol;
  capture: boolean;
  cinematic: boolean;
  dur: number;
  t0: number;
};

type SceneProps = {
  fen: string;
  ground: GroundId;
  flipped: boolean;
  characters: boolean;
  selected: Square | null;
  legal: Square[];
  last: { from: Square; to: Square } | null;
  strike: Strike | null;
  onSquare: (square: Square) => void;
  onStrikeDone: (id: number) => void;
};

const FILES = "abcdefgh";

function localOf(square: string) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return new THREE.Vector3(file - 3.5, 0, 7 - rank - 3.5);
}

function smooth(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function Hall({ ground }: { ground: GroundId }) {
  const outdoor = ground === "yard" || ground === "glade";
  const fog = outdoor ? "#b7c6c4" : ground === "keep" ? "#1a120e" : "#c4b39a";
  return (
    <>
      <color attach="background" args={[fog]} />
      <fog attach="fog" args={[fog, outdoor ? 18 : 10, outdoor ? 46 : 32]} />
      {outdoor ? <Sky sunPosition={[6, 3, 2]} turbidity={6} /> : null}
      <hemisphereLight args={[outdoor ? "#d5e4ef" : "#c8b69a", "#3a2a1c", 0.55]} />
      <ambientLight intensity={outdoor ? 0.35 : 0.28} />
      <directionalLight position={[7, 12, 6]} intensity={outdoor ? 1.35 : 0.85} />
      {ground === "throne" ? <ThroneRoom /> : null}
      {ground === "yard" ? <CastleYard /> : null}
      {ground === "glade" ? <Glade /> : null}
      {ground === "keep" ? <Keep /> : null}
    </>
  );
}

function ThroneRoom() {
  return (
    <group>
      <mesh position={[0, -0.45, 0]}>
        <boxGeometry args={[28, 0.4, 36]} />
        <meshStandardMaterial color="#cfc6b8" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[2.2, 0.06, 22]} />
        <meshStandardMaterial color="#7a1e2c" roughness={0.7} />
      </mesh>
      <mesh position={[0, 4.6, 0]}>
        <boxGeometry args={[22, 0.3, 30]} />
        <meshStandardMaterial color="#d9d1c4" />
      </mesh>
      <mesh position={[0, 2.4, -14]}>
        <boxGeometry args={[22, 5, 0.5]} />
        <meshStandardMaterial color="#e7e1d6" />
      </mesh>
      <mesh position={[-10.5, 2.4, 0]}>
        <boxGeometry args={[0.5, 5, 28]} />
        <meshStandardMaterial color="#e4ddd2" />
      </mesh>
      <mesh position={[10.5, 2.4, 0]}>
        <boxGeometry args={[0.5, 5, 28]} />
        <meshStandardMaterial color="#e4ddd2" />
      </mesh>
      {[-6, -2, 2, 6].map((x) =>
        [-8, -2, 4].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 2.2, z]}>
            <cylinderGeometry args={[0.38, 0.42, 4.4, 10]} />
            <meshStandardMaterial color="#f3efe6" roughness={0.55} />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.7, -12]}>
        <boxGeometry args={[2.4, 1.4, 1.1]} />
        <meshStandardMaterial color="#c6a15a" metalness={0.45} roughness={0.35} />
      </mesh>
      <pointLight position={[0, 3.2, 0]} intensity={8} distance={18} color="#ffe2b0" />
    </group>
  );
}

function CastleYard() {
  return (
    <group>
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[60, 0.5, 60]} />
        <meshStandardMaterial color="#6d8a48" roughness={1} />
      </mesh>
      <mesh position={[0, 1.6, -16]}>
        <boxGeometry args={[26, 4, 2]} />
        <meshStandardMaterial color="#d7d0c2" roughness={0.8} />
      </mesh>
      {[-8, -4, 0, 4, 8].map((x) => (
        <mesh key={x} position={[x, 3.8, -16]}>
          <boxGeometry args={[1.3, 1.1, 2.1]} />
          <meshStandardMaterial color="#cfc6b6" />
        </mesh>
      ))}
    </group>
  );
}

function Glade() {
  return (
    <group>
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[50, 0.5, 50]} />
        <meshStandardMaterial color="#4f7a3c" roughness={1} />
      </mesh>
      <mesh position={[-7, 3, -8]}>
        <boxGeometry args={[3.2, 8, 0.35]} />
        <meshStandardMaterial color="#d5e7ef" transparent opacity={0.85} />
      </mesh>
      <mesh position={[-7, 0.4, -6]}>
        <sphereGeometry args={[2.2, 14, 10]} />
        <meshStandardMaterial color="#9aa8a4" roughness={1} />
      </mesh>
      {[4, 7, -4].map((x, i) => (
        <mesh key={x} position={[x, 1.6, -9 - i]}>
          <coneGeometry args={[1.1, 3.4, 7]} />
          <meshStandardMaterial color="#245c34" />
        </mesh>
      ))}
    </group>
  );
}

function Keep() {
  return (
    <group>
      <mesh position={[0, -0.4, 0]}>
        <boxGeometry args={[20, 0.4, 24]} />
        <meshStandardMaterial color="#3a332c" roughness={0.95} />
      </mesh>
      <mesh position={[0, 3, -10]}>
        <boxGeometry args={[18, 6.4, 0.8]} />
        <meshStandardMaterial color="#2a241e" />
      </mesh>
      <mesh position={[-8, 3, 0]}>
        <boxGeometry args={[0.8, 6.4, 20]} />
        <meshStandardMaterial color="#2e2822" />
      </mesh>
      <mesh position={[8, 3, 0]}>
        <boxGeometry args={[0.8, 6.4, 20]} />
        <meshStandardMaterial color="#2e2822" />
      </mesh>
      <mesh position={[0, 6.1, 0]}>
        <boxGeometry args={[16, 0.4, 20]} />
        <meshStandardMaterial color="#241e18" />
      </mesh>
      <pointLight position={[-4, 2.4, -4]} color="#ff8a3a" intensity={12} distance={10} />
      <pointLight position={[4, 2.4, 2]} color="#ff8a3a" intensity={8} distance={9} />
    </group>
  );
}

function BoardDeck({
  selected,
  legal,
  last,
  onSquare,
}: {
  selected: Square | null;
  legal: Square[];
  last: { from: Square; to: Square } | null;
  onSquare: (square: Square) => void;
}) {
  const squares = useMemo(() => {
    const list: { square: Square; dark: boolean }[] = [];
    for (let rank = 1; rank <= 8; rank++) {
      for (let file = 0; file < 8; file++) {
        list.push({ square: `${FILES[file]}${rank}` as Square, dark: (file + rank) % 2 === 0 });
      }
    }
    return list;
  }, []);
  const legalSet = useMemo(() => new Set(legal), [legal]);
  return (
    <group>
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[9.4, 0.28, 9.4]} />
        <meshStandardMaterial color="#4a2a18" roughness={0.62} />
      </mesh>
      {squares.map(({ square, dark }) => {
        const pos = localOf(square);
        const hot = selected === square;
        const moved = last?.from === square || last?.to === square;
        const color = hot ? "#e6c56a" : moved ? (dark ? "#6a5434" : "#efe0b4") : dark ? "#8d5a32" : "#f0d7a4";
        return (
          <mesh
            key={square}
            position={[pos.x, 0.04, pos.z]}
            onClick={(event) => {
              event.stopPropagation();
              onSquare(square);
            }}
          >
            <boxGeometry args={[0.96, 0.08, 0.96]} />
            <meshStandardMaterial color={color} roughness={0.55} />
            {legalSet.has(square) ? (
              <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.13, 16]} />
                <meshBasicMaterial color="#f3ead7" />
              </mesh>
            ) : null}
          </mesh>
        );
      })}
    </group>
  );
}

function Cloth({ color, metal = 0.15, rough = 0.62 }: { color: string; metal?: number; rough?: number }) {
  return <meshStandardMaterial color={color} metalness={metal} roughness={rough} />;
}

function Fighter({
  type,
  color,
  swingRef,
  downRef,
}: {
  type: PieceSymbol;
  color: Side;
  swingRef: RefObject<number>;
  downRef: RefObject<number>;
}) {
  const light = color === "w";
  const cloth = light ? "#2a628c" : "#7c2430";
  const metal = light ? "#efe8da" : "#2a2c30";
  const skin = light ? "#e6b48e" : "#c49672";
  const gold = light ? "#e6c56a" : "#8d6234";
  const trim = light ? "#d7b15a" : "#c45a48";
  const body = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  useFrame(() => {
    const fall = downRef.current ?? 0;
    const swing = swingRef.current ?? 0;
    if (body.current) {
      body.current.rotation.x = fall * 1.35;
      body.current.position.y = -fall * 0.2;
      body.current.rotation.y = color === "w" ? Math.PI : 0;
    }
    if (arm.current) arm.current.rotation.z = -0.45 - swing * 1.25;
  });
  if (type === "n") {
    return (
      <group ref={body}>
        <mesh position={[0, 0.32, 0.05]}>
          <boxGeometry args={[0.28, 0.22, 0.72]} />
          <Cloth color={light ? "#6b4630" : "#1c1816"} rough={0.8} />
        </mesh>
        <mesh position={[0, 0.48, 0.38]}>
          <boxGeometry args={[0.16, 0.16, 0.28]} />
          <Cloth color={light ? "#6b4630" : "#1c1816"} />
        </mesh>
        {[-0.1, 0.1].map((x) =>
          [-0.18, 0.16].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 0.12, z]}>
              <boxGeometry args={[0.08, 0.24, 0.08]} />
              <Cloth color="#241810" />
            </mesh>
          )),
        )}
        <mesh position={[0, 0.94, 0.02]}>
          <boxGeometry args={[0.22, 0.28, 0.16]} />
          <Cloth color={cloth} />
        </mesh>
        <mesh position={[0, 1.18, 0.02]}>
          <sphereGeometry args={[0.12, 12, 10]} />
          <Cloth color={skin} rough={0.7} />
        </mesh>
        <mesh position={[0, 1.32, 0.02]}>
          <coneGeometry args={[0.1, 0.16, 6]} />
          <Cloth color={metal} metal={0.45} />
        </mesh>
        <group ref={arm} position={[0.18, 1.05, 0.1]}>
          <mesh position={[0, -0.05, 0.32]}>
            <boxGeometry args={[0.045, 0.045, 0.72]} />
            <Cloth color={trim} metal={0.55} />
          </mesh>
        </group>
      </group>
    );
  }
  return (
    <group ref={body}>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[0.24, 0.18, 0.16]} />
        <Cloth color={light ? "#3a2a1c" : "#120e0c"} />
      </mesh>
      <mesh position={[0, 0.48, 0]}>
        <boxGeometry args={[type === "k" || type === "q" ? 0.38 : 0.3, type === "p" ? 0.34 : 0.42, 0.2]} />
        <Cloth color={cloth} />
      </mesh>
      <mesh position={[0, type === "p" ? 0.78 : 0.86, 0]}>
        <sphereGeometry args={[type === "p" ? 0.12 : 0.14, 12, 10]} />
        <Cloth color={skin} rough={0.72} />
      </mesh>
      {type === "k" || type === "q" || type === "r" ? (
        <mesh position={[0, 1.08, 0]}>
          <cylinderGeometry args={[0.1, 0.13, 0.14, 6]} />
          <Cloth color={gold} metal={0.62} rough={0.28} />
        </mesh>
      ) : null}
      {type === "b" ? (
        <mesh position={[0, 1.08, 0]}>
          <coneGeometry args={[0.08, 0.32, 6]} />
          <Cloth color={gold} metal={0.45} />
        </mesh>
      ) : null}
      {type === "k" || type === "q" ? (
        <mesh position={[0, 0.52, -0.12]}>
          <boxGeometry args={[0.42, 0.5, 0.05]} />
          <Cloth color={light ? "#1e4e78" : "#6e1c28"} />
        </mesh>
      ) : null}
      <group ref={arm} position={[0.22, 0.62, 0.06]}>
        <mesh position={[0, -0.16, 0]}>
          <boxGeometry args={[0.07, 0.28, 0.07]} />
          <Cloth color={cloth} />
        </mesh>
        <mesh position={[0, -0.46, 0.02]}>
          <boxGeometry args={[0.05, type === "p" ? 0.38 : 0.7, 0.05]} />
          <Cloth color={metal} metal={0.72} rough={0.22} />
        </mesh>
      </group>
      {type === "r" ? (
        <mesh position={[-0.24, 0.52, 0.05]}>
          <boxGeometry args={[0.22, 0.34, 0.06]} />
          <Cloth color={metal} metal={0.45} />
        </mesh>
      ) : null}
    </group>
  );
}

function Staunton({ type, color, downRef }: { type: PieceSymbol; color: Side; downRef: RefObject<number> }) {
  const fill = color === "w" ? "#f6f1e6" : "#16120e";
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const fall = downRef.current ?? 0;
    if (!ref.current) return;
    ref.current.rotation.x = fall * 1.2;
    ref.current.rotation.y = color === "w" ? Math.PI : 0;
  });
  const h = type === "p" ? 0.55 : type === "k" || type === "q" ? 1.05 : 0.82;
  return (
    <group ref={ref}>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.22, 0.24, 0.1, 12]} />
        <meshStandardMaterial color={fill} roughness={0.35} />
      </mesh>
      <mesh position={[0, h * 0.42, 0]}>
        <cylinderGeometry args={[type === "p" ? 0.1 : 0.12, 0.16, h * 0.55, 10]} />
        <meshStandardMaterial color={fill} roughness={0.32} />
      </mesh>
      <mesh position={[0, h * 0.78, 0]}>
        <sphereGeometry args={[type === "p" ? 0.12 : 0.16, 12, 10]} />
        <meshStandardMaterial color={fill} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Actor({
  piece,
  strike,
  characters,
  onSquare,
}: {
  piece: Placed;
  strike: Strike | null;
  characters: boolean;
  onSquare: (square: Square) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const scratch = useRef(new THREE.Vector3());
  const home = useMemo(() => localOf(piece.square), [piece.square]);
  const swingRef = useRef(0);
  const downRef = useRef(0);
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    let swing = 0;
    let down = 0;
    const now = performance.now();
    if (strike && piece.square === strike.from) {
      const t = Math.min(1, (now - strike.t0) / strike.dur);
      const travel = smooth(Math.min(1, t / (strike.cinematic ? 0.58 : 0.82)));
      scratch.current.copy(home).lerp(localOf(strike.to), travel);
      scratch.current.y += Math.sin(t * Math.PI) * (strike.cinematic ? 0.18 : 0.05);
      if (strike.cinematic && t > 0.42 && t < 0.78) swing = Math.sin(((t - 0.42) / 0.36) * Math.PI);
    } else if (strike?.rookFrom && piece.square === strike.rookFrom && strike.rookTo) {
      const t = Math.min(1, (now - strike.t0) / strike.dur);
      scratch.current.copy(home).lerp(localOf(strike.rookTo), smooth(Math.min(1, t / 0.8)));
    } else if (strike?.victim && piece.square === strike.victim && strike.capture) {
      const t = Math.min(1, (now - strike.t0) / strike.dur);
      scratch.current.copy(home);
      down = t < 0.6 ? 0 : (t - 0.6) / 0.4;
    } else {
      scratch.current.copy(home);
      scratch.current.y += Math.sin(now / 480 + home.x * 2) * 0.015;
    }
    if (!group.userData.muted) {
      group.traverse((obj) => {
        obj.raycast = () => null;
      });
      group.userData.muted = true;
    }
    swingRef.current = swing;
    downRef.current = down;
    group.position.copy(scratch.current);
  });
  return (
    <group
      ref={ref}
      onClick={(event) => {
        event.stopPropagation();
        onSquare(piece.square);
      }}
    >
      {characters ? (
        <Fighter type={piece.type} color={piece.color} swingRef={swingRef} downRef={downRef} />
      ) : (
        <Staunton type={piece.type} color={piece.color} downRef={downRef} />
      )}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.24, 12]} />
        <meshBasicMaterial color="#000" transparent opacity={0.28} />
      </mesh>
    </group>
  );
}

function CameraRig({
  strike,
  flipped,
  onStrikeDone,
}: {
  strike: Strike | null;
  flipped: boolean;
  onStrikeDone: (id: number) => void;
}) {
  const look = useRef(new THREE.Vector3(0, 0.45, 0));
  const wantPos = useRef(new THREE.Vector3());
  const wantLook = useRef(new THREE.Vector3());
  const fired = useRef<number | null>(null);
  const seat = useMemo(() => new THREE.Vector3(0, 2.45, 8.7), []);
  const seatLook = useMemo(() => new THREE.Vector3(0, 0.35, 0.2), []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const k = 1 - Math.exp(-3.2 * dt);
    wantPos.current.copy(seat);
    wantLook.current.copy(seatLook);
    if (strike?.cinematic) {
      const t = Math.min(1, (performance.now() - strike.t0) / strike.dur);
      const zoom = t < 0.14 ? t / 0.14 : t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.2) : 1;
      const blend = smooth(zoom);
      const a = localOf(strike.from);
      const b = localOf(strike.to);
      if (flipped) {
        a.x *= -1;
        a.z *= -1;
        b.x *= -1;
        b.z *= -1;
      }
      const mid = a.clone().lerp(b, 0.62);
      const side = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x);
      if (side.lengthSq() < 0.001) side.set(1, 0, 0);
      side.normalize();
      const fightPos = mid.clone().addScaledVector(side, 3.15);
      fightPos.y = 1.7;
      const fightLook = mid.clone();
      fightLook.y = 0.72;
      wantPos.current.lerp(fightPos, blend);
      wantLook.current.lerp(fightLook, blend);
      if (t > 0.55 && t < 0.7) {
        wantPos.current.x += (Math.random() - 0.5) * 0.1;
        wantPos.current.y += (Math.random() - 0.5) * 0.06;
      }
      if (t >= 1 && fired.current !== strike.id) {
        fired.current = strike.id;
        onStrikeDone(strike.id);
      }
    } else if (strike && performance.now() - strike.t0 >= strike.dur && fired.current !== strike.id) {
      fired.current = strike.id;
      onStrikeDone(strike.id);
    }
    if (!strike) fired.current = null;
    wantPos.current.x += Math.sin(performance.now() / 1600) * 0.05;
    const glide = strike?.cinematic ? Math.min(1, k * 2.2) : k;
    state.camera.position.lerp(wantPos.current, glide);
    look.current.lerp(wantLook.current, glide);
    state.camera.lookAt(look.current);
  });
  return null;
}

function World(props: SceneProps) {
  const pieces = useMemo(() => piecesFromFen(props.fen), [props.fen]);
  return (
    <>
      <Hall ground={props.ground} />
      <group rotation={[0, props.flipped ? Math.PI : 0, 0]}>
        <BoardDeck selected={props.selected} legal={props.legal} last={props.last} onSquare={props.onSquare} />
        {pieces.map((piece) => (
          <Actor
            key={`${piece.square}-${piece.color}${piece.type}`}
            piece={piece}
            strike={props.strike}
            characters={props.characters}
            onSquare={props.onSquare}
          />
        ))}
      </group>
      <CameraRig strike={props.strike} flipped={props.flipped} onStrikeDone={props.onStrikeDone} />
    </>
  );
}

export function BattleScene(props: SceneProps) {
  return (
    <Canvas
      className="hall"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh" }}
      camera={{ position: [0, 2.45, 8.7], fov: 42, near: 0.1, far: 80 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <World {...props} />
    </Canvas>
  );
}
