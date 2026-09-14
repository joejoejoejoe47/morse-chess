import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import * as THREE from "three";
import { FILES, squareToWorld } from "@/lib/chess/board-math";
import type { Side } from "@/lib/mores-constants";
import { boardById, mysteryPair, type BoardSkin } from "@/lib/chess/board-skins";

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

function lathe(pairs: [number, number][], segments = 28) {
  const pts = pairs.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, segments);
}

function makeGeometries() {
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
  return { pawn, rook, bishop, queen, king, knightBase };
}

function PieceMesh({
  type,
  color,
  geometries,
  ivory,
  ebony,
  skin,
}: {
  type: PieceSymbol;
  color: Color;
  geometries: ReturnType<typeof makeGeometries>;
  ivory: THREE.MeshStandardMaterial;
  ebony: THREE.MeshStandardMaterial;
  skin: BoardSkin;
}) {
  const mat = color === "w" ? ivory : ebony;
  if (type === "n") {
    return (
      <group>
        <mesh geometry={geometries.knightBase} material={mat} castShadow />
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
    <group>
      <mesh geometry={geo} material={mat} castShadow />
      {type === "k" ? (
        <group position={[0, 0.98, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.07, 0.22, 0.07]} />
            <meshStandardMaterial color={mat.color} roughness={0.35} metalness={0.08} />
          </mesh>
          <mesh position={[0, 0.04, 0]} castShadow>
            <boxGeometry args={[0.18, 0.07, 0.07]} />
            <meshStandardMaterial color={mat.color} roughness={0.35} metalness={0.08} />
          </mesh>
        </group>
      ) : null}
      {type === "q" ? (
        <group position={[0, 0.96, 0]}>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.12, 0.02, Math.sin(a) * 0.12]} castShadow>
                <sphereGeometry args={[0.035, 10, 10]} />
                <meshStandardMaterial color={mat.color} roughness={0.32} metalness={0.1} />
              </mesh>
            );
          })}
        </group>
      ) : null}
      {type === "r" ? (
        <group position={[0, 0.74, 0]}>
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.22, 0.05, Math.sin(a) * 0.22]} castShadow>
                <boxGeometry args={[0.1, 0.1, 0.1]} />
                <meshStandardMaterial color={mat.color} roughness={0.4} metalness={0.06} />
              </mesh>
            );
          })}
        </group>
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
}) {
  const ref = useRef<THREE.Group>(null);
  const start = squareToWorld(spawnFrom);
  const pos = useRef(new THREE.Vector3(start[0], 0, start[2]));
  const lift = useRef(selected ? 0.22 : 0);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
    const dest = squareToWorld(square);
    const target = new THREE.Vector3(dest[0], 0, dest[2]);
    const k = 1 - Math.exp(-14 * dt);
    pos.current.lerp(target, k);
    lift.current += ((selected ? 0.24 : 0) - lift.current) * (1 - Math.exp(-16 * dt));
    if (!ref.current) return;
    ref.current.position.set(pos.current.x, 0.08 + lift.current, pos.current.z);
    ref.current.rotation.y = type === "n" ? (color === "w" ? Math.PI : 0) : 0;
  });

  return (
    <group ref={ref} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <PieceMesh type={type} color={color} geometries={geometries} ivory={ivory} ebony={ebony} skin={skin} />
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
}) {
  const geometries = useMemo(() => makeGeometries(), []);
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
      Object.values(geometries).forEach((g) => g.dispose());
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

  const wood = useMemo(() => {
    if (skin.tableKind !== "walnut") return null;
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
  const sky =
    skin.id === "tide" || skin.id === "master"
      ? lightRoom
        ? "#d8e4f4"
        : "#02030a"
      : lightRoom
        ? "#f6f1e4"
        : "#0c0d0b";
  const hemiSky = lightRoom ? "#fffaf1" : skin.fillLight;
  const hemiGround = skin.felt;

  return (
    <>
      <color attach="background" args={[sky]} />
      <hemisphereLight args={[hemiSky, hemiGround, lightRoom ? 0.85 : 0.55]} />
      <ambientLight intensity={lightRoom ? 0.5 : 0.32} />
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
      ) : (
        <mesh position={[0, skin.tableKind === "felt" ? -0.18 : skin.tableKind === "plank" ? -0.26 : -0.32, 0]} receiveShadow>
          <boxGeometry
            args={[
              skin.tableKind === "legend" ? 10.6 : 10,
              skin.tableKind === "felt" ? 0.28 : skin.tableKind === "plank" ? 0.42 : 0.52,
              skin.tableKind === "legend" ? 10.6 : 10,
            ]}
          />
          <meshStandardMaterial
            color={skin.table}
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
          onClick={() => onSquare(p.sq)}
        />
      ))}
      <OrbitControls
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

export function ChessBoard3D({
  fen,
  you,
  lastMove,
  myTurn,
  onMove,
  disabled,
  appearance = "dark",
  skin,
}: {
  fen: string;
  you: Side;
  lastMove: { from: string; to: string } | null;
  myTurn: boolean;
  onMove: (from: Square, to: Square) => void;
  disabled?: boolean;
  appearance?: "light" | "dark";
  skin?: BoardSkin;
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
        camera={{ position: cam, fov: 36, near: 0.1, far: 80 }}
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
        />
      </Canvas>
    </div>
  );
}
