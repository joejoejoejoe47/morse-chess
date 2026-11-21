/**
 * Battle Chess 3D / AN / LG (owner t375u, MB-14).
 *  - 3d: a raised wooden island on a blue sea, rock mountains, bushes, carved piece tokens and two sailing frigates.
 *  - an: the same, animated: pieces hop, arrows and cannonballs fly, hit pieces burst into shards.
 *  - lg: a plastic brick island: studded baseplate, brick mountains, round-brick bushes, studded tokens.
 */
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BC_X0, BC_X1, BC_Y0, BC_Y1, bcPos, bcSq, bcTerrain } from "@/lib/boardgames/battlechess";
import { useBcPieces, type BcPiece } from "./bc-board-2d";
import { disc, woodTexture, Shards, Shake, type BgStyle, type Burst } from "./bg-board-3d";

type Props = {
  style: BgStyle;
  fen: string;
  you: "w" | "b";
  lastMove: { from: string; to: string } | null;
  lastSan?: string | null;
  myTurn: boolean;
  disabled?: boolean;
  onMove: (from: string, to: string) => void;
  legalFor?: (from: string) => string[];
  checkSq?: string | null;
};

const LAND_Y = 0; // top of the island
const SEA_Y = -0.28; // water surface
/** Board cell -> world x/z. The island (a..n, 1..8) is centred on the origin; +z is rank 1's side. */
const wx = (x: number) => x - 6.5;
const wz = (y: number) => -(y - 4.5);

const GLYPH: Record<string, string> = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
const ICON: Record<string, { fill: string[]; stroke: string[] }> = {
  C: { fill: [], stroke: ["M34 12 Q86 50 34 88", "M34 12 L34 88", "M14 50 L84 50", "M72 38 L86 50 L72 62", "M14 50 L6 42 M14 50 L6 58"] },
  E: { fill: ["M50 34 C42 22 24 18 6 24 C18 30 26 38 34 46 C24 48 20 56 22 64 L38 58 L44 82 L50 74 L56 82 L62 58 L78 64 C80 56 76 48 66 46 C74 38 82 30 94 24 C76 18 58 22 50 34 Z", "M58 30 A8 8 0 1 1 42 30 A8 8 0 1 1 58 30 Z"], stroke: [] },
  A: { fill: ["M50 6 C34 14 26 30 28 48 C30 62 40 70 50 70 C60 70 70 62 72 48 C74 30 66 14 50 6 Z", "M22 92 L78 92 L72 74 C64 70 36 70 28 74 Z", "M70 56 L90 30 L94 34 L74 60 Z"], stroke: [] },
};

const texCache = new Map<string, THREE.CanvasTexture>();
/** The carved face of a token: a ring and the piece's emblem. */
function faceTexture(kind: string, white: boolean, lego: boolean) {
  const key = `${kind}${white}${lego}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const base = lego ? (white ? "#f4f1ea" : "#26232b") : white ? "#f1e3c4" : "#1e1626";
  const ink = white ? "#3a2412" : "#e0b85a";
  g.fillStyle = base;
  g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  if (!lego) {
    const grad = g.createRadialGradient(96, 84, 10, 128, 128, 132);
    grad.addColorStop(0, "rgba(255,255,255,.28)");
    grad.addColorStop(1, white ? "rgba(120,70,20,.25)" : "rgba(0,0,0,.35)");
    g.fillStyle = grad; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = ink;
  g.lineWidth = 9;
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  if (GLYPH[kind]) {
    g.fillStyle = ink;
    g.font = `150px "DejaVu Sans","Segoe UI Symbol","Apple Symbols","Noto Sans Symbols2",serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(GLYPH[kind], 128, 140);
  } else {
    const ic = ICON[kind];
    g.save();
    g.translate(48, 48);
    g.scale(1.6, 1.6);
    g.fillStyle = ink;
    g.strokeStyle = ink;
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const d of ic.fill) g.fill(new Path2D(d));
    g.lineWidth = 7;
    for (const d of ic.stroke) g.stroke(new Path2D(d));
    if (kind === "A") {
      g.fillStyle = base;
      g.fill(new Path2D("M38 40 C42 34 58 34 62 40 C60 54 40 54 38 40 Z"));
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}

