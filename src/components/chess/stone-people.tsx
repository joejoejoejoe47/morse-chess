import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PieceSymbol } from "chess.js";

export type PeopleCast = "stone" | "pipe" | "ring";

export type Gait = { phase: number; amp: number };

function tone(cast: PeopleCast, white: boolean) {
  if (cast === "pipe") {
    return white
      ? { skin: "#e4b894", cloth: "#c4473a", trim: "#234e9a", metal: "#d7d7df" }
      : { skin: "#c9d3a6", cloth: "#3c6840", trim: "#d4a84a", metal: "#8a8a78" };
  }
  if (cast === "ring") {
    return white
      ? { skin: "#d4c4ae", cloth: "#4e6254", trim: "#c8ccd2", metal: "#b7bdc6" }
      : { skin: "#8d877e", cloth: "#1c1e22", trim: "#6e3030", metal: "#3a3c40" };
  }
  return white
    ? { skin: "#e3ddd2", cloth: "#d4cec3", trim: "#bdb6aa", metal: "#aea89e" }
    : { skin: "#4a4742", cloth: "#3a3834", trim: "#2c2a27", metal: "#6a6660" };
}

function useMats(cast: PeopleCast, white: boolean) {
  return useMemo(() => {
    const c = tone(cast, white);
    const rough = cast === "stone" ? 0.9 : 0.62;
    const make = (color: string, metalness = 0.04) =>
      new THREE.MeshStandardMaterial({ color, roughness: rough, metalness });
    return {
      skin: make(c.skin),
      cloth: make(c.cloth),
      trim: make(c.trim, cast === "stone" ? 0.08 : 0.2),
      metal: make(c.metal, cast === "stone" ? 0.12 : 0.35),
    };
  }, [cast, white]);
}

function Sword({ material }: { material: THREE.Material }) {
  return (
    <group position={[0, -0.28, 0.02]}>
      <mesh position={[0, -0.14, 0]} material={material} castShadow>
        <boxGeometry args={[0.028, 0.3, 0.01]} />
      </mesh>
      <mesh material={material} castShadow>
        <boxGeometry args={[0.09, 0.022, 0.016]} />
      </mesh>
    </group>
  );
}

function Walker({
  type,
  mats,
  gait,
  tall,
  hat,
}: {
  type: PieceSymbol;
  mats: ReturnType<typeof useMats>;
  gait: MutableRefObject<Gait>;
  tall: number;
  hat: "hood" | "crown" | "cap" | "horns" | null;
}) {
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const chest = useRef<THREE.Group>(null);
  const castle = type === "r";
  const armored = type === "b" || type === "k";
  const torsoW = castle ? 0.46 : armored ? 0.34 : 0.28;

  useFrame(() => {
    const swing = Math.sin(gait.current.phase) * gait.current.amp;
    if (legL.current) legL.current.rotation.x = swing * 0.75;
    if (legR.current) legR.current.rotation.x = -swing * 0.75;
    if (armL.current) armL.current.rotation.x = -swing * 0.55;
    if (armR.current) armR.current.rotation.x = swing * 0.55;
    if (chest.current) chest.current.position.y = 0.7 + Math.abs(swing) * 0.035;
  });

  return (
    <group scale={tall}>
      <group position={[-0.09, 0.46, 0]} ref={legL}>
        <mesh position={[0, -0.14, 0]} material={mats.cloth} castShadow>
          <boxGeometry args={[0.09, 0.26, 0.09]} />
        </mesh>
        <mesh position={[0, -0.32, 0.02]} material={mats.trim} castShadow>
          <boxGeometry args={[0.1, 0.16, 0.1]} />
        </mesh>
      </group>
      <group position={[0.09, 0.46, 0]} ref={legR}>
        <mesh position={[0, -0.14, 0]} material={mats.cloth} castShadow>
          <boxGeometry args={[0.09, 0.26, 0.09]} />
        </mesh>
        <mesh position={[0, -0.32, 0.02]} material={mats.trim} castShadow>
          <boxGeometry args={[0.1, 0.16, 0.1]} />
        </mesh>
      </group>
      <group ref={chest} position={[0, 0.7, 0]}>
        <mesh material={castle ? mats.trim : mats.cloth} castShadow>
          <boxGeometry args={[torsoW, castle ? 0.5 : 0.36, castle ? 0.36 : 0.18]} />
        </mesh>
        {castle
          ? [-0.16, 0, 0.16].map((x) => (
              <mesh key={x} position={[x, 0.3, 0]} material={mats.trim} castShadow>
                <boxGeometry args={[0.1, 0.12, 0.36]} />
              </mesh>
            ))
          : null}
        {armored ? (
          <mesh position={[0, 0.02, 0.08]} material={mats.metal} castShadow>
            <boxGeometry args={[torsoW + 0.04, 0.22, 0.06]} />
          </mesh>
        ) : null}
        <mesh position={[0, castle ? 0.42 : 0.32, 0]} material={mats.skin} castShadow>
          <sphereGeometry args={[castle ? 0.09 : 0.11, 16, 12]} />
        </mesh>
        {hat === "hood" ? (
          <mesh position={[0, 0.4, -0.02]} material={mats.cloth} castShadow>
            <coneGeometry args={[0.16, 0.28, 12]} />
          </mesh>
        ) : null}
        {hat === "crown" ? (
          <mesh position={[0, 0.48, 0]} material={mats.metal} castShadow>
            <boxGeometry args={[0.16, 0.06, 0.08]} />
          </mesh>
        ) : null}
        {hat === "cap" ? (
          <mesh position={[0, 0.42, 0.02]} material={mats.cloth} castShadow>
            <boxGeometry args={[0.18, 0.06, 0.2]} />
          </mesh>
        ) : null}
        {hat === "horns" ? (
          <group position={[0, 0.42, 0]}>
            <mesh position={[-0.08, 0.08, 0]} rotation={[0, 0, 0.5]} material={mats.metal} castShadow>
              <boxGeometry args={[0.03, 0.16, 0.03]} />
            </mesh>
            <mesh position={[0.08, 0.08, 0]} rotation={[0, 0, -0.5]} material={mats.metal} castShadow>
              <boxGeometry args={[0.03, 0.16, 0.03]} />
            </mesh>
          </group>
        ) : null}
        <group position={[-torsoW / 2, 0.08, 0]} ref={armL}>
          <mesh position={[0, -0.14, 0]} material={mats.cloth} castShadow>
            <boxGeometry args={[0.07, 0.28, 0.07]} />
          </mesh>
          {type === "q" ? (
            <group position={[0, -0.26, 0]}>
              <Sword material={mats.metal} />
            </group>
          ) : null}
        </group>
        <group position={[torsoW / 2, 0.08, 0]} ref={armR}>
          <mesh position={[0, -0.14, 0]} material={mats.cloth} castShadow>
            <boxGeometry args={[0.07, 0.28, 0.07]} />
          </mesh>
          {type === "q" || type === "b" ? (
            <group position={[0, -0.26, 0]}>
              <Sword material={mats.metal} />
            </group>
          ) : null}
        </group>
      </group>
    </group>
  );
}

