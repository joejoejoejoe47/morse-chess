import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";

export type ArenaSide = "w" | "b" | "all";

/** 0 in full day, 1 at night. MeadowDay writes this; lanterns read it. */
export const arenaNight = { value: 0 };

const COLOSSEUM_SCALE = 15;
const COLOSSEUM_LIFT = 0.31 * COLOSSEUM_SCALE;
const WHITE_PAWN = "/units/rogue.glb";
const BLACK_PAWN = "/units/skeleton-minion.glb";

const ARCH_FILES = [-7, -5, -3, -1, 1, 3, 5, 7];
const ARCH_R = 11.35;

type Fan = { x: number; y: number; z: number; rot: number; side: ArenaSide; s: number };

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const BRICK_VERT = `
varying vec3 vBrickWorld;
varying vec3 vBrickNormal;
`;
const BRICK_VERT_BODY = `
vBrickWorld = (modelMatrix * vec4(position, 1.0)).xyz;
vBrickNormal = normalize(mat3(modelMatrix) * normal);
`;
const BRICK_FRAG = `
varying vec3 vBrickWorld;
varying vec3 vBrickNormal;
float brickHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float brickNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(brickHash(i), brickHash(i + vec2(1.0, 0.0)), f.x),
    mix(brickHash(i + vec2(0.0, 1.0)), brickHash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
vec4 romanBrick(vec2 uv) {
  vec2 size = vec2(1.12, 0.34);
  float row = floor(uv.y / size.y);
  vec2 cell = vec2(uv.x + mod(row, 2.0) * size.x * 0.5, uv.y);
  vec2 id = floor(cell / size);
  vec2 f = fract(cell / size);
  float mortar = 1.0 - step(0.05, f.x) * step(0.1, f.y) * step(f.x, 0.95) * step(f.y, 0.9);
  float h = brickHash(id);
  float h2 = brickHash(id + 19.2);
  vec3 clay = mix(vec3(0.62, 0.16, 0.06), vec3(0.92, 0.48, 0.18), h);
  clay = mix(clay, vec3(0.86, 0.72, 0.48), smoothstep(0.86, 0.98, h2));
  clay = mix(clay, vec3(0.28, 0.10, 0.06), smoothstep(0.95, 1.0, brickHash(id + 4.4)));
  clay *= 0.9 + brickNoise(uv * 16.0) * 0.18;
  float chip = smoothstep(0.82, 0.98, brickNoise(uv * 6.5 + id));
  clay = mix(clay, clay * vec3(0.75, 0.7, 0.62), chip * 0.45);
  float ao = smoothstep(0.0, 0.1, f.x) * smoothstep(1.0, 0.9, f.x);
  ao *= smoothstep(0.0, 0.12, f.y) * smoothstep(1.0, 0.88, f.y);
  clay *= mix(0.78, 1.0, ao);
  vec3 joint = vec3(0.38, 0.33, 0.28) * (0.82 + brickNoise(uv * 8.0) * 0.36);
  return vec4(mix(clay, joint, mortar), mortar);
}
vec4 sampleBrick(vec3 world, vec3 normal) {
  vec3 n = abs(normalize(normal + vec3(0.0001)));
  n = pow(n, vec3(3.0));
  n /= n.x + n.y + n.z;
  vec4 b = romanBrick(world.zy) * n.x + romanBrick(world.xz) * n.y + romanBrick(world.xy) * n.z;
  b.rgb *= 0.94 + brickNoise(world.xz * 0.065 + world.y * 0.04) * 0.12;
  float dirt = smoothstep(3.2, 0.05, world.y);
  b.rgb = mix(b.rgb, b.rgb * vec3(0.82, 0.74, 0.62), dirt * 0.28);
  b.rgb = mix(b.rgb, b.rgb * vec3(0.52, 0.48, 0.44), smoothstep(7.6, 9.8, world.y) * 0.4);
  return b;
}
`;

