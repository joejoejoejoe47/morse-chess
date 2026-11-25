/**
 * Real 3D arena surroundings (owner t392u/t402u): free Sketchfab models (CC BY 4.0) dropped in per chapter.
 * Add one with `bash scripts/arena-glb.sh <download.glb> <chapter>`; until a file exists the code-built arena shows.
 * The model is scaled to the arena size and lowered so the board sits on its flattest floor near the middle.
 */
import { Component, Suspense, useMemo, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { asset, hasAsset } from "@/lib/base";

export type ArenaModel = {
  file: string;
  title: string;
  author: string;
  authorUrl: string;
  url: string;
  /** Width the model is scaled to (board is ~9 wide). */
  size?: number;
  /** Extra tuning once we have seen the model in place. */
  rotY?: number;
  offset?: [number, number, number];
  /** Push everything inside this radius down (interiors with props in the middle). */
  clearRadius?: number;
};

const LICENSE = "CC BY 4.0";
export const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

export const ARENA_MODELS: Record<number, ArenaModel> = {
  1: { file: "/legendary/arenas/ch1.glb", title: "Steampunk Atelier", author: "Gaz3dModeling", authorUrl: "https://sketchfab.com/Gaz3dModeling", url: "https://sketchfab.com/3d-models/steampunk-atelier-cbbed80decb64bfd952bf87d18e42f2d", size: 34 },
  2: { file: "/legendary/arenas/ch2.glb", title: "Ice Castles NY — The Dome", author: "Katie Alois", authorUrl: "https://sketchfab.com/kalois", url: "https://sketchfab.com/3d-models/ice-castles-ny-the-dome-17e5f0bae5944ab0ab8cdaeab05a4e79", size: 36 },
  3: { file: "/legendary/arenas/ch3.glb", title: "Medieval Fortress Kit", author: "Aya Rady", authorUrl: "https://sketchfab.com/ayarady", url: "https://sketchfab.com/3d-models/medieval-fortress-kit-f246ce47e15f407b8399c1b270d782bd", size: 40 },
  4: { file: "/legendary/arenas/ch4.glb", title: "Witch Hut in a Swamp", author: "Eddie Roach", authorUrl: "https://sketchfab.com/eddie.roach", url: "https://sketchfab.com/3d-models/witch-hut-in-a-swamp-304f4aad73874c43a864e2b272fd7e4a", size: 38 },
  5: { file: "/legendary/arenas/ch5.glb", title: "Previz-Lowpoly Colosseum", author: "Neberkenezer", authorUrl: "https://sketchfab.com/neberkenezer", url: "https://sketchfab.com/3d-models/previz-lowpoly-colosseum-with-concept-textures-c1c2391478a34ba9a4c5f254c662fb30", size: 46 },
};

/** The model for a chapter, only when its file shipped with this build. */
export function arenaModel(n: number): ArenaModel | null {
  const m = ARENA_MODELS[n];
  return m && hasAsset(m.file) ? m : null;
}

export function creditLine(m: ArenaModel): string {
  return `Arena: “${m.title}” by ${m.author} (Sketchfab), ${LICENSE}`;
}

/** Credit shown wherever a model is on screen (CC BY needs title, author, source and licence). */
export function ArenaCredit({ n, className }: { n: number; className?: string }) {
  const m = arenaModel(n);
  if (!m) return null;
  return (
    <p className={className ?? "mcc-credit"} data-arena-credit={n}>
      Arena: <a href={m.url} target="_blank" rel="noreferrer">“{m.title}”</a> by <a href={m.authorUrl} target="_blank" rel="noreferrer">{m.author}</a>,{" "}
      <a href={LICENSE_URL} target="_blank" rel="noreferrer">{LICENSE}</a>
    </p>
  );
}

const FLOOR_Y = -0.62;

function Fitted({ m }: { m: ArenaModel }) {
  const gltf = useGLTF(asset(m.file), false, true);
  const obj = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.rotation.y = m.rotY ?? 0;
    root.updateMatrixWorld(true);
    // 1) scale to the arena size
    let box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const s = (m.size ?? 36) / Math.max(size.x, size.z, 0.001);
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    root.position.x -= c.x;
    root.position.z -= c.z;
    root.updateMatrixWorld(true);
    // 2) find the floor under the board: rays straight down from low-ish height, lowest common hit wins
    const ray = new THREE.Raycaster();
    const meshes: THREE.Object3D[] = [];
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
    const h = box.max.y - box.min.y;
    const startY = box.min.y + h * 0.35;
    const hits: number[] = [];
    for (const [x, z] of [[0, 0], [2.5, 2.5], [-2.5, 2.5], [2.5, -2.5], [-2.5, -2.5]]) {
      ray.set(new THREE.Vector3(x, startY, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(meshes, false)[0];
      if (hit) hits.push(hit.point.y);
    }
    const floor = hits.length ? hits.sort((a, b) => a - b)[Math.floor(hits.length / 2)] : box.min.y;
    root.position.y += FLOOR_Y - floor;
    if (m.offset) root.position.add(new THREE.Vector3(...m.offset));
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      // anything standing where the board goes is hidden so it never pokes through
      // (big shells such as floors, walls and domes stay; props smaller than the board are hidden)
      const b = new THREE.Box3().setFromObject(mesh);
      const p = b.getCenter(new THREE.Vector3());
      const sz = b.getSize(new THREE.Vector3());
      if (Math.hypot(p.x, p.z) < (m.clearRadius ?? 6.5) && Math.max(sz.x, sz.z) < 12 && b.max.y > FLOOR_Y + 0.15) mesh.visible = false;
    });
    return root;
  }, [gltf, m]);
  return <primitive object={obj} />;
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  componentDidCatch(e: unknown) { console.warn("arena model failed, using the built-in arena", e); }
  render() { return this.state.bad ? this.props.fallback : this.props.children; }
}

/** The chapter's real arena if its GLB shipped, else `fallback` (the code-built scenery). */
export function ArenaSurroundings({ n, fallback }: { n: number; fallback: ReactNode }) {
  const m = arenaModel(n);
  if (!m) return <>{fallback}</>;
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Fitted m={m} />
      </Suspense>
    </Boundary>
  );
}
