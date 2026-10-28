import { fixLegoWinding } from "@/lib/avatar/lego-winding";
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { HAT_FIT, hatFitOf, softenMetal } from "@/lib/avatar/hat-fit";
import { asset } from "@/lib/base";
import { crownById, legoPartById } from "@/lib/avatar/catalog";

/**
 * The LG minifig dresser: one body (torso, arms, cape), one head, one pair of legs,
 * a hat and a held sword, each taken from a different Brick Verse figure.
 *
 * The figure files do not share pivots or proportions (some keep every node at the
 * origin, some are off-centre, some are smaller inside their box), so parts are not
 * swapped node-for-node. Instead every figure has a measured skull (SKULL) and its legs
 * are measured from the file, and each borrowed part is moved and scaled onto the
 * body figure's own joints:
 * - legs fill the body figure's own leg space exactly (hips under the torso, feet on the floor);
 * - the head's skull lands on the body figure's skull, scaled to the same size (head on the neck);
 * - a hat sits on that skull; whatever the head figure already wore on top
 *   (hood, helmet, wizard hat, hair, ears) is hidden so the hat replaces it;
 * - the sword sits in the right hand.
 * Picking all five from one figure gives back that figure exactly.
 */

/**
 * The minifig skeleton of every figure file (figure height 1, facing +z), measured from
 * its geometry (tools: lgtable.mjs), not guessed:
 * - `skull`: the bare head that sits on the neck: centre x/z, `y` the bottom of the head
 *   (where it meets the torso: the neck), `r` its radius. `top` (the head's top, under the
 *   stud) is worked out from those. A body figure's skull is also where its neck is.
 * - `legs`: the figure's own pair of legs: centre `x`, hip height `top` (floor is y=0),
 *   width `w`, and `z` the hip axle the legs swing on.
 * - `hipZ`: the centre of the hips (the bottom of the torso piece), front to back.
 *
 * Every minifig head is the same size next to its torso (skull radius is a third of the
 * hip width, in every file that has a plain head), so a borrowed head is scaled to the body
 * figure's own skull. Several files carry their legs set back from the hips (the Space
 * Police, Blacktron and Bomb Glider files have them 0.065 behind), so legs are placed by
 * the hips, not by where the body figure's own legs were.
 */
