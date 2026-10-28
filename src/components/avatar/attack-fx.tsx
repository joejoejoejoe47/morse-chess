import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AttackItem } from "@/lib/avatar/catalog";

/**
 * The extra effect drawn on top of an AN king attack clip. Everything is in the king's own
 * space (he faces +z), so it follows the figure on the board, in the AV cabinet and in the store.
 * `clock.current` is the time the strike started (seconds, -1 when idle), set by the Figurine.
 */
export function AttackFx({ fx, clock }: { fx: AttackItem["fx"]; clock: MutableRefObject<number> }) {
  if (!fx) return null;
  if (fx === "spin") return <SpinRing clock={clock} />;
  if (fx === "leap") return <Shockwave clock={clock} />;
  if (fx === "fire") return <Fireball clock={clock} />;
  if (fx === "thunder") return <Thunder clock={clock} />;
  return <Sparks clock={clock} />;
}

/** Seconds since the strike started, or -1. */
function ageOf(clock: MutableRefObject<number>, now: number) {
  return clock.current < 0 ? -1 : now - clock.current;
}

const glow = (color: string, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });

function SpinRing({ clock }: { clock: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const mats = useMemo(() => [glow("#ffd76a", 0.9), glow("#fff3c0", 0.7), glow("#ffb52e", 0.6)], []);
  useFrame(({ clock: c }) => {
    const g = group.current;
    if (!g) return;
    const age = ageOf(clock, c.elapsedTime);
    const on = age >= 0.05 && age < 1.25;
    g.visible = on;
    if (!on) return;
    const p = (age - 0.05) / 1.2;
    g.rotation.y = age * 16;
    const s = 0.75 + p * 0.7;
    g.scale.set(s, 1, s);
    const fade = Math.sin(Math.min(1, p) * Math.PI);
    mats[0].opacity = 0.9 * fade;
    mats[1].opacity = 0.7 * fade;
    mats[2].opacity = 0.55 * fade;
  });
  return (
    <group ref={group} visible={false}>
      <mesh position={[0, 0.35, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats[0]}>
        <torusGeometry args={[0.62, 0.035, 8, 48, Math.PI * 1.6]} />
      </mesh>
      <mesh position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 1.3]} material={mats[1]}>
        <torusGeometry args={[0.52, 0.025, 8, 48, Math.PI * 1.3]} />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 2.4]} material={mats[2]}>
        <torusGeometry args={[0.72, 0.05, 8, 48, Math.PI * 1.1]} />
      </mesh>
      <pointLight position={[0, 0.6, 0]} color="#ffcf5a" intensity={2.2} distance={3} />
    </group>
  );
}

