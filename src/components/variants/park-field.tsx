/**
 * The Park Field (owner, t192u): a daytime football field in a town park. Real grass with neon
 * lines, the cyan Nebula Knights and purple Plasma Phantoms end zones, the centre crest, wooden
 * bleachers full of fans, team benches, trees, a little town behind and a "GFL CHAMPIONSHIP"
 * jumbotron. Everything is procedural (no downloaded assets) and instanced, so it stays light.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  CinemaCam,
  Field,
  Fireworks,
  GoalPosts,
  MARGIN_L,
  MARGIN_W,
  StadiumCam,
  TEAM,
  canvasTex,
  mulberry,
  type HomeTeam,
  type Hype,
  type StadiumShow,
} from "@/components/variants/neon-stadium";

const FONT = `"Arial Black", "Helvetica Neue", Impact, "DejaVu Sans", sans-serif`;
const WOOD = new THREE.Color("#b07a4a");
const WOOD_DARK = new THREE.Color("#7a5232");

type Inst = { m: THREE.Matrix4; c?: THREE.Color };

/** fills an instanced mesh once */
function useInstances(ref: React.RefObject<THREE.InstancedMesh | null>, list: Inst[]) {
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    list.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      if (it.c) mesh.setColorAt(i, it.c);
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ref, list]);
}

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
function place(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0) {
  _q.setFromAxisAngle(_up, yaw);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}

/* ── Sky, sun and clouds ── */

function Sky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vP;
          void main(){
            float y = max(vP.y, 0.0);
            vec3 top = vec3(0.20, 0.45, 0.85);
            vec3 hor = vec3(0.78, 0.88, 0.97);
            vec3 c = mix(hor, top, pow(y, 0.55));
            // soft sun glow
            vec3 sun = normalize(vec3(0.45, 0.55, 0.7));
            float s = max(dot(normalize(vP), sun), 0.0);
            c += vec3(1.0, 0.92, 0.75) * (pow(s, 64.0) * 0.9 + pow(s, 6.0) * 0.12);
            if (vP.y < 0.0) c = vec3(0.42, 0.55, 0.36);
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} renderOrder={-10}>
      <sphereGeometry args={[150, 32, 16]} />
    </mesh>
  );
}

function Clouds() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const list = useMemo(() => {
    const rnd = mulberry(91);
    const out: Inst[] = [];
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 60 + rnd() * 50;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const cy = 26 + rnd() * 18;
      for (let k = 0; k < 4; k++) {
        const s = 3 + rnd() * 4;
        out.push({ m: place(cx + (rnd() - 0.5) * 9, cy + rnd() * 1.5, cz + (rnd() - 0.5) * 5, s * 1.6, s * 0.55, s) });
      }
    }
    return out;
  }, []);
  useInstances(ref, list);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, list.length]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.9} fog={false} />
    </instancedMesh>
  );
}

/* ── Trees and the town ── */

/** keeps trees and houses off the field, the bleachers and the jumbotron */
function clear(x: number, z: number, hw: number, hl: number, padX: number, padZ: number) {
  return Math.abs(x) > hw + padX || Math.abs(z) > hl + padZ;
}

