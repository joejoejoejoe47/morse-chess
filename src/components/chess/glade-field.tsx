import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export const GLADE_PITCH = 2;

export function gladeHeight(x: number, z: number) {
  const board = 4 * GLADE_PITCH;
  const court = Math.max(Math.abs(x), Math.abs(z));
  const mask = THREE.MathUtils.smoothstep(court, board + 0.15, board + 9);
  const roll =
    Math.sin(x * 0.07) * Math.cos(z * 0.06) * 0.55 +
    Math.sin(x * 0.15 + 0.7) * Math.sin(z * 0.13) * 0.22 +
    Math.cos(x * 0.038 - z * 0.032) * 0.7;
  const lawn = Math.sin(x * 0.28) * Math.cos(z * 0.24) * 0.12 + Math.sin(x * 0.7 + z * 0.55) * 0.04;
  return roll * mask + lawn * (1 - mask);
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function makeReed() {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 5);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) * (1 - y * 0.9));
    pos.setZ(i, Math.sin(y * Math.PI) * 0.12);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeLeafMap() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 256, 256);
  const blobs = [
    ["#1e4a22", 128, 150, 70, 46],
    ["#2f6b30", 100, 120, 54, 36],
    ["#3f8a38", 150, 118, 58, 34],
    ["#6aaa44", 118, 96, 40, 26],
    ["#245c28", 146, 168, 48, 30],
    ["#8cbc58", 90, 150, 36, 22],
    ["#163818", 128, 132, 90, 58],
  ] as const;
  for (const [color, x, y, rx, ry] of blobs) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, (x - 128) * 0.01, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBloomMap() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 64, 96);
  ctx.strokeStyle = "#2f6a32";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(32, 94);
  ctx.lineTo(32, 48);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.fillStyle = i % 2 ? "#f4efe2" : "#f2d56a";
    ctx.beginPath();
    ctx.ellipse(32 + Math.cos(a) * 12, 36 + Math.sin(a) * 10, 7, 4, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#e2b23a";
  ctx.beginPath();
  ctx.arc(32, 36, 4, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float sNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = sHash(i);
    float b = sHash(i + vec2(1.0, 0.0));
    float c = sHash(i + vec2(0.0, 1.0));
    float d = sHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float sFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * sNoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 zenith = vec3(0.23, 0.46, 0.78);
    vec3 mid = vec3(0.55, 0.74, 0.88);
    vec3 horizon = vec3(0.86, 0.84, 0.74);
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.35, h));
    col = mix(col, zenith, smoothstep(0.2, 0.85, h));
    vec2 cuv = dir.xz / max(dir.y + 0.35, 0.2);
    float cloud = smoothstep(0.52, 0.72, sFbm(cuv * 1.6));
    col = mix(col, vec3(0.96, 0.97, 0.98), cloud * smoothstep(0.02, 0.25, dir.y));
    float sun = pow(max(dot(dir, normalize(vec3(0.72, 0.48, 0.28))), 0.0), 48.0);
    col += vec3(1.0, 0.86, 0.55) * sun;
    gl_FragColor = vec4(col, 1.0);
  }
