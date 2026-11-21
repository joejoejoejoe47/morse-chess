/**
 * 3D / AN / LG boards for Checkers and Chinese Chess (owner t377u).
 *  - 3d: polished wooden board, lathe-turned discs (checkers kings stacked; xiangqi carved characters).
 *  - an: the same set, animated: pieces hop, captured pieces are blasted off the board in shards.
 *  - lg: plastic brick versions: studded discs on a studded baseplate.
 * Procedural for now; the Sketchfab sets (Pratibha / chung_the_artist, CC BY 4.0) can replace
 * the board meshes once the GLBs are on the box.
 */
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { bgDims, bgMust, bgSq, XQ_CHAR, type BoardGameId } from "@/lib/boardgames/adapter";
import { usePieceIds } from "./bg-board-2d";

export type BgStyle = "3d" | "an" | "lg";
type Props = {
  game: BoardGameId;
  style: BgStyle;
  fen: string;
  you: "w" | "b";
  lastMove: { from: string; to: string } | null;
  myTurn: boolean;
  disabled?: boolean;
  onMove: (from: string, to: string) => void;
  legalFor?: (from: string) => string[];
  checkSq?: string | null;
};

/** World position of a square / point. Checkers: square centres; xiangqi: grid points. */
function worldOf(game: BoardGameId, r: number, f: number): [number, number] {
  if (game === "checkers") return [f - 3.5, r - 3.5];
  return [(f - 4) * 0.9, (r - 4.5) * 0.9];
}

function discProfile(radius: number, h: number, ridge: boolean) {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  const bevel = h * 0.28;
  pts.push(new THREE.Vector2(radius - bevel, 0));
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, bevel + Math.sin(a) * bevel));
  }
  pts.push(new THREE.Vector2(radius, h - bevel));
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, h - bevel + Math.sin(a) * bevel));
  }
  if (ridge) {
    pts.push(new THREE.Vector2(radius * 0.8, h));
    pts.push(new THREE.Vector2(radius * 0.76, h - h * 0.12));
    pts.push(new THREE.Vector2(radius * 0.7, h - h * 0.12));
    pts.push(new THREE.Vector2(radius * 0.66, h));
  }
  pts.push(new THREE.Vector2(0, h));
  return pts;
}

const discGeo = new Map<string, THREE.LatheGeometry>();
function disc(radius: number, h: number, ridge: boolean) {
  const k = `${radius}-${h}-${ridge}`;
  if (!discGeo.has(k)) discGeo.set(k, new THREE.LatheGeometry(discProfile(radius, h, ridge), 48));
  return discGeo.get(k)!;
}

