import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { Color, PieceSymbol } from "chess.js";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { asset } from "@/lib/base";
import { crownById, type TeamView } from "@/lib/avatar/catalog";

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

export function SculptedPiece({ type, color, ink, yaw }: { type: PieceSymbol; color: Color; ink?: string; yaw?: number }) {
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
    obj.scale.multiplyScalar(HEIGHT[type] / (size.y || 1));
    obj.updateMatrixWorld(true);
    obj.position.y -= new THREE.Box3().setFromObject(obj).min.y;
    obj.rotation.y = yaw ?? (color === "w" ? Math.PI : 0);
    return obj;
  }, [gltf.scene, type, color, ink, yaw]);
  return <primitive object={scene} />;
}

/** Crown width matches the Staunton king's head. Bottom sits at local y=0. */
export function KingCrown({ id, team }: { id: string; team: TeamView }) {
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
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const fit = 0.26 / Math.max(size.x, size.z, 0.001);
    holder.scale.setScalar(fit);
    holder.position.set(-center.x * fit, -box.min.y * fit, -center.z * fit);
    return holder;
  }, [gltf.scene, team]);
  return <primitive object={scene} />;
}