`;

type Sprout = {
  x: number;
  z: number;
  rot: number;
  trunkR: number;
  h: number;
  bark: string;
  leaf: string;
  kind: 0 | 1 | 2;
};

function buildForest() {
  const board = 4 * GLADE_PITCH;
  const trees: Sprout[] = [];
  for (let i = 0; i < 360 && trees.length < 96; i++) {
    const a = hash(i * 1.7) * Math.PI * 2;
    const near = hash(i + 5) < 0.55;
    const rad = near ? board + 3.4 + hash(i + 9) * 7 : board + 12 + hash(i + 9) * 24;
    const x = Math.cos(a) * rad + (hash(i + 13) - 0.5) * 2;
    const z = Math.sin(a) * rad + (hash(i + 21) - 0.5) * 2;
    if (Math.abs(x) < board + 1.8 && Math.abs(z) < board + 1.8) continue;
    const gap = near ? 2.8 : 3.6;
    if (trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < gap * gap)) continue;
    const roll = hash(i + 19);
    const kind: 0 | 1 | 2 = roll < 0.34 ? 0 : roll < 0.78 ? 1 : 2;
    const h = kind === 0 ? 9 + hash(i + 3) * 8 : kind === 2 ? 7 + hash(i + 3) * 4 : 6.5 + hash(i + 3) * 5;
    const bark = kind === 2 ? "#e4dccb" : hash(i + 6) > 0.5 ? "#6a4630" : "#3c291c";
    const leaf = kind === 0 ? (hash(i + 8) > 0.5 ? "#1d4a28" : "#2a6234") : kind === 2 ? "#7ea84a" : hash(i + 8) > 0.5 ? "#3d7a34" : "#2f6a2c";
    trees.push({
      x,
      z,
      rot: hash(i + 15) * Math.PI * 2,
      trunkR: kind === 2 ? 0.1 + hash(i + 2) * 0.04 : 0.16 + hash(i + 2) * 0.14,
      h,
      bark,
      leaf,
      kind,
    });
  }
  const rocks: { x: number; z: number; s: number; rot: number; c: string }[] = [];
  for (let i = 0; i < 34; i++) {
    const a = hash(i + 140) * Math.PI * 2;
    const rad = board + 2.2 + hash(i + 141) * 16;
    rocks.push({
      x: Math.cos(a) * rad,
      z: Math.sin(a) * rad,
      s: 0.35 + hash(i + 142) * 0.7,
      rot: hash(i + 143) * Math.PI,
      c: hash(i + 144) > 0.5 ? "#8d8478" : "#5c564c",
    });
  }
  const flowers: { x: number; z: number }[] = [];
  for (let i = 0; i < 90; i++) {
    const a = hash(i + 200) * Math.PI * 2;
    const rad = board + 0.8 + hash(i + 201) * 6.5;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    if (Math.abs(x) < board - 0.2 && Math.abs(z) < board - 0.2) continue;
    flowers.push({ x, z });
  }
  return { trees, rocks, flowers };
}

function stamp(mesh: THREE.InstancedMesh, count: number, place: (i: number, dummy: THREE.Object3D, color: THREE.Color) => void) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.quaternion.identity();
    place(i, dummy, color);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
}

export function MeadowField() {
  const forest = useMemo(() => {
    const data = buildForest();
    const ground = new THREE.PlaneGeometry(150, 150, 128, 128);
    ground.rotateX(-Math.PI / 2);
    const pos = ground.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, gladeHeight(pos.getX(i), pos.getZ(i)));
    ground.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.96, metalness: 0 });
    groundMat.customProgramCacheKey = () => "glade-ground";
    groundMat.onBeforeCompile = (shader) => {
      shader.uniforms.uPitch = { value: GLADE_PITCH };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vGladeW;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGladeW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
varying vec3 vGladeW;
uniform float uPitch;
float gHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gNoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);float a=gHash(i);float b=gHash(i+vec2(1.0,0.0));float c=gHash(i+vec2(0.0,1.0));float d=gHash(i+vec2(1.0,1.0));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float gFbm(vec2 p){float v=0.0;float a=0.5;for(int i=0;i<5;i++){v+=a*gNoise(p);p*=2.03;a*=0.5;}return v;}`)
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
{
  vec2 w = vGladeW.xz;
  float n = gFbm(w * 0.22);
  float fine = gFbm(w * 1.7);
  float micro = gNoise(w * 14.0);
  float streak = sin(w.x * 42.0 + micro * 9.0) * sin(w.y * 37.0 - micro * 7.0);
  streak = smoothstep(-0.2, 0.85, streak);
  vec3 soil = vec3(0.16, 0.09, 0.045);
  vec3 shade = vec3(0.045, 0.14, 0.03);
  vec3 lush = vec3(0.12, 0.32, 0.06);
  vec3 lit = vec3(0.42, 0.48, 0.12);
  vec3 dry = vec3(0.45, 0.40, 0.14);
  vec3 col = mix(shade, lush, n);
  col = mix(col, lit, fine * 0.5);
  col = mix(col, dry, smoothstep(0.62, 0.9, fine) * 0.4);
  col = mix(col, col * vec3(1.12, 1.18, 0.78), streak * 0.25);
  col = mix(col, soil, smoothstep(0.55, 0.12, n) * 0.18);
  float halfB = uPitch * 4.0;
  float inside = 1.0 - smoothstep(halfB - 0.05, halfB + 0.1, max(abs(w.x), abs(w.y)));
  float cell = min(min(fract(w.x / uPitch), 1.0 - fract(w.x / uPitch)), min(fract(w.y / uPitch), 1.0 - fract(w.y / uPitch))) * uPitch;
  float check = mod(floor(w.x / uPitch + 4.0) + floor(w.y / uPitch + 4.0), 2.0);
  float mow = sin(w.x * 1.55) * 0.5 + 0.5;
  col *= mix(1.0, mix(0.9, 1.05, check), inside * 0.18);
  col = mix(col, col * vec3(0.94, 1.03, 0.9), mow * inside * 0.14);
  col = mix(col, col * 0.66, smoothstep(0.09, 0.0, cell) * inside * 0.4);
  col = mix(col, vec3(0.72, 0.66, 0.46), smoothstep(0.05, 0.012, cell) * inside * 0.75);
  col *= mix(0.82, 1.0, smoothstep(-0.3, 0.4, vGladeW.y));
  diffuseColor.rgb = col;
}`,
        );
    };
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    const leafMap = makeLeafMap();
    const bloomMap = makeBloomMap();
    const barkMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.96, metalness: 0 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: leafMap ?? undefined,
      alphaTest: 0.35,
      roughness: 0.86,
      side: THREE.DoubleSide,
    });
    const pineMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, metalness: 0 });
    const rockMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.94, metalness: 0.02 });
    const bloomMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: bloomMap ?? undefined,
      alphaTest: 0.2,
      roughness: 0.7,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const bladeMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    bladeMat.customProgramCacheKey = () => "glade-blade";
    bladeMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float tip = clamp(position.y, 0.0, 1.0);
            float phase = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.22;
            float wave = sin(uTime * 1.2 + phase);
            transformed.x += tip * tip * wave * 0.16;
            transformed.z += tip * tip * cos(uTime * 0.85 + phase) * 0.07;
          #endif`,
        );
      bladeMat.userData.shader = shader;
    };

    const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 8);
    trunkGeo.translate(0, 0.5, 0);
    const coneGeo = new THREE.ConeGeometry(1, 1, 9);
    coneGeo.translate(0, 0.5, 0);
    const cardGeo = new THREE.PlaneGeometry(1, 1);
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const reed = makeReed();

    const pines = data.trees.filter((t) => t.kind === 0);
    const broad = data.trees.filter((t) => t.kind !== 0);

    const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, Math.max(1, data.trees.length));
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    if (data.trees.length) {
      stamp(trunks, data.trees.length, (i, dummy, color) => {
        const t = data.trees[i];
        dummy.position.set(t.x, gladeHeight(t.x, t.z), t.z);
        dummy.rotation.y = t.rot;
        dummy.scale.set(t.trunkR, t.h * (t.kind === 0 ? 0.55 : 0.62), t.trunkR);
        color.set(t.bark);
      });
    }

    const pineTops = new THREE.InstancedMesh(coneGeo, pineMat, Math.max(1, pines.length * 4));
    pineTops.castShadow = true;
    if (pines.length) {
      stamp(pineTops, pines.length * 4, (i, dummy, color) => {
        const t = pines[Math.floor(i / 4)];
        const layer = i % 4;
        const lift = t.h * (0.42 + layer * 0.12);
        const width = t.h * (0.36 - layer * 0.06);
        dummy.position.set(t.x + Math.sin(layer + t.rot) * 0.15, gladeHeight(t.x, t.z) + lift, t.z);
        dummy.rotation.y = t.rot + layer;
        dummy.scale.set(width, t.h * 0.34, width);
        color.set(t.leaf).offsetHSL(0, 0, layer * 0.035 - 0.04);
      });
    }

    const cards = new THREE.InstancedMesh(cardGeo, leafMat, Math.max(1, broad.length * 9));
    cards.castShadow = true;
    if (broad.length) {
      stamp(cards, broad.length * 9, (i, dummy, color) => {
        const t = broad[Math.floor(i / 9)];
        const k = i % 9;
        const ring = k < 6 ? 1 : 0;
        const ang = t.rot + k;
        const spread = ring ? t.h * 0.22 : 0;
        const y = gladeHeight(t.x, t.z) + t.h * (ring ? 0.62 : 0.78);
        dummy.position.set(t.x + Math.cos(ang) * spread, y, t.z + Math.sin(ang) * spread);
        dummy.rotation.set(0.15 + (k % 3) * 0.2, ang, 0);
        const s = t.h * (ring ? 0.34 : 0.42);
        dummy.scale.set(s, s * 0.82, 1);
        color.set(t.leaf).offsetHSL(0, 0, ring ? 0.02 : 0.08);
      });
    }

    const bushesN = 70;
    const bushCards = new THREE.InstancedMesh(cardGeo, leafMat, bushesN * 5);
    bushCards.castShadow = true;
    stamp(bushCards, bushesN * 5, (i, dummy, color) => {
      const b = Math.floor(i / 5);
      const k = i % 5;
      const a = hash(b + 20) * Math.PI * 2;
      const rad = 4 * GLADE_PITCH + 1.5 + hash(b + 21) * 8;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const s = 0.9 + hash(b + 22) * 0.8;
      dummy.position.set(x + Math.cos(k) * s * 0.35, gladeHeight(x, z) + s * 0.35, z + Math.sin(k) * s * 0.35);
      dummy.rotation.set(0.4, a + k, 0);
      dummy.scale.set(s, s * 0.7, 1);
      color.set(hash(b) > 0.5 ? "#2f6a32" : "#4d8a3c");
    });

    const BLADE_COUNT = 5200;
    const blades = new THREE.InstancedMesh(reed, bladeMat, BLADE_COUNT);
    const greens = ["#245c28", "#3e7a34", "#6aa044", "#c3d06a", "#1a421f", "#8fb85a"];
    stamp(blades, BLADE_COUNT, (i, dummy, color) => {
      const a = hash(i * 1.17) * Math.PI * 2;
      const near = hash(i + 3) < 0.62;
      const rad = near ? Math.sqrt(hash(i + 4)) * 24 : 24 + hash(i + 4) * 26;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const court = Math.max(Math.abs(x), Math.abs(z)) < 4 * GLADE_PITCH;
      const h = court ? 0.1 + hash(i + 6) * 0.16 : 0.32 + hash(i + 6) * 0.62;
      const w = court ? 0.028 + hash(i + 7) * 0.02 : 0.04 + hash(i + 7) * 0.035;
      dummy.position.set(x, gladeHeight(x, z), z);
      dummy.rotation.y = hash(i + 8) * Math.PI;
      dummy.rotation.z = (hash(i + 9) - 0.5) * 0.25;
      dummy.scale.set(w, h, 1);
      color.set(greens[i % greens.length]);
      if (hash(i + 11) > 0.9) color.set("#d2c56a");
    });

    const stones = new THREE.InstancedMesh(rockGeo, rockMat, data.rocks.length);
    stones.castShadow = true;
    stones.receiveShadow = true;
    stamp(stones, data.rocks.length, (i, dummy, color) => {
      const r = data.rocks[i];
      dummy.position.set(r.x, gladeHeight(r.x, r.z) + r.s * 0.2, r.z);
      dummy.rotation.set(r.rot, r.rot * 0.7, r.rot * 0.2);
      dummy.scale.set(r.s * 1.25, r.s * 0.48, r.s * 0.9);
      color.set(r.c);
    });

    const blooms = new THREE.InstancedMesh(cardGeo, bloomMat, data.flowers.length);
    stamp(blooms, data.flowers.length, (i, dummy, color) => {
      const f = data.flowers[i];
      dummy.position.set(f.x, gladeHeight(f.x, f.z) + 0.16, f.z);
      dummy.rotation.y = hash(i + 50);
      dummy.scale.set(0.28, 0.42, 1);
      color.set("#ffffff");
    });

    return { ground, groundMat, skyMat, trunks, pineTops, cards, bushCards, blades, bladeMat, stones, blooms, leafMap, bloomMap };
  }, []);

  useFrame(({ clock }) => {
    const shader = forest.bladeMat.userData.shader as { uniforms: { uTime: { value: number } } } | undefined;
    if (shader) shader.uniforms.uTime.value = clock.elapsedTime;
  });

  useEffect(
    () => () => {
      forest.ground.dispose();
      forest.groundMat.dispose();
      forest.skyMat.dispose();
      forest.leafMap?.dispose();
      forest.bloomMap?.dispose();
      const geos = new Set<THREE.BufferGeometry>();
      const mats = new Set<THREE.Material>();
      for (const mesh of [forest.trunks, forest.pineTops, forest.cards, forest.bushCards, forest.blades, forest.stones, forest.blooms]) {
        geos.add(mesh.geometry);
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((item) => mats.add(item));
        else mats.add(mat);
      }
      geos.forEach((geo) => geo.dispose());
      mats.forEach((mat) => mat.dispose());
    },
    [forest],
  );

  return (
    <group>
      <mesh>
        <sphereGeometry args={[140, 32, 20]} />
        <primitive object={forest.skyMat} attach="material" />
      </mesh>
      <mesh geometry={forest.ground} receiveShadow material={forest.groundMat} />
      <primitive object={forest.trunks} />
      <primitive object={forest.pineTops} />
      <primitive object={forest.cards} />
      <primitive object={forest.bushCards} />
      <primitive object={forest.blades} />
      <primitive object={forest.stones} />
      <primitive object={forest.blooms} />
    </group>
  );
}