function seaTexture(lego: boolean) {
  const W = 20 * 64, H = 14 * 64;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  for (let yi = 0; yi < 14; yi++)
    for (let xi = 0; xi < 20; xi++) {
      g.fillStyle = (xi + yi) % 2 === 0 ? (lego ? "#3c8de0" : "#2f5fb8") : lego ? "#2f7bcc" : "#244c9a";
      g.fillRect(xi * 64, yi * 64, 64, 64);
      if (!lego) {
        g.strokeStyle = "rgba(140,180,255,.35)";
        g.lineWidth = 2;
        for (const off of [20, 44]) {
          g.beginPath();
          g.moveTo(xi * 64, yi * 64 + off);
          g.quadraticCurveTo(xi * 64 + 16, yi * 64 + off - 5, xi * 64 + 32, yi * 64 + off);
          g.quadraticCurveTo(xi * 64 + 48, yi * 64 + off + 5, xi * 64 + 64, yi * 64 + off);
          g.stroke();
        }
      }
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const HEIGHT: Record<string, number> = { P: 0.16, N: 0.22, B: 0.22, C: 0.22, E: 0.24, A: 0.24, R: 0.26, Q: 0.3, K: 0.34 };
type Anim = { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; hop: number };

function useGlide(target: THREE.Vector3, style: BgStyle, ship: boolean) {
  const g = useRef<THREE.Group>(null);
  const anim = useRef<Anim | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (!g.current) return;
    if (first.current) {
      g.current.position.copy(target);
      first.current = false;
      return;
    }
    const from = g.current.position.clone();
    from.y = target.y;
    const dist = from.distanceTo(target);
    if (dist < 1e-3) return;
    anim.current = {
      from,
      to: target.clone(),
      t: 0,
      dur: ship ? 0.6 + dist * 0.08 : style === "an" ? 0.5 + dist * 0.05 : 0.32,
      hop: ship ? 0 : style === "an" ? 0.55 + dist * 0.12 : style === "lg" ? 0.25 : 0.05,
    };
  }, [target, style, ship]);
  return { g, anim };
}

function Token({ pc, style, pos, selected, check, faceYaw, onClick }: { pc: BcPiece; style: BgStyle; pos: THREE.Vector3; selected: boolean; check: boolean; faceYaw: number; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const { g, anim } = useGlide(pos, style, false);
  useFrame((st, dt) => {
    const gr = g.current;
    if (!gr) return;
    const a = anim.current;
    if (a) {
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
      gr.position.lerpVectors(a.from, a.to, e);
      gr.position.y = pos.y + Math.sin(Math.PI * a.t) * a.hop;
      if (style === "an") gr.rotation.z = Math.sin(Math.PI * a.t) * 0.25;
      if (a.t >= 1) {
        anim.current = null;
        gr.rotation.z = 0;
        gr.position.copy(pos);
      }
    } else {
      gr.position.y = pos.y + (selected ? 0.18 + Math.sin(st.clock.elapsedTime * 4) * 0.04 : 0);
    }
  });
  const lego = style === "lg";
  const white = pc.c === "w";
  const r = 0.38;
  const h = HEIGHT[pc.kind] ?? 0.2;
  const tex = useMemo(() => faceTexture(pc.kind, white, lego), [pc.kind, white, lego]);
  const color = lego ? (white ? "#f2efe6" : "#2a2730") : white ? "#e9d3a6" : "#231a2c";
  return (
    <group ref={g} onClick={onClick}>
      <mesh geometry={disc(r, h, false)} castShadow receiveShadow>
        {lego ? <meshStandardMaterial color={color} roughness={0.22} /> : <meshPhysicalMaterial color={color} roughness={0.38} clearcoat={0.6} clearcoatRoughness={0.3} />}
      </mesh>
      {!lego ? (
        <mesh position={[0, h * 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r * 0.995, 0.014, 8, 48]} />
          <meshStandardMaterial color="#e0b85a" metalness={0.9} roughness={0.25} />
        </mesh>
      ) : null}
      <mesh position={[0, h + 0.003, 0]} rotation={[-Math.PI / 2, 0, faceYaw]}>
        <circleGeometry args={[r * 0.88, 40]} />
        <meshStandardMaterial map={tex} roughness={0.45} transparent />
      </mesh>
      {lego
        ? [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} position={[sx * r * 0.66, h + 0.035, sz * r * 0.66]} castShadow>
              <cylinderGeometry args={[0.045, 0.045, 0.07, 14]} />
              <meshStandardMaterial color={color} roughness={0.22} />
            </mesh>
          ))
        : null}
      {pc.kind === "K" ? (
        <mesh position={[0, h + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r * 0.95, 0.03, 10, 40]} />
          <meshStandardMaterial color="#f2c94c" metalness={0.9} roughness={0.2} emissive="#5a3a00" />
        </mesh>
      ) : null}
      {selected || check ? (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 1.08, r * 1.26, 40]} />
          <meshBasicMaterial color={check ? "#ff4a3a" : "#ffe08a"} transparent opacity={0.9} />
        </mesh>
      ) : null}
    </group>
  );
}