function Trees({ hw, hl }: { hw: number; hl: number }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const pines = useRef<THREE.InstancedMesh>(null);
  const { t, l, p } = useMemo(() => {
    const rnd = mulberry(42);
    const t: Inst[] = [];
    const l: Inst[] = [];
    const p: Inst[] = [];
    const greens = ["#3f7f2e", "#4c8f34", "#2f6a2a", "#5d9b3a", "#3a7536"].map((c) => new THREE.Color(c));
    const pineGreens = ["#2b5a2c", "#24502a", "#336a34"].map((c) => new THREE.Color(c));
    let tries = 0;
    while (t.length < 110 && tries++ < 4000) {
      const x = (rnd() - 0.5) * 70;
      const z = (rnd() - 0.5) * 64;
      if (!clear(x, z, hw, hl, 7.5, 4.5)) continue;
      if (Math.abs(x) < 26 && Math.abs(z) < 4 && x > 0) continue; // keep the view from the TV camera open
      if (Math.hypot(x, z) > 36) continue;
      const h = 1.2 + rnd() * 0.9;
      const s = 0.9 + rnd() * 0.8;
      t.push({ m: place(x, h / 2, z, s, h, s), c: WOOD_DARK });
      if (rnd() < 0.3) {
        const ph = 2.6 + rnd() * 2;
        p.push({ m: place(x, h * 0.6 + ph / 2, z, s * 1.1, ph, s * 1.1, rnd() * 6), c: pineGreens[Math.floor(rnd() * pineGreens.length)] });
      } else {
        const c = greens[Math.floor(rnd() * greens.length)];
        l.push({ m: place(x, h + 0.7 * s, z, 1.25 * s, 1.05 * s, 1.25 * s, rnd() * 6), c });
        l.push({ m: place(x + (rnd() - 0.5) * 0.8 * s, h + 1.35 * s, z + (rnd() - 0.5) * 0.8 * s, 0.85 * s, 0.8 * s, 0.85 * s, rnd() * 6), c });
      }
    }
    return { t, l, p };
  }, [hw, hl]);
  useInstances(trunks, t);
  useInstances(leaves, l);
  useInstances(pines, p);
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, t.length]} castShadow>
        <cylinderGeometry args={[0.11, 0.15, 1, 6]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={leaves} args={[undefined, undefined, l.length]} castShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
      <instancedMesh ref={pines} args={[undefined, undefined, p.length]} castShadow>
        <coneGeometry args={[0.75, 1, 7]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
    </group>
  );
}

