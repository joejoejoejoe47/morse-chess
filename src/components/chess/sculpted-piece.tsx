import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { Color, PieceSymbol } from "chess.js";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { asset } from "@/lib/base";
import { crownById, type TeamView } from "@/lib/avatar/catalog";
import { HAT_FIT, softenMetal } from "@/lib/avatar/hat-fit";

const FILE: Record<Color, Record<PieceSymbol, string>> = {
  w: {
    k: asset("/pieces/01_king_light.glb"),
    q: asset("/pieces/03_queen_light.glb"),
    b: asset("/pieces/05_bishop_light.glb"),
    n: asset("/pieces/07_knight_light.glb"),
    r: asset("/pieces/09_rook_light.glb"),
    p: asset("/pieces/11_pawn_light.glb"),
  },
  b: {
    k: asset("/pieces/02_king_dark.glb"),
    q: asset("/pieces/04_queen_dark.glb"),
    b: asset("/pieces/06_bishop_dark.glb"),
    n: asset("/pieces/08_knight_dark.glb"),
    r: asset("/pieces/10_rook_dark.glb"),
    p: asset("/pieces/12_pawn_dark.glb"),
  },
};

const HEIGHT: Record<PieceSymbol, number> = {
  k: 1.12,
  q: 1.04,
  b: 0.9,
  n: 0.84,
  r: 0.86,
  p: 0.66,
};

export function SculptedPiece({ type, color, ink, yaw, crowned = false }: { type: PieceSymbol; color: Color; ink?: string; yaw?: number; crowned?: boolean }) {
  const gltf = useGLTF(FILE[color][type]);
  const scene = useMemo(() => {
    const obj = cloneSkeleton(gltf.scene);
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = list.map((mat) => {
        const copy = (mat as THREE.MeshStandardMaterial).clone();
        if (ink) {
          copy.map = null;
          copy.color.set(ink);
          copy.metalness = 0.16;
          copy.roughness = 0.38;
        } else if (copy.map) {
          copy.map.colorSpace = THREE.SRGBColorSpace;
          copy.color.set("#ffffff");
        }
        return copy;
      });
      mesh.material = next.length === 1 ? next[0] : next;
    });
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    if (crowned && type === "k") hideFinial(obj, FINIAL_FROM[color]);
    obj.scale.multiplyScalar(HEIGHT[type] / (size.y || 1));
    obj.updateMatrixWorld(true);
    obj.position.y -= new THREE.Box3().setFromObject(obj).min.y;
    obj.rotation.y = yaw ?? (color === "w" ? Math.PI : 0);
    return obj;
  }, [gltf.scene, type, color, ink, yaw, crowned]);
  return <primitive object={scene} />;
}

/**
 * The king's head a crown is fitted to, in the crown group's own units: `r` the widest
 * rim of the head (the coronet flare a hat band wraps), `seat` the height of that rim
 * from the group's origin. Measured from the models (the dark Staunton king's head sits
 * a little higher than the light one's).
 */
export type KingHead = { r: number; seat: number };
export const STAUNTON_HEAD: Record<Color, KingHead> = { w: { r: 0.155, seat: -0.03 }, b: { r: 0.155, seat: -0.008 } };

/**
 * How each crown sits on a king: `band` the slice of the model's height that is its band
 * (the ring that goes round the head), `r` the band's radius over the head's, `sink` how far
 * below the rim it slides (in head radii, negative floats it above, like the halo).
 */
const KING_FIT: Record<string, { band: [number, number]; r: number; sink: number }> = {
  clown: { band: [0, 0.08], r: 0.7, sink: -0.25 },
  chef: { band: [0, 0.08], r: 0.92, sink: 0 },
  cappello: { band: [0.2, 0.3], r: 0.95, sink: 0 },
  viking: { band: [0, 0.08], r: 1.02, sink: 0.12 },
  "gold-crown": { band: [0, 0.08], r: 0.98, sink: 0 },
  "royal-crown": { band: [0, 0.08], r: 0.9, sink: 0 },
  "poly-band": { band: [0, 0.08], r: 0.98, sink: 0 },
  halo: { band: [0, 1], r: 1.0, sink: -0.75 },
};

/** The band of a crown model: its centre on x/z, radius and bottom, from the vertices in that slice. */
function bandOf(root: THREE.Object3D, [t0, t1]: [number, number]) {
  root.updateMatrixWorld(true);
  const all = new THREE.Box3().setFromObject(root, true);
  const h = all.max.y - all.min.y;
  const lo = all.min.y + t0 * h - 1e-6;
  const hi = all.min.y + t1 * h + 1e-6;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    const pos = mesh.isMesh ? mesh.geometry.getAttribute("position") : null;
    if (!pos) return;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (v.y >= lo && v.y <= hi) box.expandByPoint(v);
    }
  });
  if (box.isEmpty()) box.copy(all);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return { x: c.x, z: c.z, r: Math.max(size.x, size.z) / 2, bottom: box.min.y, mid: c.y };
}

/**
 * A crown or hat on a chess king: its band centred on the head's axis, level, wrapping the
 * rim of the head (see KingHead). Local y=0 is the king's crown point the callers place it at.
 */
export function KingCrown({ id, team, head = STAUNTON_HEAD.w }: { id: string; team: TeamView; head?: KingHead }) {
  void team;
  const spec = crownById(id);
  const gltf = useGLTF(spec.model || asset("/avatars/crowns/poly-band.glb"));
  const scene = useMemo(() => {
    const holder = new THREE.Group();
    const obj = gltf.scene.clone(true);
    holder.add(obj);
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
    });
    if (HAT_FIT[id]) obj.traverse((node) => (node as THREE.Mesh).isMesh && softenMetal(node as THREE.Mesh));
    const fit = KING_FIT[id] ?? { band: [0, 0.08] as [number, number], r: 1.06, sink: 0 };
    const band = bandOf(holder, fit.band);
    const k = (fit.r * head.r) / Math.max(band.r, 1e-4);
    const halo = id === "halo";
    holder.scale.setScalar(k);
    // The halo floats by its middle; everything else stands on its band.
    holder.position.set(-band.x * k, head.seat - (halo ? band.mid : band.bottom) * k - fit.sink * head.r, -band.z * k);
    return holder;
  }, [gltf.scene, id, head]);
  return <primitive object={scene} />;
}

/** Where the light and dark Staunton kings' heads end and the cross finial starts (share of height). */
export const FINIAL_FROM: Record<Color, number> = { w: 0.845, b: 0.865 };

/** Squash a king's cross finial down into the top of its head, for when it wears a crown. */
export function hideFinial(root: THREE.Object3D, fromTop: number) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const cut = box.min.y + (box.max.y - box.min.y) * fromTop;
  const v = new THREE.Vector3();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const back = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const geo = mesh.geometry.clone();
    const pos = geo.getAttribute("position");
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (v.y <= cut) continue;
      v.y = cut;
      v.applyMatrix4(back);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    mesh.geometry = geo;
  });
}