type Skull = {
  x: number;
  z: number;
  /** Bottom of the head: the neck. */
  y: number;
  r: number;
  /** Top of the head (below the stud): where a hat sits. */
  top: number;
  /**
   * The head is a helmet or mask that stays on; a hat sits on top of it, at the gear's top and
   * width. With `cut` as well, what sticks up past the gear top (Black Panther's ears) is
   * trimmed under the hat.
   */
  gear?: { top: number; r: number };
  /** Where hidden headgear starts, when it differs from the skull (top y, radius share). */
  cut?: { top?: number; r?: number };
};
type Rig = { skull: Skull; legs: { x: number; top: number; w: number; z: number }; hipZ: number };
const skull = (x: number, z: number, y: number, r: number, more: Partial<Skull> = {}): Skull => ({ x, z, y, r, top: y + 1.9 * r, ...more });
const RIG: Record<string, Rig> = {
  "captain-america.glb": { skull: skull(-0.072, -0.173, 0.72, 0.13), legs: { x: -0.072, top: 0.368, w: 0.39, z: -0.174 }, hipZ: -0.173 },
  "spiderman.glb": { skull: skull(0, -0.043, 0.713, 0.126), legs: { x: 0, top: 0.366, w: 0.381, z: -0.043 }, hipZ: -0.043 },
  "ironman.glb": {
    skull: skull(0, -0.018, 0.665, 0.118, { cut: { r: 1.06 } }),
    legs: { x: 0, top: 0.341, w: 0.355, z: -0.012 },
    hipZ: -0.018,
  },
  // A mask with no bare skull under it, much bigger than a minifig head: its radius here is
  // the skull it stands for, so it comes out helmet-sized.
  "blackpanther.glb": {
    skull: skull(0, -0.03, 0.52, 0.17, { top: 0.84, gear: { top: 0.86, r: 0.205 }, cut: { top: 0.86, r: 3 } }),
    legs: { x: -0.001, top: 0.172, w: 0.373, z: -0.029 },
    hipZ: -0.033,
  },
  "wizard.glb": { skull: skull(0.127, -0.05, 0.616, 0.111), legs: { x: 0.127, top: 0.314, w: 0.334, z: -0.05 }, hipZ: -0.05 },
  "space-police.glb": {
    skull: skull(-0.004, -0.055, 0.685, 0.118, { cut: { top: 0.9, r: 1.06 } }),
    legs: { x: -0.004, top: 0.339, w: 0.357, z: -0.12 },
    hipZ: -0.055,
  },
  "widow.glb": { skull: skull(-0.014, -0.202, 0.682, 0.123), legs: { x: -0.014, top: 0.348, w: 0.369, z: -0.203 }, hipZ: -0.202 },
  "skeleton.glb": { skull: skull(0, 0, 0.629, 0.116, { cut: { r: 1.08 } }), legs: { x: 0, top: 0.3, w: 0.321, z: 0.031 }, hipZ: 0 },
  "blacktron.glb": {
    skull: skull(0.009, -0.054, 0.691, 0.119, { cut: { r: 1.06 } }),
    legs: { x: 0.009, top: 0.342, w: 0.36, z: -0.119 },
    hipZ: -0.054,
  },
  "insectoid.glb": {
    skull: skull(0, -0.053, 0.686, 0.116, { cut: { r: 1.06 } }),
    legs: { x: 0, top: 0.329, w: 0.349, z: -0.116 },
    hipZ: -0.053,
  },
  "gigabot.glb": { skull: skull(0, -0.09, 0.675, 0.123), legs: { x: 0, top: 0.349, w: 0.37, z: -0.056 }, hipZ: -0.036 },
  // Doom's cape is merged into his body mesh, so his hip centre is where his own legs plug in (z 0.024).
  "doom-bigbrick.glb": { skull: skull(0, 0.031, 0.614, 0.095, { cut: { r: 1.1 } }), legs: { x: 0, top: 0.272, w: 0.26, z: 0.024 }, hipZ: 0.024 },
};
export const SKULL: Record<string, Skull> = Object.fromEntries(Object.entries(RIG).map(([f, rig]) => [f, rig.skull]));
/**
 * Things a figure carries in its arm meshes, by material: `held` sits in the right hand
 * (hidden when a weapon is chosen), `face` belongs to that figure's own head (hidden when
 * another head is worn).
 */
const PROPS: Record<string, { held?: string[]; face?: string[] }> = {
  "wizard.glb": { held: ["Red"], face: ["White", "Black", "Trans_Clear"] },
  "widow.glb": { held: ["Dark_Bluish_Grey"] },
  "skeleton.glb": { face: ["Black"] },
};
/** Headgear that is its own material in a head figure: taken off whole when a hat goes on. */
/**
 * `back`: the head has no back of its own, so the back of the headgear stays below the hat
 * (`behind`: how far behind the skull centre it starts, in skull radii; `wide`: clip radius).
 * `skin`: the head has no back, and its front is shown from inside instead.
 * `lid`: a flat top closing the trimmed head under an open crown (x/z half-widths and centre z
 * in the file, at the skull's cut top).
 */
type Lid = { rx: number; rz: number; z: number; color: string };
const HEADGEAR: Record<string, { gear: string[]; back?: string[]; behind?: number; wide?: number; skin?: string; lid?: Lid }> = {
  "widow.glb": { gear: [], back: ["Dark_Orange"], behind: 0.6 },
  "doom-bigbrick.glb": { gear: ["#008000"] },
  // The skeleton's black hood comes off whole; the skull under it stays round to its top.
  "skeleton.glb": { gear: ["Black"] },
  "space-police.glb": { gear: ["White", "Trans_Red"], skin: "Yellow" },
  // Helmets over a plain minifig head: a hat can't go over a helmet, so the helmet comes off
  // (the skull clip trims what is left of it) and the hat sits on the head at minifig size.
  "ironman.glb": { gear: ["Color_154", "Decoration_10908d1"] },
  "blacktron.glb": { gear: [], skin: "Yellow" },
  "insectoid.glb": { gear: ["Trans_Green"] },
  // The mask is one open shell: once its ears are trimmed it gets a lid, so an open crown
  // (gold crown, band, halo) doesn't show into it.
  "blackpanther.glb": { gear: [], skin: "bp_body", lid: { rx: 0.205, rz: 0.15, z: -0.025, color: "#1b1b1f" } },
};
const propNames = (file: string) => [...(PROPS[file]?.held ?? []), ...(PROPS[file]?.face ?? [])];
const matName = (mesh: THREE.Mesh) => ((Array.isArray(mesh.material) ? mesh.material[0]?.name : mesh.material?.name) ?? "").trim();