function dressStone(material: THREE.MeshStandardMaterial) {
  material.color.set("#ffffff");
  material.emissive.set("#000000");
  material.emissiveIntensity = 0;
  material.roughness = 0.86;
  material.metalness = 0.02;
  material.vertexColors = false;
  material.map = null;
  material.customProgramCacheKey = () => "roman-brick-v3";
  material.onBeforeCompile = (shader) => {
    if (shader.vertexShader.includes("vBrickWorld")) return;
    if (!shader.fragmentShader.includes("#include <map_fragment>")) return;
    if (!shader.vertexShader.includes("#include <begin_vertex>")) return;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${BRICK_VERT}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${BRICK_VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${BRICK_FRAG}`)
      .replace(
        "#include <map_fragment>",
        "vec4 brickTex = sampleBrick(vBrickWorld, vBrickNormal);\ndiffuseColor.rgb = brickTex.rgb;",
      )
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = mix(0.74, 0.98, brickTex.a);");
  };
  return material;
}

export function promotionDoor(fileX: number, sign: number) {
  let x = ARCH_FILES[0];
  let best = Infinity;
  for (const file of ARCH_FILES) {
    const dist = Math.abs(file - fileX);
    if (dist < best) {
      best = dist;
      x = file;
    }
  }
  const zAbs = Math.sqrt(Math.max(1, ARCH_R * ARCH_R - x * x));
  const side = x >= 0 ? -1 : 1;
  return {
    into: new THREE.Vector3(x, 0, sign * (zAbs + 0.62)),
    stage: new THREE.Vector3(x, 0, sign * (zAbs - 2.45)),
    chair: new THREE.Vector3(x + side * 1.42, 0, sign * (zAbs - 1.55)),
  };
}

function ArchDoor({ x, z, compact = false }: { x: number; z: number; compact?: boolean }) {
  const yaw = Math.atan2(-x, -z);
  const stone = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e7d3ae",
        roughness: 0.78,
        metalness: 0.03,
      }),
    [],
  );
  const gap = 1.2;
  const pierW = 0.3;
  const pierH = 3.15;
  const depth = 0.58;
  const rad = gap / 2;
  const voussoirs = [0, 1, 2, 3, 4, 5, 6];
  useEffect(
    () => () => {
      stone.dispose();
    },
    [stone],
  );
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]} scale={compact ? 0.82 : 1}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (rad + pierW / 2), pierH / 2, 0]} material={stone} castShadow receiveShadow>
          <boxGeometry args={[pierW, pierH, depth]} />
        </mesh>
      ))}
      {voussoirs.map((i) => {
        const a = Math.PI * (i / (voussoirs.length - 1));
        const cx = Math.cos(a) * rad;
        const cy = pierH + Math.sin(a) * rad;
        return (
          <mesh key={i} position={[cx, cy, 0]} rotation={[0, 0, a - Math.PI / 2]} material={stone} castShadow receiveShadow>
            <boxGeometry args={[0.34, 0.42, depth]} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.08, 0.16]} receiveShadow material={stone}>
        <boxGeometry args={[gap + pierW * 2, 0.16, depth + 0.2]} />
      </mesh>
      <mesh position={[0, pierH * 0.36, -1.05]}>
        <planeGeometry args={[gap * 0.52, pierH * 0.55]} />
        <meshBasicMaterial color="#140e0a" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
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
      const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const dressed = sources.map((source) => dressStone((source as THREE.MeshStandardMaterial).clone()));
      mesh.material = dressed.length === 1 ? dressed[0] : dressed;
    });
    return root;
  }, [gltf]);

  return <primitive object={model} scale={COLOSSEUM_SCALE} position={[0, COLOSSEUM_LIFT, 0]} />;
}

useGLTF.preload("/arena/coliseum.glb");
useGLTF.preload(WHITE_PAWN);
useGLTF.preload(BLACK_PAWN);

function buildFans() {
  const fans: Fan[] = [];
  const rings = [
    { r: 12.8, y: 1.55, count: 32 },
    { r: 15.6, y: 3.2, count: 40 },
    { r: 18.4, y: 4.95, count: 46 },
  ];
  rings.forEach((ring, band) => {
    for (let i = 0; i < ring.count; i++) {
      const a = (i / ring.count) * Math.PI * 2 + band * 0.17;
      const x = Math.sin(a) * ring.r;
      const z = Math.cos(a) * ring.r;
      const n = band * 40 + i;
      fans.push({
        x,
        y: ring.y,
        z,
        rot: Math.atan2(-x, -z) + (hash(n + 4) - 0.5) * 0.2,
        side: z >= 0 ? "w" : "b",
        s: 0.42 + hash(n + 2) * 0.08,
      });
    }
  });
  return fans;
}

function SeatedPawn({
  url,
  x,
  y,
  z,
  rot,
  scale,
  cheer,
}: {
  url: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  cheer: boolean;
}) {
  const { scene, animations } = useGLTF(url);
  const clone = useMemo(() => {
    const next = cloneSkeleton(scene);
    next.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
      if (/sword|knife|shield|axe|staff|crossbow|wand/i.test(obj.name)) obj.visible = false;
    });
    return next;
  }, [scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clone), [clone]);
  const mode = useRef<"sit" | "cheer">("sit");

  useEffect(() => {
    const sit = animations.find((clip) => clip.name === "Sit_Floor_Idle") ?? animations.find((clip) => clip.name === "Idle");
    if (!sit) return;
    const action = mixer.clipAction(sit);
    action.time = Math.random() * sit.duration;
    action.play();
    return () => {
      mixer.stopAllAction();
    };
  }, [animations, mixer]);

  useFrame((_, raw) => {
    const want = cheer ? "cheer" : "sit";
    if (want !== mode.current) {
      const nextName = want === "cheer" ? "Cheer" : "Sit_Floor_Idle";
      const nextClip = animations.find((clip) => clip.name === nextName) ?? animations.find((clip) => clip.name === "Idle");
      if (nextClip) {
        mixer.stopAllAction();
        const action = mixer.clipAction(nextClip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
      }
      mode.current = want;
    }
    mixer.update(Math.min(raw, 0.05));
  });

  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]} scale={scale}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[0.85, 0.16, 0.5]} />
        <meshStandardMaterial color="#d9c7a4" roughness={0.82} />
      </mesh>
      <primitive object={clone} position={[0, 0.1, 0]} />
    </group>
  );
}

function NightLantern({ x, z }: { x: number; z: number }) {
  const light = useRef<THREE.PointLight>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const yaw = Math.atan2(-x, -z);
  useFrame(() => {
    const night = arenaNight.value;
    if (light.current) light.current.intensity = night * 8;
    if (glow.current) glow.current.emissiveIntensity = 0.2 + night * 3.4;
  });
  return (
    <group position={[x, 4.15, z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.05, -0.28]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.55]} />
        <meshStandardMaterial color="#3a2e24" roughness={0.8} />
      </mesh>
      <mesh position={[0, -0.18, 0]}>
        <boxGeometry args={[0.22, 0.28, 0.22]} />
        <meshStandardMaterial ref={glow} color="#ffc27a" emissive="#ff8a1a" emissiveIntensity={0.4} roughness={0.35} />
      </mesh>
      <pointLight ref={light} position={[0, -0.12, 0.18]} color="#ffb15a" distance={18} decay={2} intensity={0} />
    </group>
  );
}

export function Arena({ cheer }: { cheer: ArenaSide | null }) {
  const fans = useMemo(() => buildFans(), []);
  const lanterns = useMemo(() => {
    const spots: { x: number; z: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.12;
      spots.push({ x: Math.sin(a) * 12.15, z: Math.cos(a) * 12.15 });
    }
    return spots;
  }, []);

  return (
    <group>
      <Coliseum />
      {ARCH_FILES.flatMap((x) => {
        const z = Math.sqrt(Math.max(1, ARCH_R * ARCH_R - x * x));
        return [
          <ArchDoor key={`n-${x}`} x={x} z={-(z + 0.85)} compact />,
          <ArchDoor key={`s-${x}`} x={x} z={z} />,
        ];
      })}
      {lanterns.map((spot) => (
        <NightLantern key={`${spot.x.toFixed(2)}-${spot.z.toFixed(2)}`} x={spot.x} z={spot.z} />
      ))}
      {fans.map((fan, i) => (
        <SeatedPawn
          key={i}
          url={fan.side === "w" ? WHITE_PAWN : BLACK_PAWN}
          x={fan.x}
          y={fan.y}
          z={fan.z}
          rot={fan.rot}
          scale={fan.s}
          cheer={cheer === "all" || cheer === fan.side}
        />
      ))}
    </group>
  );
}
