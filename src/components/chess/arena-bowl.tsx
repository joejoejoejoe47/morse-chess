import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type ArenaSide = "w" | "b";

const RX = 1.32;
const RZ = 1.05;
const TIERS = 14;

type Fan = { x: number; y: number; z: number; rot: number; side: ArenaSide; s: number };

function stoneTex() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#dcc9a6";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = i % 2 ? "rgba(92, 68, 40, 0.07)" : "rgba(255, 248, 230, 0.09)";
    ctx.fillRect((i * 47) % 256, (i * 91) % 256, 2, 2);
  }
  for (let y = 6; y < 256; y += 16) {
    ctx.strokeStyle = "rgba(70, 52, 28, 0.16)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function archTex() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1024, 256);
  ctx.fillStyle = "#e4d3b0";
  ctx.fillRect(0, 0, 1024, 256);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * (1024 / n);
    ctx.fillStyle = "#d5c29a";
    ctx.fillRect(cx - 42, 0, 84, 256);
    ctx.fillStyle = "#1c1814";
    ctx.beginPath();
    ctx.moveTo(cx - 22, 256);
    ctx.lineTo(cx - 22, 118);
    ctx.ellipse(cx, 118, 22, 36, 0, Math.PI, 0, true);
    ctx.lineTo(cx + 22, 256);
    ctx.fill();
    ctx.strokeStyle = "rgba(90, 64, 36, 0.45)";
    ctx.strokeRect(cx - 30, 8, 60, 240);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(3, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function garlandTex() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1024, 128);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const x0 = (i * 1024) / n;
    const x1 = x0 + 1024 / n;
    ctx.strokeStyle = "#9a1e24";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(x0 + 8, 18);
    ctx.quadraticCurveTo((x0 + x1) / 2, 118, x1 - 8, 18);
    ctx.stroke();
    ctx.strokeStyle = "#e0b44a";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#7d1418";
    ctx.fillRect((x0 + x1) / 2 - 8, 8, 16, 28);
    ctx.fillStyle = "#c9a24a";
    ctx.beginPath();
    ctx.arc((x0 + x1) / 2, 96, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function personTex() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, 32, 48);
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
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBowl() {
  const pts: THREE.Vector2[] = [];
  const add = (r: number, y: number) => pts.push(new THREE.Vector2(r, y));
  add(12.35, 0.04);
  add(12.35, 1.92);
  add(13.05, 2.04);
  for (let i = 0; i < TIERS; i++) {
    const r = 13.1 + i * 0.84;
    const y = 2.04 + i * 0.4;
    add(r, y + 0.36);
    add(r + 0.72, y + 0.36);
  }
  const r = 13.1 + (TIERS - 1) * 0.84 + 0.72;
  const y = 2.04 + (TIERS - 1) * 0.4 + 0.36;
  add(r + 0.18, y + 1.45);
  add(r + 0.78, y + 1.45);
  add(r + 0.78, y + 0.2);
  return new THREE.LatheGeometry(pts, 84);
}

function buildFans() {
  const fans: Fan[] = [];
  const light = ["#f7f4ee", "#f3efe6", "#e7d7a4", "#dfe7f2", "#f2f2f2", "#c9a36a"];
  const dark = ["#7c1f2a", "#1c2438", "#2a211c", "#8d3b2c", "#142033", "#4a3030"];
  const mix = ["#e23b32", "#2d62a8", "#f2c14e", "#67a15a", "#1b1b1b", "#e8eef6", "#c4572a", "#f4f1ea"];
  for (let tier = 0; tier < TIERS; tier++) {
    const radius = 13.1 + tier * 0.84 + 0.36;
    const y = 2.04 + tier * 0.4 + 0.4;
    const steps = Math.max(48, Math.floor((2 * Math.PI * radius * ((RX + RZ) / 2)) / 0.7));
    for (let i = 0; i < steps; i++) {
      if ((i + tier) % 17 === 0) continue;
      const a = (i / steps) * Math.PI * 2 + tier * 0.02;
      const x = Math.sin(a) * radius * RX;
      const z = Math.cos(a) * radius * RZ;
      const side: ArenaSide = z >= 0 ? "w" : "b";
      const n = Math.abs(Math.sin(i * 12.9898 + tier * 78.233) * 43758.5453);
      const pick = n - Math.floor(n);
      const palette = side === "w" ? (pick > 0.42 ? light : mix) : pick > 0.42 ? dark : mix;
      void palette;
      fans.push({
        x,
        y,
        z,
        rot: a + Math.PI + (pick - 0.5) * 0.4,
        side,
        s: 0.82 + (pick % 0.3),
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
    const person = personTex();
    const mat = new THREE.MeshStandardMaterial({
      map: person ?? undefined,
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

    const bowl = makeBowl();
    const stone = stoneTex();
    const arches = archTex();
    const garland = garlandTex();
    const bowlMat = new THREE.MeshStandardMaterial({
      map: stone ?? undefined,
      color: "#e6d3b0",
      roughness: 0.96,
      metalness: 0,
    });
    const archMat = new THREE.MeshStandardMaterial({
      map: arches ?? undefined,
      color: "#e7d5b2",
      roughness: 0.94,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const sashMat = new THREE.MeshStandardMaterial({
      map: garland ?? undefined,
      transparent: true,
      depthWrite: false,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const sandMat = new THREE.MeshStandardMaterial({ color: "#e6d2a4", roughness: 1, metalness: 0 });
    const topR = 13.1 + (TIERS - 1) * 0.84 + 0.9;
    const topY = 2.04 + (TIERS - 1) * 0.4 + 1.55;
    return { fans, crowd, body, mat, bowl, bowlMat, archMat, sashMat, sandMat, stone, arches, garland, topR, topY };
  }, []);

  const cheerRef = useRef(cheer);
  cheerRef.current = cheer;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const sash = useRef<THREE.Mesh>(null);

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
    if (sash.current) {
      sash.current.position.y = 1.78 + Math.sin(t * (side ? 6 : 1.5)) * (side ? 0.04 : 0.01);
    }
  });

  useEffect(
    () => () => {
      built.body.dispose();
      built.mat.dispose();
      built.bowl.dispose();
      built.bowlMat.dispose();
      built.archMat.dispose();
      built.sashMat.dispose();
      built.sandMat.dispose();
      built.stone?.dispose();
      built.arches?.dispose();
      built.garland?.dispose();
    },
    [built],
  );

  return (
    <group>
      <group scale={[RX, 1, RZ]}>
        <mesh geometry={built.bowl} material={built.bowlMat} receiveShadow castShadow />
        <mesh position={[0, 0.98, 0]} material={built.archMat} castShadow>
          <cylinderGeometry args={[12.22, 12.22, 1.72, 72, 1, true]} />
        </mesh>
        <mesh ref={sash} position={[0, 1.78, 0]} material={built.sashMat}>
          <cylinderGeometry args={[12.48, 12.48, 0.46, 72, 1, true]} />
        </mesh>
        <mesh position={[0, built.topY, 0]} material={built.archMat}>
          <cylinderGeometry args={[built.topR, built.topR, 1.05, 80, 1, true]} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} material={built.sandMat} receiveShadow>
          <ringGeometry args={[11.9, 12.35, 72]} />
        </mesh>
      </group>
      <primitive object={built.crowd} />
      <Drapes cheer={cheer} />
    </group>
  );
}

function Drapes({ cheer }: { cheer: ArenaSide | null }) {
  const cloth = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!cloth.current) return;
    cloth.current.children.forEach((child, i) => {
      const side: ArenaSide = child.position.z >= 0 ? "w" : "b";
      const live = cheer === side;
      child.rotation.y = Math.atan2(child.position.x, child.position.z) + Math.PI + Math.sin(clock.elapsedTime * (live ? 8 : 1.3) + i) * (live ? 0.2 : 0.03);
    });
  });
  const spots = useMemo(() => {
    const list: { x: number; z: number; color: string }[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const x = Math.sin(a) * 12.7 * RX;
      const z = Math.cos(a) * 12.7 * RZ;
      list.push({ x, z, color: i % 2 ? "#8d1c22" : "#c9a24a" });
    }
    return list;
  }, []);
  return (
    <group ref={cloth}>
      {spots.map((s, i) => (
        <mesh key={i} position={[s.x, 1.55, s.z]}>
          <planeGeometry args={[0.85, 1.15]} />
          <meshStandardMaterial color={s.color} side={THREE.DoubleSide} roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}