function woodTexture(base: string, dark: string, seed: number, w = 512, h = 512) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = dark;
    g.globalAlpha = 0.05 + rnd() * 0.12;
    g.lineWidth = 1 + rnd() * 3;
    g.beginPath();
    const y = rnd() * h;
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 70 + i) * 6 + (rnd() - 0.5) * 3);
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Texture is drawn with rank 9 (black side) at the top, so it reads right from red's side. */
function xqBoardTexture(lego: boolean) {
  const W = 1024, H = 1138;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  if (lego) {
    g.fillStyle = "#e9dcc0";
    g.fillRect(0, 0, W, H);
  } else {
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#f0d29a");
    grad.addColorStop(0.5, "#e0b874");
    grad.addColorStop(1, "#cc9f5e");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = "#8a5a26";
      g.globalAlpha = 0.04 + Math.random() * 0.08;
      g.lineWidth = 1 + Math.random() * 3;
      g.beginPath();
      const y = Math.random() * H;
      g.moveTo(0, y);
      for (let x = 0; x <= W; x += 40) g.lineTo(x, y + Math.sin(x / 90 + i) * 7);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  const m = 72, sx = (W - 2 * m) / 8, sy = (H - 2 * m) / 9;
  const X = (f: number) => m + f * sx, Y = (r: number) => m + r * sy;
  g.strokeStyle = lego ? "#3b3b3b" : "#4a2e10";
  g.lineWidth = 5;
  g.strokeRect(X(0) - 10, Y(0) - 10, sx * 8 + 20, sy * 9 + 20);
  g.lineWidth = 3;
  for (let r = 0; r < 10; r++) { g.beginPath(); g.moveTo(X(0), Y(r)); g.lineTo(X(8), Y(r)); g.stroke(); }
  for (let f = 0; f < 9; f++) {
    g.beginPath(); g.moveTo(X(f), Y(0)); g.lineTo(X(f), Y(f === 0 || f === 8 ? 9 : 4)); g.stroke();
    if (f !== 0 && f !== 8) { g.beginPath(); g.moveTo(X(f), Y(5)); g.lineTo(X(f), Y(9)); g.stroke(); }
  }
  for (const r0 of [0, 7]) {
    g.beginPath(); g.moveTo(X(3), Y(r0)); g.lineTo(X(5), Y(r0 + 2)); g.moveTo(X(5), Y(r0)); g.lineTo(X(3), Y(r0 + 2)); g.stroke();
  }
  g.fillStyle = lego ? "#2b2b2b" : "#5a3712";
  g.font = `700 ${Math.round(sy * 0.62)}px "Noto Serif SC","Songti SC","SimSun",serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("楚 河", X(2), Y(4.5));
  g.fillText("漢 界", X(6), Y(4.5));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function charTexture(ch: string, red: boolean, lego: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = lego ? "#f4f1ea" : "#f3dcae";
  g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  if (!lego) {
    const grad = g.createRadialGradient(100, 90, 10, 128, 128, 130);
    grad.addColorStop(0, "rgba(255,255,255,.35)");
    grad.addColorStop(1, "rgba(120,70,20,.25)");
    g.fillStyle = grad; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = red ? "#b3202a" : "#1d1a1f";
  g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.stroke();
  g.fillStyle = red ? "#b3202a" : "#1d1a1f";
  g.font = `700 140px "Noto Serif SC","Songti SC","KaiTi","SimSun",serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(ch, 128, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function Studs({ cols, rows, pitch, y, color, ox = 0, oz = 0 }: { cols: number; rows: number; pitch: number; y: number; color: string; ox?: number; oz?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.CylinderGeometry(pitch * 0.3, pitch * 0.3, pitch * 0.18, 16), [pitch]);
  useEffect(() => {
    const m = new THREE.Matrix4();
    let i = 0;
    for (let a = 0; a < cols; a++)
      for (let b = 0; b < rows; b++) {
        m.makeTranslation(ox + (a - (cols - 1) / 2) * pitch, y + pitch * 0.09, oz + (b - (rows - 1) / 2) * pitch);
        ref.current?.setMatrixAt(i++, m);
      }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [cols, rows, pitch, y, ox, oz]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, cols * rows]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.35} metalness={0.02} />
    </instancedMesh>
  );
}

function CheckersBoardMesh({ lego }: { lego: boolean }) {
  const light = useMemo(() => (lego ? null : woodTexture("#e6c895", "#8a5a26", 3)), [lego]);
  const dark = useMemo(() => (lego ? null : woodTexture("#5a301c", "#1d0c05", 7)), [lego]);
  const frame = useMemo(() => (lego ? null : woodTexture("#6b3a1c", "#2a1206", 11)), [lego]);
  const squares = [];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const isDark = (r + f) % 2 === 0;
      const [x, y] = worldOf("checkers", r, f);
      squares.push(
        <mesh key={`${r}-${f}`} position={[x, 0.001, -y]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[1, 1]} />
          {lego ? (
            <meshStandardMaterial color={isDark ? "#2f6b3a" : "#e8e2d2"} roughness={0.35} />
          ) : (
            <meshStandardMaterial map={isDark ? dark! : light!} roughness={0.45} metalness={0.05} />
          )}
        </mesh>,
      );
    }
  return (
    <group>
      <mesh position={[0, -0.16, 0]} receiveShadow castShadow>
        <boxGeometry args={[9.1, 0.3, 9.1]} />
        {lego ? <meshStandardMaterial color="#7a7a7a" roughness={0.4} /> : <meshStandardMaterial map={frame!} roughness={0.35} metalness={0.1} />}
      </mesh>
      <mesh position={[0, -0.005, 0]}>
        <boxGeometry args={[8.12, 0.02, 8.12]} />
        <meshStandardMaterial color="#c9a24f" metalness={0.8} roughness={0.25} />
      </mesh>
      {squares}
      {lego ? (
        <>
          <Studs cols={1} rows={9} pitch={1} y={0} color="#7a7a7a" ox={-4.3} />
          <Studs cols={1} rows={9} pitch={1} y={0} color="#7a7a7a" ox={4.3} />
        </>
      ) : null}
    </group>
  );
}

function XiangqiBoardMesh({ lego }: { lego: boolean }) {
  const tex = useMemo(() => xqBoardTexture(lego), [lego]);
  const frame = useMemo(() => (lego ? null : woodTexture("#7a4420", "#2a1206", 13)), [lego]);
  const gw = 8 * 0.9, gh = 9 * 0.9;
  const W = gw / (1 - 144 / 1024), H = gh / (1 - 144 / 1138);
  return (
    <group>
      <mesh position={[0, -0.16, 0]} receiveShadow castShadow>
        <boxGeometry args={[W + 0.9, 0.3, H + 0.9]} />
        {lego ? <meshStandardMaterial color="#c9312c" roughness={0.38} /> : <meshStandardMaterial map={frame!} roughness={0.35} metalness={0.1} />}
      </mesh>
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={tex} roughness={lego ? 0.4 : 0.55} />
      </mesh>
      {lego ? (
        <>
          <Studs cols={1} rows={11} pitch={0.9} y={0} color="#c9312c" ox={-(W / 2 + 0.25)} />
          <Studs cols={1} rows={11} pitch={0.9} y={0} color="#c9312c" ox={W / 2 + 0.25} />
        </>
      ) : null}
    </group>
  );
}

type Anim = { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; hop: number };

function Piece({
  game, style, c, kind, king, pos, selected, must, check, faceYaw, onClick,
}: {
  game: BoardGameId; style: BgStyle; c: "w" | "b"; kind: string; king: boolean; pos: [number, number];
  selected: boolean; must: boolean; check: boolean; faceYaw: number; onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const g = useRef<THREE.Group>(null);
  const anim = useRef<Anim | null>(null);
  const target = useMemo(() => new THREE.Vector3(pos[0], 0, -pos[1]), [pos]);
  const first = useRef(true);
  useEffect(() => {
    if (!g.current) return;
    if (first.current) {
      g.current.position.copy(target);
      first.current = false;
      return;
    }
    const from = g.current.position.clone();
    from.y = 0;
    const dist = from.distanceTo(target);
    if (dist < 1e-3) return;
    anim.current = { from, to: target.clone(), t: 0, dur: style === "an" ? 0.55 + dist * 0.05 : 0.32, hop: style === "an" ? 0.6 + dist * 0.18 : style === "lg" ? 0.25 : 0.05 };
  }, [target, style]);
  useFrame((st, dt) => {
    const gr = g.current;
    if (!gr) return;
    const a = anim.current;
    if (a) {
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
      gr.position.lerpVectors(a.from, a.to, e);
      gr.position.y = Math.sin(Math.PI * a.t) * a.hop;
      if (style === "an") gr.rotation.z = Math.sin(Math.PI * a.t) * 0.25;
      if (a.t >= 1) {
        anim.current = null;
        gr.rotation.z = 0;
        gr.position.y = 0;
      }
    } else {
      gr.position.y = selected ? 0.18 + Math.sin(st.clock.elapsedTime * 4) * 0.04 : 0;
    }
  });

  const lego = style === "lg";
  const red = c === "w";
  const r = game === "checkers" ? 0.4 : 0.38;
  const h = game === "checkers" ? 0.16 : 0.2;
  const charTex = useMemo(() => (game === "xiangqi" ? charTexture(XQ_CHAR[kind][c], red, lego) : null), [game, kind, c, red, lego]);
  const color = game === "checkers"
    ? lego ? (red ? "#d22f27" : "#232323") : red ? "#a5161c" : "#1b1719"
    : lego ? "#f2efe6" : "#e9c98f";
  const mat = lego ? (
    <meshStandardMaterial color={color} roughness={0.22} metalness={0} />
  ) : game === "checkers" ? (
    <meshPhysicalMaterial color={color} roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.25} />
  ) : (
    <meshStandardMaterial color={color} roughness={0.5} />
  );
  const layers = game === "checkers" && king ? 2 : 1;
  const top = layers * (h + 0.005);
  return (
    <group ref={g} onClick={onClick}>
      {Array.from({ length: layers }, (_, i) => (
        <mesh key={i} geometry={disc(r, h, !lego && game === "checkers")} position={[0, i * (h + 0.005), 0]} castShadow receiveShadow>
          {mat}
        </mesh>
      ))}
      {game === "xiangqi" && charTex ? (
        <mesh position={[0, h + 0.004, 0]} rotation={[-Math.PI / 2, 0, faceYaw]}>
          <circleGeometry args={[r * 0.86, 40]} />
          <meshStandardMaterial map={charTex} roughness={0.5} transparent />
        </mesh>
      ) : null}
      {lego
        ? [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={`s${i}`} position={[sx * r * (game === "xiangqi" ? 0.62 : 0.36), top + 0.03, sz * r * (game === "xiangqi" ? 0.62 : 0.36)]} castShadow>
              <cylinderGeometry args={[r * (game === "xiangqi" ? 0.11 : 0.17), r * (game === "xiangqi" ? 0.11 : 0.17), 0.07, 16]} />
              <meshStandardMaterial color={game === "xiangqi" ? (red ? "#c9312c" : "#2b2b2b") : color} roughness={0.22} />
            </mesh>
          ))
        : null}
      {game === "checkers" && king ? (
        <mesh position={[0, top + (lego ? 0.09 : 0.012), 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r * 0.55, 0.035, 10, 40]} />
          <meshStandardMaterial color="#f2c94c" metalness={0.9} roughness={0.2} emissive="#5a3a00" />
        </mesh>
      ) : null}
      {selected || must || check ? (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 1.08, r * 1.24, 40]} />
          <meshBasicMaterial color={check ? "#ff4a3a" : selected ? "#ffe08a" : "#ffb52e"} transparent opacity={0.9} />
        </mesh>
      ) : null}
    </group>
  );
}