const rigOf = (file: string): Rig => RIG[file] ?? RIG["spiderman.glb"];
/** Ironman's hips are modelled inside his right leg (in the body's red). */
/** Standard minifig leg proportion: hip height over hip width. */
const LEG_RATIO = 0.94;
/** Largest borrowed-head skull radius, as a share of the torso's hip width. */
const MAX_HEAD_PER_HIP = 0.34;

const HIP_IN_LEGS: Record<string, string> = { "ironman.glb": "Color_154" };


const partFile = (id: string) => legoPartById(id).file;
const partUrl = (id: string) => asset(`/lego/chars/${partFile(id)}`);
const swordUrl = (id: string) => asset(id === "talwar" ? "/avatars/swords/talwar.glb" : "/avatars/swords/devil.glb");

const LEGS = ["legL", "legR"];

/** Box of the named nodes, in the figure file's own space. */
function boxOf(scene: THREE.Object3D, names: string[], skip: string[] = []) {
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const name of names) {
    scene.getObjectByName(name)?.traverse((node) => {
      const mesh = node as THREE.Mesh;
      const pos = mesh.isMesh ? (mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined) : undefined;
      if (!pos || skip.includes(matName(mesh))) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
      for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m));
    });
  }
  return box;
}

/** Lowest part of the right arm: where the hand closes. */
function handOf(scene: THREE.Object3D, unit: number, skip: string[]) {
  const box = boxOf(scene, ["armR"], skip);
  if (box.isEmpty()) return new THREE.Vector3(-0.2, 0.4, 0.05);
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const v = new THREE.Vector3();
  const sum = new THREE.Vector3();
  let n = 0;
  const cut = box.min.y + 0.05 * unit;
  scene.getObjectByName("armR")?.traverse((node) => {
    const mesh = node as THREE.Mesh;
    const pos = mesh.isMesh ? (mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined) : undefined;
    if (!pos || skip.includes(matName(mesh))) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (v.y <= cut) {
        sum.add(v);
        n++;
      }
    }
  });
  return n ? sum.divideScalar(n) : box.getCenter(new THREE.Vector3());
}

/**
 * Hide part of a mesh, measured in its figure file's space: everything above `yMax`,
 * or the headgear around a skull (anything above the skull top, or wider than the skull
 * above its lower half).
 */
type Clip = { yMax?: number; zMax?: number; skull?: Skull };
function clipMesh(mesh: THREE.Mesh, toFile: THREE.Matrix4, clip: Clip) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const next = mats.map((src) => {
    const mat = src.clone();
    const s = clip.skull;
    const uniforms = {
      uToFile: { value: toFile.clone() },
      uYMax: { value: clip.yMax ?? 1e6 },
      uZMax: { value: clip.zMax ?? 1e6 },
      uSkull: { value: new THREE.Vector4(s?.x ?? 0, s?.z ?? 0, s ? s.r * (s.cut?.r ?? 1.12) : 1e6, s ? s.top - s.r * 3 : 1e6) },
      uSkullTop: { value: s ? (s.cut?.top ?? s.top + s.r * 0.02) : 1e6 },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform mat4 uToFile;\nvarying vec3 vFileP;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvFileP = (uToFile * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uYMax;\nuniform float uZMax;\nuniform vec4 uSkull;\nuniform float uSkullTop;\nvarying vec3 vFileP;")
        .replace(
          "void main() {",
          "void main() {\n if (vFileP.y > uYMax || vFileP.z > uZMax) discard;\n if (vFileP.y > uSkull.w && (vFileP.y > uSkullTop || length(vFileP.xz - uSkull.xy) > uSkull.z)) discard;",
        );
    };
    mat.customProgramCacheKey = () => "lego-dress-clip";
    return mat;
  });
  mesh.material = Array.isArray(mesh.material) ? next : next[0];
}