/** A two-cell frigate, drawn along +x (rotated for a ship lying along z). */
function Frigate({ pc, style, pos, alongZ, selected, onClick }: { pc: BcPiece; style: BgStyle; pos: THREE.Vector3; alongZ: boolean; selected: boolean; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const { g, anim } = useGlide(pos, style, true);
  const lego = style === "lg";
  const white = pc.c === "w";
  const hullGeo = useMemo(() => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.95, 0.12);
    sh.lineTo(0.8, 0.12);
    sh.quadraticCurveTo(0.98, 0.1, 1.0, 0.0);
    sh.quadraticCurveTo(0.9, -0.22, 0.6, -0.26);
    sh.lineTo(-0.75, -0.26);
    sh.quadraticCurveTo(-0.95, -0.2, -0.95, 0.12);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    geo.translate(0, 0, -0.25);
    return geo;
  }, []);
  const sailGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.46, 0.5, 6, 6);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.cos((p.getX(i) / 0.46) * Math.PI) * 0.06);
    geo.computeVertexNormals();
    return geo;
  }, []);
  useFrame((st, dt) => {
    const gr = g.current;
    if (!gr) return;
    const a = anim.current;
    if (a) {
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
      gr.position.lerpVectors(a.from, a.to, e);
      if (a.t >= 1) anim.current = null;
    }
    const tt = st.clock.elapsedTime + (white ? 0 : 1.7);
    gr.position.y = pos.y + Math.sin(tt * 1.6) * 0.025 + (selected ? 0.1 : 0);
    gr.rotation.x = Math.sin(tt * 1.2) * 0.03;
  });
  const hull = lego ? (white ? "#f2efe6" : "#2a2730") : white ? "#e8dcc2" : "#2a1f33";
  const trim = lego ? (white ? "#c9312c" : "#f2c94c") : "#e0b85a";
  const sail = lego ? (white ? "#ffffff" : "#3b3546") : white ? "#fffaf0" : "#3a2f48";
  return (
    <group ref={g} onClick={onClick}>
      <group rotation={[0, alongZ ? Math.PI / 2 : 0, 0]}>
        <mesh geometry={hullGeo} castShadow receiveShadow>
          <meshStandardMaterial color={hull} roughness={lego ? 0.22 : 0.5} />
        </mesh>
        <mesh position={[0.02, 0.17, 0]}>
          <boxGeometry args={[1.8, 0.03, 0.52]} />
          <meshStandardMaterial color={trim} metalness={lego ? 0 : 0.7} roughness={0.3} />
        </mesh>
        {[-0.5, 0.05, 0.55].map((mx, i) => (
          <group key={i} position={[mx, 0.17, 0]}>
            <mesh position={[0, 0.42, 0]} castShadow>
              <cylinderGeometry args={[0.02, 0.025, 0.84, 8]} />
              <meshStandardMaterial color={lego ? "#5a3a1a" : "#4a2e14"} />
            </mesh>
            <mesh geometry={sailGeo} position={[0, 0.48 - i * 0.03, 0.03]} rotation={[0, Math.PI / 2, 0]} castShadow>
              <meshStandardMaterial color={sail} side={THREE.DoubleSide} roughness={0.8} />
            </mesh>
          </group>
        ))}
        <mesh position={[0.55, 1.02, 0]}>
          <boxGeometry args={[0.16, 0.08, 0.01]} />
          <meshStandardMaterial color={white ? "#c0392b" : "#7d3cff"} />
        </mesh>
        {selected ? (
          <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.05, 1.2, 48]} />
            <meshBasicMaterial color="#ffe08a" transparent opacity={0.85} />
          </mesh>
        ) : null}
      </group>
    </group>
  );
}

