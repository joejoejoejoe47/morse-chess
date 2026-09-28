import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export type ArenaSide = "w" | "b";

const COLOSSEUM_SCALE = 8.4;

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

function stoneMaterial(stone: { map: THREE.Texture; normalMap: THREE.Texture } | null) {
  return new THREE.MeshStandardMaterial({
    map: stone?.map,
    normalMap: stone?.normalMap,
    color: "#f3e6cf",
    roughness: 0.84,
    metalness: 0.02,
    normalScale: new THREE.Vector2(0.85, 0.85),
    side: THREE.DoubleSide,
  });
}

function paintStone(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute("position");
  const normal = geo.getAttribute("normal");
  if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  const uv = geo.getAttribute("uv");
  const uvScale = 4.2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(normal?.getX(i) ?? 0);
    const ny = Math.abs(normal?.getY(i) ?? 1);
    const nz = Math.abs(normal?.getZ(i) ?? 0);
    const u = ny >= nx && ny >= nz ? x : nx >= nz ? z : x;
    const v = ny >= nx && ny >= nz ? z : y;
    uv.setXY(i, u * uvScale, v * uvScale);
  }
  uv.needsUpdate = true;
  return geo;
}

function Coliseum({ stone }: { stone: { map: THREE.Texture; normalMap: THREE.Texture } | null }) {
  const gltf = useGLTF("/arena/coliseum.glb");
  const model = useMemo(() => {
    const root = gltf.scene.clone(true);
    const material = stoneMaterial(stone);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry = paintStone(mesh.geometry.clone());
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
    },
    [model],
  );

  return <primitive object={model} scale={COLOSSEUM_SCALE} />;
}

useGLTF.preload("/arena/coliseum.glb");

function buildFans(geo: THREE.BufferGeometry | null) {
  const fans: Fan[] = [];
  if (!geo) return fans;
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  if (!pos || !nor) return fans;
  const bins = new Map<string, { x: number; y: number; z: number; ny: number }>();
  for (let i = 0; i < pos.count; i += 2) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = nor.getY(i);
    const r = Math.hypot(x, z);
    if (ny < 0.62 || r < 1.55 || r > 3.35 || y < 0.1) continue;
    const key = `${Math.round(Math.atan2(x, z) * 16)}:${Math.round(y * 16)}`;
    const prev = bins.get(key);
    if (!prev || ny > prev.ny) bins.set(key, { x, y, z, ny });
  }
  let n = 0;
  for (const seat of bins.values()) {
    const x = seat.x * COLOSSEUM_SCALE;
    const y = seat.y * COLOSSEUM_SCALE + 0.04;
    const z = seat.z * COLOSSEUM_SCALE;
    const pick = hash(n * 3.1 + seat.y * 9.7);
    fans.push({
      x,
      y,
      z,
      rot: Math.atan2(x, z),
      side: z >= 0 ? "w" : "b",
      s: 0.62 + pick * 0.2,
    });
    n += 1;
  }
  return fans;
}

function pawnShape() {
  const pts = [
    [0, 0],
    [0.28, 0],
    [0.28, 0.05],
    [0.18, 0.09],
    [0.12, 0.28],
    [0.16, 0.34],
    [0.1, 0.4],
    [0.16, 0.5],
    [0.14, 0.58],
    [0.06, 0.62],
    [0, 0.63],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 12);
  geo.computeVertexNormals();
  return geo;
}

export function Arena({ cheer }: { cheer: ArenaSide | null }) {
  const stone = useMemo(() => makeTravertine(), []);
  const gltf = useGLTF("/arena/coliseum.glb");
  const built = useMemo(() => {
    let geo: THREE.BufferGeometry | null = null;
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && !geo) geo = mesh.geometry;
    });
    const fans = buildFans(geo);
    const body = pawnShape();
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.42, metalness: 0.04 });
    const crowd = new THREE.InstancedMesh(body, mat, fans.length);
    crowd.castShadow = true;
    crowd.receiveShadow = true;
    crowd.frustumCulled = false;
    const color = new THREE.Color();
    const dummy = new THREE.Object3D();
    fans.forEach((f, i) => {
      const tone = 0.86 + hash(i + 4) * 0.14;
      color.set(f.side === "w" ? "#f6f1e6" : "#241c18").multiplyScalar(tone);
      crowd.setColorAt(i, color);
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(0, f.rot, 0);
      dummy.scale.setScalar(f.s);
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
    });
    crowd.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    return { fans, crowd, body, mat };
  }, [gltf]);

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
      const hop = on ? Math.abs(Math.sin(t * 8 + i * 0.37)) * 0.22 : Math.sin(t * 0.8 + i) * 0.012;
      dummy.position.set(f.x, f.y + hop, f.z);
      dummy.rotation.set(on ? Math.sin(t * 9 + i) * 0.08 : 0, f.rot, 0);
      dummy.scale.setScalar(f.s);
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
    }
    crowd.instanceMatrix.needsUpdate = true;
  });

  useEffect(
    () => () => {
      built.body.dispose();
      built.mat.dispose();
      stone?.map.dispose();
      stone?.normalMap.dispose();
    },
    [built, stone],
  );

  return (
    <group>
      <Coliseum stone={stone} />
      <primitive object={built.crowd} />
    </group>
  );
}