/** Copy the named nodes of a figure (with their place in that file) into a new group, optionally clipped. */
function lift(scene: THREE.Object3D, names: string[], clip?: Clip) {
  fixLegoWinding(scene);
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const out = new THREE.Group();
  for (const name of names) {
    const src = scene.getObjectByName(name);
    if (!src) continue;
    const copy = src.clone(true);
    copy.matrixAutoUpdate = false;
    copy.matrix.multiplyMatrices(inv, src.matrixWorld);
    copy.matrix.decompose(copy.position, copy.quaternion, copy.scale);
    copy.matrixAutoUpdate = true;
    out.add(copy);
    if (clip) {
      out.updateMatrixWorld(true);
      copy.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) clipMesh(mesh, mesh.matrixWorld.clone(), clip);
      });
    }
  }
  return out;
}

/** A Brick Verse minifig built from a body, a head, a hat, a pair of legs, and a weapon. */
export { HAT_FIT };

export function LegoDress({
  body,
  head,
  hair,
  legs,
  weapon,
}: {
  body: string;
  head: string;
  hair: string;
  legs: string;
  weapon: string;
}) {
  const bodyG = useGLTF(partUrl(body));
  const headG = useGLTF(partUrl(head));
  const legsG = useGLTF(partUrl(legs));
  const hasHat = hair !== "none";

  const fig = useMemo(() => {
    const bodyFile = partFile(body);
    const legsFile = partFile(legs);
    const headFile = partFile(head);
    const B = rigOf(bodyFile);
    const L = rigOf(legsFile);
    const skullB = B.skull;
    const skullH = rigOf(headFile).skull;
    const root = new THREE.Group();

    // Torso, arms and anything worn on them (cape, shield) come from the body figure.
    root.add(lift(bodyG.scene, ["body"].filter((n) => bodyG.scene.getObjectByName(n)), undefined));
    const torso = root.children[0];
    // The body's own head is not used here; the head figure provides it.
    torso.getObjectByName("head")?.removeFromParent();
    // Hide what the body figure carries when the hand or face belongs to something else.
    const props = PROPS[bodyFile];
    const hide = [...(weapon !== "none" ? props?.held ?? [] : []), ...(head !== body ? props?.face ?? [] : [])];
    torso.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && hide.includes(matName(mesh))) mesh.visible = false;
    });
    // Hips modelled inside a leg belong to the torso: keep them with their body, not with the legs.
    const onlyMat = (group: THREE.Object3D, mat: string, keep: boolean) =>
      group.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh && (matName(mesh) === mat) !== keep) mesh.visible = false;
      });
    if (HIP_IN_LEGS[bodyFile] && legsFile !== bodyFile) {
      const hips = lift(bodyG.scene, LEGS);
      onlyMat(hips, HIP_IN_LEGS[bodyFile], true);
      root.add(hips);
    }

    // Legs: scaled to the body's hip width, hip axle under the centre of the hips, tops at the
    // hip line, and the whole figure is then stood on the floor. Legs are scaled evenly, except
    // a pair modelled squatter than a standard minifig leg (hip height ~0.94 x hip width, e.g.
    // Black Panther's) is drawn out to standard height so every figure stands the same.
    const legsL = lift(legsG.scene, LEGS);
    if (HIP_IN_LEGS[legsFile] && legsFile !== bodyFile) onlyMat(legsL, HIP_IN_LEGS[legsFile], false);
    const k = B.legs.w / L.legs.w;
    const legsHolder = new THREE.Group();
    legsHolder.add(legsL);
    legsL.position.set(-L.legs.x, -L.legs.top, -L.legs.z);
    const ky = k * Math.max(1, (LEG_RATIO * L.legs.w) / L.legs.top);
    legsHolder.scale.set(k, ky, k);
    legsHolder.position.set(B.legs.x, B.legs.top, B.hipZ);
    root.add(legsHolder);
    const floor = B.legs.top - L.legs.top * ky;

    // Head: scaled to the body's own head size, the bottom of the skull centred on the neck.
    const headN = lift(headG.scene, ["head"], hasHat && (!skullH.gear || skullH.cut) ? { skull: skullH } : undefined);
    if (hasHat)
      headN.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const gear = HEADGEAR[headFile];
        if (gear?.gear.includes(matName(mesh))) mesh.visible = false;
        else if (gear?.back?.includes(matName(mesh)))
          clipMesh(mesh, mesh.matrixWorld.clone(), {
            zMax: skullH.z - skullH.r * (gear.behind ?? 0.1),
            skull: { ...skullH, cut: { top: skullH.top - skullH.r * 0.15, r: gear.wide ?? 3 } },
          });
        else if (gear?.skin === matName(mesh)) {
          const two = [mesh.material].flat().map((m) => {
            // clone() drops the headgear clip shader, so carry it over.
            const c = Object.assign(m.clone(), { side: THREE.DoubleSide });
            c.onBeforeCompile = m.onBeforeCompile;
            c.customProgramCacheKey = m.customProgramCacheKey;
            return c;
          });
          mesh.material = Array.isArray(mesh.material) ? two : two[0];
        }
      });
    const lid = HEADGEAR[headFile]?.lid;
    if (hasHat && lid) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: lid.color, roughness: 0.5 }),
      );
      disc.scale.set(lid.rx, 1, lid.rz);
      disc.position.set(skullH.x, (skullH.cut?.top ?? skullH.top) - 0.004, lid.z);
      headN.add(disc);
    }
    // A borrowed head is never bigger than a standard minifig head for the torso (skull radius
    // ~1/3 of hip width): Black Panther's own oversized cat head stays only on its own body.
    const headR = headFile === bodyFile ? skullB.r : Math.min(skullB.r, MAX_HEAD_PER_HIP * B.legs.w);
    const hk = headR / skullH.r;
    const headHolder = new THREE.Group();
    headHolder.add(headN);
    headN.position.set(-skullH.x, -skullH.y, -skullH.z);
    headHolder.scale.setScalar(hk);
    headHolder.position.set(skullB.x, skullB.y, skullB.z);
    root.add(headHolder);

    // Where the hat goes: on the skull, or on top of a helmet the head keeps.
    const top = skullH.gear ?? skullH;
    const hatAt: Skull = { x: skullB.x, z: skullB.z, y: skullB.y, top: skullB.y + (top.top - skullH.y) * hk, r: top.r * hk };
    const unit = B.legs.w;
    return { root, skull: skullB, floor, hatAt, hand: handOf(bodyG.scene, unit, propNames(bodyFile)), unit };
  }, [bodyG.scene, headG.scene, legsG.scene, body, head, legs, hasHat, weapon]);

  return (
    <group position={[0, 0, 1.2]} scale={1.15}>
      <group position={[-fig.skull.x, -fig.floor, -fig.skull.z]}>
        <primitive object={fig.root} />
        {hasHat ? (
          <group position={[fig.hatAt.x, fig.hatAt.top, fig.hatAt.z]}>
            <MinifigHat id={hair} skull={fig.hatAt} />
          </group>
        ) : null}
        {weapon !== "none" ? (
          <group position={fig.hand} scale={fig.unit / 0.36}>
            <SwordBit id={weapon} />
          </group>
        ) : null}
      </group>
    </group>
  );
}