function Island({ lego }: { lego: boolean }) {
  const light = useMemo(() => (lego ? null : woodTexture("#dcae6e", "#9a6a34", 5)), [lego]);
  const dark = useMemo(() => (lego ? null : woodTexture("#8a5426", "#3e1f08", 9)), [lego]);
  const sea = useMemo(() => seaTexture(lego), [lego]);
  const cells: React.ReactNode[] = [];
  const studs: [number, number][] = [];
  for (let y = 1; y <= 8; y++)
    for (let x = 0; x <= 13; x++) {
      const t = bcTerrain(x, y);
      if (t === "W") continue;
      const isDark = (x + y) % 2 === 0;
      cells.push(
        <mesh key={`${x},${y}`} position={[wx(x), LAND_Y - 0.2, wz(y)]} castShadow receiveShadow>
          <boxGeometry args={[1, 0.4, 1]} />
          {lego ? <meshStandardMaterial color={isDark ? "#4e9a3a" : "#7cc35c"} roughness={0.3} /> : <meshStandardMaterial map={isDark ? dark! : light!} roughness={0.42} />}
        </mesh>,
      );
      if (lego && t === "L") studs.push([wx(x), wz(y)]);
    }
  const studRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = new THREE.Matrix4();
    studs.forEach(([x, z], i) => {
      m.makeTranslation(x, LAND_Y + 0.04, z);
      studRef.current?.setMatrixAt(i, m);
    });
    if (studRef.current) studRef.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh position={[wx((BC_X0 + BC_X1) / 2), SEA_Y, wz((BC_Y0 + BC_Y1) / 2)]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 14]} />
        {lego ? <meshStandardMaterial map={sea} roughness={0.15} transparent opacity={0.92} /> : <meshPhysicalMaterial map={sea} roughness={0.18} metalness={0.05} clearcoat={1} clearcoatRoughness={0.15} />}
      </mesh>
      <mesh position={[wx((BC_X0 + BC_X1) / 2), SEA_Y - 0.15, wz((BC_Y0 + BC_Y1) / 2)]} castShadow receiveShadow>
        <boxGeometry args={[20.6, 0.28, 14.6]} />
        <meshStandardMaterial color={lego ? "#6d6d6d" : "#e0b85a"} metalness={lego ? 0 : 0.75} roughness={0.3} />
      </mesh>
      {cells}
      {lego ? (
        <instancedMesh ref={studRef} args={[undefined, undefined, studs.length]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.08, 14]} />
          <meshStandardMaterial color="#66b14b" roughness={0.3} />
        </instancedMesh>
      ) : null}
      <Mountain x={0} y={7} lego={lego} />
      <Mountain x={12} y={1} lego={lego} />
      <Bush x={6} y={5} lego={lego} />
      <Bush x={7} y={4} lego={lego} />
    </group>
  );
}

