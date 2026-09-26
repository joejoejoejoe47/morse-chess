import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import * as THREE from "three";
import { StonePerson, WarCorpse, type Gait, type PeopleCast } from "@/components/chess/stone-people";
import { FILES, squareToWorld } from "@/lib/chess/board-math";
import type { Side } from "@/lib/mores-constants";
import { boardById, boardUsesFinePieces, mysteryPair, type BoardSkin } from "@/lib/chess/board-skins";
import type { RoomScene } from "@/lib/chess/look-prefs";
import { HtmlPiece } from "@/components/chess/html-piece";
import { ModelSky, SpaceSky } from "@/components/chess/space-sky";

function hexRgb(hex: string) {
  const n = hex.replace("#", "");
  return {
    r: Number.parseInt(n.slice(0, 2), 16),
    g: Number.parseInt(n.slice(2, 4), 16),
    b: Number.parseInt(n.slice(4, 6), 16),
  };
}

function makeWoodTexture(hex: string, seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { r, g, b } = hexRgb(hex);
  const img = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    const wave = Math.sin(y * 0.07 + seed) * 14 + Math.sin(y * 0.31 + seed * 1.7) * 6;
    for (let x = 0; x < 512; x++) {
      const pore = ((x * 13 + y * 7 + seed * 50) % 17) - 8;
      const streak = Math.sin(x * 0.045 + y * 0.011 + seed) * 16;
      const v = wave + streak + pore * 0.6;
      const i = (y * 512 + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r + v));
      img.data[i + 1] = Math.max(0, Math.min(255, g + v * 0.82));
      img.data[i + 2] = Math.max(0, Math.min(255, b + v * 0.5));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeMarbleTexture(hex: string, seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { r, g, b } = hexRgb(hex);
  const img = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const v1 = Math.sin(x * 0.03 + y * 0.018 + seed) + Math.sin(x * 0.09 - y * 0.05 + seed * 1.7) * 0.55;
      const v2 = Math.sin((x + y) * 0.04 + seed) * 0.35;
      const vein = Math.abs(v1 + v2);
      const speckle = ((x * 17 + y * 31 + seed * 80) % 13) - 6;
      const glow = vein > 1.35 ? 48 : vein > 1.05 ? 18 : 0;
      const i = (y * 512 + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r + speckle + glow));
      img.data[i + 1] = Math.max(0, Math.min(255, g + speckle + glow * 0.9));
      img.data[i + 2] = Math.max(0, Math.min(255, b + speckle + glow * 1.05));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function lathe(pairs: [number, number][], segments = 28) {
  const pts = pairs.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, segments);
}

function makeKnightHead() {
  const s = new THREE.Shape();
  s.moveTo(0.03, 0);
  s.lineTo(0.2, 0);
  s.lineTo(0.18, 0.14);
  s.quadraticCurveTo(0.32, 0.26, 0.24, 0.42);
  s.lineTo(0.36, 0.48);
  s.lineTo(0.38, 0.56);
  s.lineTo(0.26, 0.58);
  s.lineTo(0.2, 0.74);
  s.lineTo(0.1, 0.66);
  s.quadraticCurveTo(-0.02, 0.48, 0.03, 0.22);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 2,
    curveSegments: 10,
  });
  g.translate(-0.12, 0, -0.08);
  g.rotateY(-Math.PI / 2);
  return g;
}

function makeClubGeometries() {
  const pawn = lathe([
    [0, 0],
    [0.32, 0],
    [0.32, 0.06],
    [0.2, 0.1],
    [0.16, 0.26],
    [0.2, 0.3],
    [0.12, 0.34],
    [0.14, 0.4],
    [0.2, 0.5],
    [0.18, 0.58],
    [0.1, 0.63],
    [0, 0.64],
  ]);
  const rook = lathe([
    [0, 0],
    [0.34, 0],
    [0.34, 0.08],
    [0.22, 0.12],
    [0.2, 0.52],
    [0.28, 0.56],
    [0.28, 0.72],
    [0.22, 0.72],
    [0, 0.72],
  ]);
  const bishop = lathe([
    [0, 0],
    [0.32, 0],
    [0.32, 0.07],
    [0.18, 0.12],
    [0.14, 0.4],
    [0.18, 0.5],
    [0.12, 0.62],
    [0.1, 0.78],
    [0.06, 0.86],
    [0.08, 0.9],
    [0, 0.92],
  ]);
  const queen = lathe([
    [0, 0],
    [0.34, 0],
    [0.34, 0.08],
    [0.18, 0.14],
    [0.16, 0.46],
    [0.22, 0.54],
    [0.16, 0.62],
    [0.2, 0.78],
    [0.12, 0.86],
    [0.08, 0.94],
    [0, 0.96],
  ]);
  const king = lathe([
    [0, 0],
    [0.34, 0],
    [0.34, 0.08],
    [0.18, 0.14],
    [0.16, 0.5],
    [0.22, 0.58],
    [0.16, 0.66],
    [0.18, 0.84],
    [0.12, 0.9],
    [0, 0.9],
  ]);
  const knightBase = lathe([
    [0, 0],
    [0.32, 0],
    [0.32, 0.08],
    [0.2, 0.12],
    [0.18, 0.28],
    [0, 0.28],
  ]);
  return { pawn, rook, bishop, queen, king, knightBase, knightHead: null as THREE.BufferGeometry | null };
}