/** A hat crown sized to the skull and pushed down over it; local y=0 is the skull top. */
function MinifigHat({ id, skull }: { id: string; skull: Skull }) {
  const spec = crownById(id);
  const gltf = useGLTF(spec.model || asset("/avatars/crowns/poly-band.glb"));
  const fit = hatFitOf(id);
  const obj = useMemo(() => {
    const holder = new THREE.Group();
    const hat = gltf.scene.clone(true);
    hat.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        softenMetal(mesh);
      }
    });
    holder.add(hat);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder, true);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = (fit.w * 2 * skull.r) / (Math.max(size.x, size.z, 1e-3) * (fit.base ?? 1));
    hat.position.set(-center.x, -box.min.y, -center.z);
    holder.scale.setScalar(s);
    holder.position.y = -fit.sink * 2 * skull.r;
    if (fit.yaw) holder.rotation.y = fit.yaw;
    return holder;
  }, [gltf.scene, fit, skull]);
  return <primitive object={obj} />;
}

/** The sword, gripped at its hilt, blade forward and up. */
function SwordBit({ id }: { id: string }) {
  const gltf = useGLTF(swordUrl(id));
  const obj = useMemo(() => {
    const holder = new THREE.Group();
    const blade = gltf.scene.clone(true);
    holder.add(blade);
    blade.position.y = -0.08;
    holder.scale.setScalar(0.7);
    holder.rotation.set(0.55, 0, 0);
    return holder;
  }, [gltf.scene]);
  return <primitive object={obj} />;
}
