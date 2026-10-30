import { useEffect, useMemo, useRef, useState, Suspense, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as skinClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { asset } from "@/lib/base";

/* Touchdown celebrations (owner t245u, AV > FB mode > FB edit). Each plays ~6 s over the end zone that
   was scored in, from the moment of the touchdown, so it is seen before and during the replay.
   Models are other people's free models (CC0 / CC BY 3.0), credited in src/lib/football/fb-gear.ts,
   public/football/CREDITS.md and the /credits screen. Everything else is made in code. */

const M = {
  dragon: "/football/celebrations/dragon-a2315d1b2e.glb",
  whale: "/football/celebrations/whale-a9f06bd488.glb",
  hawk: "/football/celebrations/hawk-f1215873e7.glb",
  ufo: "/football/celebrations/ufo-d33dad8f70.glb",
  blimp: "/football/celebrations/blimp-05f6218d16.glb",
  balloon: "/football/celebrations/balloon-7505fe6ac2.glb",
  rocket: "/football/celebrations/rocket-66239ba141.glb",
};
const MODEL_OF: Record<string, string[]> = {
  "cel-dragon": [M.dragon],
  "cel-whale": [M.whale],
  "cel-hawks": [M.hawk],
  "cel-ufo": [M.ufo],
  "cel-blimp": [M.blimp],
  "cel-balloons": [M.balloon],
  "cel-rocket": [M.rocket],
};

/** Warm the GLB cache for one celebration (the football page calls this for both players' picks). */
export function preloadCelebration(id: string) {
  for (const url of MODEL_OF[id] ?? []) useGLTF.preload(asset(url));
}

/** How long each one runs (s). */
export const CELEB_SECONDS: Record<string, number> = {
  "cel-confetti": 5.5,
  "cel-coins": 5.5,
  "cel-lasers": 6,
  "cel-thunder": 5,
  "cel-balloons": 7,
  "cel-blimp": 7,
  "cel-hawks": 6,
  "cel-whale": 7.5,
  "cel-ufo": 6.5,
  "cel-rocket": 6,
  "cel-dragon": 7.5,
};

export type CelebrateCue = { id: number; kind: string; z: number; color?: string };

type Ctx = { z: number; s: number; color: string; born: number; half: number };

/** Seconds since the celebration began (or the pinned time, for screenshots: window.__fbCelT). */
function useAge(born: number) {
  const clock = useThree((st) => st.clock);
  return () => {
    const pin = (window as unknown as { __fbCelT?: number }).__fbCelT;
    return pin ?? clock.elapsedTime - born;
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
/** deterministic random so every replay of one celebration looks the same */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A clone of a GLB scaled so its largest side is `size`, centred on x/z, standing on y=0 (or centred in y). */
function useModel(url: string, size: number, opts: { center?: boolean; clip?: string } = {}) {
  const gltf = useGLTF(asset(url));
  return useMemo(() => {
    const raw = gltf.animations.length ? skinClone(gltf.scene) : gltf.scene.clone(true);
    raw.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.frustumCulled = false;
      }
    });
    raw.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(raw);
    const dim = box.getSize(new THREE.Vector3());
    const k = size / Math.max(dim.x, dim.y, dim.z, 1e-6);
    const c = box.getCenter(new THREE.Vector3());
    const fit = new THREE.Group();
    fit.add(raw);
    raw.position.set(-c.x, opts.center ? -c.y : -box.min.y, -c.z);
    fit.scale.setScalar(k);
    const holder = new THREE.Group();
    holder.add(fit);
    let mixer: THREE.AnimationMixer | null = null;
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(raw);
      const clip = gltf.animations.find((a) => (opts.clip ? a.name.includes(opts.clip) : true)) ?? gltf.animations[0];
      mixer.clipAction(clip).play();
    }
    return { obj: holder, mixer };
  }, [gltf, size, opts.center, opts.clip]);
}

/** Drives a model's animation clip by the celebration clock (so a pinned time shows a pinned pose). */
function useMixer(mixer: THREE.AnimationMixer | null, age: () => number, speed = 1) {
  useFrame(() => {
    if (mixer) mixer.setTime(Math.max(0, age()) * speed);
  });
}