function makeStauntonGeometries() {
  const pawn = lathe(
    [
      [0, 0],
      [0.3, 0],
      [0.3, 0.05],
      [0.22, 0.08],
      [0.2, 0.12],
      [0.14, 0.16],
      [0.12, 0.34],
      [0.16, 0.38],
      [0.12, 0.42],
      [0.11, 0.5],
      [0.18, 0.58],
      [0.16, 0.68],
      [0.08, 0.72],
      [0, 0.73],
    ],
    48,
  );
  const rook = lathe(
    [
      [0, 0],
      [0.32, 0],
      [0.32, 0.06],
      [0.24, 0.1],
      [0.2, 0.16],
      [0.17, 0.22],
      [0.16, 0.52],
      [0.22, 0.56],
      [0.24, 0.62],
      [0.26, 0.7],
      [0.2, 0.7],
      [0, 0.7],
    ],
    48,
  );
  const bishop = lathe(
    [
      [0, 0],
      [0.3, 0],
      [0.3, 0.05],
      [0.2, 0.1],
      [0.16, 0.16],
      [0.12, 0.22],
      [0.11, 0.48],
      [0.16, 0.54],
      [0.12, 0.6],
      [0.1, 0.72],
      [0.14, 0.86],
      [0.08, 0.96],
      [0.05, 1.02],
      [0.07, 1.06],
      [0, 1.07],
    ],
    48,
  );
  const queen = lathe(
    [
      [0, 0],
      [0.32, 0],
      [0.32, 0.06],
      [0.22, 0.1],
      [0.17, 0.16],
      [0.13, 0.24],
      [0.12, 0.52],
      [0.18, 0.58],
      [0.14, 0.64],
      [0.16, 0.78],
      [0.2, 0.9],
      [0.12, 0.96],
      [0.08, 1.02],
      [0, 1.04],
    ],
    48,
  );
  const king = lathe(
    [
      [0, 0],
      [0.34, 0],
      [0.34, 0.06],
      [0.22, 0.11],
      [0.17, 0.17],
      [0.13, 0.26],
      [0.12, 0.56],
      [0.2, 0.62],
      [0.15, 0.68],
      [0.16, 0.86],
      [0.2, 0.96],
      [0.12, 1.0],
      [0, 1.0],
    ],
    48,
  );
  const knightBase = lathe(
    [
      [0, 0],
      [0.3, 0],
      [0.3, 0.06],
      [0.2, 0.1],
      [0.16, 0.16],
      [0.14, 0.3],
      [0, 0.3],
    ],
    40,
  );
  return { pawn, rook, bishop, queen, king, knightBase, knightHead: makeKnightHead() };
}

function makeGeometries(fine: boolean) {
  return fine ? makeStauntonGeometries() : makeClubGeometries();
}

function PieceMesh({
  type,
  color,
  geometries,
  ivory,
  ebony,
  skin,
  outlineOn,
}: {
  type: PieceSymbol;
  color: Color;
  geometries: ReturnType<typeof makeGeometries>;
  ivory: THREE.MeshStandardMaterial;
  ebony: THREE.MeshStandardMaterial;
  skin: BoardSkin;
  outlineOn: boolean;
}) {
  const mat = color === "w" ? ivory : ebony;
  const outline = color === "w" ? skin.whiteStroke : skin.blackStroke;
  const fine = boardUsesFinePieces(skin);
  const scale = skin.pieceScale || 1;
  if (type === "n") {
    return (
      <group scale={scale}>
        {outlineOn ? (
          <mesh geometry={geometries.knightBase} scale={[1.1, 1.06, 1.1]}>
            <meshBasicMaterial color={outline} side={THREE.BackSide} />
          </mesh>
        ) : null}
        <mesh geometry={geometries.knightBase} material={mat} castShadow />
        {geometries.knightHead ? (
          <mesh geometry={geometries.knightHead} position={[0, 0.28, 0]} material={mat} castShadow />
        ) : (
          <group rotation={[0, Math.PI, 0]}>
            <mesh position={[0, 0.42, 0.02]} rotation={[0.15, 0, 0]} castShadow>
              <boxGeometry args={[0.22, 0.38, 0.34]} />
              <meshStandardMaterial color={mat.color} roughness={mat.roughness} metalness={mat.metalness} />
            </mesh>
            <mesh position={[0, 0.62, 0.16]} rotation={[0.55, 0, 0]} castShadow>
              <boxGeometry args={[0.2, 0.22, 0.3]} />
              <meshStandardMaterial color={mat.color} roughness={mat.roughness} metalness={mat.metalness} />
            </mesh>
            <mesh position={[0, 0.72, 0.3]} castShadow>
              <boxGeometry args={[0.16, 0.12, 0.16]} />
              <meshStandardMaterial color={mat.color} roughness={mat.roughness} metalness={mat.metalness} />
            </mesh>
            <mesh position={[0.05, 0.86, 0.08]} castShadow>
              <boxGeometry args={[0.08, 0.16, 0.1]} />
              <meshStandardMaterial color={mat.color} roughness={mat.roughness} metalness={mat.metalness} />
            </mesh>
          </group>
        )}
      </group>
    );
  }
  const geo =
    type === "p"
      ? geometries.pawn
      : type === "r"
        ? geometries.rook
        : type === "b"
          ? geometries.bishop
          : type === "q"
            ? geometries.queen
            : geometries.king;
  return (
    <group scale={scale}>
      {outlineOn ? (
        <mesh geometry={geo} scale={[1.1, 1.07, 1.1]}>
          <meshBasicMaterial color={outline} side={THREE.BackSide} />
        </mesh>
      ) : null}
      <mesh geometry={geo} material={mat} castShadow />
      {type === "k" ? (
        <group position={[0, fine ? 1.08 : 0.98, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.07, 0.24, 0.07]} />
            <meshStandardMaterial color={mat.color} roughness={0.35} metalness={0.08} />
          </mesh>
          <mesh position={[0, 0.04, 0]} castShadow>
            <boxGeometry args={[0.2, 0.07, 0.07]} />
            <meshStandardMaterial color={mat.color} roughness={0.35} metalness={0.08} />
          </mesh>
        </group>
      ) : null}
      {type === "q" ? (
        <group position={[0, fine ? 1.04 : 0.96, 0]}>
          {[0, 1, 2, 3, 4, 5, 6, 7].slice(0, fine ? 8 : 5).map((i) => {
            const n = fine ? 8 : 5;
            const a = (i / n) * Math.PI * 2;
            const r = fine ? 0.14 : 0.12;
            return (
              <mesh key={i} position={[Math.cos(a) * r, 0.02, Math.sin(a) * r]} castShadow>
                <sphereGeometry args={[fine ? 0.028 : 0.035, 10, 10]} />
                <meshStandardMaterial color={mat.color} roughness={0.32} metalness={0.1} />
              </mesh>
            );
          })}
        </group>
      ) : null}
      {type === "r" ? (
        <group position={[0, fine ? 0.7 : 0.74, 0]}>
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            const r = fine ? 0.2 : 0.22;
            return (
              <mesh key={i} position={[Math.cos(a) * r, 0.07, Math.sin(a) * r]} castShadow>
                <boxGeometry args={[0.09, fine ? 0.14 : 0.1, 0.09]} />
                <meshStandardMaterial color={mat.color} roughness={0.4} metalness={0.06} />
              </mesh>
            );
          })}
        </group>
      ) : null}
      {type === "b" && fine ? (
        <mesh position={[0, 0.92, 0]} rotation={[0, 0, 0.14]} castShadow>
          <boxGeometry args={[0.018, 0.2, 0.14]} />
          <meshStandardMaterial color={outline} roughness={0.45} metalness={0.05} />
        </mesh>
      ) : null}
    </group>
  );
}

