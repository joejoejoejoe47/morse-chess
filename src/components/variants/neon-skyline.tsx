import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* The city beyond the Neon stadium: a ring of low-poly towers (one instanced mesh, one draw call)
   with a light sprinkle of lit windows drawn in the shader, a few soft neon roof strips and a
   purple glow on the horizon. Nothing here is fogged so it reads as a far-away silhouette. */

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

const towerVert = /* glsl */ `
  attribute float aSeed;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vSeed;
  varying float vTop;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vSeed = aSeed;
    vTop = position.y; // 0 at the street, 1 at the roof (geometry is a unit box sitting on y=0)
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const towerFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vSeed;
  varying float vTop;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    // dark blue-violet glass, a touch lighter near the roof where the city glow hits it
    vec3 base = mix(vec3(0.006, 0.005, 0.016), vec3(0.02, 0.015, 0.045), smoothstep(0.0, 1.0, vTop));
    float side = abs(vNormalW.y) < 0.5 ? 1.0 : 0.0;
    vec3 col = base * (0.8 + 0.25 * abs(vNormalW.x));
    if (side > 0.5) {
      float u = abs(vNormalW.x) > 0.5 ? vWorld.z : vWorld.x;
      vec2 cell = vec2(u / 0.55, vWorld.y / 0.62);
      vec2 id = floor(cell);
      vec2 f = fract(cell);
      float pane = step(0.22, f.x) * step(f.x, 0.78) * step(0.25, f.y) * step(f.y, 0.75);
      float h = hash(id + vSeed * 17.0);
      float lit = step(0.915, h) * pane * step(0.6, vWorld.y);
      // a very slow twinkle on a few windows
      float tw = 0.75 + 0.25 * sin(uTime * 0.6 + h * 40.0);
      vec3 warm = vec3(1.0, 0.78, 0.45);
      vec3 cool = vec3(0.55, 0.9, 1.0);
      vec3 win = mix(warm, cool, step(0.965, h)) * 0.7 * tw;
      col = mix(col, win, lit);
    }
    // the bottom of the city melts into the haze
    float haze = 1.0 - smoothstep(0.0, 4.5, vWorld.y);
    col = mix(col, vec3(0.06, 0.018, 0.1), haze * 0.75);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skyFrag = /* glsl */ `
  varying vec3 vDir;
  void main() {
    float y = vDir.y;
    vec3 top = vec3(0.004, 0.004, 0.014);
    vec3 glow = vec3(0.11, 0.03, 0.17);
    vec3 pinkish = vec3(0.17, 0.03, 0.1);
    float band = exp(-max(y, 0.0) * 4.5);
    // the glow is a little pinker on one side and bluer on the other
    vec3 g = mix(glow, pinkish, 0.5 + 0.5 * vDir.z);
    vec3 col = mix(top, g, band * 0.85);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const NEON = ["#2ee6ff", "#ff2d7a", "#a04bff", "#ffb02e"];

export function NeonSkyline({ hw, hl }: { hw: number; hl: number }) {
  const { towers, strips, beacons, towerMat, skyMat } = useMemo(() => {
    const r = rng(9137);
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const list: { x: number; z: number; w: number; d: number; h: number; rot: number }[] = [];
    // three loose rings of buildings around the bowl; taller ones further out
    const rings = [
      { rx: hw + 13, rz: hl + 12, n: 30, h: [5, 11] },
      { rx: hw + 19, rz: hl + 18, n: 36, h: [8, 17] },
      { rx: hw + 27, rz: hl + 26, n: 44, h: [11, 26] },
    ];
    for (const ring of rings) {
      for (let i = 0; i < ring.n; i++) {
        const a = (i / ring.n) * Math.PI * 2 + r() * 0.08;
        const jitter = 1 + (r() - 0.5) * 0.14;
        const x = Math.cos(a) * ring.rx * jitter;
        const z = Math.sin(a) * ring.rz * jitter;
        const tall = r() < 0.12 ? 1.45 : 1;
        list.push({ x, z, w: 1.6 + r() * 2.4, d: 1.6 + r() * 2.4, h: (ring.h[0] + r() * (ring.h[1] - ring.h[0])) * tall, rot: -a + (r() - 0.5) * 0.3 });
      }
    }
    const towers = new THREE.InstancedMesh(box, undefined as unknown as THREE.Material, list.length);
    const seeds = new Float32Array(list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    list.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rot);
      m.compose(new THREE.Vector3(b.x, 0, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
      towers.setMatrixAt(i, m);
      seeds[i] = r();
    });
    box.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    const towerMat = new THREE.ShaderMaterial({ vertexShader: towerVert, fragmentShader: towerFrag, uniforms: { uTime: { value: 0 } }, fog: false });
    towers.material = towerMat;
    towers.frustumCulled = false;

    // soft neon roof strips on about one in five towers
    const stripGeo = new THREE.BoxGeometry(1, 0.12, 1);
    const picks = list.filter(() => r() < 0.22);
    const strips = new THREE.InstancedMesh(stripGeo, new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, transparent: true, opacity: 0.6 }), picks.length);
    const c = new THREE.Color();
    picks.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rot);
      m.compose(new THREE.Vector3(b.x, b.h * (0.55 + r() * 0.42), b.z), q, new THREE.Vector3(b.w * 1.02, 1, b.d * 1.02));
      strips.setMatrixAt(i, m);
      strips.setColorAt(i, c.set(NEON[Math.floor(r() * NEON.length)]).multiplyScalar(0.8));
    });
    strips.frustumCulled = false;

    // red blinking-free beacons on the tallest towers
    const tallest = [...list].sort((a, b) => b.h - a.h).slice(0, 10);
    const beaconGeo = new THREE.SphereGeometry(0.16, 6, 4);
    const beacons = new THREE.InstancedMesh(beaconGeo, new THREE.MeshBasicMaterial({ color: "#ff4a5e", toneMapped: false, fog: false }), tallest.length);
    tallest.forEach((b, i) => {
      m.makeTranslation(b.x, b.h + 0.2, b.z);
      beacons.setMatrixAt(i, m);
    });
    beacons.frustumCulled = false;

    const skyMat = new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false });
    return { towers, strips, beacons, towerMat, skyMat };
  }, [hw, hl]);
  useEffect(
    () => () => {
      towers.geometry.dispose();
      towerMat.dispose();
      strips.geometry.dispose();
      (strips.material as THREE.Material).dispose();
      beacons.geometry.dispose();
      (beacons.material as THREE.Material).dispose();
      skyMat.dispose();
    },
    [towers, strips, beacons, towerMat, skyMat],
  );
  useFrame(({ clock }) => {
    towerMat.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <group>
      <mesh material={skyMat} renderOrder={-10}>
        <sphereGeometry args={[90, 24, 12]} />
      </mesh>
      {/* dark ground out to the city so nothing floats */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <circleGeometry args={[95, 32]} />
        <meshBasicMaterial color="#05040c" fog={false} />
      </mesh>
      <primitive object={towers} />
      <primitive object={strips} />
      <primitive object={beacons} />
    </group>
  );
}