function additive(color: string, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Point a unit-height cylinder/box from a to b. */
function span(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, width = 1) {
  _p.subVectors(b, a);
  const len = _p.length();
  obj.position.copy(a).addScaledVector(_p, 0.5);
  obj.quaternion.setFromUnitVectors(UP, _p.normalize());
  obj.scale.set(width, Math.max(1e-3, len), width);
}

/* ---------- Confetti Cannons ---------- */
function Confetti({ c }: { c: Ctx }) {
  const age = useAge(c.born);
  const N = 560;
  const cannons = useMemo(
    () => [
      new THREE.Vector3(-3.7, 0.3, c.z - 0.9 * c.s),
      new THREE.Vector3(3.7, 0.3, c.z - 0.9 * c.s),
      new THREE.Vector3(-3.7, 0.3, c.z + 0.9 * c.s),
      new THREE.Vector3(3.7, 0.3, c.z + 0.9 * c.s),
    ],
    [c.z, c.s],
  );
  const parts = useMemo(() => {
    const r = rng(7);
    return Array.from({ length: N }, (_, i) => {
      const k = i % 4;
      const volley = Math.floor(r() * 3);
      const o = cannons[k];
      return {
        k,
        t0: volley * 0.55 + k * 0.08 + r() * 0.08,
        v: new THREE.Vector3(-Math.sign(o.x) * (2 + r() * 3.5), 9 + r() * 5, (r() - 0.5) * 5),
        spin: new THREE.Vector3(r() * 9, r() * 9, r() * 9),
        wob: r() * 6.28,
      };
    });
  }, [cannons]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const flashes = useRef<(THREE.Mesh | null)[]>([]);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const pal = [c.color, "#ffd84a", "#ffffff", "#ff2d7a", "#2ee6ff", "#7cff6b"].map((h) => new THREE.Color(h));
    const r = rng(11);
    for (let i = 0; i < N; i++) m.setColorAt(i, pal[Math.floor(r() * pal.length)]);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [c.color]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const t = age();
    const kd = 1.5;
    for (let i = 0; i < N; i++) {
      const q = parts[i];
      const tau = t - q.t0;
      if (tau < 0) {
        _m.makeScale(0, 0, 0);
        m.setMatrixAt(i, _m);
        continue;
      }
      const e = (1 - Math.exp(-kd * tau)) / kd;
      const o = cannons[q.k];
      const vt = -1.1;
      const x = o.x + q.v.x * e + Math.sin(tau * 3 + q.wob) * 0.25 * Math.min(1, tau);
      const y = Math.max(0.12, o.y + vt * tau + (q.v.y - vt) * e);
      const z = o.z + q.v.z * e + Math.cos(tau * 2.4 + q.wob) * 0.2 * Math.min(1, tau);
      _p.set(x, y, z);
      _e.set(q.spin.x * tau, q.spin.y * tau, q.spin.z * tau);
      _q.setFromEuler(_e);
      const fade = 1 - smooth((t - 4.6) / 0.9);
      _s.setScalar(fade);
      _m.compose(_p, _q, _s);
      m.setMatrixAt(i, _m);
    }
    m.instanceMatrix.needsUpdate = true;
    flashes.current.forEach((f, k) => {
      if (!f) return;
      const since = Math.min(...[0, 0.55, 1.1].map((v) => { const d = t - v - k * 0.08; return d < 0 ? 9 : d; }));
      const on = since < 0.25 ? 1 - since / 0.25 : 0;
      f.scale.setScalar(0.2 + (1 - on) * 0.9);
      (f.material as THREE.MeshBasicMaterial).opacity = on;
    });
  });
  const flashMat = useMemo(() => additive("#fff3b0", 0), []);
  return (
    <group>
      {cannons.map((o, k) => (
        <group key={k} position={o}>
          <mesh rotation={[0, 0, Math.sign(o.x) * 0.45]} position={[0, -0.05, 0]}>
            <cylinderGeometry args={[0.16, 0.22, 0.7, 14]} />
            <meshStandardMaterial color="#20232b" metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh ref={(el) => { flashes.current[k] = el; }} position={[-Math.sign(o.x) * 0.15, 0.35, 0]} material={flashMat}>
            <sphereGeometry args={[0.5, 12, 8]} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={mesh} args={[undefined, undefined, N]} frustumCulled={false}>
        <planeGeometry args={[0.11, 0.07]} />
        <meshStandardMaterial side={THREE.DoubleSide} roughness={0.5} emissive="#333333" />
      </instancedMesh>
    </group>
  );
}

/* ---------- Coin Shower ---------- */
function Coins({ c }: { c: Ctx }) {
  const age = useAge(c.born);
  const N = 240;
  const tex = useMemo(() => {
    const t = new THREE.TextureLoader().load(asset("/morse-coin.png"));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const mats = useMemo(() => {
    const rim = new THREE.MeshStandardMaterial({ color: "#d9a53a", metalness: 0.9, roughness: 0.3, emissive: "#3a2808" });
    const face = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.6, roughness: 0.35, emissive: "#2a1d06", transparent: true, alphaTest: 0.3 });
    return [rim, face, face];
  }, [tex]);
  const parts = useMemo(() => {
    const r = rng(3);
    return Array.from({ length: N }, () => ({
      x: (r() - 0.5) * 7,
      z: c.z + (r() - 0.5) * 4,
      y0: 9 + r() * 5,
      t0: r() * 2.6,
      spin: 4 + r() * 8,
      tilt: r() * 6.28,
      rest: r() * 6.28,
    }));
  }, [c.z]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const t = age();
    for (let i = 0; i < N; i++) {
      const q = parts[i];
      const tau = t - q.t0;
      if (tau < 0) {
        _m.makeScale(0, 0, 0);
        m.setMatrixAt(i, _m);
        continue;
      }
      // falls with drag (terminal ~6 m/s), one small bounce, then lies flat
      const vt = 6.5;
      const kd = 9.8 / vt;
      const drop = vt * tau - (vt / kd) * (1 - Math.exp(-kd * tau));
      let y = q.y0 - drop;
      let landed = 0;
      if (y < 0.03) {
        const over = (0.03 - y) / vt;
        landed = Math.min(1, over * 3);
        const b = Math.max(0, Math.sin(Math.min(Math.PI, over * 7))) * 0.25 * (1 - landed);
        y = 0.03 + b;
      }
      _p.set(q.x, y, q.z);
      _e.set(q.tilt + tau * q.spin * (1 - landed), q.rest, (1 - landed) * tau * 2);
      if (landed >= 1) _e.set(0, q.rest, 0);
      _q.setFromEuler(_e);
      const fade = 1 - smooth((t - 4.8) / 0.7);
      _s.setScalar(fade);
      _m.compose(_p, _q, _s);
      m.setMatrixAt(i, _m);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, mats, N]} frustumCulled={false}>
      <cylinderGeometry args={[0.17, 0.17, 0.035, 18]} />
    </instancedMesh>
  );
}

/* ---------- Laser Show ---------- */
function Lasers({ c }: { c: Ctx }) {
  const age = useAge(c.born);
  const cols = ["#2ee6ff", "#ff2d7a", "#7cff6b", "#ffd84a", c.color];
  const beams = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        from: new THREE.Vector3((i % 2 ? 1 : -1) * 7.2, 7.5 + (i % 3) * 0.4, c.z + c.s * ((Math.floor(i / 2) - 2) * 1.8)),
        color: cols[i % cols.length],
        ph: i * 1.3,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.z, c.s, c.color],
  );
  const core = useRef<(THREE.Mesh | null)[]>([]);
  const glow = useRef<(THREE.Mesh | null)[]>([]);
  const spot = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(() => beams.map((b) => ({ core: additive("#ffffff", 0.9), glow: additive(b.color, 0.45), spot: additive(b.color, 0.7) })), [beams]);
  useFrame(() => {
    const t = age();
    const on = smooth(t / 0.4) * (1 - smooth((t - 5.2) / 0.8));
    beams.forEach((b, i) => {
      const sweep = t * (1.4 + (i % 3) * 0.35) + b.ph;
      _b.set(Math.sin(sweep) * 3.3, 0.06, c.z + Math.cos(sweep * 0.8) * 2.2);
      const strobe = 0.75 + 0.25 * Math.sin(t * 22 + i);
      const k = core.current[i];
      const g = glow.current[i];
      const sp = spot.current[i];
      if (k) span(k, b.from, _b, 1);
      if (g) span(g, b.from, _b, 1);
      if (sp) sp.position.copy(_b);
      mats[i].core.opacity = 0.9 * on * strobe;
      mats[i].glow.opacity = 0.45 * on * strobe;
      mats[i].spot.opacity = 0.7 * on;
    });
  });
  return (
    <group>
      {beams.map((b, i) => (
        <group key={i}>
          <mesh ref={(el) => { core.current[i] = el; }} material={mats[i].core} frustumCulled={false}>
            <cylinderGeometry args={[0.025, 0.025, 1, 6, 1, true]} />
          </mesh>
          <mesh ref={(el) => { glow.current[i] = el; }} material={mats[i].glow} frustumCulled={false}>
            <cylinderGeometry args={[0.09, 0.09, 1, 8, 1, true]} />
          </mesh>
          <mesh ref={(el) => { spot.current[i] = el; }} material={mats[i].spot} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.32, 20]} />
          </mesh>
          <mesh position={b.from}>
            <boxGeometry args={[0.35, 0.25, 0.35]} />
            <meshStandardMaterial color="#1a1d24" emissive={b.color} emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ---------- Thunder Strike ---------- */
const STRIKES = [0.45, 1.25, 1.8, 2.7, 3.3, 3.75];
function bolt(seed: number, from: THREE.Vector3, to: THREE.Vector3) {
  const r = rng(seed);
  const pts = [from.clone()];
  const n = 11;
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const p = from.clone().lerp(to, u);
    const j = (1 - Math.abs(u - 0.5) * 1.2) * 0.9;
    p.x += (r() - 0.5) * j;
    p.z += (r() - 0.5) * j;
    pts.push(p);
  }
  pts.push(to.clone());
  // one side branch
  const at = 3 + Math.floor(r() * 4);
  const br = [pts[at].clone()];
  for (let i = 1; i <= 4; i++) br.push(pts[at].clone().add(new THREE.Vector3((r() - 0.3) * 0.7 * i, -0.75 * i, (r() - 0.5) * 0.6 * i)));
  return [pts, br];
}
function Thunder({ c }: { c: Ctx }) {
  const age = useAge(c.born);
  const bolts = useMemo(
    () =>
      STRIKES.map((_, i) => {
        const r = rng(100 + i);
        const to = new THREE.Vector3((r() - 0.5) * 5, 0.05, c.z + (r() - 0.5) * 2.4);
        const from = new THREE.Vector3(to.x * 0.4 + (r() - 0.5) * 2, 10, c.z + c.s * (r() * 1.5));
        return bolt(200 + i, from, to).map((line) => {
          const segs: [THREE.Vector3, THREE.Vector3][] = [];
          for (let k = 0; k + 1 < line.length; k++) segs.push([line[k], line[k + 1]]);
          return segs;
        }).flat();
      }),
    [c.z, c.s],
  );
  const groups = useRef<(THREE.Group | null)[]>([]);
  const light = useRef<THREE.PointLight>(null);
  const cloud = useRef<THREE.Group>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const coreMat = useMemo(() => additive("#f2f6ff", 1), []);
  const glowMat = useMemo(() => additive("#7aa8ff", 0.5), []);
  const ringMats = useMemo(() => STRIKES.map(() => additive("#9cc3ff", 0)), []);
  useFrame(() => {
    const t = age();
    let flash = 0;
    STRIKES.forEach((st, i) => {
      const d = t - st;
      const vis = d >= 0 && d < 0.22 && (d < 0.06 || d > 0.1);
      const g = groups.current[i];
      if (g) g.visible = vis;
      if (d >= 0 && d < 0.5) flash = Math.max(flash, 1 - d / 0.5);
      const ring = rings.current[i];
      if (ring) {
        const on = d >= 0 && d < 1.2;
        ring.visible = on;
        ring.scale.setScalar(0.3 + d * 2.2);
        ringMats[i].opacity = on ? (1 - d / 1.2) * 0.8 : 0;
      }
    });
    if (light.current) light.current.intensity = flash * 260;
    if (cloud.current) {
      const on = smooth(t / 0.4) * (1 - smooth((t - 4.2) / 0.8));
      cloud.current.scale.setScalar(Math.max(0.001, on));
      cloud.current.rotation.y = t * 0.15;
    }
  });
  return (
    <group>
      <pointLight ref={light} position={[0, 7, c.z]} color="#bcd4ff" intensity={0} distance={40} decay={1.2} />
      <group ref={cloud} position={[0, 10.2, c.z + c.s * 0.6]}>
        {Array.from({ length: 11 }, (_, i) => {
          const a = (i / 11) * Math.PI * 2;
          const rr = 1.2 + (i % 3) * 0.9;
          return (
            <mesh key={i} position={[Math.cos(a) * rr * 1.4, (i % 2) * 0.4, Math.sin(a) * rr * 0.7]}>
              <sphereGeometry args={[1.1 + (i % 3) * 0.35, 14, 10]} />
              <meshStandardMaterial color="#2b2f3a" roughness={1} transparent opacity={0.92} />
            </mesh>
          );
        })}
      </group>
      {bolts.map((segs, i) => (
        <group key={i} ref={(el) => { groups.current[i] = el; }} visible={false}>
          {segs.map(([a, b], k) => (
            <group key={k}>
              <mesh ref={(el) => el && span(el, a, b, 1)} material={coreMat} frustumCulled={false}>
                <cylinderGeometry args={[0.05, 0.05, 1, 5, 1, true]} />
              </mesh>
              <mesh ref={(el) => el && span(el, a, b, 1)} material={glowMat} frustumCulled={false}>
                <cylinderGeometry args={[0.2, 0.2, 1, 6, 1, true]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {bolts.map((segs, i) => (
        <mesh key={`r${i}`} ref={(el) => { rings.current[i] = el; }} position={[segs[10]?.[1].x ?? 0, 0.07, segs[10]?.[1].z ?? c.z]} rotation={[-Math.PI / 2, 0, 0]} material={ringMats[i]} visible={false}>
          <ringGeometry args={[0.7, 1, 32]} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- model flyers ---------- */
type Path = (t: number) => THREE.Vector3;
/** Model forward axis fix per file (radians about y; 0 = the model faces +z). Tuned by eye. */
const YAW_FIX: Record<string, number> = {
  [M.dragon]: 0,
  [M.whale]: 0,
  [M.hawk]: 0,
  [M.blimp]: 0,
  [M.ufo]: 0,
  [M.balloon]: 0,
  [M.rocket]: 0,
};

function Flyer({
  url,
  size,
  clip,
  speed = 1,
  path,
  born,
  scaleAt,
  bank = 0.35,
  face = true,
  spin = 0,
  children,
  onPose,
}: {
  url: string;
  size: number;
  clip?: string;
  speed?: number;
  path: Path;
  born: number;
  scaleAt?: (t: number) => number;
  bank?: number;
  face?: boolean;
  spin?: number;
  children?: ReactNode;
  onPose?: (g: THREE.Group, t: number) => void;
}) {
  const age = useAge(born);
  const { obj, mixer } = useModel(url, size, { clip, center: true });
  useMixer(mixer, age, speed);
  const g = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const prevYaw = useRef<number | null>(null);
  useFrame(() => {
    const grp = g.current;
    const tr = turn.current;
    if (!grp || !tr) return;
    const t = age();
    const p = path(t);
    grp.position.copy(p);
    const sc = scaleAt ? scaleAt(t) : 1;
    grp.scale.setScalar(Math.max(0.0001, sc));
    grp.visible = sc > 0.001;
    if (face) {
      _a.copy(path(t + 0.06)).sub(p);
      const yaw = Math.atan2(_a.x, _a.z);
      const pitch = -Math.atan2(_a.y, Math.hypot(_a.x, _a.z));
      const last = prevYaw.current ?? yaw;
      let dy = yaw - last;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      prevYaw.current = yaw;
      tr.rotation.set(pitch * 0.6, yaw + (YAW_FIX[url] ?? 0), -dy * bank * 30, "YXZ");
    } else tr.rotation.set(0, t * spin + (YAW_FIX[url] ?? 0), 0);
    onPose?.(grp, t);
  });
  return (
    <group ref={g}>
      <group ref={turn}>
        <primitive object={obj} />
      </group>
      {children}
    </group>
  );
}

/** A flash and a puff of smoke: "out of nowhere". */
function Puff({ at, t0, born, color = "#ffb347", size = 3 }: { at: THREE.Vector3; t0: number; born: number; color?: string; size?: number }) {
  const age = useAge(born);
  const core = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const coreMat = useMemo(() => additive(color, 0), [color]);
  const smokeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6b6170", transparent: true, opacity: 0, depthWrite: false, roughness: 1 }), []);
  useFrame(() => {
    const d = age() - t0;
    const on = d >= 0 && d < 1.4;
    if (core.current) {
      core.current.visible = on;
      core.current.scale.setScalar(size * (0.2 + Math.min(1, d / 0.25) * 0.8));
      coreMat.opacity = on ? Math.max(0, 1 - d / 0.45) : 0;
    }
    if (ring.current) {
      ring.current.visible = on;
      ring.current.scale.setScalar(size * (0.5 + d * 0.9));
      smokeMat.opacity = on ? Math.max(0, 0.6 * (1 - d / 1.4)) : 0;
    }
    if (light.current) light.current.intensity = on ? Math.max(0, 1 - d / 0.5) * 120 : 0;
  });
  return (
    <group position={at}>
      <pointLight ref={light} color={color} intensity={0} distance={25} decay={1.3} />
      <mesh ref={core} material={coreMat} visible={false}>
        <sphereGeometry args={[0.5, 16, 12]} />
      </mesh>
      <mesh ref={ring} material={smokeMat} visible={false}>
        <icosahedronGeometry args={[0.55, 1]} />
      </mesh>
    </group>
  );
}

/** A stream of glowing particles, e.g. dragon fire or a rocket flame. */
function Stream({
  born,
  from,
  dir,
  on,
  count = 260,
  reach = 7,
  spread = 0.35,
  colors = ["#ffcf4a", "#ff7a1a", "#ff3a12"],
  size = 0.5,
  life = 0.55,
}: {
  born: number;
  from: () => THREE.Vector3;
  dir: () => THREE.Vector3;
  on: (t: number) => boolean;
  count?: number;
  reach?: number;
  spread?: number;
  colors?: string[];
  size?: number;
  life?: number;
}) {
  const age = useAge(born);
  const sets = useMemo(
    () =>
      colors.map((col, ci) => {
        const g = new THREE.BufferGeometry();
        const n = Math.floor(count / colors.length);
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
        const r = rng(500 + ci);
        const seed = Array.from({ length: n }, () => [r(), (r() - 0.5) * 2, (r() - 0.5) * 2] as const);
        const mat = new THREE.PointsMaterial({ color: col, size: size * (1 - ci * 0.2), sizeAttenuation: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        return { g, mat, seed, n, ci };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, size],
  );
  useFrame(() => {
    const t = age();
    const active = on(t);
    const o = from();
    const d = dir().normalize();
    _b.set(-d.z, 0, d.x).normalize();
    _s.crossVectors(d, _b).normalize();
    for (const set of sets) {
      set.mat.opacity = active ? 0.9 : 0;
      const arr = set.g.attributes.position.array as Float32Array;
      for (let i = 0; i < set.n; i++) {
        const [ph, sx, sy] = set.seed[i];
        const a = (((t / life + ph) % 1) + 1) % 1;
        const dist = a * reach * (0.75 + set.ci * 0.15);
        const w = spread * dist;
        arr[i * 3] = o.x + d.x * dist + (_b.x * sx + _s.x * sy) * w;
        arr[i * 3 + 1] = o.y + d.y * dist + (_b.y * sx + _s.y * sy) * w - a * a * 0.6;
        arr[i * 3 + 2] = o.z + d.z * dist + (_b.z * sx + _s.z * sy) * w;
      }
      set.g.attributes.position.needsUpdate = true;
    }
  });
  return (
    <group>
      {sets.map((s) => (
        <points key={s.ci} geometry={s.g} material={s.mat} frustumCulled={false} />
      ))}
    </group>
  );
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const fadeInOut = (t: number, end: number, inT = 0.5, outT = 0.8) => smooth(t / inT) * (1 - smooth((t - (end - outT)) / outT));

/* ---------- Hot Air Balloons ---------- */
function Balloons({ c }: { c: Ctx }) {
  const end = CELEB_SECONDS["cel-balloons"];
  return (
    <group>
      {[-3.2, 0, 3.2].map((x, i) => (
        <Flyer
          key={i}
          url={M.balloon}
          size={2.6}
          born={c.born}
          face={false}
          spin={0.25}
          path={(t) => V(x + Math.sin(t * 0.8 + i) * 0.4, 0.8 + Math.min(t, end) * (0.95 + i * 0.12) + (i === 1 ? 0.6 : 0), c.z + c.s * (1.6 + (i % 2) * 0.8))}
          scaleAt={(t) => fadeInOut(t - i * 0.25, end - i * 0.25, 0.6, 0.9)}
        />
      ))}
    </group>
  );
}

/* ---------- Team Blimp ---------- */
function Blimp({ c }: { c: Ctx }) {
  const end = CELEB_SECONDS["cel-blimp"];
  const beam = useMemo(() => additive(c.color, 0.16), [c.color]);
  return (
    <Flyer
      url={M.blimp}
      size={6.5}
      born={c.born}
      bank={0}
      path={(t) => V(-17 + (34 * t) / end, 7.6 + Math.sin(t * 1.3) * 0.25, c.z + c.s * 0.6)}
      scaleAt={(t) => fadeInOut(t, end, 0.4, 0.6)}
    >
      {[-1.2, 1.2].map((dx, i) => (
        <mesh key={i} position={[dx, -4.1, 0]} material={beam} rotation={[0, 0, dx * 0.12]}>
          <coneGeometry args={[1.5, 7.2, 24, 1, true]} />
        </mesh>
      ))}
    </Flyer>
  );
}

/* ---------- Hawk Squadron ---------- */
function Hawks({ c }: { c: Ctx }) {
  const end = CELEB_SECONDS["cel-hawks"];
  const slots: [number, number][] = [[0, 0], [-1.1, -1], [1.1, -1], [-2.2, -2], [2.2, -2], [-3.3, -3], [3.3, -3]];
  return (
    <group>
      {slots.map(([dz, dx], i) => (
        <Flyer
          key={i}
          url={M.hawk}
          size={1.5}
          born={c.born}
          clip="Fly"
          speed={1.4 + (i % 3) * 0.1}
          path={(t) => {
            const u = t / end;
            return V(-16 + 32 * u + dx * 1.1, 6.5 - 4.2 * Math.sin(Math.PI * Math.min(1, Math.max(0, u))) + Math.sin(t * 3 + i) * 0.12, c.z + dz * 0.9);
          }}
          scaleAt={(t) => fadeInOut(t, end, 0.3, 0.4)}
        />
      ))}
    </group>
  );
}

/* ---------- Sky Whale ---------- */
function Whale({ c }: { c: Ctx }) {
  const end = CELEB_SECONDS["cel-whale"];
  return (
    <Flyer
      url={M.whale}
      size={8}
      born={c.born}
      clip="Swim"
      speed={0.9}
      bank={0.15}
      path={(t) => {
        const u = t / end;
        return V(-18 + 36 * u, 7.5 + Math.sin(u * Math.PI) * 1.4 + Math.sin(t * 1.6) * 0.3, c.z + c.s * (2.5 - 4 * Math.sin(u * Math.PI)));
      }}
      scaleAt={(t) => fadeInOut(t, end, 0.6, 0.8)}
    />
  );
}

/* ---------- UFO Visit ---------- */
function Ufo({ c }: { c: Ctx }) {
  const age = useAge(c.born);
  const beamMat = useMemo(() => additive("#7cff6b", 0.22), []);
  const ringMat = useMemo(() => additive("#b6ff9a", 0.5), []);
  const beam = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const hover = V(0, 4.6, c.z);
  const path: Path = (t) => {
    if (t < 1.3) {
      const u = smooth(t / 1.3);
      return V(-11 * (1 - u), 15 - 10.4 * u, c.z + c.s * 5 * (1 - u));
    }
    if (t < 4.7) return V(Math.sin((t - 1.3) * 1.6) * 0.5, 4.6 + Math.sin(t * 3) * 0.15, c.z + Math.cos((t - 1.3) * 1.6) * 0.3 - 0.3);
    const u = (t - 4.7) / 1.4;
    return V(14 * u * u, 4.6 + 13 * u * u, c.z - c.s * 4 * u);
  };
  useFrame(() => {
    const t = age();
    const on = t > 1.4 && t < 4.6 ? smooth((t - 1.4) / 0.3) * (1 - smooth((t - 4.3) / 0.3)) : 0;
    beamMat.opacity = on * (0.18 + 0.08 * Math.sin(t * 14));
    ringMat.opacity = on * 0.55;
    if (beam.current) beam.current.visible = on > 0.01;
    if (ring.current) {
      ring.current.visible = on > 0.01;
      ring.current.scale.setScalar(1 + ((t * 1.5) % 1) * 0.6);
    }
  });
  return (
    <group>
      <Flyer url={M.ufo} size={3.4} born={c.born} face={false} spin={3} path={path} scaleAt={(t) => (t < 6.3 ? 1 : 0)} />
      <mesh ref={beam} position={[hover.x, hover.y / 2, hover.z]} material={beamMat} visible={false}>
        <coneGeometry args={[2.1, hover.y, 32, 1, true]} />
      </mesh>
      <mesh ref={ring} position={[0, 0.08, c.z]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat} visible={false}>
        <ringGeometry args={[1.6, 2.1, 40]} />
      </mesh>
    </group>
  );
}

/* ---------- Rocket Launch ---------- */
function Rocket({ c }: { c: Ctx }) {
  const age = useAge(c.born);
  const pad = V(0, 0, c.z + c.s * 1.4);
  const lift = 0.7;
  const yAt = (t: number) => (t < lift ? Math.sin(t * 60) * 0.02 : 0.5 * 7 * (t - lift) ** 2);
  const pop = lift + Math.sqrt((2 * 15) / 7); // bursts at ~15 high
  const burst = useRef<THREE.Points>(null);
  const burstGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const r = rng(77);
    const n = 700;
    const dirs = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const k = 0.85 + r() * 0.3;
      dirs[i * 3] = Math.sqrt(1 - u * u) * Math.cos(a) * k;
      dirs[i * 3 + 1] = u * k;
      dirs[i * 3 + 2] = Math.sqrt(1 - u * u) * Math.sin(a) * k;
    }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.userData.dirs = dirs;
    return g;
  }, []);
  const burstMat = useMemo(() => new THREE.PointsMaterial({ color: c.color, size: 0.35, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), [c.color]);
  useFrame(() => {
    const t = age();
    const d = t - pop;
    const pts = burst.current;
    if (!pts) return;
    pts.visible = d > 0 && d < 2.6;
    if (!pts.visible) return;
    const dirs = burstGeo.userData.dirs as Float32Array;
    const arr = burstGeo.attributes.position.array as Float32Array;
    const r = 7 * (1 - Math.exp(-2.2 * d));
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = pad.x + dirs[i] * r;
      arr[i + 1] = 15 + dirs[i + 1] * r - 0.6 * d * d;
      arr[i + 2] = pad.z + dirs[i + 2] * r;
    }
    burstGeo.attributes.position.needsUpdate = true;
    burstMat.opacity = Math.max(0, 1 - d / 2.6);
    burstMat.color.set(Math.floor(d * 6) % 2 ? "#ffffff" : c.color);
  });
  return (
    <group>
      <Flyer url={M.rocket} size={2.4} born={c.born} face={false} path={(t) => V(pad.x, Math.min(yAt(t), 16) + 1.2, pad.z)} scaleAt={(t) => (t < pop ? 1 : 0)} />
      <Stream
        born={c.born}
        from={() => V(pad.x, Math.min(yAt(age()), 16) + 0.05, pad.z)}
        dir={() => V(0, -1, 0)}
        on={(t) => t > 0.15 && t < pop}
        reach={2.6}
        spread={0.28}
        life={0.35}
        size={0.42}
        colors={["#fff2b0", "#ffb347", "#ff5a1a"]}
      />
      <Puff at={V(pad.x, 0.6, pad.z)} t0={lift - 0.1} born={c.born} color="#ffd27a" size={3.4} />
      <points ref={burst} geometry={burstGeo} material={burstMat} frustumCulled={false} visible={false} />
    </group>
  );
}

/* ---------- Dragon Flyover ---------- */
function Dragon({ c }: { c: Ctx }) {
  const age = useAge(c.born);
  const end = CELEB_SECONDS["cel-dragon"];
  const appear = 0.25;
  const vanish = end - 0.9;
  const R = 6;
  const theta = (t: number) => Math.PI + ((t - appear) / (vanish - appear)) * Math.PI * 2.2;
  const path: Path = (t) => {
    const th = theta(t);
    return V(Math.cos(th) * R, 6.8 + Math.sin(t * 2.2) * 0.45 - Math.sin(((t - appear) / (vanish - appear)) * Math.PI) * 1.2, c.z + c.s * 0.8 + Math.sin(th) * R * 0.65);
  };
  const head = () => {
    const t = age();
    const p = path(t);
    const f = path(t + 0.06).sub(p).normalize();
    return p.addScaledVector(f, 2.6).add(V(0, 0.4, 0));
  };
  const breath = () => {
    const t = age();
    const p = path(t);
    const f = path(t + 0.06).sub(p).normalize();
    // forward and down toward the end zone
    return f.multiplyScalar(0.6).add(V(0, 0, c.z).sub(p).normalize());
  };
  const start = path(appear);
  const stop = path(vanish);
  return (
    <group>
      <Puff at={start} t0={appear - 0.05} born={c.born} color="#c06bff" size={4} />
      <Flyer
        url={M.dragon}
        size={6.5}
        born={c.born}
        clip="Fast_Flying"
        speed={1.15}
        bank={0.5}
        path={path}
        scaleAt={(t) => (t < appear ? 0 : t < appear + 0.3 ? smooth((t - appear) / 0.3) : t < vanish ? 1 : 1 - smooth((t - vanish) / 0.25))}
      />
      <Stream born={c.born} from={head} dir={breath} on={(t) => t > 2 && t < 4.4} reach={6.5} spread={0.3} life={0.55} size={0.6} />
      <Puff at={stop} t0={vanish} born={c.born} color="#c06bff" size={4} />
    </group>
  );
}

const EFFECT: Record<string, (p: { c: Ctx }) => ReactNode> = {
  "cel-confetti": Confetti,
  "cel-coins": Coins,
  "cel-lasers": Lasers,
  "cel-thunder": Thunder,
  "cel-balloons": Balloons,
  "cel-blimp": Blimp,
  "cel-hawks": Hawks,
  "cel-whale": Whale,
  "cel-ufo": Ufo,
  "cel-rocket": Rocket,
  "cel-dragon": Dragon,
};

/** The celebration show: renders the latest cue's effect over its end zone until it is over. */
export default function Celebrations({ cue }: { cue: CelebrateCue | null }) {
  const clock = useThree((s) => s.clock);
  const [live, setLive] = useState<(CelebrateCue & { born: number })[]>([]);
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!cue || seen.current === cue.id || !EFFECT[cue.kind]) return;
    seen.current = cue.id;
    setLive((list) => [...list.slice(-1), { ...cue, born: clock.elapsedTime }]);
  }, [cue, clock]);
  useFrame(() => {
    if ((window as unknown as { __fbCelT?: number }).__fbCelT != null) return;
    const now = clock.elapsedTime;
    if (live.some((l) => now - l.born > (CELEB_SECONDS[l.kind] ?? 6) + 0.3)) setLive((list) => list.filter((l) => now - l.born <= (CELEB_SECONDS[l.kind] ?? 6) + 0.3));
  });
  return (
    <group>
      {live.map((l) => {
        const Fx = EFFECT[l.kind];
        const ctx: Ctx = { z: l.z, s: l.z >= 0 ? 1 : -1, color: l.color ?? "#2ee6ff", born: l.born, half: 4 };
        return (
          <Suspense key={l.id} fallback={null}>
            <Fx c={ctx} />
          </Suspense>
        );
      })}
    </group>
  );
}
