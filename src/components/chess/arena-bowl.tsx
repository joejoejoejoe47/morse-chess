import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type ArenaSide = "w" | "b";

const TIERS = 8;

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

function archBay(height: number, arch: number) {
  const shape = new THREE.Shape();
  const w = 1.2;
  shape.moveTo(-w, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, height);
  shape.lineTo(-w, height);
  shape.closePath();
  const hole = new THREE.Path();
  const base = 0.48;
  hole.moveTo(-arch, base);
  hole.lineTo(-arch, base + arch * 1.35);
  hole.absarc(0, base + arch * 1.35, arch, Math.PI, 0, false);
  hole.lineTo(arch, base);
  hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.25, bevelEnabled: false, curveSegments: 8 });
  geo.translate(0, 0, -0.62);
  geo.computeVertexNormals();
  return geo;
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

function Coliseum({ stone }: { stone: { map: THREE.Texture; normalMap: THREE.Texture } | null }) {
  const built = useMemo(() => {
    const material = stoneMaterial(stone);
    const lower = archBay(5.5, 0.74);
    const upper = archBay(4.4, 0.62);
    const attic = new THREE.BoxGeometry(2.35, 1.15, 1.45);
    const stepGeos: THREE.BufferGeometry[] = [];
    const dummy = new THREE.Object3D();
    const bays = 42;
    const seat = (mesh: THREE.InstancedMesh, radius: number, y: number, count: number) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        dummy.position.set(Math.sin(a) * radius, y, Math.cos(a) * radius * 1.16);
        dummy.rotation.set(0, a, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    const lowerMesh = new THREE.InstancedMesh(lower, material, bays);
    const upperMesh = new THREE.InstancedMesh(upper, material, bays);
    const atticMesh = new THREE.InstancedMesh(attic, material, bays);
    lowerMesh.castShadow = upperMesh.castShadow = atticMesh.castShadow = true;
    lowerMesh.receiveShadow = upperMesh.receiveShadow = atticMesh.receiveShadow = true;
    seat(lowerMesh, 38.5, 0, bays);
    seat(upperMesh, 39.1, 5.45, bays);
    seat(atticMesh, 39.4, 9.7, bays);
    const steps: THREE.Mesh[] = [];
    for (let tier = 0; tier < TIERS; tier++) {
      const inner = 16.2 + tier * 2.35;
      const geo = new THREE.RingGeometry(inner, inner + 2.45, 72);
      geo.rotateX(-Math.PI / 2);
      geo.scale(1, 1, 1.16);
      stepGeos.push(geo);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.y = 0.28 + tier * 0.78;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      steps.push(mesh);
    }
    const lip = new THREE.TorusGeometry(40.2, 0.55, 8, 72);
    lip.scale(1, 1, 1.16);
    lip.rotateX(Math.PI / 2);
    const lipMesh = new THREE.Mesh(lip, material);
    lipMesh.position.y = 10.45;
    lipMesh.castShadow = true;
    return { material, lower, upper, attic, lip, stepGeos, lowerMesh, upperMesh, atticMesh, lipMesh, steps };
  }, [stone]);

  useEffect(
    () => () => {
      built.lower.dispose();
      built.upper.dispose();
      built.attic.dispose();
      built.lip.dispose();
      built.stepGeos.forEach((geo) => geo.dispose());
      built.material.dispose();
    },
    [built],
  );

  return (
    <group>
      <primitive object={built.lowerMesh} />
      <primitive object={built.upperMesh} />
      <primitive object={built.atticMesh} />
      <primitive object={built.lipMesh} />
      {built.steps.map((step, i) => (
        <primitive key={i} object={step} />
      ))}
    </group>
  );
}

function buildFans() {
  const fans: Fan[] = [];
  for (let tier = 0; tier < TIERS; tier++) {
    const radius = 17.3 + tier * 2.35;
    const y = 0.42 + tier * 0.78;
    const steps = Math.max(28, Math.floor((2 * Math.PI * radius) / 1.55));
    for (let i = 0; i < steps; i++) {
      if ((i + tier * 3) % 9 === 0) continue;
      const a = (i / steps) * Math.PI * 2 + tier * 0.08;
      const x = Math.sin(a) * radius;
      const z = Math.cos(a) * radius * 1.16;
      const side: ArenaSide = z >= 0 ? "w" : "b";
      const pick = hash(i * 3.1 + tier * 9.7);
      fans.push({
        x,
        y,
        z,
        rot: Math.atan2(x, z),
        side,
        s: 0.72 + pick * 0.22,
      });
    }
  }
  return fans;
}

export function Arena({ cheer }: { cheer: ArenaSide | null }) {
  const stone = useMemo(() => makeTravertine(), []);
  const built = useMemo(() => {
    const fans = buildFans();
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