function Shockwave({ clock }: { clock: MutableRefObject<number> }) {
  const ring = useRef<THREE.Mesh>(null);
  const dust = useRef<THREE.Group>(null);
  const mat = useMemo(() => glow("#9fe7ff", 0.9), []);
  const dustMat = useMemo(() => glow("#e8f6ff", 0.7), []);
  const bits = useMemo(() => Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2), []);
  useFrame(({ clock: c }) => {
    const age = ageOf(clock, c.elapsedTime);
    const land = 0.62;
    const on = age >= land && age < land + 0.6;
    if (ring.current) ring.current.visible = on;
    if (dust.current) dust.current.visible = on;
    if (!on) return;
    const p = (age - land) / 0.6;
    const r = 0.25 + p * 1.6;
    ring.current?.scale.set(r, r, 1);
    mat.opacity = 0.9 * (1 - p);
    dustMat.opacity = 0.7 * (1 - p);
    dust.current?.children.forEach((child, i) => {
      const a = bits[i];
      child.position.set(Math.sin(a) * r * 0.9, 0.05 + Math.sin(p * Math.PI) * 0.35, 0.3 + Math.cos(a) * r * 0.9);
    });
  });
  return (
    <group>
      <mesh ref={ring} position={[0, 0.03, 0.3]} rotation={[-Math.PI / 2, 0, 0]} visible={false} material={mat}>
        <ringGeometry args={[0.82, 1, 48]} />
      </mesh>
      <group ref={dust} visible={false}>
        {bits.map((a) => (
          <mesh key={a} material={dustMat}>
            <sphereGeometry args={[0.06, 8, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Fireball({ clock }: { clock: MutableRefObject<number> }) {
  const orb = useRef<THREE.Group>(null);
  const boom = useRef<THREE.Mesh>(null);
  const core = useMemo(() => glow("#fff1a8", 1), []);
  const shell = useMemo(() => glow("#ff7a1a", 0.75), []);
  const blast = useMemo(() => glow("#ff9a2e", 0.9), []);
  useFrame(({ clock: c }) => {
    const age = ageOf(clock, c.elapsedTime);
    const fly0 = 0.32;
    const fly1 = 0.78;
    const flying = age >= fly0 && age < fly1;
    if (orb.current) {
      orb.current.visible = flying;
      if (flying) {
        const p = (age - fly0) / (fly1 - fly0);
        orb.current.position.set(0, 0.95 - p * 0.35 + Math.sin(p * Math.PI) * 0.15, 0.45 + p * 1.5);
        const wob = 1 + Math.sin(age * 40) * 0.12;
        orb.current.scale.setScalar((0.6 + p * 0.5) * wob);
      }
    }
    const hit = age >= fly1 && age < fly1 + 0.42;
    if (boom.current) {
      boom.current.visible = hit;
      if (hit) {
        const p = (age - fly1) / 0.42;
        boom.current.scale.setScalar(0.3 + p * 1.1);
        blast.opacity = 0.9 * (1 - p);
      }
    }
  });
  return (
    <group>
      <group ref={orb} visible={false}>
        <mesh material={core}>
          <sphereGeometry args={[0.13, 16, 12]} />
        </mesh>
        <mesh material={shell}>
          <sphereGeometry args={[0.22, 16, 12]} />
        </mesh>
        <mesh material={shell} position={[0, 0, -0.18]} scale={[0.7, 0.7, 1.4]}>
          <sphereGeometry args={[0.16, 12, 10]} />
        </mesh>
        <pointLight color="#ff8a2a" intensity={3.2} distance={3.5} />
      </group>
      <mesh ref={boom} position={[0, 0.6, 1.95]} visible={false} material={blast}>
        <sphereGeometry args={[0.45, 18, 14]} />
      </mesh>
    </group>
  );
}

/** A jagged bolt from the sky onto the square in front of the king. */
function boltPoints(seed: number) {
  const pts: THREE.Vector3[] = [];
  let x = 0;
  let z = 1.5;
  let r = seed;
  const rnd = () => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280 - 0.5;
  };
  for (let i = 0; i <= 9; i++) {
    const y = 4.2 - (i / 9) * 4.2;
    pts.push(new THREE.Vector3(x, y, z));
    x += rnd() * 0.45;
    z += rnd() * 0.3;
    if (i === 8) {
      x = 0;
      z = 1.5;
    }
  }
  return pts;
}

function Thunder({ clock }: { clock: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const flash = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const boltMat = useMemo(() => glow("#e9f4ff", 1), []);
  const haloMat = useMemo(() => glow("#7fb8ff", 0.6), []);
  const flashMat = useMemo(() => glow("#bcd9ff", 0.8), []);
  const tubes = useMemo(
    () =>
      [11, 73].map((seed) => {
        const curve = new THREE.CatmullRomCurve3(boltPoints(seed), false, "catmullrom", 0.1);
        return [new THREE.TubeGeometry(curve, 40, 0.025, 5), new THREE.TubeGeometry(curve, 40, 0.075, 6)] as const;
      }),
    [],
  );
  useFrame(({ clock: c }) => {
    const age = ageOf(clock, c.elapsedTime);
    const t0 = 0.5;
    const on = age >= t0 && age < t0 + 0.55;
    const g = group.current;
    if (g) {
      g.visible = on;
      if (on) {
        const step = Math.floor((age - t0) * 22);
        g.children.forEach((child, i) => {
          child.visible = (step + i) % 3 !== 0;
        });
      }
    }
    if (flash.current) {
      flash.current.visible = on;
      if (on) {
        const p = (age - t0) / 0.55;
        flash.current.scale.setScalar(0.4 + p * 1.4);
        flashMat.opacity = 0.8 * (1 - p);
      }
    }
    if (light.current) light.current.intensity = on ? 6 * (1 - (age - t0) / 0.55) : 0;
  });
  return (
    <group>
      <group ref={group} visible={false}>
        {tubes.map(([thin, thick], i) => (
          <group key={i}>
            <mesh geometry={thin} material={boltMat} />
            <mesh geometry={thick} material={haloMat} />
          </group>
        ))}
      </group>
      <mesh ref={flash} position={[0, 0.03, 1.5]} rotation={[-Math.PI / 2, 0, 0]} visible={false} material={flashMat}>
        <circleGeometry args={[0.9, 32]} />
      </mesh>
      <pointLight ref={light} position={[0, 1.4, 1.5]} color="#a9ccff" intensity={0} distance={5} />
    </group>
  );
}

function Sparks({ clock }: { clock: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const mat = useMemo(() => glow("#ffd34a", 1), []);
  const dirs = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 0.9, 0.5 + Math.abs(Math.sin(a * 3)) * 0.9, 0.4 + Math.sin(a) * 0.5);
      }),
    [],
  );
  useFrame(({ clock: c }) => {
    const g = group.current;
    if (!g) return;
    const age = ageOf(clock, c.elapsedTime);
    const t0 = 0.55;
    const on = age >= t0 && age < t0 + 0.45;
    g.visible = on;
    if (!on) return;
    const p = (age - t0) / 0.45;
    mat.opacity = 1 - p;
    g.children.forEach((child, i) => {
      if (!(child instanceof THREE.Mesh)) return;
      const d = dirs[i];
      child.position.set(d.x * p * 0.8, 0.15 + d.y * p * 0.8 - p * p * 0.5, 0.75 + d.z * p * 0.8);
    });
  });
  return (
    <group ref={group} visible={false}>
      {dirs.map((_, i) => (
        <mesh key={i} material={mat}>
          <sphereGeometry args={[0.035, 6, 5]} />
        </mesh>
      ))}
      <pointLight position={[0, 0.4, 0.8]} color="#ffcf4a" intensity={2.5} distance={2.5} />
    </group>
  );
}
