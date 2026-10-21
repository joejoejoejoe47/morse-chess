/**
 * Sky Arena: the 8x8 board on a glowing plinth in the middle of a sci-fi
 * fighting stage that floats high above a city at sunset.
 *
 *  - stage.glb: "Low Poly Sci-fi Fighting Stage" by Umar (sketchfab.com/123umar123),
 *    Sketchfab Standard license. Textures resized to webp, its galaxy dome is hidden,
 *    and the roof cap was split into its own primitive that is single-sided facing
 *    down, so from the game camera above you look straight onto the board.
 *  - sky.webp: Poly Haven "Qwantani Sunset (Pure Sky)" (CC0), tone mapped and graded warmer.
 *  - the city below is procedural: merged buildings with lit windows, glowing streets, haze.
 * See public/sky-arena/CREDITS.md.
 */
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { asset } from "@/lib/base";

export const SKY_ARENA_BOARD_ID = "sky-arena";

const STAGE_URL = asset("/sky-arena/stage.glb");
const SKY_URL = asset("/sky-arena/sky.webp");

/** Model units -> world units. The model's inner floor is a disc of radius 0.124 (5 here), raised rim to 0.164. */
const SCALE = 40;
const PLINTH = 8.3;
/** Turn the stage so its 8 floor lamps sit between the board's corners and edges. */
const TURN = Math.PI / 8;
/** Spin the sky so the sunset sits in front of the white player's camera. */
const SKY_TURN = -1.9;
/** Sun direction in the sky image (u 0.5996, v 0.4658), turned by SKY_TURN. */
const SUN = new THREE.Vector3(Math.cos(0.626), Math.sin(0.107) * 1.6, Math.sin(0.626))
  .normalize()
  .applyAxisAngle(new THREE.Vector3(0, 1, 0), -SKY_TURN);
const HAZE = "#b88f86";
const CITY_Y = -95;

/** Camera limits for this board: close enough that the board always fills the view. */
export const SKY_ARENA_ZOOM = { min: 8.5, max: 15 } as const;
export const SKY_ARENA_CAMERA = { w: [0, 8.6, 11.2] as [number, number, number], b: [0, 8.6, -11.2] as [number, number, number] };

const CYAN = "#3fd8ff";
const VIOLET = "#b05cff";

function noRaycast() {
  return null;
}

/**
 * The stage's pillars and roof ring: anything clearly in front of the board (between
 * the camera and the board) is cut away, so it never hides the game.
 * The pillars behind the board stay and frame it.
 */
