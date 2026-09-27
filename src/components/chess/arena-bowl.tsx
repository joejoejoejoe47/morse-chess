import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export type ArenaSide = "w" | "b";

const COLOSSEUM_SCALE = 0.065;
const TIERS = 11;

type Fan = { x: number; y: number; z: number; rot: number; side: ArenaSide; s: number };

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function makeTravertine() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#e7d3ae";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 8000; i++) {
    const g = 180 + Math.floor(hash(i) * 50);
    ctx.fillStyle = `rgba(${g}, ${g - 18}, ${g - 40}, 0.18)`;
    ctx.fillRect(hash(i + 3) * size, hash(i + 7) * size, 2, 2);
  }
  const course = 84;
  let row = 0;
  for (let y = 0; y < size; y += course) {
    let x = row % 2 ? -40 : 0;
    let n = row * 17;
    while (x < size) {
      const bw = 78 + Math.floor(hash(n) * 92);
      const tone = hash(n + 2);
      const r = 196 + tone * 48;
      const g = 168 + tone * 36;
      const b = 126 + tone * 24;
      ctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
      ctx.fillRect(x + 3, y + 3, bw - 6, course - 6);
      if (hash(n + 4) > 0.82) {
        ctx.fillStyle = "rgba(92, 78, 54, 0.28)";
        ctx.fillRect(x + 8, y + 10, bw * 0.4, 6);
      }
      if (hash(n + 5) > 0.9) {
        ctx.fillStyle = "rgba(70, 110, 62, 0.35)";
        ctx.fillRect(x + 4, y + course - 10, bw - 8, 5);
      }
      x += bw;
      n += 1;
    }
    row += 1;
  }
  ctx.strokeStyle = "rgba(92, 70, 46, 0.55)";
  ctx.lineWidth = 3;
  for (let y = 0; y <= size; y += course) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  const pixels = ctx.getImageData(0, 0, size, size);
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i++) {
    const p = i * 4;
    height[i] = (pixels.data[p] * 0.3 + pixels.data[p + 1] * 0.5 + pixels.data[p + 2] * 0.2) / 255;
  }
  const normal = document.createElement("canvas");
  normal.width = size;
  normal.height = size;
  const nctx = normal.getContext("2d");
  if (!nctx) return null;
  const nd = nctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + ((x - 1 + size) % size)];
      const r = height[y * size + ((x + 1) % size)];
      const u = height[((y - 1 + size) % size) * size + x];
      const d = height[((y + 1) % size) * size + x];
      const dx = (l - r) * 2.2;
      const dy = (u - d) * 2.2;
      const dz = 1;
      const len = Math.hypot(dx, dy, dz) || 1;
      const i = (y * size + x) * 4;
      nd.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      nd.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nd.data[i + 2] = (dz / len) * 255;
      nd.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nd, 0, 0);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const normalMap = new THREE.CanvasTexture(normal);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  return { map, normalMap };
}

function seatTheCrowd(geo: THREE.BufferGeometry) {
  const index = geo.getIndex();
  const pos = geo.getAttribute("position");
  const normal = geo.getAttribute("normal");
  const uv = geo.getAttribute("uv");
  if (!index || !pos || !uv) return geo;
  const keep: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    const ra = Math.hypot(pos.getX(a), pos.getZ(a));
    const rb = Math.hypot(pos.getX(b), pos.getZ(b));
    const rc = Math.hypot(pos.getX(c), pos.getZ(c));
    const y = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    if (Math.min(ra, rb, rc) < 190 && y < 48) continue;
    keep.push(a, b, c);
  }
  geo.setIndex(keep);
  const uvScale = 0.0065;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(normal?.getX(i) ?? 0);
    const ny = Math.abs(normal?.getY(i) ?? 1);
    const nz = Math.abs(normal?.getZ(i) ?? 0);
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv.setXY(i, u * uvScale, v * uvScale);
  }
  uv.needsUpdate = true;
  return geo;
}