function AnimatedPiece({
  square,
  spawnFrom,
  type,
  color,
  selected,
  you,
  geometries,
  ivory,
  ebony,
  onClick,
  skin,
  outlineOn,
  people,
  cast,
  slay,
  showTip,
  clash,
  duelAt,
}: {
  square: string;
  spawnFrom: string;
  type: PieceSymbol;
  color: Color;
  selected: boolean;
  you: Side;
  geometries: ReturnType<typeof makeGeometries>;
  ivory: THREE.MeshStandardMaterial;
  ebony: THREE.MeshStandardMaterial;
  onClick: () => void;
  skin: BoardSkin;
  outlineOn: boolean;
  people: boolean;
  cast: PeopleCast;
  slay: boolean;
  showTip: boolean;
  clash: boolean;
  duelAt: string | null;
}) {
  const ref = useRef<THREE.Group>(null);
  const start = squareToWorld(spawnFrom);
  const pos = useRef(new THREE.Vector3(start[0], 0, start[2]));
  const lift = useRef(selected ? 0.22 : 0);
  const gait = useRef<Gait>({ phase: 0, amp: 0, act: "idle", fade: 1 });
  const swung = useRef(false);
  const attackUntil = useRef(0);
  const trip = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t: number } | null>(null);
  const [tip, setTip] = useState(false);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
    const dest = squareToWorld(square);
    const target = new THREE.Vector3(dest[0], 0, dest[2]);
    const jumping = type === "n";
    if (people || jumping) {
      if (!trip.current || trip.current.to.distanceTo(target) > 0.01) {
        trip.current = { from: pos.current.clone(), to: target.clone(), t: 0 };
      }
      const span = trip.current.from.distanceTo(trip.current.to);
      if (span > 0.02) trip.current.t = Math.min(1, trip.current.t + dt / (jumping ? 0.86 : 0.72));
      else trip.current.t = 1;
      pos.current.lerpVectors(trip.current.from, trip.current.to, trip.current.t);
    } else {
      const k = 1 - Math.exp(-14 * dt);
      pos.current.lerp(target, k);
    }
    lift.current += ((selected ? 0.24 : 0) - lift.current) * (1 - Math.exp(-16 * dt));
    if (!ref.current) return;
    const hop =
      jumping && trip.current && trip.current.t > 0 && trip.current.t < 1
        ? Math.sin(trip.current.t * Math.PI) * 2.05
        : 0;
    ref.current.position.set(pos.current.x, 0.08 + lift.current + hop, pos.current.z);
    if (people) {
      const traveling = (trip.current?.t ?? 1) < 1;
      gait.current.amp += ((traveling ? 1 : 0) - gait.current.amp) * (1 - Math.exp(-8 * dt));
      if (traveling) gait.current.phase += dt * 9;
      if (!traveling && slay && !swung.current) {
        swung.current = true;
        attackUntil.current = performance.now() + (clash || duelAt ? 1900 : 980);
      }
      gait.current.act = performance.now() < attackUntil.current ? "attack" : traveling ? "walk" : "idle";
      if (duelAt && gait.current.act === "attack") {
        const foe = squareToWorld(duelAt as Square);
        const fx = foe[0] - pos.current.x;
        const fz = foe[2] - pos.current.z;
        if (Math.hypot(fx, fz) > 0.05) ref.current.rotation.y = Math.atan2(fx, fz);
        return;
      }
      const dx = target.x - pos.current.x;
      const dz = target.z - pos.current.z;
      if (Math.hypot(dx, dz) > 0.08) ref.current.rotation.y = Math.atan2(dx, dz);
      else if (gait.current.act !== "attack") ref.current.rotation.y = color === "w" ? Math.PI : 0;
      return;
    }
    const knightTurn =
      skin.id === "lodge" || skin.id === "pine" || skin.id === "pipe-court" || skin.id === "ring-march";
    ref.current.rotation.y = type === "n" ? (color === "w" ? Math.PI : 0) + (knightTurn ? Math.PI : 0) : 0;
  });

  return (
    <group
      ref={ref}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => {
        const kind = (e.nativeEvent as PointerEvent).pointerType;
        if (kind && kind !== "mouse") return;
        if (!showTip) return;
        setTip(true);
      }}
      onPointerOut={() => setTip(false)}
    >
      {tip && showTip ? (
        <Html position={[0, 1.45, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
          <span className="grid size-12 place-items-center rounded-md border border-white/25 bg-black/60 shadow-lg">
            <HtmlPiece
              kind={type}
              fill={color === "w" ? "#f7f3ea" : "#1c140e"}
              edge={color === "w" ? "#2a1810" : "#f4efe4"}
              className="!m-0 !h-10 !w-8"
            />
          </span>
        </Html>
      ) : null}
      {people ? (
        <StonePerson
          type={type}
          white={color === "w"}
          cast={cast}
          sword={cast === "wars" || cast === "mario" || cast === "lotr" ? color !== you : false}
          clash={clash}
          wing={square[0] < "e" ? "a" : "b"}
          gait={gait}
        />
      ) : (
        <PieceMesh
          type={type}
          color={color}
          geometries={geometries}
          ivory={ivory}
          ebony={ebony}
          skin={skin}
          outlineOn={outlineOn}
        />
      )}
    </group>
  );
}

