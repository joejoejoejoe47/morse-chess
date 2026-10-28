import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { asset } from "@/lib/base";

/* Touchdown fireworks. The particle animation is "Fireworks Demo - Free Download" by Laurie Annis
   (Sketchfab, CC BY 4.0, credited in public/football/CREDITS.md). The 9 MB GLB (2,200 animated cubes)
   was baked offline by tools/fwbake.mjs into fireworks-<hash>.bin: 12 frames a second, only the frames
   where each spark is visible, 16-bit positions, gzip (about 230 KB). Here every firework is one
   THREE.Points draw call with a glowing additive sprite, tinted in a team colour. */

const FILE = "/football/fireworks-53e482d4e1.bin";

type Track = { F: number; FPS: number; N: number; a0: Uint16Array; len: Uint16Array; off: Uint32Array; pos: Float32Array; size: Uint8Array };

let cache: Promise<Track> | null = null;

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf; // the server already un-gzipped it
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export function loadFireworks(): Promise<Track> {
  cache ??= fetch(asset(FILE))
    .then((r) => {
      if (!r.ok) throw new Error(`fireworks ${r.status}`);
      return r.arrayBuffer();
    })
    .then(gunzip)
    .then((buf) => {
      const v = new DataView(buf);
      const F = v.getUint16(4, true);
      const FPS = v.getUint16(6, true);
      const N = v.getUint32(8, true);
      const a0 = new Uint16Array(N);
      const len = new Uint16Array(N);
      const off = new Uint32Array(N);
      let total = 0;
      for (let i = 0; i < N; i++) {
        a0[i] = v.getUint16(12 + i * 4, true);
        len[i] = v.getUint16(14 + i * 4, true);
        off[i] = total;
        total += len[i];
      }
      const base = 12 + N * 4;
      const q = new Int16Array(buf.slice(base, base + total * 6));
      const size = new Uint8Array(buf.slice(base + total * 6, base + total * 7));
      const pos = new Float32Array(total * 3);
      for (let i = 0; i < N; i++) {
        let x = 0, y = 0, z = 0;
        for (let j = 0; j < len[i]; j++) {
          const k = off[i] + j;
          x += q[k * 3];
          y += q[k * 3 + 1];
          z += q[k * 3 + 2];
          pos[k * 3] = x / 400;
          pos[k * 3 + 1] = y / 400;
          pos[k * 3 + 2] = z / 400;
        }
      }
      return { F, FPS, N, a0, len, off, pos, size };
    })
    .catch((err) => {
      cache = null;
      throw err;
    });
  return cache;
}

const VERT = `
attribute float aAlpha;
uniform float uSize;
uniform float uViewH;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * aAlpha * projectionMatrix[1][1] * uViewH * 0.5 / max(0.1, -mv.z), 0.0, 30.0);
  vAlpha = aAlpha;
}`;
const FRAG = `
uniform vec3 uColor;
uniform float uHot;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  float core = exp(-r * 7.0);
  float glow = exp(-r * 2.2) * 0.55;
  vec3 col = mix(uColor, vec3(1.0), core * (0.12 + uHot * 0.22));
  gl_FragColor = vec4(col * (core * 0.8 + glow) * min(1.0, vAlpha * 1.3) * 0.75, 1.0);
}`;

type Shell = { x: number; z: number; color: string; delay: number; scale: number; spin: number };