function Mountain({ x, y, lego }: { x: number; y: number; lego: boolean }) {
  const cx = (wx(x) + wx(x + 1)) / 2, cz = (wz(y) + wz(y + 1)) / 2;
  const rock = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(0.95, 1);
    const p = geo.attributes.position;
    let s = x * 7 + y;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      v.multiplyScalar(0.85 + rnd() * 0.3);
      p.setXYZ(i, v.x, Math.max(0, v.y) * 1.2, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }, [x, y]);
  if (lego)
    return (
      <group position={[cx, LAND_Y, cz]}>
        {[[1.9, 0.4, 1.9, 0.2], [1.4, 0.4, 1.4, 0.6], [0.9, 0.4, 0.9, 1.0], [0.45, 0.4, 0.45, 1.4]].map(([w, hh, d, yy], i) => (
          <mesh key={i} position={[0, yy, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, hh, d]} />
            <meshStandardMaterial color={i === 3 ? "#f4f4f4" : i % 2 ? "#8f9399" : "#a3a8ae"} roughness={0.3} />
          </mesh>
        ))}
      </group>
    );
  return (
    <group position={[cx, LAND_Y, cz]}>
      <mesh geometry={rock} castShadow receiveShadow>
        <meshStandardMaterial color="#9aa0ab" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.15, 0.95, -0.1]} scale={[0.35, 0.22, 0.35]}>
        <coneGeometry args={[1, 1, 7]} />
        <meshStandardMaterial color="#f4f6fa" roughness={0.6} flatShading />
      </mesh>
    </group>
  );
}

function Bush({ x, y, lego }: { x: number; y: number; lego: boolean }) {
  const blobs: [number, number, number, number][] = [[0, 0.22, 0, 0.3], [-0.18, 0.18, 0.1, 0.2], [0.17, 0.2, -0.08, 0.22], [0.08, 0.36, 0.1, 0.18], [-0.1, 0.33, -0.14, 0.16]];
  return (
    <group position={[wx(x), LAND_Y, wz(y)]}>
      {lego ? (
        <>
          <mesh position={[0, 0.18, 0]} castShadow>
            <cylinderGeometry args={[0.38, 0.38, 0.36, 20]} />
            <meshStandardMaterial color="#3c8a2e" roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.42, 0]} castShadow>
            <sphereGeometry args={[0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#4fae3c" roughness={0.25} />
          </mesh>
        </>
      ) : (
        blobs.map(([bx, by, bz, r], i) => (
          <mesh key={i} position={[bx, by, bz]} castShadow>
            <icosahedronGeometry args={[r, 1]} />
            <meshStandardMaterial color={["#2f6b2a", "#3f8a34", "#4a9b3c", "#3a7f31", "#357a2e"][i]} roughness={0.8} flatShading />
          </mesh>
        ))
      )}
    </group>
  );
}

type Missile = { id: number; from: THREE.Vector3; to: THREE.Vector3; kind: "arrow" | "ball" };
function Projectile({ m, onDone }: { m: Missile; onDone: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const done = useRef(false);
  const dur = 0.45 + m.from.distanceTo(m.to) * 0.06;
  useFrame((_, dt) => {
    t.current = Math.min(1, t.current + dt / dur);
    const k = t.current;
    const p = new THREE.Vector3().lerpVectors(m.from, m.to, k);
    p.y += Math.sin(Math.PI * k) * (0.8 + m.from.distanceTo(m.to) * 0.15);
    if (ref.current) {
      const ahead = new THREE.Vector3().lerpVectors(m.from, m.to, Math.min(1, k + 0.02));
      ahead.y += Math.sin(Math.PI * Math.min(1, k + 0.02)) * (0.8 + m.from.distanceTo(m.to) * 0.15);
      ref.current.position.copy(p);
      ref.current.lookAt(ahead);
    }
    if (k >= 1 && !done.current) {
      done.current = true;
      onDone();
    }
  });
  return (
    <group ref={ref}>
      {m.kind === "arrow" ? (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.5, 6]} />
          <meshStandardMaterial color="#ffd36b" emissive="#7a4a00" />
        </mesh>
      ) : (
        <mesh>
          <sphereGeometry args={[0.09, 14, 10]} />
          <meshStandardMaterial color="#222" metalness={0.8} roughness={0.3} emissive="#ff6a1a" emissiveIntensity={0.4} />
        </mesh>
      )}
    </group>
  );
}