function BoardSquares({
  selected,
  legal,
  lastMove,
  checkSquare,
  onSquare,
  skin,
  lightMap,
  darkMap,
}: {
  selected: string | null;
  legal: Set<string>;
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  onSquare: (sq: Square) => void;
  skin: BoardSkin;
  lightMap?: THREE.Texture | null;
  darkMap?: THREE.Texture | null;
}) {
  const squares = useMemo(() => {
    const list: { sq: Square; x: number; z: number; light: boolean }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = `${FILES[f]}${r + 1}` as Square;
        list.push({ sq, x: f - 3.5, z: 3.5 - r, light: (f + r) % 2 === 1 });
      }
    }
    return list;
  }, []);

  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (skin.id !== "mystery" || !group.current) return;
    const [lightC, darkC] = mysteryPair(clock.elapsedTime + Date.now() / 900);
    group.current.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.userData.lock) return;
      if (typeof obj.userData.light !== "boolean") return;
      const mat = obj.material as THREE.MeshStandardMaterial;
      if (!mat?.color) return;
      mat.color.set(obj.userData.light ? lightC : darkC);
    });
  });

  return (
    <group ref={group}>
      {squares.map(({ sq, x, z, light }) => {
        const isSel = selected === sq;
        const isLast = lastMove?.from === sq || lastMove?.to === sq;
        const isCheck = checkSquare === sq;
        const color = isCheck
          ? skin.check
          : isSel
            ? skin.select
            : isLast
              ? skin.last
              : light
                ? skin.lightSq
                : skin.darkSq;
        return (
          <group key={sq}>
            <mesh
              position={[x, 0.08, z]}
              receiveShadow
              userData={{ light, lock: isCheck || isSel || isLast }}
              onClick={(e) => {
                e.stopPropagation();
                onSquare(sq);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                document.body.style.cursor = "default";
              }}
            >
              <boxGeometry args={[0.98, 0.08, 0.98]} />
              <meshStandardMaterial
                color={color}
                map={isCheck || isSel || isLast ? null : light ? lightMap ?? null : darkMap ?? null}
                roughness={skin.sqRough}
                metalness={skin.sqMetal}
              />
            </mesh>
            {legal.has(sq) ? (
              <mesh position={[x, 0.14, z]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.16, 22]} />
                <meshBasicMaterial color={skin.dot} transparent opacity={0.88} />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

const SEAT_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SEAT_FRAG = `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(map, vUv);
  float green = c.g - max(c.r, c.b);
  float key = distance(c.rgb, vec3(0.0, 1.0, 0.0));
  if (green > 0.22 && key < 0.82) discard;
  if (c.g > 0.55 && c.r < 0.38 && c.b < 0.38) discard;
  c.g = min(c.g, max(c.r, c.b) * 1.08);
  gl_FragColor = vec4(c.rgb, 1.0);
}
`;

function RobotFigure() {
  const shell = "#14150f";
  const panel = "#1c1d18";
  const eye = "#f3ead8";
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 2.55, 0]} castShadow>
        <boxGeometry args={[2.1, 3.3, 0.85]} />
        <meshStandardMaterial color={shell} roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position={[0, 3.35, 0.22]} castShadow>
        <boxGeometry args={[1.55, 1.15, 0.55]} />
        <meshStandardMaterial color={panel} roughness={0.4} metalness={0.15} />
      </mesh>
      <mesh position={[-0.38, 3.4, 0.52]}>
        <sphereGeometry args={[0.16, 14, 14]} />
        <meshStandardMaterial color={eye} emissive={eye} emissiveIntensity={0.55} />
      </mesh>
      <mesh position={[0.38, 3.4, 0.52]}>
        <sphereGeometry args={[0.16, 14, 14]} />
        <meshStandardMaterial color={eye} emissive={eye} emissiveIntensity={0.55} />
      </mesh>
      <mesh position={[0, 2.55, 0.48]}>
        <boxGeometry args={[0.7, 0.1, 0.08]} />
        <meshStandardMaterial color="#3a2a1c" />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow>
        <boxGeometry args={[1.4, 0.35, 0.7]} />
        <meshStandardMaterial color={panel} roughness={0.5} metalness={0.1} />
      </mesh>
    </group>
  );
}

function TableSeat({
  you,
  mode,
  video,
}: {
  you: Side;
  mode: "video" | "bot" | null;
  video: HTMLVideoElement | null;
}) {
  const behindFar = you === "w";
  const z = behindFar ? -5.55 : 5.55;
  const rotY = behindFar ? 0 : Math.PI;
  const [tex, setTex] = useState<THREE.VideoTexture | null>(null);

  useEffect(() => {
    if (mode !== "video" || !video) {
      setTex(null);
      return;
    }
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    setTex(t);
    return () => {
      t.dispose();
      setTex(null);
    };
  }, [mode, video]);

  useFrame(() => {
    if (tex) tex.needsUpdate = true;
  });

  if (!mode) return null;

  if (mode === "bot") {
    return (
      <group position={[0, 0.12, z]} rotation={[0, rotY, 0]}>
        <RobotFigure />
      </group>
    );
  }

  if (!tex) return null;

  const w = 6.6;
  const h = 8.8;
  const y = h * 0.42;
  return (
    <mesh position={[0, y, z]} rotation={[0, rotY, 0]} renderOrder={2}>
      <planeGeometry args={[w, h]} />
      <shaderMaterial
        transparent
        depthWrite
        uniforms={{ map: { value: tex } }}
        vertexShader={SEAT_VERT}
        fragmentShader={SEAT_FRAG}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function WalnutTable({ map }: { map: THREE.Texture | null }) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#5c3a22",
        map: map ?? undefined,
        roughness: 0.32,
        metalness: 0.08,
      }),
    [map],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <group>
      <mesh position={[0, -0.21, 0]} receiveShadow castShadow material={mat}>
        <boxGeometry args={[11.4, 0.42, 11.4]} />
      </mesh>
      <mesh position={[0, -0.52, 0]} receiveShadow material={mat}>
        <boxGeometry args={[10.6, 0.22, 10.6]} />
      </mesh>
      {[[-4.6, -4.6], [4.6, -4.6], [-4.6, 4.6], [4.6, 4.6]].map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, -1.15, z]} castShadow receiveShadow material={mat}>
          <cylinderGeometry args={[0.22, 0.28, 1.4, 16]} />
        </mesh>
      ))}
    </group>
  );
}

