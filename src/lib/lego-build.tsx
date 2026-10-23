/**
 * Shared bits of "Create Lego board": the palette (official LDraw parts, see public/lego/CREDITS.md),
 * the piece format saved by the backend, and an instanced renderer for a whole build.
 *
 * Units: x, z in studs (integers, the footprint's low corner), y in plates (1 brick = 3 plates),
 * r in quarter turns. In the palette GLB 1 stud = 1 unit and 1 plate = 0.4 units.
 */
import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import * as THREE from "three";
import { asset } from "@/lib/base";

/** Bump with every palette rebuild so browsers do not keep an old GLB. */
const PALETTE_V = "b972114d";
export const PALETTE_URL = asset(`/lego/builder/palette.glb?v=${PALETTE_V}`);
export const PALETTE_META_URL = asset(`/lego/builder/palette.json?v=${PALETTE_V}`);

export type PaletteItem = { id: string; name: string; cat: string; price: number; tint: boolean; w: number; d: number; h: number };
export type LegoPiece = { p: string; x: number; y: number; z: number; r: number; c: string };

/** Build area in studs (matches php/src/LegoBuilder.php). */
export const BUILD_AREA = 60;
/** The chess board and its frame keep |x|, |z| < RESERVED studs clear. */
export const RESERVED = 19;
export const PLATE = 0.4;

/** Classic LEGO colours. */
export const LEGO_COLORS: { name: string; hex: string }[] = [
  { name: "White", hex: "#f4f4f4" },
  { name: "Light Bluish Grey", hex: "#a0a5a9" },
  { name: "Dark Bluish Grey", hex: "#6c6e68" },
  { name: "Black", hex: "#1b2a34" },
  { name: "Red", hex: "#c91a09" },
  { name: "Dark Red", hex: "#720e0f" },
  { name: "Orange", hex: "#fe8a18" },
  { name: "Yellow", hex: "#f2cd37" },
  { name: "Tan", hex: "#e4cd9e" },
  { name: "Reddish Brown", hex: "#582a12" },
  { name: "Lime", hex: "#bbe90b" },
  { name: "Green", hex: "#237841" },
  { name: "Dark Green", hex: "#184632" },
  { name: "Medium Azure", hex: "#36aebf" },
  { name: "Blue", hex: "#0055bf" },
  { name: "Dark Blue", hex: "#0a3463" },
  { name: "Medium Lavender", hex: "#ac78ba" },
  { name: "Magenta", hex: "#923978" },
  { name: "Bright Pink", hex: "#e4adc8" },
  { name: "Pearl Gold", hex: "#aa7f2e" },
];

let nodesCache: Promise<Map<string, THREE.Object3D>> | null = null;
/** Palette item nodes without React (the builder loads them up front). */
export function loadPaletteNodes(): Promise<Map<string, THREE.Object3D>> {
  nodesCache ??= new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(PALETTE_URL)
    .then((g) => bakePaletteNodes(g.scene))
    .catch((e) => {
      nodesCache = null;
      throw e;
    });
  return nodesCache;
}

let metaCache: Promise<PaletteItem[]> | null = null;
export function loadPaletteMeta(): Promise<PaletteItem[]> {
  metaCache ??= fetch(PALETTE_META_URL).then((r) => {
    if (!r.ok) throw new Error("Could not load the Brick pieces.");
    return r.json() as Promise<PaletteItem[]>;
  });
  return metaCache;
}

/** Footprint of an item after r quarter turns. */
export function footprint(it: Pick<PaletteItem, "w" | "d">, r: number): [number, number] {
  return r % 2 ? [it.d, it.w] : [it.w, it.d];
}

/** True when the footprint overlaps the chess board or leaves the build area. */
export function blocked(x: number, z: number, fw: number, fd: number): boolean {
  if (x < -BUILD_AREA || z < -BUILD_AREA || x + fw > BUILD_AREA || z + fd > BUILD_AREA) return true;
  return x < RESERVED && x + fw > -RESERVED && z < RESERVED && z + fd > -RESERVED;
}

/** Height map: stud cell "x,z" -> top of the highest piece there, in plates. */
export function heightMap(pieces: LegoPiece[], items: Map<string, PaletteItem>): Map<string, number> {
  const m = new Map<string, number>();
  for (const pc of pieces) {
    const it = items.get(pc.p);
    if (!it) continue;
    const [fw, fd] = footprint(it, pc.r);
    const top = pc.y + it.h;
    for (let i = 0; i < fw; i++)
      for (let j = 0; j < fd; j++) {
        const k = `${pc.x + i},${pc.z + j}`;
        if ((m.get(k) ?? 0) < top) m.set(k, top);
      }
  }
  return m;
}

/** Plate level a piece with this footprint lands on (resting on the highest thing under it). */
export function restLevel(hm: Map<string, number>, x: number, z: number, fw: number, fd: number): number {
  let y = 0;
  for (let i = 0; i < fw; i++) for (let j = 0; j < fd; j++) y = Math.max(y, hm.get(`${x + i},${z + j}`) ?? 0);
  return y;
}

/** Local transform of a piece in stud units. */
export function pieceMatrix(pc: LegoPiece, it: PaletteItem, out = new THREE.Matrix4()): THREE.Matrix4 {
  const [fw, fd] = footprint(it, pc.r);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (pc.r * Math.PI) / 2);
  return out.compose(new THREE.Vector3(pc.x + fw / 2, pc.y * PLATE, pc.z + fd / 2), q, new THREE.Vector3(1, 1, 1));
}