function Rider({
  mats,
  gait,
}: {
  mats: ReturnType<typeof useMats>;
  gait: MutableRefObject<Gait>;
}) {
  const legs = useRef<(THREE.Group | null)[]>([]);
  const rider = useRef<THREE.Group>(null);

  useFrame(() => {
    const { phase, amp } = gait.current;
    legs.current.forEach((leg, i) => {
      if (!leg) return;
      const offset = i % 2 === 0 ? 0 : Math.PI;
      leg.rotation.x = Math.sin(phase + offset) * 0.55 * amp;
    });
    if (rider.current) rider.current.position.y = 0.78 + Math.abs(Math.sin(phase)) * 0.02 * amp;
  });

  const spots: [number, number, number][] = [
    [-0.1, 0.34, 0.22],
    [0.1, 0.34, 0.22],
    [-0.1, 0.34, -0.22],
    [0.1, 0.34, -0.22],
  ];

  return (
    <group>
      {spots.map((p, i) => (
        <group key={i} position={p} ref={(node) => { legs.current[i] = node; }}>
          <mesh position={[0, -0.16, 0]} material={mats.trim} castShadow>
            <boxGeometry args={[0.07, 0.32, 0.07]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.52, 0]} material={mats.cloth} castShadow>
        <boxGeometry args={[0.22, 0.22, 0.62]} />
      </mesh>
      <mesh position={[0, 0.66, 0.38]} rotation={[0.7, 0, 0]} material={mats.trim} castShadow>
        <boxGeometry args={[0.1, 0.22, 0.1]} />
      </mesh>
      <mesh position={[0, 0.78, 0.5]} material={mats.skin} castShadow>
        <boxGeometry args={[0.12, 0.1, 0.22]} />
      </mesh>
      <group ref={rider} position={[0, 0.78, -0.02]}>
        <mesh material={mats.cloth} castShadow>
          <boxGeometry args={[0.22, 0.26, 0.14]} />
        </mesh>
        <mesh position={[0, 0.22, 0]} material={mats.skin} castShadow>
          <sphereGeometry args={[0.09, 14, 10]} />
        </mesh>
      </group>
    </group>
  );
}

export function StonePerson({
  type,
  white,
  cast,
  gait,
}: {
  type: PieceSymbol;
  white: boolean;
  cast: PeopleCast;
  gait: MutableRefObject<Gait>;
}) {
  const mats = useMats(cast, white);
  const tall = type === "k" ? (cast === "pipe" && !white ? 1.4 : cast === "pipe" && white ? 1.05 : 1.28) : type === "q" ? 1.12 : type === "p" ? 0.74 : type === "b" ? 1.06 : 1;
  const hat =
    type === "q" ? "hood" : type === "k" && cast === "pipe" ? (white ? "cap" : "horns") : type === "k" ? "crown" : null;
  if (type === "n") return <Rider mats={mats} gait={gait} />;
  return <Walker type={type} mats={mats} gait={gait} tall={tall} hat={hat} />;
}