function seeThroughFront(mat: THREE.Material) {
  const m = mat.clone();
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vArenaWorld;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvArenaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vArenaWorld;")
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        {
          vec3 toBoard = -cameraPosition;
          float boardDist = length(toBoard);
          float along = dot(vArenaWorld - cameraPosition, toBoard / boardDist);
          if (along < boardDist - 6.5) discard;
        }`,
      );
  };
  m.customProgramCacheKey = () => "sky-arena-see-through";
  return m;
}

/** Tiny seeded random so the city looks the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windowTexture() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const r = rng(7);
  const n = 16;
  const cell = size / n;
  // map: wall + windows (lit warm, dim, dark glass); emissive is drawn into a second canvas
  const e = document.createElement("canvas");
  e.width = size;
  e.height = size;
  const ge = e.getContext("2d")!;
  g.fillStyle = "#2a2a34";
  g.fillRect(0, 0, size, size);
  ge.fillStyle = "#000";
  ge.fillRect(0, 0, size, size);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = r();
      const px = x * cell + cell * 0.2;
      const py = y * cell + cell * 0.22;
      const w = cell * 0.6;
      const h = cell * 0.56;
      if (k < 0.34) {
        const warm = ["#ffd08a", "#ffe2b0", "#ffc070", "#fff0d0", "#ffb860"][Math.floor(r() * 5)];
        g.fillStyle = warm;
        g.fillRect(px, py, w, h);
        ge.fillStyle = warm;
        ge.globalAlpha = 0.55 + r() * 0.45;
        ge.fillRect(px, py, w, h);
        ge.globalAlpha = 1;
      } else {
        g.fillStyle = k < 0.5 ? "#3a4a66" : "#141821";
        g.fillRect(px, py, w, h);
      }
    }
  }
  // keep the corner pixel (0,0) plain wall: roofs sample it
  g.fillStyle = "#2a2a34";
  g.fillRect(0, 0, 3, 3);
  ge.fillStyle = "#000";
  ge.fillRect(0, 0, 3, 3);
  const map = new THREE.CanvasTexture(c);
  const emissive = new THREE.CanvasTexture(e);
  for (const t of [map, emissive]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
  }
  return { map, emissive };
}

function streetTexture() {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#07080c";
  g.fillRect(0, 0, size, size);
  // one city block per texture repeat: glowing roads on two edges
  const road = size * 0.14;
  const grad = (x: number, y: number, w: number, h: number) => {
    g.fillStyle = "#3a2a1c";
    g.fillRect(x, y, w, h);
  };
  grad(0, 0, size, road);
  grad(0, 0, road, size);
  g.fillStyle = "#ffb050";
  g.fillRect(0, road * 0.12, size, 3);
  g.fillRect(0, road * 0.85, size, 3);
  g.fillRect(road * 0.12, 0, 3, size);
  g.fillRect(road * 0.85, 0, 3, size);
  g.fillStyle = "#ffe0a0";
  for (let i = 0; i < 12; i++) {
    g.fillRect(i * (size / 12), road * 0.48, 10, 3);
    g.fillRect(road * 0.48, i * (size / 12), 3, 10);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const BLOCK = 18;
const CITY_RADIUS = 600;

/** All buildings merged into one mesh; UVs are in world units so windows keep their size. */
function cityGeometry() {
  const r = rng(2026);
  const parts: THREE.BufferGeometry[] = [];
  const cells = Math.ceil(CITY_RADIUS / BLOCK);
  const road = BLOCK * 0.14;
  const lot = BLOCK - road;
  for (let i = -cells; i <= cells; i++) {
    for (let j = -cells; j <= cells; j++) {
      const bx = i * BLOCK;
      const bz = j * BLOCK;
      const d = Math.hypot(bx, bz);
      if (d > CITY_RADIUS) continue;
      // downtown: taller toward a center ahead of the white player, and right under the stage
      const down = Math.max(0, 1 - Math.hypot(bx - 20, bz + 140) / 260);
      const under = Math.max(0, 1 - d / 120);
      const split = r() < 0.5 ? 1 : 2;
      for (let a = 0; a < split; a++) {
        for (let b = 0; b < split; b++) {
          const w = (lot / split) * (0.62 + r() * 0.3);
          const dpt = (lot / split) * (0.62 + r() * 0.3);
          const tall = 5 + Math.pow(r(), 2.2) * (12 + down * 42 + under * 6);
          const cx = bx + road + (lot / split) * (a + 0.5);
          const cz = bz + road + (lot / split) * (b + 0.5);
          const geo = new THREE.BoxGeometry(w, tall, dpt);
          geo.translate(cx, tall / 2, cz);
          const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
          const ou = r() * 16;
          const ov = Math.floor(r() * 16);
          // BoxGeometry faces: +x, -x, +y, -y, +z, -z; 4 verts each
          for (let f = 0; f < 6; f++) {
            for (let v = 0; v < 4; v++) {
              const idx = f * 4 + v;
              if (f === 2 || f === 3) {
                uv.setXY(idx, 0.002, 0.002);
                continue;
              }
              const faceW = f < 2 ? dpt : w;
              const u0 = uv.getX(idx);
              const v0 = uv.getY(idx);
              // 16 windows per texture, one window every 1.6 units
              uv.setXY(idx, (ou + u0 * faceW / 1.6) / 16, (ov + v0 * tall / 1.6) / 16);
            }
          }
          parts.push(geo);
        }
      }
    }
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

function City() {
  const { geo, mats, ground } = useMemo(() => {
    const win = windowTexture();
    const street = streetTexture();
    const span = CITY_RADIUS * 2 + BLOCK * 2;
    street.repeat.set(span / BLOCK, span / BLOCK);
    street.offset.set(0.5 - (span / 2 / BLOCK) % 1, 0.5 - (span / 2 / BLOCK) % 1);
    return {
      geo: cityGeometry(),
      mats: new THREE.MeshStandardMaterial({
        map: win.map,
        emissiveMap: win.emissive,
        emissive: new THREE.Color("#ffffff"),
        emissiveIntensity: 1.6,
        roughness: 0.75,
        metalness: 0.15,
      }),
      ground: {
        span,
        mat: new THREE.MeshStandardMaterial({
          color: "#ffffff",
          map: street,
          emissiveMap: street,
          emissive: new THREE.Color("#ffffff"),
          emissiveIntensity: 0.9,
          roughness: 0.95,
        }),
      },
    };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mats.map?.dispose();
      mats.emissiveMap?.dispose();
      mats.dispose();
      ground.mat.map?.dispose();
      ground.mat.dispose();
    },
    [geo, mats, ground],
  );
  return (
    <group position={[0, CITY_Y, 0]}>
      <mesh geometry={geo} material={mats} raycast={noRaycast} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={ground.mat} raycast={noRaycast}>
        <planeGeometry args={[ground.span, ground.span]} />
      </mesh>
    </group>
  );
}

function SunsetSky() {
  const tex = useTexture(SKY_URL);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const before = {
      bg: scene.background,
      env: scene.environment,
      bgRot: scene.backgroundRotation.clone(),
      envRot: scene.environmentRotation.clone(),
      bgI: scene.backgroundIntensity,
      envI: scene.environmentIntensity,
    };
    scene.background = tex;
    scene.environment = tex;
    scene.backgroundRotation.set(0, SKY_TURN, 0);
    scene.environmentRotation.set(0, SKY_TURN, 0);
    scene.backgroundIntensity = 1;
    scene.environmentIntensity = 0.55;
    const cam = camera as THREE.PerspectiveCamera;
    const far = cam.far;
    cam.far = 1200;
    cam.updateProjectionMatrix();
    return () => {
      scene.background = before.bg;
      scene.environment = before.env;
      scene.backgroundRotation.copy(before.bgRot);
      scene.environmentRotation.copy(before.envRot);
      scene.backgroundIntensity = before.bgI;
      scene.environmentIntensity = before.envI;
      cam.far = far;
      cam.updateProjectionMatrix();
    };
  }, [tex, scene, camera]);
  return null;
}

export function SkyArenaWorld({
  squaresBottom = 0.04,
  plinth = true,
}: {
  /** World y where the board's squares (or the caller's own deck) start. */
  squaresBottom?: number;
  /** Draw our metal plinth under the squares (off when the caller brings its own deck). */
  plinth?: boolean;
}) {
  const gltf = useGLTF(STAGE_URL);
  // The plinth (0.28 tall) stands on the stage's inner floor; its corners rest in the rim slope
  // (0.18 up at their radius), so nothing pokes through. The squares sit on the plinth.
  const floorY = squaresBottom - 0.28;

  const stage = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = noRaycast;
      if (mesh.name.startsWith("AS_outer")) {
        mesh.visible = false; // the model's galaxy dome: replaced by the sunset sky
        return;
      }
      if (mesh.name.startsWith("Spot")) {
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(seeThroughFront) : seeThroughFront(mesh.material);
        mesh.castShadow = false;
      } else {
        mesh.castShadow = true;
      }
      mesh.receiveShadow = true;
    });
    return root;
  }, [gltf.scene]);

  const plinthH = squaresBottom - floorY;
  const trimY = squaresBottom - 0.05;
  const half = PLINTH / 2;
  const sun = SUN.clone().multiplyScalar(40);

  return (
    <>
      <SunsetSky />
      <fog attach="fog" args={[HAZE, 160, 650]} />
      <directionalLight position={[sun.x, sun.y, sun.z]} intensity={1.6} color="#ffb27a" />
      <hemisphereLight args={["#ffc9a8", "#3a2c48", 0.35]} />
      <primitive object={stage} position={[0, floorY, 0]} rotation={[0, TURN, 0]} scale={SCALE} />
      {plinth ? (
        <>
          <mesh position={[0, floorY + plinthH / 2 - 0.001, 0]} receiveShadow castShadow raycast={noRaycast}>
            <boxGeometry args={[PLINTH, plinthH, PLINTH]} />
            <meshStandardMaterial color="#141a2a" metalness={0.7} roughness={0.3} />
          </mesh>
          {[
            { p: [0, trimY, half], s: [PLINTH + 0.04, 0.05, 0.06], c: CYAN },
            { p: [0, trimY, -half], s: [PLINTH + 0.04, 0.05, 0.06], c: VIOLET },
            { p: [half, trimY, 0], s: [0.06, 0.05, PLINTH], c: "#7a8cff" },
            { p: [-half, trimY, 0], s: [0.06, 0.05, PLINTH], c: "#7a8cff" },
          ].map((t, i) => (
            <mesh key={i} position={t.p as [number, number, number]} raycast={noRaycast}>
              <boxGeometry args={t.s as [number, number, number]} />
              <meshStandardMaterial color={t.c} emissive={t.c} emissiveIntensity={1.4} toneMapped={false} />
            </mesh>
          ))}
        </>
      ) : null}
      <City />
    </>
  );
}
