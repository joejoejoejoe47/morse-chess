import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* The Galactic Football League stadium: a dark bowl, neon field, crowd and colored spotlights,
   all built from code (canvas textures, instanced meshes and lights). No images. */

export const TEAM = { w: "#2ee6ff", b: "#ff2d7a" } as const;
export type Scoreboard = { home: number; away: number; clock: string; note: string; homeName?: string; awayName?: string };

const PX = 128; // canvas pixels per board unit
const FONT = `"Arial Black", "Helvetica Neue", Impact, "DejaVu Sans", sans-serif`;
const MARGIN_L = 1; // field margin past each end zone (units)
const MARGIN_W = 0.8; // sideline margin (units)

function glowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, glow: string, opts: { italic?: boolean; spacing?: number; stroke?: string } = {}) {
  ctx.save();
  ctx.font = `${opts.italic === false ? "" : "italic "}900 ${size}px ${FONT}`;
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${opts.spacing ?? 0}px`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = glow;
  ctx.shadowBlur = size * 0.45;
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = size * 0.15;
  ctx.fillText(text, x, y);
  if (opts.stroke) {
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, size * 0.045);
    ctx.strokeStyle = opts.stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.restore();
}

function shieldPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.bezierCurveTo(cx + w * 0.22, cy - h * 0.42, cx + w * 0.4, cy - h * 0.46, cx + w / 2, cy - h * 0.4);
  ctx.bezierCurveTo(cx + w * 0.52, cy + h * 0.05, cx + w * 0.3, cy + h * 0.34, cx, cy + h / 2);
  ctx.bezierCurveTo(cx - w * 0.3, cy + h * 0.34, cx - w * 0.52, cy + h * 0.05, cx - w / 2, cy - h * 0.4);
  ctx.bezierCurveTo(cx - w * 0.4, cy - h * 0.46, cx - w * 0.22, cy - h * 0.42, cx, cy - h / 2);
  ctx.closePath();
}

/** Knight-helmet shield crest, drawn at (cx, cy) with the given height. */
function crest(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number) {
  const w = h * 0.82;
  ctx.save();
  ctx.shadowColor = "#2ee6ff";
  ctx.shadowBlur = h * 0.18;
  shieldPath(ctx, cx, cy, w * 1.08, h * 1.06);
  ctx.fillStyle = "#ffb02e";
  ctx.fill();
  ctx.shadowBlur = 0;
  shieldPath(ctx, cx, cy, w, h);
  const g = ctx.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
  g.addColorStop(0, "#1c64ff");
  g.addColorStop(0.55, "#0b2a8a");
  g.addColorStop(1, "#06143f");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = h * 0.03;
  ctx.strokeStyle = "#7ff6ff";
  ctx.stroke();
  // helmet
  const hx = cx;
  const hy = cy - h * 0.08;
  const r = h * 0.2;
  ctx.beginPath();
  ctx.moveTo(hx - r, hy + r * 0.9);
  ctx.lineTo(hx - r, hy - r * 0.1);
  ctx.quadraticCurveTo(hx - r, hy - r * 1.15, hx, hy - r * 1.2);
  ctx.quadraticCurveTo(hx + r, hy - r * 1.15, hx + r, hy - r * 0.1);
  ctx.lineTo(hx + r, hy + r * 0.9);
  ctx.closePath();
  const steel = ctx.createLinearGradient(hx - r, hy, hx + r, hy);
  steel.addColorStop(0, "#9fb3c8");
  steel.addColorStop(0.5, "#eef6ff");
  steel.addColorStop(1, "#6d8198");
  ctx.fillStyle = steel;
  ctx.fill();
  ctx.lineWidth = h * 0.012;
  ctx.strokeStyle = "#0a1a3a";
  ctx.stroke();
  ctx.fillStyle = "#04102a"; // visor: eye slit and breathing holes
  ctx.beginPath();
  ctx.roundRect(hx - r * 0.8, hy - r * 0.22, r * 1.6, r * 0.24, r * 0.1);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = "#2ee6ff";
  ctx.shadowBlur = r * 0.5;
  ctx.fillStyle = "#7ff6ff";
  ctx.fillRect(hx - r * 0.6, hy - r * 0.14, r * 0.42, r * 0.08);
  ctx.fillRect(hx + r * 0.18, hy - r * 0.14, r * 0.42, r * 0.08);
  ctx.restore();
  ctx.fillStyle = "#c9d6e6"; // nose guard
  ctx.fillRect(hx - r * 0.07, hy - r * 0.3, r * 0.14, r * 0.42);
  ctx.fillStyle = "#04102a";
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hx + sx * r * (0.28 + i * 0.16), hy + r * 0.38 + i * r * 0.05, r * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  // plume
  ctx.beginPath();
  ctx.moveTo(hx, hy - r * 1.2);
  ctx.quadraticCurveTo(hx + r * 1.6, hy - r * 2.0, hx + r * 1.9, hy - r * 0.4);
  ctx.quadraticCurveTo(hx + r * 1.1, hy - r * 1.2, hx, hy - r * 0.9);
  ctx.fillStyle = "#ff8a1e";
  ctx.fill();
  // stars
  ctx.fillStyle = "#ffe9a8";
  for (const [dx, dy, s] of [[-0.3, -0.33, 0.03], [0.32, -0.3, 0.025], [-0.22, 0.2, 0.02], [0.25, 0.18, 0.022]] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx * w, cy + dy * h, s * h, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // ribbon text
  glowText(ctx, "NEBULA", cx, cy + h * 0.27, h * 0.17, "#ffd36a", "#ff8a1e", { stroke: "#3a1600", spacing: 2 });
  glowText(ctx, "KNIGHTS", cx, cy + h * 0.41, h * 0.12, "#7ff6ff", "#1c8cff", { stroke: "#021a3a", spacing: 3 });
}

/** Field canvas. Length runs left→right (row 0 on the left), width top→bottom (column 0 at the top). */
function fieldCanvas(rows: number, cols: number) {
  const W = (rows + MARGIN_L * 2) * PX;
  const H = Math.round((cols + MARGIN_W * 2) * PX);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const X = (k: number) => (MARGIN_L + k) * PX; // row boundary k
  const Y = (k: number) => (MARGIN_W + k) * PX; // column boundary k
  const top = Y(0);
  const bottom = Y(cols);
  ctx.fillStyle = "#050a12";
  ctx.fillRect(0, 0, W, H);
  // turf stripes, every half unit (5 yards)
  for (let i = 0; i < rows * 2; i++) {
    ctx.fillStyle = i % 2 ? "#0c2a24" : "#0a231f";
    ctx.fillRect(X(i / 2), top, PX / 2 + 1, bottom - top);
  }
  // fine turf grain
  const rnd = mulberry(7);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? "60,140,110" : "0,0,0"},${0.05 + rnd() * 0.06})`;
    ctx.fillRect(X(0) + rnd() * (X(rows) - X(0)), top + rnd() * (bottom - top), 2, 2 + rnd() * 4);
  }
  // end zones
  const zone = (k0: number, k1: number, a: string, b: string) => {
    const g = ctx.createLinearGradient(X(k0), 0, X(k1), 0);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(X(k0), top, X(k1) - X(k0), bottom - top);
  };
  zone(0, 2, "rgba(10,120,190,0.55)", "rgba(6,60,110,0.35)");
  zone(rows - 2, rows, "rgba(120,10,70,0.35)", "rgba(200,20,90,0.55)");
  // diagonal energy hatching in the end zones
  ctx.save();
  ctx.lineWidth = 3;
  for (const [k0, col] of [[0, "rgba(46,230,255,0.10)"], [rows - 2, "rgba(255,45,122,0.10)"]] as const) {
    ctx.beginPath();
    ctx.rect(X(k0), top, 2 * PX, bottom - top);
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = col;
    for (let s = -H; s < 2 * PX + H; s += 26) {
      ctx.beginPath();
      ctx.moveTo(X(k0) + s, top);
      ctx.lineTo(X(k0) + s - (bottom - top), bottom);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  // end zone names, read along the zone
  ctx.save();
  ctx.translate(X(1), (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  glowText(ctx, "NEBULA", 0, -PX * 0.36, PX * 0.78, "#5ff4ff", "#00a8ff", { stroke: "#012238", spacing: 10 });
  glowText(ctx, "KNIGHTS", 0, PX * 0.42, PX * 0.6, "#ffb02e", "#ff7a00", { stroke: "#2a1200", spacing: 10 });
  ctx.restore();
  ctx.save();
  ctx.translate(X(rows - 1), (top + bottom) / 2);
  ctx.rotate(Math.PI / 2);
  glowText(ctx, "PLASMA", 0, -PX * 0.36, PX * 0.78, "#ff5fc0", "#ff0a6c", { stroke: "#300018", spacing: 10 });
  glowText(ctx, "PHANTOMS", 0, PX * 0.42, PX * 0.56, "#c98bff", "#8a2bff", { stroke: "#1a0030", spacing: 8 });
  ctx.restore();
  // faint square grid so moves still read like a board
  ctx.save();
  ctx.strokeStyle = "rgba(160,255,230,0.07)";
  ctx.lineWidth = 2;
  for (let f = 1; f < cols; f++) {
    ctx.beginPath();
    ctx.moveTo(X(2), Y(f));
    ctx.lineTo(X(rows - 2), Y(f));
    ctx.stroke();
  }
  ctx.restore();
  // hash marks every yard near the hash lines and sidelines
  ctx.save();
  for (let y = 0; y <= (rows - 4) * 10; y++) {
    const x = X(2) + (y / 10) * PX;
    const half = x < X(rows / 2) ? "rgba(190,250,255,0.55)" : "rgba(255,190,215,0.55)";
    ctx.fillStyle = half;
    if (y % 10 === 0) continue;
    const len = y % 5 === 0 ? PX * 0.16 : PX * 0.09;
    for (const yy of [top + 6, Y(cols / 2 - 1.25), Y(cols / 2 + 1.25), bottom - 6 - len]) ctx.fillRect(x - 1.5, yy, 3, len);
  }
  ctx.restore();
  // yard lines
  for (let k = 2; k <= rows - 2; k++) {
    const goal = k === 2 || k === rows - 2;
    const mid = k === rows / 2;
    const col = mid ? "#f4fbff" : k < rows / 2 ? "#a8f3ff" : "#ffb3cf";
    const glow = mid ? "#ffffff" : k < rows / 2 ? "#00d0ff" : "#ff2d7a";
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = goal ? 26 : 16;
    ctx.fillStyle = col;
    const w = goal ? 9 : mid ? 7 : 5;
    ctx.fillRect(X(k) - w / 2, top, w, bottom - top);
    ctx.fillRect(X(k) - w / 2, top, w, bottom - top);
    ctx.restore();
  }
  // yard numbers 10..50..10, both sidelines, with the little goal-ward arrows
  for (let k = 3; k <= rows - 3; k++) {
    const yards = 10 * Math.min(k - 2, rows - 2 - k);
    const left = k < rows / 2;
    const fill = k === rows / 2 ? "#ffffff" : left ? "#9ff6ff" : "#ff9cc2";
    const glow = k === rows / 2 ? "#a0e8ff" : left ? "#00c8ff" : "#ff2d7a";
    for (const [y, flip] of [[bottom - PX * 0.95, false], [top + PX * 0.95, true]] as const) {
      ctx.save();
      ctx.translate(X(k), y);
      if (flip) ctx.rotate(Math.PI);
      glowText(ctx, String(yards), 0, 0, PX * 0.42, fill, glow, { italic: false, spacing: 2 });
      if (yards !== 50) {
        const dir = left !== flip ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(dir * PX * 0.36, -PX * 0.07);
        ctx.lineTo(dir * PX * 0.36, PX * 0.09);
        ctx.lineTo(dir * PX * 0.46, PX * 0.01);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.shadowColor = glow;
        ctx.shadowBlur = 10;
        ctx.fill();
      }
      ctx.restore();
    }
  }
  // neon boundary, cyan half then magenta half
  ctx.save();
  ctx.lineWidth = 10;
  ctx.shadowBlur = 34;
  for (const [a, b, col] of [[0, rows / 2, "#2ee6ff"], [rows / 2, rows, "#ff2d7a"]] as const) {
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.beginPath();
    ctx.moveTo(X(rows / 2), top);
    ctx.lineTo(X(a === 0 ? 0 : rows), top);
    ctx.lineTo(X(a === 0 ? 0 : rows), bottom);
    ctx.lineTo(X(rows / 2), bottom);
    ctx.stroke();
    ctx.stroke();
    void b;
  }
  ctx.restore();
  // center crest
  crest(ctx, X(rows / 2), (top + bottom) / 2, PX * 2.35);
  return c;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function Field({ rows, cols }: { rows: number; cols: number }) {
  const tex = useMemo(() => canvasTex(fieldCanvas(rows, cols)), [rows, cols]);
  useEffect(() => () => tex.dispose(), [tex]);
  const L = rows + MARGIN_L * 2;
  const Wd = cols + MARGIN_W * 2;
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.125, 0]} receiveShadow>
        <planeGeometry args={[L, Wd]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.62} roughness={0.82} metalness={0} />
      </mesh>
    </group>
  );
}

/* ── Stands ── */

const TIERS = 13;
const STEP_OUT = 0.62;
const STEP_UP = 0.36;

function roundRect(shape: THREE.Shape | THREE.Path, hw: number, hl: number, r: number) {
  shape.moveTo(-hw + r, -hl);
  shape.lineTo(hw - r, -hl);
  shape.quadraticCurveTo(hw, -hl, hw, -hl + r);
  shape.lineTo(hw, hl - r);
  shape.quadraticCurveTo(hw, hl, hw - r, hl);
  shape.lineTo(-hw + r, hl);
  shape.quadraticCurveTo(-hw, hl, -hw, hl - r);
  shape.lineTo(-hw, -hl + r);
  shape.quadraticCurveTo(-hw, -hl, -hw + r, -hl);
}

/** Points along a rounded rectangle perimeter, spaced `gap` apart. */
function perimeter(hw: number, hl: number, r: number, gap: number) {
  const shape = new THREE.Shape();
  roundRect(shape, hw, hl, r);
  const len = 2 * (2 * (hw - r) + 2 * (hl - r)) + 2 * Math.PI * r;
  const n = Math.floor(len / gap);
  return shape.getSpacedPoints(n).slice(0, n);
}

function Stands({ hw, hl }: { hw: number; hl: number }) {
  const tiers = useMemo(() => {
    const out: THREE.ExtrudeGeometry[] = [];
    for (let i = 0; i < TIERS; i++) {
      const w = hw + i * STEP_OUT;
      const l = hl + i * STEP_OUT;
      const s = new THREE.Shape();
      roundRect(s, w + STEP_OUT + 0.02, l + STEP_OUT + 0.02, 1.4 + i * STEP_OUT);
      const hole = new THREE.Path();
      roundRect(hole, w, l, 1.2 + i * STEP_OUT);
      s.holes.push(hole);
      out.push(new THREE.ExtrudeGeometry(s, { depth: STEP_UP * (i + 1) + 0.6, bevelEnabled: false, curveSegments: 10 }));
    }
    return out;
  }, [hw, hl]);
  useEffect(() => () => tiers.forEach((g) => g.dispose()), [tiers]);
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      {tiers.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshStandardMaterial color={i % 2 ? "#151b36" : "#1b2244"} roughness={0.9} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

/** Fans glow faintly in their own shirt colour so the stands read even far from the lamps. */
function selfLit(shader: { fragmentShader: string }) {
  shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.12;");
}

function Crowd({ hw, hl }: { hw: number; hl: number }) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const sticks = useRef<THREE.InstancedMesh>(null);
  const seats = useMemo(() => {
    const rnd = mulberry(42);
    const list: { x: number; y: number; z: number; team: "w" | "b" | "n"; ph: number; stick: boolean }[] = [];
    for (let i = 1; i < TIERS; i++) {
      const w = hw + i * STEP_OUT + STEP_OUT * 0.5;
      const l = hl + i * STEP_OUT + STEP_OUT * 0.5;
      for (const p of perimeter(w, l, 1.2 + i * STEP_OUT + STEP_OUT * 0.5, 0.19)) {
        if (rnd() < 0.08) continue; // a few empty seats
        // world: shape x → x, shape y → -z after the stands' rotation
        const x = p.x + (rnd() - 0.5) * 0.06;
        const z = -p.y + (rnd() - 0.5) * 0.06;
        const side = z > 0 ? "w" : "b";
        const roll = rnd();
        list.push({ x, y: STEP_UP * (i + 1) - 0.6 + 0.62, z, team: roll < 0.62 ? side : roll < 0.8 ? (side === "w" ? "b" : "w") : "n", ph: rnd() * Math.PI * 2, stick: rnd() < 0.12 });
      }
    }
    return list;
  }, [hw, hl]);
  const palette = useMemo(
    () => ({
      w: ["#1559c8", "#1aa0d8", "#2c3fc0", "#0db8d0", "#d07a1c"].map((c) => new THREE.Color(c)),
      b: ["#d0225f", "#9c0c3a", "#c83c92", "#6c22c8", "#c84620"].map((c) => new THREE.Color(c)),
      n: ["#2a2f45", "#5a5f70", "#c8c2b8", "#1a1d29", "#ffd23a"].map((c) => new THREE.Color(c)),
      skin: ["#f1c9a5", "#c98b5e", "#8d5a3b", "#5e3a24", "#e8b38c"].map((c) => new THREE.Color(c)),
    }),
    [],
  );
  useEffect(() => {
    const m = new THREE.Matrix4();
    const rnd = mulberry(9);
    const sticksList = seats.filter((s) => s.stick);
    seats.forEach((s, i) => {
      const face = Math.atan2(-s.x, -s.z);
      m.makeRotationY(face);
      m.setPosition(s.x, s.y + 0.12, s.z);
      bodies.current?.setMatrixAt(i, m);
      bodies.current?.setColorAt(i, palette[s.team][Math.floor(rnd() * 5)]);
      m.makeRotationY(face);
      m.setPosition(s.x, s.y + 0.29, s.z);
      heads.current?.setMatrixAt(i, m);
      heads.current?.setColorAt(i, palette.skin[Math.floor(rnd() * 5)]);
    });
    sticksList.forEach((s, i) => {
      m.makeTranslation(s.x, s.y + 0.46, s.z);
      sticks.current?.setMatrixAt(i, m);
      sticks.current?.setColorAt(i, new THREE.Color(s.team === "b" ? "#ff3b8f" : s.team === "w" ? "#45f0ff" : "#fff1a0"));
    });
    for (const ref of [bodies, heads, sticks]) {
      if (!ref.current) continue;
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [seats, palette]);
  // the crowd bounces a little: a slice of fans is updated each frame
  const cursor = useRef(0);
  const tmp = useMemo(() => new THREE.Matrix4(), []);
  useFrame(({ clock }) => {
    const b = bodies.current;
    const h = heads.current;
    if (!b || !h) return;
    const t = clock.elapsedTime;
    const n = Math.min(400, seats.length);
    for (let j = 0; j < n; j++) {
      const i = (cursor.current + j) % seats.length;
      const s = seats[i];
      const hop = Math.max(0, Math.sin(t * 5 + s.ph)) * 0.07;
      const face = Math.atan2(-s.x, -s.z);
      tmp.makeRotationY(face);
      tmp.setPosition(s.x, s.y + 0.12 + hop, s.z);
      b.setMatrixAt(i, tmp);
      tmp.setPosition(s.x, s.y + 0.29 + hop, s.z);
      h.setMatrixAt(i, tmp);
    }
    cursor.current = (cursor.current + n) % seats.length;
    b.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
  });
  const nSticks = seats.filter((s) => s.stick).length;
  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, seats.length]} frustumCulled={false}>
        <boxGeometry args={[0.15, 0.22, 0.1]} />
        <meshStandardMaterial roughness={0.75} onBeforeCompile={selfLit} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, seats.length]} frustumCulled={false}>
        <sphereGeometry args={[0.056, 8, 6]} />
        <meshStandardMaterial roughness={0.7} onBeforeCompile={selfLit} />
      </instancedMesh>
      <instancedMesh ref={sticks} args={[undefined, undefined, Math.max(1, nSticks)]} frustumCulled={false}>
        <sphereGeometry args={[0.045, 6, 4]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/* ── Neon trims, banners and boards ── */

function NeonWall({ hw, hl }: { hw: number; hl: number }) {
  // the low wall around the field: an LED ad ribbon, cyan on the Knights' half, magenta on the Phantoms' half
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 2048;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#03060d";
    ctx.fillRect(0, 0, 2048, 64);
    const words = ["GFL", "NEBULA KNIGHTS", "GALACTIC FOOTBALL LEAGUE", "PLASMA PHANTOMS", "GO KNIGHTS!", "GFL CHAMPIONSHIP"];
    let x = 30;
    let i = 0;
    while (x < 2048) {
      const word = words[i % words.length];
      const col = i % 2 ? "#ff4f9a" : "#4ff0ff";
      ctx.font = `italic 900 36px ${FONT}`;
      const w = ctx.measureText(word).width;
      glowText(ctx, word, x + w / 2, 33, 36, col, col, { spacing: 2 });
      x += w + 90;
      i++;
    }
    const t = canvasTex(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  const h = 0.42;
  const sides: { pos: [number, number, number]; rot: number; len: number; col: string }[] = [
    { pos: [hw, h / 2, hl / 2], rot: -Math.PI / 2, len: hl, col: TEAM.w },
    { pos: [hw, h / 2, -hl / 2], rot: -Math.PI / 2, len: hl, col: TEAM.b },
    { pos: [-hw, h / 2, hl / 2], rot: Math.PI / 2, len: hl, col: TEAM.w },
    { pos: [-hw, h / 2, -hl / 2], rot: Math.PI / 2, len: hl, col: TEAM.b },
    { pos: [0, h / 2, hl], rot: Math.PI, len: hw * 2, col: TEAM.w },
    { pos: [0, h / 2, -hl], rot: 0, len: hw * 2, col: TEAM.b },
  ];
  return (
    <group>
      {sides.map((s, i) => (
        <group key={i} position={s.pos} rotation={[0, s.rot, 0]}>
          <mesh>
            <planeGeometry args={[s.len, h]} />
            <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, h / 2 + 0.02, 0]}>
            <boxGeometry args={[s.len, 0.045, 0.045]} />
            <meshBasicMaterial color={s.col} toneMapped={false} />
          </mesh>
          <mesh position={[0, -h / 2 + 0.01, 0]}>
            <boxGeometry args={[s.len, 0.03, 0.03]} />
            <meshBasicMaterial color={s.col} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function boardCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  return canvasTex(c);
}

function frame(ctx: CanvasRenderingContext2D, w: number, h: number, a: string, b: string, r = 28) {
  ctx.fillStyle = "#050814";
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, r);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.save();
  ctx.lineWidth = 8;
  ctx.strokeStyle = g;
  ctx.shadowColor = a;
  ctx.shadowBlur = 24;
  ctx.stroke();
  ctx.restore();
}

function TopBanner({ x, y }: { x: number; y: number }) {
  const champ = useMemo(
    () =>
      boardCanvas(1024, 192, (ctx) => {
        frame(ctx, 1024, 192, "#b04bff", "#4f7bff", 40);
        glowText(ctx, "GFL CHAMPIONSHIP", 512, 100, 70, "#f3e9ff", "#b04bff", { spacing: 8 });
      }),
    [],
  );
  const teams = useMemo(
    () =>
      boardCanvas(1600, 128, (ctx) => {
        frame(ctx, 1600, 128, "#2ee6ff", "#ff2d7a", 20);
        glowText(ctx, "NEBULA KNIGHTS", 420, 66, 62, "#6ff3ff", "#00a8ff", { spacing: 4 });
        glowText(ctx, "VS", 800, 66, 54, "#ffffff", "#c070ff");
        glowText(ctx, "PLASMA PHANTOMS", 1180, 66, 62, "#ff6fc0", "#ff0a6c", { spacing: 4 });
      }),
    [],
  );
  useEffect(() => () => { champ.dispose(); teams.dispose(); }, [champ, teams]);
  return (
    <group position={[x, y, 0]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 1.05, 0]} rotation={[-0.2, 0, 0]}>
        <planeGeometry args={[5.0, 0.94]} />
        <meshBasicMaterial map={champ} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.3]} rotation={[-0.35, 0, 0]}>
        <planeGeometry args={[11, 0.88]} />
        <meshBasicMaterial map={teams} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Pennant({ position, rotY, text, sub, a, b }: { position: [number, number, number]; rotY: number; text: string; sub: string; a: string; b: string }) {
  const tex = useMemo(
    () =>
      boardCanvas(512, 384, (ctx) => {
        frame(ctx, 512, 384, a, b, 30);
        glowText(ctx, text, 256, 160, 120, "#ffffff", a, { spacing: 6 });
        glowText(ctx, sub, 256, 270, 52, b, b, { spacing: 4 });
      }),
    [text, sub, a, b],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh rotation={[-0.25, 0, 0]}>
        <planeGeometry args={[2.4, 1.8]} />
        <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Jumbotron({ board, position }: { board: Scoreboard; position: [number, number, number] }) {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1536;
    c.height = 384;
    return c;
  }, []);
  const tex = useMemo(() => canvasTex(canvas), [canvas]);
  useEffect(() => {
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 1536, 384);
    frame(ctx, 1536, 384, "#2ee6ff", "#ff2d7a", 34);
    // home block
    ctx.fillStyle = "rgba(20,120,255,0.18)";
    ctx.fillRect(30, 30, 520, 324);
    ctx.fillStyle = "rgba(255,30,110,0.18)";
    ctx.fillRect(986, 30, 520, 324);
    glowText(ctx, (board.homeName ?? "NEBULA KNIGHTS").toUpperCase(), 290, 92, 48, "#6ff3ff", "#00a8ff", { spacing: 2 });
    glowText(ctx, String(board.home), 290, 230, 150, "#ffffff", "#2ee6ff", { italic: false });
    glowText(ctx, (board.awayName ?? "PLASMA PHANTOMS").toUpperCase(), 1246, 92, 48, "#ff6fc0", "#ff0a6c", { spacing: 2 });
    glowText(ctx, String(board.away), 1246, 230, 150, "#ffffff", "#ff2d7a", { italic: false });
    glowText(ctx, "GFL", 768, 112, 130, "#ffffff", "#9a6bff", { spacing: 10 });
    glowText(ctx, "GALACTIC FOOTBALL LEAGUE", 768, 200, 34, "#d9c8ff", "#9a6bff", { spacing: 4 });
    glowText(ctx, board.clock, 768, 268, 58, "#ffe14a", "#ff9d00", { italic: false, spacing: 4 });
    glowText(ctx, board.note.toUpperCase(), 768, 330, 30, "#bfefff", "#2ee6ff", { spacing: 3 });
    tex.needsUpdate = true;
  }, [board.home, board.away, board.clock, board.note, board.homeName, board.awayName, canvas, tex]);
  useEffect(() => () => tex.dispose(), [tex]);
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    // face the camera, but stay upright
    g.lookAt(camera.position.x, g.position.y + (camera.position.y - g.position.y) * 0.6, camera.position.z);
  });
  return (
    <group ref={ref} position={position}>
      <mesh>
        <planeGeometry args={[4.6, 1.15]} />
        <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ── Light ── */

function glowSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const beamVert = `
varying float vY; varying vec3 vN; varying vec3 vV;
uniform float uH;
void main(){
  vY = position.y / uH + 0.5;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const beamFrag = `
varying float vY; varying vec3 vN; varying vec3 vV;
uniform vec3 uColor; uniform float uOpacity;
void main(){
  float edge = pow(abs(dot(vN, vV)), 1.6);
  float a = (0.12 + 0.88 * pow(vY, 0.9)) * edge * uOpacity;
  gl_FragColor = vec4(uColor, a);
}`;

function Beam({ from, to, color, width = 1.4, opacity = 0.32 }: { from: THREE.Vector3; to: THREE.Vector3; color: string; width?: number; opacity?: number }) {
  const len = from.distanceTo(to);
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uH: { value: len } }), [color, opacity, len]);
  return (
    <mesh position={mid} quaternion={quat} renderOrder={5}>
      <cylinderGeometry args={[0.06, width, len, 24, 1, true]} />
      <shaderMaterial vertexShader={beamVert} fragmentShader={beamFrag} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Rig({ hw, hl }: { hw: number; hl: number }) {
  const sprite = useMemo(() => glowSprite(), []);
  useEffect(() => () => sprite.dispose(), [sprite]);
  const top = STEP_UP * TIERS + 1.3;
  const out = (TIERS - 1) * STEP_OUT;
  const rigs = useMemo(() => {
    const far = -(hw + out);
    return [
      { at: new THREE.Vector3(far, top, 5.2), aim: new THREE.Vector3(1.2, 0, 3.2), color: "#22d3ff" },
      { at: new THREE.Vector3(far + 0.3, top + 0.6, 1.8), aim: new THREE.Vector3(-0.5, 0, 1.2), color: "#3a5bff" },
      { at: new THREE.Vector3(far, top + 0.8, -1.4), aim: new THREE.Vector3(0.4, 0, -0.8), color: "#b04bff" },
      { at: new THREE.Vector3(far + 0.3, top + 0.4, -4.4), aim: new THREE.Vector3(-0.8, 0, -3.4), color: "#ff8a1e" },
      { at: new THREE.Vector3(far, top, -7.4), aim: new THREE.Vector3(1, 0, -5.4), color: "#ff2d7a" },
      { at: new THREE.Vector3(-1.5, top - 0.6, hl + out), aim: new THREE.Vector3(0.5, 0, 4.5), color: "#2ee6ff" },
      { at: new THREE.Vector3(-1.5, top - 0.6, -(hl + out)), aim: new THREE.Vector3(0.5, 0, -4.5), color: "#ff3b8f" },
    ];
  }, [hw, hl, out, top]);
  return (
    <group>
      {rigs.map((r, i) => (
        <group key={i}>
          <Lamp at={r.at} aim={r.aim} color={r.color} />
          <Beam from={r.at} to={r.aim} color={r.color} width={1.9} opacity={0.5} />
          <sprite position={r.at} scale={[1.6, 1.6, 1]}>
            <spriteMaterial map={sprite} color={r.color} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </sprite>
          <mesh position={r.at}>
            <boxGeometry args={[0.5, 0.3, 0.5]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Lamp({ at, aim, color }: { at: THREE.Vector3; aim: THREE.Vector3; color: string }) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.copy(aim);
    return o;
  }, [aim]);
  useEffect(() => {
    if (light.current) light.current.target = target;
  }, [target]);
  return (
    <>
      <primitive object={target} />
      <spotLight ref={light} position={at} color={color} intensity={34} angle={0.36} penumbra={0.7} decay={1} distance={0} />
    </>
  );
}

/** Camera: broadside like a TV shot on wide screens, end-on on tall phones. */
function StadiumCam({ rows }: { rows: number }) {
  const { camera, size, controls } = useThree();
  const wide = size.width >= size.height * 1.05;
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const fov0 = persp.fov;
    persp.fov = wide ? 44 : 40;
    persp.updateProjectionMatrix();
    const aim = wide ? new THREE.Vector3(-2.2, 0, 0) : new THREE.Vector3(0, 0, -0.4);
    if (wide) camera.position.set(rows * 0.84, rows * 0.86, 0.001);
    else camera.position.set(0, rows * 1.5, rows * 0.8);
    camera.lookAt(aim);
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    orbit?.target?.copy(aim);
    orbit?.update?.();
    return () => {
      persp.fov = fov0;
      persp.updateProjectionMatrix();
    };
  }, [wide, rows, camera, controls]);
  return null;
}

export function NeonStadium({ rows, cols, board }: { rows: number; cols: number; board?: Scoreboard | null }) {
  const hw = cols / 2 + MARGIN_W + 0.35; // inner wall, across
  const hl = rows / 2 + MARGIN_L + 0.35; // inner wall, along
  const out = (TIERS - 1) * STEP_OUT;
  const size = useThree((st) => st.size);
  const wide = size.width >= size.height * 1.05;
  return (
    <group>
      <color attach="background" args={["#03040b"]} />
      <fog attach="fog" args={["#05040f", 26, 60]} />
      <hemisphereLight args={["#6c7cff", "#1a0820", 0.85]} />
      <ambientLight intensity={0.22} color="#8fa0ff" />
      <directionalLight
        position={[5, 16, 2]}
        intensity={1.75}
        color="#eef3ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0004}
      />
      {/* team-colored rim light from each end zone */}
      <directionalLight position={[0, 4, 14]} intensity={0.9} color={TEAM.w} />
      <directionalLight position={[0, 4, -14]} intensity={0.9} color={TEAM.b} />
      <pointLight position={[0, 3, 0]} intensity={6} distance={12} decay={1.2} color="#9a7bff" />
      <StadiumCam rows={rows} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[hw * 2 + 0.4, hl * 2 + 0.4]} />
        <meshStandardMaterial color="#04070d" roughness={0.9} />
      </mesh>
      <Field rows={rows} cols={cols} />
      <NeonWall hw={hw} hl={hl} />
      <Stands hw={hw} hl={hl} />
      <Crowd hw={hw} hl={hl} />
      <Rig hw={hw} hl={hl} />
      <TopBanner x={-(hw + out * 0.62)} y={STEP_UP * TIERS * 0.5} />
      <Pennant position={[-(hw + out * 0.55), STEP_UP * TIERS * 0.75, hl + out * 0.55]} rotY={Math.PI * 0.75} text="GFL" sub="CHAMPIONSHIP" a="#2ee6ff" b="#9fd0ff" />
      <Pennant position={[-(hw + out * 0.55), STEP_UP * TIERS * 0.75, -(hl + out * 0.55)]} rotY={Math.PI * 0.25} text="GO" sub="KNIGHTS!" a="#ff2d7a" b="#ffb02e" />
      {board ? <Jumbotron board={board} position={wide ? [hw + 0.5, 0.8, 0] : [0, 1.9, -(hl + 0.9)]} /> : null}
    </group>
  );
}

/* ── Glowing move paths ── */

export function Arc({ from, to, color, opacity = 1, lift = 0.5 }: { from: [number, number, number]; to: [number, number, number]; color: string; opacity?: number; lift?: number }) {
  const { tube, glow, head, quat } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const d = a.distanceTo(b);
    const m = a.clone().add(b).multiplyScalar(0.5);
    m.y += lift + d * 0.14;
    const curve = new THREE.QuadraticBezierCurve3(a, m, b.clone().lerp(m, 0.12));
    const end = curve.getPoint(1);
    const tan = curve.getTangent(1);
    return {
      tube: new THREE.TubeGeometry(curve, 40, 0.05, 10, false),
      glow: new THREE.TubeGeometry(curve, 40, 0.14, 10, false),
      head: end,
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize()),
    };
  }, [from[0], from[1], from[2], to[0], to[1], to[2], lift]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { tube.dispose(); glow.dispose(); }, [tube, glow]);
  return (
    <group renderOrder={6}>
      <mesh geometry={tube}>
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh geometry={glow}>
        <meshBasicMaterial color={color} transparent opacity={0.38 * opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={head} quaternion={quat}>
        <coneGeometry args={[0.17, 0.38, 16]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** A move arrow that fades out after a couple of seconds. */
export function FadingArc({ from, to, color }: { from: [number, number, number]; to: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    if (born.current == null) born.current = clock.elapsedTime;
    const age = clock.elapsedTime - born.current;
    const k = age < 2.2 ? 1 : Math.max(0, 1 - (age - 2.2) / 0.9);
    g.visible = k > 0.01;
    g.traverse((n) => {
      const mat = (n as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (mat && "opacity" in mat) {
        mat.userData.base ??= mat.opacity;
        mat.opacity = mat.userData.base * k;
      }
    });
  });
  return (
    <group ref={ref}>
      <Arc from={from} to={to} color={color} />
    </group>
  );
}

/** Glowing team disc under a player. */
export function TeamRing({ side, position }: { side: "w" | "b"; position: [number, number, number] }) {
  const col = TEAM[side];
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <ringGeometry args={[0.3, 0.4, 36]} />
        <meshBasicMaterial color={col} transparent opacity={0.95} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} renderOrder={1}>
        <circleGeometry args={[0.46, 36]} />
        <meshBasicMaterial color={col} transparent opacity={0.22} blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Glowing target marker for a legal square. */
export function TargetMark({ position, color, strong = false }: { position: [number, number, number]; color: string; strong?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5) * 0.08);
  });
  return (
    <group position={position}>
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <ringGeometry args={strong ? [0.34, 0.47, 32] : [0.2, 0.31, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <circleGeometry args={[strong ? 0.5 : 0.4, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
