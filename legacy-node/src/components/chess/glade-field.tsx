import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { Arena, arenaNight, type ArenaSide } from "@/components/chess/arena-bowl";

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
  const keep = THREE.MathUtils.smoothstep(Math.hypot(x, z), 30, 46);
  return roll * mask * keep + lawn * (1 - mask);
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function paintGrid() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const span = 8 * GLADE_PITCH + 0.35;
  if (!ctx) return { tex: null as THREE.CanvasTexture | null, span };
  const px = (v: number) => ((v + span / 2) / span) * size;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#c2a36a";
  ctx.fillRect(0, 0, size, size);
  const dust = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.55);
  dust.addColorStop(0, "rgba(236, 214, 168, 0.35)");
  dust.addColorStop(1, "rgba(120, 86, 48, 0.28)");
  ctx.fillStyle = dust;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9; i++) {
    const p = (i - 4) * GLADE_PITCH;
    const a = px(-4 * GLADE_PITCH);
    const b = px(4 * GLADE_PITCH);
    const c = px(p);
    ctx.strokeStyle = "rgba(42, 28, 16, 0.85)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(a, c);
    ctx.lineTo(b, c);
    ctx.moveTo(c, a);
    ctx.lineTo(c, b);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 244, 220, 0.92)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(a, c);
    ctx.lineTo(b, c);
    ctx.moveTo(c, a);
    ctx.lineTo(c, b);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, span };
}

const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = `
  uniform float uDay;
  varying vec3 vDir;
  float hsh(vec2 p){return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);}
  float nse(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hsh(i), hsh(i+vec2(1.0,0.0)), f.x), mix(hsh(i+vec2(0.0,1.0)), hsh(i+vec2(1.0,1.0)), f.x), f.y);
  }
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 dayCol = mix(vec3(0.72, 0.84, 0.95), vec3(0.28, 0.58, 0.9), smoothstep(0.0, 0.4, h));
    dayCol = mix(dayCol, vec3(0.08, 0.34, 0.78), smoothstep(0.28, 0.85, h));
    float cloud = smoothstep(0.55, 0.75, nse(dir.xz / max(dir.y + 0.25, 0.15) * 1.8));
    dayCol = mix(dayCol, vec3(0.97, 0.98, 0.99), cloud * smoothstep(0.02, 0.2, dir.y));
    float sun = pow(max(dot(dir, normalize(vec3(0.72, 0.46, 0.28))), 0.0), 40.0);
    dayCol += vec3(1.0, 0.86, 0.55) * sun;
    vec3 nightCol = mix(vec3(0.05, 0.04, 0.08), vec3(0.015, 0.02, 0.06), h);
    float stars = step(0.992, hsh(floor(dir.xz * 380.0)));
    nightCol += vec3(0.9, 0.92, 1.0) * stars * smoothstep(0.05, 0.35, dir.y);
    vec3 col = mix(nightCol, dayCol, clamp(uDay, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

useGLTF.preload("/glade/trees.glb");

function Grove() {
  const gltf = useGLTF("/glade/trees.glb");
  const trees = useMemo(() => {
    const kinds = [1, 2, 3, 4, 5]
      .map((n) => gltf.scene.getObjectByName(`NormalTree_${n}`))
      .filter((node): node is THREE.Object3D => Boolean(node));
    const made: THREE.Group[] = [];
    for (let i = 0; i < 18; i++) {
      const kind = kinds[i % kinds.length];
      if (!kind) continue;
      const a = hash(i * 1.7 + 4) * Math.PI * 2;
      const rad = 36 + hash(i + 11) * 16;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const copy = kind.clone(true);
      copy.position.set(0, 0, 0);
      copy.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      const holder = new THREE.Group();
      holder.position.set(x, gladeHeight(x, z), z);
      holder.rotation.y = hash(i + 6) * Math.PI * 2;
      holder.scale.setScalar(1.45 + hash(i + 2) * 0.85);
      holder.add(copy);
      made.push(holder);
    }
    return made;
  }, [gltf]);

  return (
    <group>
      {trees.map((tree, i) => (
        <primitive key={i} object={tree} />
      ))}
    </group>
  );
}

export function MeadowField({ cheer = null }: { cheer?: ArenaSide | null }) {
  const maps = useTexture({
    map: "/glade/ground/diff.jpg",
    normalMap: "/glade/ground/nor.jpg",
    roughnessMap: "/glade/ground/rough.jpg",
  });

  const field = useMemo(() => {
    const repeat = 22;
    for (const tex of [maps.map, maps.normalMap, maps.roughnessMap]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
      tex.anisotropy = 8;
    }
    maps.map.colorSpace = THREE.SRGBColorSpace;
    maps.normalMap.colorSpace = THREE.LinearSRGBColorSpace;
    maps.roughnessMap.colorSpace = THREE.LinearSRGBColorSpace;

    const ground = new THREE.PlaneGeometry(150, 150, 48, 48);
    ground.rotateX(-Math.PI / 2);
    const pos = ground.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const hole = Math.max(Math.abs(x), Math.abs(z)) < 13 ? 1 : 0;
      pos.setY(i, gladeHeight(x, z) * (1 - hole));
    }
    ground.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: 1,
      metalness: 0,
    });
    groundMat.normalScale.set(1.45, 1.45);

    const painted = paintGrid();
    const court = new THREE.PlaneGeometry(painted.span, painted.span);
    court.rotateX(-Math.PI / 2);
    const courtMat = new THREE.MeshStandardMaterial({
      map: painted.tex ?? undefined,
      roughness: 0.92,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

    const skyMat = new THREE.ShaderMaterial({
      uniforms: { uDay: { value: 1 } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    return { ground, groundMat, court, courtMat, paint: painted.tex, skyMat };
  }, [maps.map, maps.normalMap, maps.roughnessMap]);

  useEffect(
    () => () => {
      field.ground.dispose();
      field.groundMat.dispose();
      field.court.dispose();
      field.courtMat.dispose();
      field.paint?.dispose();
      field.skyMat.dispose();
    },
    [field],
  );

  useFrame(() => {
    const mat = field.skyMat;
    if (mat.uniforms.uDay) mat.uniforms.uDay.value = 1 - arenaNight.value;
  });

  return (
    <group>
      <mesh>
        <sphereGeometry args={[140, 32, 20]} />
        <primitive object={field.skyMat} attach="material" />
      </mesh>
      <mesh geometry={field.ground} material={field.groundMat} receiveShadow />
      <mesh geometry={field.court} material={field.courtMat} position={[0, 0.045, 0]} receiveShadow />
      <Grove />
      <Arena cheer={cheer ?? null} />
    </group>
  );
}