function Scene(props: Props) {
  const { style, fen, you, lastMove, lastSan, myTurn, disabled, onMove, legalFor, checkSq } = props;
  const lego = style === "lg";
  const pieces = useBcPieces(fen, lastMove);
  const [sel, setSel] = useState<string | null>(null);
  const targets = useMemo(() => (sel && legalFor ? legalFor(sel) : []), [sel, legalFor]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [missiles, setMissiles] = useState<Missile[]>([]);
  const [bump, setBump] = useState(0);
  const prev = useRef<BcPiece[]>(pieces);
  useEffect(() => setSel(null), [fen]);
  const cellY = (x: number, y: number) => (bcTerrain(x, y) === "W" ? SEA_Y : LAND_Y);
  const shipPos = (pc: BcPiece) => new THREE.Vector3((wx(pc.x) + wx(pc.x + (pc.w ?? 1) - 1)) / 2, SEA_Y + 0.12, (wz(pc.y) + wz(pc.y + (pc.h ?? 1) - 1)) / 2);
  useEffect(() => {
    const now = new Set(pieces.map((p) => p.id));
    const gone = prev.current.filter((p) => !now.has(p.id));
    prev.current = pieces;
    if (style !== "an") return;
    const shot = lastMove && lastSan?.includes("*") ? lastMove : null;
    let delay = 300;
    if (shot) {
      const a = bcPos(shot.from)!, b = bcPos(shot.to)!;
      const shooter = pieces.find((p) => p.sq === shot.from || (p.kind === "F" && p.x <= a[0] && a[0] < p.x + (p.w ?? 1) && p.y <= a[1] && a[1] < p.y + (p.h ?? 1)));
      const kind = shooter?.kind === "C" ? "arrow" : "ball";
      setMissiles((m) => [...m, { id: Date.now(), from: new THREE.Vector3(wx(a[0]), cellY(a[0], a[1]) + 0.4, wz(a[1])), to: new THREE.Vector3(wx(b[0]), cellY(b[0], b[1]) + 0.2, wz(b[1])), kind }]);
      delay = 650;
    }
    if (!gone.length) return;
    const add = gone.map((p, i) => ({
      id: Date.now() + i,
      at: p.kind === "F" ? shipPos(p) : new THREE.Vector3(wx(p.x), cellY(p.x, p.y), wz(p.y)),
      color: p.c === "w" ? "#efe2c4" : "#2a1f33",
    }));
    const timer = window.setTimeout(() => {
      setBursts((b) => [...b, ...add]);
      setBump((n) => n + 1);
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, style]);

  const ownAt = (sq: string) => {
    const p = bcPos(sq);
    if (!p) return false;
    return pieces.some((pc) => pc.c === you && pc.x <= p[0] && p[0] < pc.x + (pc.w ?? 1) && pc.y <= p[1] && p[1] < pc.y + (pc.h ?? 1));
  };
  function tap(sq: string) {
    if (disabled || !myTurn) return;
    if (sel && targets.includes(sq)) {
      onMove(sel, sq);
      setSel(null);
      return;
    }
    if (ownAt(sq) && sq !== sel && (legalFor?.(sq).length ?? 0) > 0) setSel(sq);
    else setSel(null);
  }
  const faceYaw = you === "w" ? Math.PI : 0;

  const hits: React.ReactNode[] = [];
  for (let y = BC_Y0; y <= BC_Y1; y++)
    for (let x = BC_X0; x <= BC_X1; x++) {
      const sq = bcSq(x, y);
      const tgt = targets.includes(sq);
      const last = lastMove && (lastMove.from === sq || lastMove.to === sq);
      const yy = cellY(x, y) + (bcTerrain(x, y) === "W" ? 0.01 : 0.006);
      const enemy = tgt && pieces.some((pc) => pc.c !== you && pc.x <= x && x < pc.x + (pc.w ?? 1) && pc.y <= y && y < pc.y + (pc.h ?? 1));
      hits.push(
        <group key={sq} position={[wx(x), yy, wz(y)]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={(e) => { e.stopPropagation(); tap(sq); }}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial color={last ? "#f2c94c" : "#000"} transparent opacity={last ? 0.3 : 0} depthWrite={false} />
          </mesh>
          {tgt ? (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              {enemy ? <ringGeometry args={[0.36, 0.44, 32]} /> : <circleGeometry args={[0.13, 24]} />}
              <meshBasicMaterial color={enemy ? "#ff5a4a" : "#ffe08a"} transparent opacity={0.92} depthWrite={false} />
            </mesh>
          ) : null}
        </group>,
      );
    }

  return (
    <>
      <ambientLight intensity={lego ? 0.75 : 0.5} />
      <hemisphereLight args={["#fff2d6", "#2a1a3a", 0.55]} />
      <directionalLight position={[6, 14, 8]} intensity={lego ? 1.6 : 2.0} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <pointLight position={[-9, 6, -6]} intensity={22} color="#b58cff" distance={30} />
      <Island lego={lego} />
      {hits}
      {pieces.map((pc) =>
        pc.kind === "F" ? (
          <Frigate key={pc.id} pc={pc} style={style} pos={shipPos(pc)} alongZ={(pc.h ?? 1) > 1} selected={!!sel && ownAt(sel) && (() => { const p = bcPos(sel)!; return pc.x <= p[0] && p[0] < pc.x + (pc.w ?? 1) && pc.y <= p[1] && p[1] < pc.y + (pc.h ?? 1); })()} onClick={(e) => {
            e.stopPropagation();
            // the clicked cell of the ship
            const lx = e.point.x + 6.5, ly = -e.point.z + 4.5;
            const cx = Math.max(pc.x, Math.min(pc.x + (pc.w ?? 1) - 1, Math.round(lx)));
            const cy = Math.max(pc.y, Math.min(pc.y + (pc.h ?? 1) - 1, Math.round(ly)));
            tap(bcSq(cx, cy));
          }} />
        ) : (
          <Token key={pc.id} pc={pc} style={style} pos={new THREE.Vector3(wx(pc.x), cellY(pc.x, pc.y), wz(pc.y))} selected={sel === pc.sq} check={checkSq === pc.sq} faceYaw={faceYaw} onClick={(e) => { e.stopPropagation(); tap(pc.sq); }} />
        ),
      )}
      {missiles.map((m) => (
        <Projectile key={m.id} m={m} onDone={() => setMissiles((all) => all.filter((x) => x.id !== m.id))} />
      ))}
      {bursts.map((b) => (
        <Shards key={b.id} burst={b} onDone={() => setBursts((all) => all.filter((x) => x.id !== b.id))} />
      ))}
      <Shake bump={bump} />
      <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[60, 48]} />
        <meshStandardMaterial color={lego ? "#3a2f55" : "#120b1c"} roughness={0.9} />
      </mesh>
    </>
  );
}

export function BcBoard3D(props: Props) {
  // white's army stands on ranks 7-8 (-z); its camera sits on that side
  const flip = props.you === "w" ? -1 : 1;
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < window.innerHeight);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const aspect = typeof window !== "undefined" ? window.innerWidth / Math.max(1, window.innerHeight) : 1.6;
  const dist = 17.5 * (narrow ? Math.max(1.9, 1.25 / aspect) : 1);
  const cam: [number, number, number] = [0, dist * 0.8, dist * 0.6 * flip];
  return (
    <div className="absolute inset-0" data-bg-board3d={props.style} data-bg-game="battlechess">
      <Canvas key={`${props.you}-${narrow}`} shadows dpr={[1, 1.75]} camera={{ position: cam, fov: 38, near: 0.1, far: 300 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <color attach="background" args={[props.style === "lg" ? "#1d1530" : "#0b0810"]} />
        <fog attach="fog" args={[props.style === "lg" ? "#1d1530" : "#0b0810", 34, 90]} />
        <Scene {...props} />
        <OrbitControls target={[0, 0, flip * 1.2]} enablePan={false} minDistance={9} maxDistance={40} maxPolarAngle={Math.PI * 0.44} minPolarAngle={0.12} />
      </Canvas>
    </div>
  );
}