type Burst = { id: number; at: THREE.Vector3; color: string };

function Shards({ burst, onDone }: { burst: Burst; onDone: () => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const N = 26;
  const parts = useMemo(
    () => Array.from({ length: N }, () => ({
      v: new THREE.Vector3((Math.random() - 0.5) * 5, 2.5 + Math.random() * 3.5, (Math.random() - 0.5) * 5),
      r: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
      s: 0.06 + Math.random() * 0.1,
    })),
    [],
  );
  const t = useRef(0);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const done = useRef(false);
  useFrame((_, dt) => {
    t.current += dt;
    const tt = t.current;
    parts.forEach((p, i) => {
      const pos = new THREE.Vector3(burst.at.x + p.v.x * tt, Math.max(0.02, 0.2 + p.v.y * tt - 4.9 * tt * tt), burst.at.z + p.v.z * tt);
      e.set(p.r.x * tt, p.r.y * tt, p.r.z * tt);
      q.setFromEuler(e);
      const sc = p.s * Math.max(0, 1 - tt / 1.4);
      m.compose(pos, q, new THREE.Vector3(sc, sc, sc));
      ref.current?.setMatrixAt(i, m);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    if (tt > 1.4 && !done.current) {
      done.current = true;
      onDone();
    }
  });
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, N]} castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={burst.color} roughness={0.4} emissive={burst.color} emissiveIntensity={0.15} />
      </instancedMesh>
      <Flash at={burst.at} />
    </group>
  );
}