function plainAttr(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
  if (!(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && a.array instanceof Float32Array && !a.normalized)
    return a as THREE.BufferAttribute;
  const n = a.count;
  const s = a.itemSize;
  const f = new Float32Array(n * s);
  for (let i = 0; i < n; i++) {
    f[i * s] = a.getX(i);
    if (s > 1) f[i * s + 1] = a.getY(i);
    if (s > 2) f[i * s + 2] = a.getZ(i);
    if (s > 3) f[i * s + 3] = a.getW(i);
  }
  return new THREE.BufferAttribute(f, s);
}

/**
 * The palette GLB is meshopt-compressed and quantised, which leaves a small scale/offset on each mesh node.
 * Bake that into plain float geometry once so every mesh sits in its item's own space (instancing uses the
 * geometry alone).
 */
export function bakePaletteNodes(scene: THREE.Object3D): Map<string, THREE.Object3D> {
  const root = scene.children[0]?.name === "palette" ? scene.children[0] : scene;
  const m = new Map<string, THREE.Object3D>();
  for (const item of root.children) {
    m.set(item.name, item);
    if (item.userData.baked) continue;
    item.userData.baked = true;
    item.position.set(0, 0, 0);
    item.updateMatrixWorld(true);
    const inv = item.matrixWorld.clone().invert();
    const meshes: THREE.Mesh[] = [];
    item.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    for (const mesh of meshes) {
      const rel = inv.clone().multiply(mesh.matrixWorld);
      const g = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(mesh.geometry.attributes)) g.setAttribute(k, plainAttr(a));
      if (mesh.geometry.index) g.setIndex(mesh.geometry.index);
      g.applyMatrix4(rel);
      g.computeBoundingBox();
      g.computeBoundingSphere();
      mesh.geometry = g;
      if (mesh.parent !== item) item.add(mesh);
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.scale.set(1, 1, 1);
    }
    item.updateMatrixWorld(true);
  }
  return m;
}

/** The palette GLB's item nodes by id. */
export function usePaletteNodes(): Map<string, THREE.Object3D> {
  const gltf = useGLTF(PALETTE_URL);
  return useMemo(() => bakePaletteNodes(gltf.scene), [gltf]);
}

const tintCache = new Map<string, THREE.MeshStandardMaterial>();
/** Material for one mesh of an item: tintable surfaces take the piece colour, the rest keep theirs. */
export function pieceMaterial(base: THREE.Material, color: string): THREE.Material {
  if (base.name !== "tint") return base;
  let m = tintCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.35, metalness: 0 });
    tintCache.set(color, m);
  }
  return m;
}

/** Instanced meshes for a whole build. Each instance's userData maps instanceId -> piece index. */
export function buildInstances(pieces: LegoPiece[], items: Map<string, PaletteItem>, nodes: Map<string, THREE.Object3D>): THREE.Group {
  const root = new THREE.Group();
  const groups = new Map<string, number[]>();
  pieces.forEach((pc, i) => {
    if (!items.has(pc.p) || !nodes.has(pc.p)) return;
    const k = `${pc.p}|${pc.c}`;
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  });
  const m = new THREE.Matrix4();
  for (const [k, idx] of groups) {
    const [id, color] = k.split("|");
    const node = nodes.get(id)!;
    const it = items.get(id)!;
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const inst = new THREE.InstancedMesh(mesh.geometry, pieceMaterial(mesh.material as THREE.Material, color), idx.length);
      idx.forEach((pi, n) => inst.setMatrixAt(n, pieceMatrix(pieces[pi], it, m)));
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.userData.pieceIndex = idx;
      root.add(inst);
    });
  }
  return root;
}

/** A finished build placed around the chess board (scale = world units per stud). */
export function BuiltLego({ pieces, items, scale }: { pieces: LegoPiece[]; items: PaletteItem[]; scale: number }) {
  const nodes = usePaletteNodes();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const group = useMemo(() => {
    const g = buildInstances(pieces, byId, nodes);
    g.traverse((o) => (o.raycast = () => {}));
    return g;
  }, [pieces, byId, nodes]);
  useEffect(() => () => group.children.forEach((c) => (c as THREE.InstancedMesh).dispose()), [group]);
  return <primitive object={group} scale={scale} />;
}

/** Studded baseplate of the build area, drawn as one instanced stud field over a flat slab. */
export function BuildBaseplate({ color = "#237841", scale = 1 }: { color?: string; scale?: number }) {
  const studs = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.17, 12);
    geo.translate(0, 0.085, 0);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    const cells: [number, number][] = [];
    for (let x = -BUILD_AREA; x < BUILD_AREA; x++)
      for (let z = -BUILD_AREA; z < BUILD_AREA; z++) if (blocked(x, z, 1, 1) === false) cells.push([x, z]);
    const inst = new THREE.InstancedMesh(geo, mat, cells.length);
    const m = new THREE.Matrix4();
    cells.forEach(([x, z], i) => inst.setMatrixAt(i, m.makeTranslation(x + 0.5, 0, z + 0.5)));
    inst.receiveShadow = true;
    inst.raycast = () => {};
    return inst;
  }, [color]);
  return (
    <group scale={scale}>
      <mesh position={[0, -0.2, 0]} receiveShadow raycast={() => {}}>
        <boxGeometry args={[BUILD_AREA * 2, 0.4, BUILD_AREA * 2]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <primitive object={studs} />
    </group>
  );
}