function StudioTable({ map, brass }: { map: THREE.Texture | null; brass: string }) {
  const wood = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#4a2e1a",
        map: map ?? undefined,
        roughness: 0.38,
        metalness: 0.06,
      }),
    [map],
  );
  const rim = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3a2214",
        map: map ?? undefined,
        roughness: 0.32,
        metalness: 0.08,
      }),
    [map],
  );
  const pin = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: brass,
        roughness: 0.28,
        metalness: 0.72,
      }),
    [brass],
  );
  useEffect(
    () => () => {
      wood.dispose();
      rim.dispose();
      pin.dispose();
    },
    [wood, rim, pin],
  );
  return (
    <group>
      <mesh position={[0, -0.28, 0]} receiveShadow castShadow material={wood}>
        <boxGeometry args={[12.2, 0.56, 12.2]} />
      </mesh>
      <mesh position={[0, 0.12, 5.12]} receiveShadow castShadow material={rim}>
        <boxGeometry args={[12.05, 0.28, 1.82]} />
      </mesh>
      <mesh position={[0, 0.12, -5.12]} receiveShadow castShadow material={rim}>
        <boxGeometry args={[12.05, 0.28, 1.82]} />
      </mesh>
      <mesh position={[5.12, 0.12, 0]} receiveShadow castShadow material={rim}>
        <boxGeometry args={[1.82, 0.28, 8.42]} />
      </mesh>
      <mesh position={[-5.12, 0.12, 0]} receiveShadow castShadow material={rim}>
        <boxGeometry args={[1.82, 0.28, 8.42]} />
      </mesh>
      <mesh position={[0, 0.02, 0]} receiveShadow material={wood}>
        <boxGeometry args={[8.42, 0.08, 8.42]} />
      </mesh>
      <mesh position={[0, -0.62, 0]} receiveShadow material={wood}>
        <boxGeometry args={[11.1, 0.2, 11.1]} />
      </mesh>
      {[
        [-5.55, -5.55],
        [5.55, -5.55],
        [-5.55, 5.55],
        [5.55, 5.55],
      ].map(([x, z]) => (
        <mesh key={`pin-${x}:${z}`} position={[x, 0.2, z]} castShadow material={pin}>
          <cylinderGeometry args={[0.12, 0.12, 0.08, 16]} />
        </mesh>
      ))}
      {[
        [-4.85, -4.85],
        [4.85, -4.85],
        [-4.85, 4.85],
        [4.85, 4.85],
      ].map(([x, z]) => (
        <group key={`leg-${x}:${z}`} position={[x, 0, z]}>
          <mesh position={[0, -1.05, 0]} castShadow receiveShadow material={wood}>
            <cylinderGeometry args={[0.22, 0.3, 1.55, 18]} />
          </mesh>
          <mesh position={[0, -1.86, 0]} receiveShadow material={wood}>
            <cylinderGeometry args={[0.34, 0.34, 0.12, 18]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function RoomSky({ color, image }: { color: string; image: string | null }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!image) {
      setTexture(null);
      return;
    }
    const tex = new THREE.TextureLoader().load(image);
    tex.colorSpace = THREE.SRGBColorSpace;
    setTexture(tex);
    return () => {
      tex.dispose();
    };
  }, [image]);
  if (texture) return <primitive attach="background" object={texture} />;
  return <color attach="background" args={[color]} />;
}

function Scene({
  fen,
  you,
  lastMove,
  selected,
  legal,
  checkSquare,
  onSquare,
  interactive,
  appearance,
  skin,
  tableSeat,
  seatVideo,
  outlineOn,
  roomColor,
  roomImage,
  roomScene,
  modelUrl,
  people,
  showTip,
  fightZoom,
}: {
  fen: string;
  you: Side;
  lastMove: { from: string; to: string } | null;
  selected: string | null;
  legal: Set<string>;
  checkSquare: string | null;
  onSquare: (sq: Square) => void;
  interactive: boolean;
  appearance: "light" | "dark";
  skin: BoardSkin;
  tableSeat: "video" | "bot" | null;
  seatVideo: HTMLVideoElement | null;
  outlineOn: boolean;
  roomColor: string;
  roomImage: string | null;
  roomScene: RoomScene;
  modelUrl: string | null;
  people: boolean;
  showTip: boolean;
  fightZoom: boolean;
}) {
  const geometries = useMemo(() => makeGeometries(boardUsesFinePieces(skin)), [skin]);
  const ivory = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: skin.whitePiece,
        roughness: skin.whiteRough,
        metalness: skin.whiteMetal,
        emissive: new THREE.Color(skin.whiteEmissive),
        emissiveIntensity: skin.whiteGlow,
      }),
    [skin],
  );
  const ebony = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: skin.blackPiece,
        roughness: skin.blackRough,
        metalness: skin.blackMetal,
        emissive: new THREE.Color(skin.blackEmissive),
        emissiveIntensity: skin.blackGlow,
      }),
    [skin],
  );
  useEffect(
    () => () => {
      Object.values(geometries).forEach((g) => g?.dispose());
      ivory.dispose();
      ebony.dispose();
    },
    [geometries, ivory, ebony],
  );

  const pieces = useMemo(() => {
    const chess = new Chess(fen);
    const list: { sq: Square; type: PieceSymbol; color: Color }[] = [];
    for (const sq of chess.board().flatMap((row, rankFromTop) =>
      row.map((p, file) => ({ p, sq: `${FILES[file]}${8 - rankFromTop}` as Square })),
    )) {
      if (sq.p) list.push({ sq: sq.sq, type: sq.p.type, color: sq.p.color });
    }
    return list;
  }, [fen]);

  const prevPieces = useRef<typeof pieces | null>(null);
  const seenCapture = useRef("");
  const [bodies, setBodies] = useState<
    { id: string; sq: Square; aside: Square; type: PieceSymbol; color: Color; delay: number }[]
  >([]);
  const [captureSq, setCaptureSq] = useState<string | null>(null);
  const [duelAside, setDuelAside] = useState<Square | null>(null);
  const [fightLook, setFightLook] = useState<{ x: number; z: number } | null>(null);
  const fightTimer = useRef<number | null>(null);

  useEffect(() => {
    const before = prevPieces.current;
    prevPieces.current = pieces;
    if (!before) return;
    if (!people || !lastMove) {
      setCaptureSq(null);
      return;
    }
    const key = `${fen}|${lastMove.from}${lastMove.to}`;
    if (seenCapture.current === key) return;
    seenCapture.current = key;
    const was = before.find((p) => p.sq === lastMove.to);
    const mover = pieces.find((p) => p.sq === lastMove.to);
    let victim = was && mover && was.color !== mover.color ? was : undefined;
    if (!victim && mover?.type === "p" && lastMove.from[0] !== lastMove.to[0]) {
      const beside = `${lastMove.to[0]}${lastMove.from[1]}` as Square;
      const pawn = before.find((p) => p.sq === beside && p.type === "p" && p.color !== mover.color);
      if (pawn && !pieces.some((p) => p.sq === beside)) victim = pawn;
    }
    if (!victim) {
      setCaptureSq(null);
      setDuelAside(null);
      return;
    }
    const aside = stepAside(lastMove.from as Square, victim.sq, new Set(pieces.map((p) => p.sq)));
    setCaptureSq(lastMove.to);
    setDuelAside(aside !== victim.sq ? aside : null);
    if (fightZoom && aside !== victim.sq) {
      const here = squareToWorld(lastMove.to);
      const there = squareToWorld(aside);
      setFightLook({ x: (here[0] + there[0]) / 2, z: (here[2] + there[2]) / 2 });
    }
    if (fightTimer.current) window.clearTimeout(fightTimer.current);
    fightTimer.current = window.setTimeout(() => {
      setFightLook(null);
      setDuelAside(null);
    }, 2600);
    setBodies((list) => [
      ...list,
      {
        id: `${victim.sq}-${victim.color}${victim.type}-${key}`,
        sq: victim.sq,
        aside,
        type: victim.type,
        color: victim.color,
        delay: 0.72,
      },
    ]);
  }, [pieces, people, lastMove, fen, fightZoom]);

  const wood = useMemo(() => {
    if (skin.id === "marble") {
      const slab = makeMarbleTexture(skin.table, 0.7);
      const light = makeMarbleTexture(skin.lightSq, 0.2);
      const dark = makeMarbleTexture(skin.darkSq, 1.6);
      if (slab) slab.repeat.set(2.4, 2.4);
      return { slab, light, dark };
    }
    if (skin.tableKind !== "walnut" && skin.tableKind !== "studio") return null;
    const slab = makeWoodTexture(skin.table, 1.2);
    const light = makeWoodTexture(skin.lightSq, 0.4);
    const dark = makeWoodTexture(skin.darkSq, 2.1);
    if (slab) slab.repeat.set(2.2, 2.2);
    if (light) light.repeat.set(1, 1);
    if (dark) dark.repeat.set(1, 1);
    return { slab, light, dark };
  }, [skin]);

  useEffect(
    () => () => {
      wood?.slab?.dispose();
      wood?.light?.dispose();
      wood?.dark?.dispose();
    },
    [wood],
  );

  const lightRoom = appearance === "light";
  const cosmic = roomScene === "space" || (roomScene === "model" && Boolean(modelUrl));
  const sky = cosmic ? "#05060c" : roomColor;
  const hemiSky = lightRoom ? "#fffaf1" : skin.fillLight;
  const hemiGround = skin.felt;

  return (
    <>
      {cosmic ? <color attach="background" args={["#05060c"]} /> : <RoomSky color={sky} image={roomImage} />}
      {roomScene === "space" ? <SpaceSky /> : null}
      {roomScene === "model" && modelUrl ? (
        <Suspense fallback={null}>
          <ModelSky url={modelUrl} />
        </Suspense>
      ) : null}
      <hemisphereLight args={[hemiSky, hemiGround, lightRoom ? 0.95 : 0.7]} />
      <ambientLight intensity={lightRoom ? 0.58 : 0.42} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={lightRoom ? 1.2 : 1.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight position={[-6, 8, -8]} intensity={lightRoom ? 0.45 : 0.7} color={skin.fillLight} />
      {skin.tableKind === "legend" ? (
        <pointLight position={[0, 4.2, 0]} intensity={1.4} distance={18} color={skin.fillLight} />
      ) : null}
      {skin.tableKind === "walnut" ? (
        <WalnutTable map={wood?.slab ?? null} />
      ) : skin.tableKind === "studio" ? (
        <StudioTable map={wood?.slab ?? null} brass={skin.collar ?? "#c4a06a"} />
      ) : (
        <mesh position={[0, skin.tableKind === "felt" ? -0.18 : skin.tableKind === "plank" ? -0.26 : -0.32, 0]} receiveShadow>
          <boxGeometry
            args={[
              skin.tableKind === "legend" ? 10.6 : skin.id === "marble" ? 10.4 : 10,
              skin.tableKind === "felt" ? 0.28 : skin.tableKind === "plank" ? 0.42 : 0.52,
              skin.tableKind === "legend" ? 10.6 : skin.id === "marble" ? 10.4 : 10,
            ]}
          />
          <meshStandardMaterial
            color={skin.table}
            map={skin.id === "marble" ? wood?.slab ?? null : null}
            roughness={skin.tableKind === "felt" ? 0.58 : skin.tableKind === "plank" ? 0.38 : 0.16}
            metalness={skin.tableKind === "felt" ? 0.05 : skin.tableKind === "plank" ? 0.18 : 0.55}
          />
        </mesh>
      )}
      <BoardSquares
        selected={selected}
        legal={interactive ? legal : new Set()}
        lastMove={lastMove}
        checkSquare={checkSquare}
        onSquare={onSquare}
        skin={skin}
        lightMap={wood?.light}
        darkMap={wood?.dark}
      />
      <TableSeat you={you} mode={tableSeat} video={seatVideo} />
      {pieces.map((p) => (
        <AnimatedPiece
          key={`${p.color}${p.type}${p.sq}`}
          square={p.sq}
          spawnFrom={lastMove?.to === p.sq ? lastMove.from : p.sq}
          type={p.type}
          color={p.color}
          selected={selected === p.sq}
          you={you}
          geometries={geometries}
          ivory={ivory}
          ebony={ebony}
          skin={skin}
          outlineOn={outlineOn}
          people={people}
          cast={skin.anSet ?? "stone"}
          slay={captureSq === p.sq}
          showTip={showTip}
          clash={fightZoom}
          duelAt={captureSq === p.sq ? duelAside : null}
          onClick={() => onSquare(p.sq)}
        />
      ))}
      {people
        ? bodies.map((body) => {
            const corpse = (
              <WarCorpse
                type={body.type}
                white={body.color === "w"}
                cast={skin.anSet ?? "stone"}
                sword={
                  (skin.anSet === "wars" || skin.anSet === "mario" || skin.anSet === "lotr") &&
                  body.color !== you
                }
                clash={body.aside !== body.sq || fightZoom}
                wing={body.sq[0] < "e" ? "a" : "b"}
                delay={body.aside !== body.sq ? 1.9 : body.delay}
                onDone={() => setBodies((list) => list.filter((item) => item.id !== body.id))}
              />
            );
            if (body.aside !== body.sq) {
              return (
                <DuelShift key={body.id} from={body.sq} to={body.aside} face={(lastMove?.to ?? body.sq) as Square}>
                  {corpse}
                </DuelShift>
              );
            }
            const spot = squareToWorld(body.sq);
            return (
              <group
                key={body.id}
                position={[spot[0], 0.08, spot[2]]}
                rotation={[0, body.color === "w" ? Math.PI : 0, 0]}
              >
                {corpse}
              </group>
            );
          })
        : null}
      {duelAside && captureSq && duelAside !== captureSq ? (
        <SwordTing a={captureSq as Square} b={duelAside} />
      ) : null}
      <FightCam look={fightLook} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableRotate
        enableZoom
        minPolarAngle={0.32}
        maxPolarAngle={1.28}
        minDistance={8}
        maxDistance={22}
        target={[0, 0.2, 0]}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.85}
        zoomSpeed={0.8}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      />
    </>
  );
}