function Town({ hw, hl }: { hw: number; hl: number }) {
  const walls = useRef<THREE.InstancedMesh>(null);
  const roofs = useRef<THREE.InstancedMesh>(null);
  const wins = useRef<THREE.InstancedMesh>(null);
  const { w, r, n } = useMemo(() => {
    const rnd = mulberry(1234);
    const w: Inst[] = [];
    const r: Inst[] = [];
    const n: Inst[] = [];
    const wallCols = ["#efe3c8", "#e8d2b0", "#c9b8a0", "#b55d45", "#d9e2e8", "#f2efe6", "#9fb4c4", "#e6c07a"].map((c) => new THREE.Color(c));
    const roofCols = ["#8c3b2c", "#5d4a44", "#3f4a5a", "#a2452f", "#6a3226"].map((c) => new THREE.Color(c));
    const glass = new THREE.Color("#8fb3cc");
    for (let i = 0; i < 70; i++) {
      // most of the town sits behind the far bleachers, where the TV camera looks
      const a = i < 44 ? Math.PI + (rnd() - 0.5) * 1.9 : rnd() * Math.PI * 2;
      const rad = 38 + rnd() * 22;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad * 0.9;
      if (!clear(x, z, hw, hl, 20, 14)) continue;
      const bw = 2.2 + rnd() * 2.6;
      const bd = 2 + rnd() * 2;
      const tall = rnd() < 0.18;
      const bh = tall ? 5 + rnd() * 5 : 2 + rnd() * 2.2;
      const yaw = Math.atan2(-x, -z) + (rnd() - 0.5) * 0.4;
      w.push({ m: place(x, bh / 2, z, bw, bh, bd, yaw), c: wallCols[Math.floor(rnd() * wallCols.length)] });
      if (!tall) r.push({ m: place(x, bh + bw * 0.22, z, bd * 0.6, bw * 0.45, bw * 1.02, yaw + Math.PI / 2), c: roofCols[Math.floor(rnd() * roofCols.length)] });
      // a couple of windows facing the park
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      for (let k = 0; k < (tall ? 6 : 2); k++) {
        const along = (k % 2 ? 0.25 : -0.25) * bw;
        const up = tall ? 1.2 + Math.floor(k / 2) * 1.5 : bh * 0.55;
        n.push({ m: place(x + fx * (bd / 2 + 0.02) + Math.cos(yaw) * along, up, z + fz * (bd / 2 + 0.02) - Math.sin(yaw) * along, 0.5, 0.55, 0.05, yaw), c: glass });
      }
    }
    // a church spire and a water tower for the skyline
    w.push({ m: place(-50, 3.5, 12, 3, 7, 3, 0.3), c: new THREE.Color("#efe7d6") });
    r.push({ m: place(-50, 9.2, 12, 1.5, 4.5, 1.5, 0.3), c: new THREE.Color("#5d4a44") });
    w.push({ m: place(-46, 6, -18, 0.3, 12, 0.3), c: new THREE.Color("#8a9aa6") });
    w.push({ m: place(-46, 12.6, -18, 3.2, 2.4, 3.2), c: new THREE.Color("#c8d4dc") });
    return { w, r, n };
  }, [hw, hl]);
  useInstances(walls, w);
  useInstances(roofs, r);
  useInstances(wins, n);
  return (
    <group>
      <instancedMesh ref={walls} args={[undefined, undefined, w.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[undefined, undefined, r.length]}>
        {/* a triangular prism: a 3-sided cylinder lying on its side */}
        <cylinderGeometry args={[1, 1, 1, 3]} />
        <meshStandardMaterial roughness={0.8} flatShading />
      </instancedMesh>
      <instancedMesh ref={wins} args={[undefined, undefined, n.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.2} metalness={0.4} />
      </instancedMesh>
    </group>
  );
}

/* ── Bleachers and fans ── */

type Bleacher = { x: number; dir: 1 | -1; tiers: number; z0: number; z1: number };
const STEP_OUT = 0.55;
const STEP_UP = 0.32;

function seatSpot(b: Bleacher, k: number) {
  return { x: b.x + b.dir * (k * STEP_OUT + STEP_OUT / 2), y: (k + 1) * STEP_UP };
}

function Bleachers({ list }: { list: Bleacher[] }) {
  const boards = useRef<THREE.InstancedMesh>(null);
  const frames = useRef<THREE.InstancedMesh>(null);
  const { b, f } = useMemo(() => {
    const b: Inst[] = [];
    const f: Inst[] = [];
    const steel = new THREE.Color("#8d969e");
    for (const bl of list) {
      const len = bl.z1 - bl.z0;
      const zc = (bl.z0 + bl.z1) / 2;
      for (let k = 0; k < bl.tiers; k++) {
        const s = seatSpot(bl, k);
        b.push({ m: place(s.x, s.y, zc, 0.34, 0.06, len), c: k % 2 ? WOOD : WOOD_DARK.clone().lerp(WOOD, 0.6) });
        b.push({ m: place(s.x - bl.dir * 0.2, s.y - STEP_UP * 0.55, zc, 0.24, 0.04, len), c: WOOD_DARK });
      }
      // steel legs and the back rail
      const top = seatSpot(bl, bl.tiers - 1);
      for (let z = bl.z0; z <= bl.z1 + 1e-3; z += 1.6) {
        for (let k = 0; k < bl.tiers; k += 2) {
          const s = seatSpot(bl, k);
          f.push({ m: place(s.x, s.y / 2, z, 0.06, s.y, 0.06), c: steel });
        }
        f.push({ m: place(top.x + bl.dir * 0.2, top.y + 0.35, z, 0.05, 0.7, 0.05), c: steel });
      }
      f.push({ m: place(top.x + bl.dir * 0.2, top.y + 0.7, zc, 0.05, 0.05, len), c: steel });
    }
    return { b, f };
  }, [list]);
  useInstances(boards, b);
  useInstances(frames, f);
  return (
    <group>
      <instancedMesh ref={boards} args={[undefined, undefined, b.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={frames} args={[undefined, undefined, f.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.4} metalness={0.6} />
      </instancedMesh>
    </group>
  );
}

/** Fans on the bleachers: they sway, and jump and cheer on big plays. */
function Fans({ list, hype, home }: { list: Bleacher[]; hype: Hype | null; home: string }) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const fans = useMemo(() => {
    const rnd = mulberry(5150);
    const shirts = [home, home, "#2ee6ff", "#a04bff", "#ff8a1e", "#ffffff", "#f2d13a", "#e0405a", "#3c6fd8", "#7a2bd8"].map((c) => new THREE.Color(c));
    const skin = ["#f1c9a5", "#d9a37c", "#a8714c", "#7a4a2c", "#f5d7bd"].map((c) => new THREE.Color(c));
    const out: { x: number; y: number; z: number; face: number; ph: number; shirt: THREE.Color; skin: THREE.Color; h: number }[] = [];
    for (const bl of list) {
      for (let k = 0; k < bl.tiers; k++) {
        const s = seatSpot(bl, k);
        for (let z = bl.z0 + 0.2; z < bl.z1 - 0.1; z += 0.34) {
          if (rnd() < 0.3) continue;
          out.push({
            x: s.x + (rnd() - 0.5) * 0.06,
            y: s.y + 0.03,
            z: z + (rnd() - 0.5) * 0.08,
            face: bl.dir > 0 ? -Math.PI / 2 : Math.PI / 2,
            ph: rnd() * Math.PI * 2,
            shirt: shirts[Math.floor(rnd() * shirts.length)],
            skin: skin[Math.floor(rnd() * skin.length)],
            h: 0.9 + rnd() * 0.25,
          });
        }
      }
    }
    return out;
  }, [list, home]);
  useEffect(() => {
    fans.forEach((f, i) => {
      bodies.current?.setColorAt(i, f.shirt);
      heads.current?.setColorAt(i, f.skin);
    });
    for (const r of [bodies, heads]) if (r.current?.instanceColor) r.current.instanceColor.needsUpdate = true;
  }, [fans]);
  const level = useRef(0);
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!hype || hype.id === seen.current) return;
    seen.current = hype.id;
    level.current = Math.max(level.current, hype.level);
  }, [hype]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const frame = useRef(0);
  useFrame(({ clock }, dt) => {
    level.current = Math.max(0, level.current - dt * 0.12);
    const hyped = level.current > 0.02;
    // calm crowds only need a refresh every other frame
    if (!hyped && frame.current++ % 2) return;
    const t = clock.elapsedTime;
    const B = bodies.current;
    const H = heads.current;
    if (!B || !H) return;
    fans.forEach((f, i) => {
      const jump = hyped ? Math.max(0, Math.sin(t * 9 + f.ph)) * 0.14 * level.current : 0;
      const sway = Math.sin(t * 1.3 + f.ph) * 0.05;
      const stand = hyped ? 0.1 * Math.min(1, level.current * 2) : 0;
      q.setFromAxisAngle(_up, f.face + sway);
      v.set(f.x, f.y + 0.13 * f.h + jump + stand, f.z);
      sc.set(1, f.h, 1);
      m.compose(v, q, sc);
      B.setMatrixAt(i, m);
      v.y += 0.17 * f.h + 0.05;
      sc.set(1, 1, 1);
      m.compose(v, q, sc);
      H.setMatrixAt(i, m);
    });
    B.instanceMatrix.needsUpdate = true;
    H.instanceMatrix.needsUpdate = true;
  });
  useEffect(() => {
    for (const r of [bodies, heads]) r.current?.computeBoundingSphere();
  });
  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, fans.length]} frustumCulled={false}>
        <boxGeometry args={[0.2, 0.26, 0.13]} />
        <meshStandardMaterial roughness={0.75} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, fans.length]} frustumCulled={false}>
        <sphereGeometry args={[0.075, 10, 8]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
    </group>
  );
}