function Burst({ track, shell, born, onDone }: { track: Track; shell: Shell; born: number; onDone: () => void }) {
  const size = useThree((s) => s.size);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(track.N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(track.N), 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e4);
    return g;
  }, [track]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(shell.color) }, uSize: { value: 0.26 }, uViewH: { value: 800 }, uHot: { value: 1 } },
      }),
    [shell.color],
  );
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const done = useRef(false);
  const SPEED = 1.35;
  useFrame(({ clock }) => {
    mat.uniforms.uViewH.value = size.height;
    // __fbFwT pins the show at one moment, for screenshots only
    const pin = (window as unknown as { __fbFwT?: number }).__fbFwT;
    const t = ((pin ?? clock.elapsedTime - born) - shell.delay) * SPEED;
    const p = geo.attributes.position.array as Float32Array;
    const al = geo.attributes.aAlpha.array as Float32Array;
    if (t < 0) {
      al.fill(0);
      geo.attributes.aAlpha.needsUpdate = true;
      return;
    }
    const fr = t * track.FPS;
    if (fr >= track.F - 1) {
      if (!done.current) {
        done.current = true;
        onDone();
      }
      return;
    }
    mat.uniforms.uHot.value = Math.max(0, 1 - Math.max(0, t - 2.5) / 2);
    const f0 = Math.floor(fr);
    const u = fr - f0;
    const s = shell.scale;
    const cs = Math.cos(shell.spin);
    const sn = Math.sin(shell.spin);
    for (let i = 0; i < track.N; i++) {
      const j = f0 - track.a0[i];
      const L = track.len[i];
      if (j < 0 || j >= L) {
        al[i] = 0;
        continue;
      }
      const k0 = track.off[i] + j;
      const k1 = j + 1 < L ? k0 + 1 : k0;
      const x = track.pos[k0 * 3] + (track.pos[k1 * 3] - track.pos[k0 * 3]) * u;
      const y = track.pos[k0 * 3 + 1] + (track.pos[k1 * 3 + 1] - track.pos[k0 * 3 + 1]) * u;
      const z = track.pos[k0 * 3 + 2] + (track.pos[k1 * 3 + 2] - track.pos[k0 * 3 + 2]) * u;
      const wy = y * s;
      p[i * 3] = shell.x + (x * cs - z * sn) * s;
      p[i * 3 + 1] = wy;
      p[i * 3 + 2] = shell.z + (x * sn + z * cs) * s;
      // sparks dim as they age and fade out near the end of their own life and near the ground
      const life = 1 - j / L;
      const big = track.size[k0] / 100;
      al[i] = big * Math.min(1, life * 4) * Math.min(1, Math.max(0, wy - 0.15) * 2);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/** Two bursts each side of the end zone that was scored in, one cyan and one magenta per side. */
export default function Fireworks({ burst, side }: { burst: { id: number; z: number } | null; side: number }) {
  const [track, setTrack] = useState<Track | null>(null);
  const clock = useThree((s) => s.clock);
  const [shows, setShows] = useState<{ id: number; born: number; shells: Shell[]; left: number }[]>([]);
  // fetched as soon as the football stadium is open, so the first touchdown has no wait
  useEffect(() => {
    let live = true;
    loadFireworks().then((t) => live && setTrack(t)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!burst || !track || seen.current === burst.id) return;
    seen.current = burst.id;
    const z = burst.z;
    const shells: Shell[] = [
      { x: -side, z: z - 0.7, color: "#2ee6ff", delay: 0, scale: 0.125, spin: 0.3 },
      { x: side, z: z + 0.7, color: "#ff2d7a", delay: 0.25, scale: 0.095, spin: 1.9 },
      { x: -side, z: z + 0.9, color: "#ff2d7a", delay: 0.6, scale: 0.11, spin: 3.4 },
      { x: side, z: z - 0.9, color: "#2ee6ff", delay: 0.85, scale: 0.085, spin: 4.8 },
    ];
    setShows((list) => [...list, { id: burst.id, born: clock.elapsedTime, shells, left: shells.length }]);
  }, [burst, track, side, clock]);
  if (!track) return null;
  return (
    <group>
      {shows.map((show) =>
        show.shells.map((shell, i) => (
          <Burst
            key={`${show.id}:${i}`}
            track={track}
            shell={shell}
            born={show.born}
            onDone={() =>
              setShows((list) => list.flatMap((s) => (s.id !== show.id ? [s] : s.left <= 1 ? [] : [{ ...s, left: s.left - 1 }])))
            }
          />
        )),
      )}
    </group>
  );
}