function stepAside(from: Square, to: Square, taken: Set<string>): Square {
  const tf = FILES.indexOf(to[0] as (typeof FILES)[number]);
  const tr = Number(to[1]);
  const ff = FILES.indexOf(from[0] as (typeof FILES)[number]);
  const fr = Number(from[1]);
  const sf = Math.sign(tf - ff);
  const sr = Math.sign(tr - fr);
  const tries: [number, number][] = [
    [sf, sr],
    [sf, 0],
    [0, sr],
    [-sr || 1, sf],
    [sr, -sf || 1],
    [-sf, -sr],
  ];
  for (const [df, dr] of tries) {
    if (df === 0 && dr === 0) continue;
    const file = tf + df;
    const rank = tr + dr;
    if (file < 0 || file > 7 || rank < 1 || rank > 8) continue;
    const sq = `${FILES[file]}${rank}` as Square;
    if (sq === from || taken.has(sq)) continue;
    return sq;
  }
  return to;
}

function DuelShift({
  from,
  to,
  face,
  children,
}: {
  from: Square;
  to: Square;
  face: Square;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const a = squareToWorld(from);
  const b = squareToWorld(to);
  const look = squareToWorld(face);

  useFrame((_, raw) => {
    if (!ref.current) return;
    t.current = Math.min(1, t.current + Math.min(raw, 0.1) / 0.46);
    const x = a[0] + (b[0] - a[0]) * t.current;
    const z = a[2] + (b[2] - a[2]) * t.current;
    ref.current.position.set(x, 0.08, z);
    const dx = look[0] - x;
    const dz = look[2] - z;
    if (Math.hypot(dx, dz) > 0.04) ref.current.rotation.y = Math.atan2(dx, dz);
  });

  return <group ref={ref}>{children}</group>;
}

function SwordTing({ a, b }: { a: Square; b: Square }) {
  const mesh = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const born = useRef<number | null>(null);
  const wa = squareToWorld(a);
  const wb = squareToWorld(b);

  useFrame(({ clock }) => {
    if (born.current == null) born.current = clock.elapsedTime;
    const age = clock.elapsedTime - born.current;
    const flash = age > 0.62 && age < 2.15 ? Math.max(0, Math.sin((age - 0.62) * 16)) : 0;
    if (mesh.current) {
      mesh.current.visible = flash > 0.05;
      mesh.current.scale.setScalar(0.08 + flash * 0.34);
    }
    if (light.current) light.current.intensity = flash * 6;
  });

  return (
    <group position={[(wa[0] + wb[0]) / 2, 0.92, (wa[2] + wb[2]) / 2]}>
      <mesh ref={mesh} visible={false}>
        <sphereGeometry args={[0.14, 14, 14]} />
        <meshBasicMaterial color="#fff6cf" />
      </mesh>
      <pointLight ref={light} color="#ffe7a0" distance={5} intensity={0} />
    </group>
  );
}

function FightCam({ look }: { look: { x: number; z: number } | null }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as {
    target: THREE.Vector3;
    enabled: boolean;
    update: () => void;
  } | null;
  const home = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const back = useRef(false);

  useFrame((_, raw) => {
    if (!controls?.target) return;
    const dt = Math.min(raw, 0.05);
    if (look) {
      if (!home.current) home.current = { pos: camera.position.clone(), target: controls.target.clone() };
      back.current = true;
      controls.enabled = false;
      const gaze = new THREE.Vector3(look.x, 0.95, look.z);
      const dest = new THREE.Vector3(look.x + 2.15, 2.35, look.z + 2.45);
      const k = 1 - Math.exp(-4.2 * dt);
      camera.position.lerp(dest, k);
      controls.target.lerp(gaze, k);
      camera.lookAt(controls.target);
      return;
    }
    if (!back.current || !home.current) return;
    const k = 1 - Math.exp(-3.2 * dt);
    camera.position.lerp(home.current.pos, k);
    controls.target.lerp(home.current.target, k);
    camera.lookAt(controls.target);
    if (camera.position.distanceTo(home.current.pos) < 0.12) {
      camera.position.copy(home.current.pos);
      controls.target.copy(home.current.target);
      controls.enabled = true;
      controls.update();
      home.current = null;
      back.current = false;
    }
  });

  return null;
}

export function ChessBoard3D({
  fen,
  you,
  lastMove,
  myTurn,
  onMove,
  disabled,
  appearance = "dark",
  skin,
  tableSeat = null,
  seatVideo = null,
  outlineOn = true,
  roomColor,
  roomImage = null,
  roomScene = "color",
  modelUrl = null,
  people = false,
  showTip = true,
  fightZoom = false,
}: {
  fen: string;
  you: Side;
  lastMove: { from: string; to: string } | null;
  myTurn: boolean;
  onMove: (from: Square, to: Square) => void;
  disabled?: boolean;
  appearance?: "light" | "dark";
  skin?: BoardSkin;
  tableSeat?: "video" | "bot" | null;
  seatVideo?: HTMLVideoElement | null;
  outlineOn?: boolean;
  roomColor?: string;
  roomImage?: string | null;
  roomScene?: RoomScene;
  modelUrl?: string | null;
  people?: boolean;
  showTip?: boolean;
  fightZoom?: boolean;
}) {
  const [selected, setSelected] = useState<Square | null>(null);
  const dragged = useRef(false);
  const chess = useMemo(() => new Chess(fen), [fen]);
  const legal = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(chess.moves({ square: selected, verbose: true }).map((m) => m.to));
  }, [chess, selected]);
  const checkSquare = useMemo(() => {
    if (!chess.isCheck()) return null;
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p?.type === "k" && p.color === chess.turn()) {
          return `${FILES[f]}${8 - r}` as Square;
        }
      }
    }
    return null;
  }, [chess]);

  useEffect(() => {
    setSelected(null);
  }, [fen]);

  function onSquare(sq: Square) {
    if (dragged.current) return;
    if (disabled || !myTurn) {
      setSelected(null);
      return;
    }
    const piece = chess.get(sq);
    if (selected && legal.has(sq)) {
      onMove(selected, sq);
      setSelected(null);
      return;
    }
    if (piece && piece.color === you && you === chess.turn()) {
      setSelected(sq);
      return;
    }
    setSelected(null);
  }

  const cam: [number, number, number] = you === "w" ? [0, 15.2, 11.2] : [0, 15.2, -11.2];
  const resolved = skin ?? boardById("lodge");

  return (
    <div className="h-full w-full touch-none">
      <Canvas
        key={you}
        shadows
        dpr={[1, 1.75]}
        camera={{ position: cam, fov: 36, near: 0.1, far: 180 }}
        gl={{ antialias: true, alpha: false }}
        onPointerDown={() => {
          dragged.current = false;
        }}
        onPointerMove={(e) => {
          if (e.buttons && Math.abs(e.movementX) + Math.abs(e.movementY) > 8) {
            dragged.current = true;
          }
        }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(0, 0.2, 0);
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFShadowMap;
        }}
      >
        <Scene
          fen={fen}
          you={you}
          lastMove={lastMove}
          selected={selected}
          legal={legal}
          checkSquare={checkSquare}
          onSquare={onSquare}
          interactive={Boolean(myTurn && !disabled)}
          appearance={appearance}
          skin={resolved}
          tableSeat={tableSeat}
          seatVideo={seatVideo}
          outlineOn={outlineOn}
          roomColor={roomColor ?? (appearance === "light" ? "#f6f1e4" : "#0c0d0b")}
          roomImage={roomImage}
          roomScene={roomScene}
          modelUrl={modelUrl}
          people={people}
          showTip={showTip}
          fightZoom={fightZoom}
        />
      </Canvas>
    </div>
  );
}
