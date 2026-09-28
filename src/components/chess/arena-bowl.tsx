import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export type ArenaSide = "w" | "b";

const COLOSSEUM_SCALE = 15;
const COLOSSEUM_LIFT = 0.31 * COLOSSEUM_SCALE;

type Fan = { x: number; y: number; z: number; rot: number; side: ArenaSide; s: number };

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function Coliseum() {
  const gltf = useGLTF("/arena/coliseum.glb");
  const model = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material && "side" in material) material.side = THREE.DoubleSide;
    });
    return root;
  }, [gltf]);

  return <primitive object={model} scale={COLOSSEUM_SCALE} position={[0, COLOSSEUM_LIFT, 0]} />;
}

useGLTF.preload("/arena/coliseum.glb");

function buildFans(mesh: THREE.Mesh | null) {
  const fans: Fan[] = [];
  if (!mesh) return fans;
  mesh.updateWorldMatrix(true, false);
  const pos = mesh.geometry.getAttribute("position");
  const nor = mesh.geometry.getAttribute("normal");
  if (!pos || !nor) return fans;
  const bins = new Map<string, { x: number; y: number; z: number; ny: number }>();
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 2) {
    point.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld);
    normal.fromBufferAttribute(nor as THREE.BufferAttribute, i).transformDirection(mesh.matrixWorld);
    const r = Math.hypot(point.x, point.z);
    if (normal.y < 0.5 || r < 1.05 || r > 1.72) continue;
    const key = `${Math.round(Math.atan2(point.x, point.z) * 18)}:${Math.round(point.y * 24)}`;
    const prev = bins.get(key);
    if (!prev || normal.y > prev.ny) bins.set(key, { x: point.x, y: point.y, z: point.z, ny: normal.y });
  }
  let n = 0;
  for (const seat of bins.values()) {
    const x = seat.x * COLOSSEUM_SCALE;
    const y = seat.y * COLOSSEUM_SCALE + COLOSSEUM_LIFT + 0.06;
    const z = seat.z * COLOSSEUM_SCALE;
    const pick = hash(n * 3.1 + seat.y * 9.7);
    fans.push({
      x,
      y,
      z,
      rot: Math.atan2(x, z),
      side: z >= 0 ? "w" : "b",
      s: 0.5 + pick * 0.16,
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
  const gltf = useGLTF("/arena/coliseum.glb");
  const built = useMemo(() => {
    let mesh: THREE.Mesh | null = null;
    gltf.scene.traverse((obj) => {
      const next = obj as THREE.Mesh;
      if (next.isMesh && !mesh) mesh = next;
    });
    const fans = buildFans(mesh);
    const body = pawnShape();
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.42, metalness: 0.04 });
    const crowd = new THREE.InstancedMesh(body, mat, Math.max(fans.length, 1));
    crowd.castShadow = true;
    crowd.receiveShadow = true;
    crowd.frustumCulled = false;
    crowd.count = fans.length;
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
