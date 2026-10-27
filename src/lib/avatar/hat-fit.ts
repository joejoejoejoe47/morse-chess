import * as THREE from "three";

/**
 * How each hat sits: `w` is the width of its band over the skull diameter, `sink` how
 * far it slides down over the skull (in skull diameters). `base` is the band's share of
 * the model's full width, for hats with parts that stick out (the jester's tails).
 */
export type HatFit = { w: number; sink: number; base?: number; yaw?: number };
export const HAT_FIT: Record<string, HatFit> = {
  clown: { w: 1.1, sink: 0.3, base: 0.38 },
  chef: { w: 1.15, sink: 0.3 },
  cappello: { w: 2.3, sink: 0.15 },
  "gold-crown": { w: 1.25, sink: 0.15 },
  viking: { w: 1.5, sink: 0.25 },
};
export const hatFitOf = (id: string): HatFit => HAT_FIT[id] ?? { w: 1.15, sink: 0.3 };

/** Full metal reads black without a reflection map; keep the hat's colour showing. */
export function softenMetal(mesh: THREE.Mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const lit = mats.map((m) => {
    const std = m as THREE.MeshStandardMaterial;
    if (!std.isMeshStandardMaterial || std.metalness <= 0.4) return m;
    const c = std.clone();
    c.metalness = 0.4;
    c.roughness = Math.min(Math.max(c.roughness, 0.35), 0.6);
    return c;
  });
  mesh.material = Array.isArray(mesh.material) ? lit : lit[0];
}