function Coliseum() {
  const gltf = useGLTF("/arena/coliseum.glb");
  const stone = useMemo(() => makeTravertine(), []);
  const model = useMemo(() => {
    const root = gltf.scene.clone(true);
    const material = new THREE.MeshStandardMaterial({
      map: stone?.map,
      normalMap: stone?.normalMap,
      color: "#f3e6cf",
      roughness: 0.84,
      metalness: 0.02,
      normalScale: new THREE.Vector2(0.85, 0.85),
      side: THREE.DoubleSide,
    });
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry = seatTheCrowd(mesh.geometry.clone());
      mesh.material = material;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    root.userData.material = material;
    return root;
  }, [gltf, stone]);

  useEffect(
    () => () => {
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      const material = model.userData.material as THREE.Material | undefined;
      material?.dispose();
      stone?.map.dispose();
      stone?.normalMap.dispose();
    },
    [model, stone],
  );

  return <primitive object={model} scale={COLOSSEUM_SCALE} position={[0, 0.2, 0]} />;
}

useGLTF.preload("/arena/coliseum.glb");

function buildFans() {
  const fans: Fan[] = [];
  for (let tier = 0; tier < TIERS; tier++) {
    const radius = 17.5 + tier * 1.9;
    const y = 2.4 + tier * 1.45;
    const steps = Math.max(36, Math.floor((2 * Math.PI * radius) / 1.15));
    for (let i = 0; i < steps; i++) {
      if ((i + tier) % 11 === 0) continue;
      const a = (i / steps) * Math.PI * 2 + tier * 0.04;
      const x = Math.sin(a) * radius;
      const z = Math.cos(a) * radius * 1.15;
      const side: ArenaSide = z >= 0 ? "w" : "b";
      const pick = hash(i * 3.1 + tier * 9.7);
      fans.push({
        x,
        y,
        z,
        rot: a + Math.PI + (pick - 0.5) * 0.35,
        side,
        s: 0.78 + pick * 0.28,
      });
    }
  }
  return fans;
}

export function Arena({ cheer }: { cheer: ArenaSide | null }) {
  const built = useMemo(() => {
    const fans = buildFans();
    const body = new THREE.PlaneGeometry(0.42, 0.72);
    body.translate(0, 0.36, 0);
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(7, 47);
      ctx.lineTo(25, 47);
      ctx.lineTo(21, 18);
      ctx.lineTo(11, 18);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(16, 12, 6.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const person = new THREE.CanvasTexture(canvas);
    person.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: person,
      color: "#ffffff",
      roughness: 1,
      metalness: 0,
      transparent: true,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
    });
    const crowd = new THREE.InstancedMesh(body, mat, fans.length);
    crowd.frustumCulled = false;
    const color = new THREE.Color();
    const light = ["#f7f4ee", "#f3efe6", "#e7d7a4", "#dfe7f2", "#f6f1e4", "#c9a36a"];
    const dark = ["#7c1f2a", "#1c2438", "#2a211c", "#8d3b2c", "#142033", "#4a3030"];
    const mix = ["#e23b32", "#2d62a8", "#f2c14e", "#67a15a", "#1b1b1b", "#e8eef6", "#c4572a", "#f4f1ea"];
    const dummy = new THREE.Object3D();
    fans.forEach((f, i) => {
      const palette = f.side === "w" ? (i % 5 > 1 ? light : mix) : i % 5 > 1 ? dark : mix;
      color.set(palette[i % palette.length]);
      crowd.setColorAt(i, color);
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(0, f.rot, 0);
      dummy.scale.setScalar(f.s);
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
    });
    crowd.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    return { fans, crowd, body, mat, person };
  }, []);

  const cheerRef = useRef(cheer);
  cheerRef.current = cheer;
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const side = cheerRef.current;
    const { fans, crowd } = built;
    for (let i = 0; i < fans.length; i++) {
      const f = fans[i];
      const on = side === f.side;
      const hop = on ? Math.abs(Math.sin(t * 8 + i * 0.37)) * 0.28 : Math.sin(t * 1.2 + i) * 0.01;
      dummy.position.set(f.x, f.y + hop, f.z);
      dummy.rotation.set(0, f.rot + (on ? Math.sin(t * 11 + i) * 0.18 : 0), 0);
      dummy.scale.setScalar(f.s * (on ? 1.04 : 1));
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
    }
    crowd.instanceMatrix.needsUpdate = true;
  });

  useEffect(
    () => () => {
      built.body.dispose();
      built.mat.dispose();
      built.person.dispose();
    },
    [built],
  );

  return (
    <group>
      <Coliseum />
      <primitive object={built.crowd} />
    </group>
  );
}