/* ── Benches, fence, jumbotron ── */

function Benches({ cols }: { cols: number }) {
  const seats = useRef<THREE.InstancedMesh>(null);
  const players = useRef<THREE.InstancedMesh>(null);
  const helmets = useRef<THREE.InstancedMesh>(null);
  const { s, p, h } = useMemo(() => {
    const rnd = mulberry(808);
    const s: Inst[] = [];
    const p: Inst[] = [];
    const h: Inst[] = [];
    for (const side of [1, -1] as const) {
      const x = side * (cols / 2 + 0.55);
      const jersey = new THREE.Color(side > 0 ? TEAM.w : "#8a3bd8");
      const helmet = new THREE.Color(side > 0 ? "#bff8ff" : "#ff9a3c");
      for (const z of [-2.4, 2.4]) {
        s.push({ m: place(x, 0.33, z, 0.26, 0.05, 2.6), c: WOOD });
        s.push({ m: place(x + side * 0.12, 0.5, z, 0.04, 0.3, 2.6), c: WOOD_DARK });
        for (const dz of [-1.1, 1.1]) s.push({ m: place(x, 0.22, z + dz, 0.22, 0.2, 0.05), c: WOOD_DARK });
        for (let i = 0; i < 6; i++) {
          if (rnd() < 0.25) continue;
          const zz = z - 1.05 + i * 0.42;
          p.push({ m: place(x, 0.5, zz, 1, 1, 1, side > 0 ? -Math.PI / 2 : Math.PI / 2), c: jersey });
          h.push({ m: place(x - side * 0.01, 0.73, zz, 1, 1, 1), c: helmet });
        }
      }
    }
    return { s, p, h };
  }, [cols]);
  useInstances(seats, s);
  useInstances(players, p);
  useInstances(helmets, h);
  return (
    <group>
      <instancedMesh ref={seats} args={[undefined, undefined, s.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={players} args={[undefined, undefined, p.length]} castShadow>
        <boxGeometry args={[0.17, 0.32, 0.22]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={helmets} args={[undefined, undefined, h.length]}>
        <sphereGeometry args={[0.08, 10, 8]} />
        <meshStandardMaterial roughness={0.3} metalness={0.2} />
      </instancedMesh>
    </group>
  );
}

/** a low white rail around the field */
function Fence({ hw, hl }: { hw: number; hl: number }) {
  const rails = useRef<THREE.InstancedMesh>(null);
  const list = useMemo(() => {
    const out: Inst[] = [];
    for (const y of [0.22, 0.42]) {
      for (const sx of [1, -1]) out.push({ m: place(sx * hw, y, 0, 0.05, 0.05, hl * 2) });
      for (const sz of [1, -1]) out.push({ m: place(0, y, sz * hl, hw * 2, 0.05, 0.05) });
    }
    for (let z = -hl; z <= hl + 1e-3; z += 1.2) for (const sx of [1, -1]) out.push({ m: place(sx * hw, 0.24, z, 0.07, 0.48, 0.07) });
    for (let x = -hw + 1.2; x < hw - 0.1; x += 1.2) for (const sz of [1, -1]) out.push({ m: place(x, 0.24, sz * hl, 0.07, 0.48, 0.07) });
    return out;
  }, [hw, hl]);
  useInstances(rails, list);
  return (
    <instancedMesh ref={rails} args={[undefined, undefined, list.length]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#f4f1ea" roughness={0.6} />
    </instancedMesh>
  );
}

function jumboCanvas(home: string, homeColor: string) {
  const W = 1024;
  const H = 520;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1030");
  g.addColorStop(1, "#04060f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#2ee6ff";
  ctx.lineWidth = 10;
  ctx.shadowColor = "#2ee6ff";
  ctx.shadowBlur = 24;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowBlur = 30;
  ctx.shadowColor = "#ff9a3c";
  ctx.fillStyle = "#ffd36a";
  ctx.font = `900 112px ${FONT}`;
  ctx.fillText("GFL", W / 2, 120);
  ctx.font = `900 72px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#a04bff";
  ctx.fillText("CHAMPIONSHIP", W / 2, 222);
  const fit = (t: string) => Math.min(64, 760 / Math.max(1, t.length * 0.72));
  ctx.font = `900 ${fit(home)}px ${FONT}`;
  ctx.fillStyle = homeColor;
  ctx.shadowColor = homeColor;
  ctx.fillText(home.toUpperCase(), W * 0.27, 372);
  ctx.fillStyle = "#ffffff";
  ctx.shadowBlur = 0;
  ctx.font = `900 46px ${FONT}`;
  ctx.fillText("VS", W / 2, 372);
  ctx.font = `900 ${fit("PHANTOMS")}px ${FONT}`;
  ctx.fillStyle = "#c98bff";
  ctx.shadowColor = "#8a2bff";
  ctx.shadowBlur = 30;
  ctx.fillText("PHANTOMS", W * 0.73, 372);
  ctx.shadowBlur = 0;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillStyle = "#9fd0ff";
  ctx.fillText("PARK FIELD · GAME DAY", W / 2, 462);
  return c;
}

function Jumbotron({ x, home }: { x: number; home: HomeTeam | null }) {
  const name = home?.name ?? "Knights";
  const color = home?.color ?? TEAM.w;
  const tex = useMemo(() => canvasTex(jumboCanvas(name, color)), [name, color]);
  useEffect(() => () => tex.dispose(), [tex]);
  const w = 6.4;
  const h = 3.25;
  const y = 3.0;
  return (
    <group position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      {[-w * 0.32, w * 0.32].map((dx) => (
        <mesh key={dx} position={[dx, y / 2, -0.15]} castShadow>
          <boxGeometry args={[0.22, y, 0.22]} />
          <meshStandardMaterial color="#5b6670" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, y + h / 2, -0.12]} castShadow>
        <boxGeometry args={[w + 0.3, h + 0.3, 0.2]} />
        <meshStandardMaterial color="#1b1f2a" roughness={0.6} />
      </mesh>
      <mesh position={[0, y + h / 2, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function ParkField({ rows, cols, show = null, home = null }: { rows: number; cols: number; show?: StadiumShow | null; home?: HomeTeam | null }) {
  const hw = cols / 2 + MARGIN_W + 0.35;
  const hl = rows / 2 + MARGIN_L + 0.35;
  // when the replay ends, put the normal TV camera back
  const [reset, setReset] = useState(0);
  const cinema = Boolean(show?.shot);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !cinema) setReset((n) => n + 1);
    was.current = cinema;
  }, [cinema]);
  const stands = useMemo<Bleacher[]>(
    () => [
      { x: -(hw + 0.45), dir: -1, tiers: 8, z0: -hl + 1.2, z1: hl - 1.2 },
      { x: hw + 0.45, dir: 1, tiers: 4, z0: -hl + 1.2, z1: -0.9 },
      { x: hw + 0.45, dir: 1, tiers: 4, z0: 0.9, z1: hl - 1.2 },
    ],
    [hw, hl],
  );
  return (
    <group>
      <color attach="background" args={["#bcd9f2"]} />
      <fog attach="fog" args={["#cfe2f1", 40, 120]} />
      <hemisphereLight args={["#d6ebff", "#4f6e2c", 0.95]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[9, 18, 11]}
        intensity={2.3}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
      />
      {show?.shot ? <CinemaCam shot={show.shot} /> : <StadiumCam rows={rows} reset={reset} />}
      <Sky />
      <Clouds />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[140, 48]} />
        <meshStandardMaterial color="#5f9a44" roughness={1} />
      </mesh>
      {/* a mown apron around the field */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, 0]} receiveShadow>
        <planeGeometry args={[hw * 2 + 9, hl * 2 + 5]} />
        <meshStandardMaterial color="#4f8f3a" roughness={1} />
      </mesh>
      <Field rows={rows} cols={cols} home={home} day />
      <Fence hw={hw} hl={hl} />
      <Benches cols={cols} />
      <Bleachers list={stands} />
      <Fans list={stands} hype={show?.hype ?? null} home={home?.color ?? TEAM.w} />
      <Jumbotron x={-(hw + 0.45 + 8 * STEP_OUT + 1.4)} home={home} />
      <Trees hw={hw} hl={hl} />
      <Town hw={hw} hl={hl} />
      <GoalPosts rows={rows} />
      <Suspense fallback={null}>
        <Fireworks burst={show?.fireworks ?? null} side={cols / 2 + 1.7} />
      </Suspense>
    </group>
  );
}