function Flash({ at }: { at: THREE.Vector3 }) {
  const ref = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    const mm = ref.current;
    if (!mm) return;
    const k = Math.min(1, t.current / 0.5);
    mm.scale.setScalar(0.3 + k * 2.2);
    (mm.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
  });
  return (
    <mesh ref={ref} position={[at.x, 0.05, at.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.3, 0.55, 40]} />
      <meshBasicMaterial color="#ffd27a" transparent opacity={0.85} depthWrite={false} />
    </mesh>
  );
}

function Shake({ bump }: { bump: number }) {
  const { camera } = useThree();
  const t = useRef(1);
  const base = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    if (bump > 0) {
      t.current = 0;
      base.current = camera.position.clone();
    }
  }, [bump, camera]);
  useFrame((_, dt) => {
    if (t.current >= 0.45 || !base.current) return;
    t.current += dt;
    const k = Math.max(0, 1 - t.current / 0.45) * 0.08;
    camera.position.set(base.current.x + (Math.random() - 0.5) * k, base.current.y + (Math.random() - 0.5) * k, base.current.z + (Math.random() - 0.5) * k);
    if (t.current >= 0.45) camera.position.copy(base.current);
  });
  return null;
}

function Scene(props: Props) {
  const { game, style, fen, you, lastMove, myTurn, disabled, onMove, legalFor, checkSq } = props;
  const lego = style === "lg";
  const pieces = usePieceIds(game, fen, lastMove);
  const [sel, setSel] = useState<string | null>(null);
  const targets = useMemo(() => (sel && legalFor ? legalFor(sel) : []), [sel, legalFor]);
  const must = useMemo(() => (myTurn ? new Set(bgMust(game, fen)) : new Set<string>()), [game, fen, myTurn]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [bump, setBump] = useState(0);
  const prev = useRef<typeof pieces>(pieces);
  useEffect(() => setSel(null), [fen]);
  useEffect(() => {
    if (myTurn && game === "checkers" && must.size === 1 && lastMove && must.has(lastMove.to)) setSel(lastMove.to);
  }, [myTurn, must, game, lastMove]);
  useEffect(() => {
    const now = new Set(pieces.map((p) => p.id));
    const gone = prev.current.filter((p) => !now.has(p.id));
    prev.current = pieces;
    if (!gone.length || style !== "an") return;
    const add = gone.map((p, i) => {
      const [x, y] = worldOf(game, p.r, p.f);
      return { id: Date.now() + i, at: new THREE.Vector3(x, 0, -y), color: game === "checkers" ? (p.c === "w" ? "#b51b22" : "#222") : "#e2c48a" };
    });
    const timer = window.setTimeout(() => {
      setBursts((b) => [...b, ...add]);
      setBump((n) => n + 1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [pieces, style, game]);

  function tap(sq: string) {
    if (disabled || !myTurn) return;
    if (sel && targets.includes(sq)) {
      onMove(sel, sq);
      setSel(null);
      return;
    }
    const p = pieces.find((x) => x.sq === sq);
    if (p && p.c === you && (legalFor?.(sq).length ?? 0) > 0) setSel(sq === sel ? null : sq);
    else setSel(null);
  }

  const { files, ranks } = bgDims(game);
  const hits = [];
  for (let r = 0; r < ranks; r++)
    for (let f = 0; f < files; f++) {
      if (game === "checkers" && (r + f) % 2 !== 0) continue;
      const [x, y] = worldOf(game, r, f);
      const sq = bgSq(game, r, f);
      const tgt = targets.includes(sq);
      const last = lastMove && (lastMove.from === sq || lastMove.to === sq);
      hits.push(
        <group key={sq} position={[x, 0, -y]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} onClick={(e) => { e.stopPropagation(); tap(sq); }}>
            <planeGeometry args={game === "checkers" ? [1, 1] : [0.86, 0.86]} />
            <meshBasicMaterial color={last ? "#f2c94c" : "#000"} transparent opacity={last ? 0.22 : 0} depthWrite={false} />
          </mesh>
          {tgt ? (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <circleGeometry args={[0.13, 24]} />
              <meshBasicMaterial color="#ffe08a" transparent opacity={0.9} />
            </mesh>
          ) : null}
        </group>,
      );
    }

  return (
    <>
      <ambientLight intensity={lego ? 0.75 : 0.55} />
      <hemisphereLight args={["#fff2d6", "#2a1a3a", 0.5]} />
      <directionalLight position={[5, 12, 6]} intensity={lego ? 1.6 : 1.9} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} />
      <pointLight position={[-6, 5, -5]} intensity={18} color="#b58cff" distance={22} />
      {game === "checkers" ? <CheckersBoardMesh lego={lego} /> : <XiangqiBoardMesh lego={lego} />}
      {hits}
      {pieces.map((p) => (
        <Piece
          key={p.id}
          game={game}
          style={style}
          c={p.c}
          kind={p.kind}
          king={p.king}
          pos={worldOf(game, p.r, p.f)}
          selected={sel === p.sq}
          must={must.has(p.sq)}
          check={checkSq === p.sq}
          faceYaw={you === "b" ? Math.PI : 0}
          onClick={(e) => { e.stopPropagation(); tap(p.sq); }}
        />
      ))}
      {bursts.map((b) => (
        <Shards key={b.id} burst={b} onDone={() => setBursts((all) => all.filter((x) => x.id !== b.id))} />
      ))}
      <Shake bump={bump} />
      <mesh position={[0, -0.32, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[30, 48]} />
        <meshStandardMaterial color={lego ? "#3a2f55" : "#140d1f"} roughness={0.9} />
      </mesh>
    </>
  );
}

export function BgBoard3D(props: Props) {
  const flip = props.you === "b" ? -1 : 1;
  const tall = props.game === "xiangqi";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < window.innerHeight);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const dist = (tall ? 12.5 : 11.2) * (narrow ? 1.45 : 1);
  const cam: [number, number, number] = [0, dist * 0.82, dist * 0.62 * flip];
  return (
    <div className="absolute inset-0" data-bg-board3d={props.style} data-bg-game={props.game}>
      <Canvas key={`${props.you}-${narrow}`} shadows dpr={[1, 1.75]} camera={{ position: cam, fov: 38, near: 0.1, far: 200 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <color attach="background" args={[props.style === "lg" ? "#1d1530" : "#0b0810"]} />
        <fog attach="fog" args={[props.style === "lg" ? "#1d1530" : "#0b0810", 24, 60]} />
        <Scene {...props} />
        <OrbitControls target={[0, 0, flip * 0.6]} enablePan={false} minDistance={7} maxDistance={26} maxPolarAngle={Math.PI * 0.44} minPolarAngle={0.12} />
      </Canvas>
    </div>
  );
}
