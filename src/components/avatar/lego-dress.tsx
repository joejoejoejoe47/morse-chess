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

/** Bare skull of each figure in its own file (figure height 1, facing +z): centre x/z, top y, radius. */
/**
 * `gear`: the head is a helmet or mask with no bare skull under it. It stays as it is and
 * a hat sits on top of it instead, at the gear's top and width.
 * `cut`: where hidden headgear starts, when it differs from the skull (top y, radius share).
 */
type Skull = {
  x: number;
  z: number;
  top: number;
  r: number;
  gear?: { top: number; r: number };
  cut?: { top?: number; r?: number };
  /** Shrink an oversized helmet head to minifig size (gear heads only). */
  size?: number;
};
export const SKULL: Record<string, Skull> = {
  "captain-america.glb": { x: -0.07, z: -0.155, top: 0.968, r: 0.13 },
  "spiderman.glb": { x: -0.006, z: -0.043, top: 0.95, r: 0.12 },
  "ironman.glb": { x: 0, z: -0.01, top: 0.97, r: 0.13, gear: { top: 1.0, r: 0.155 } },
  "blackpanther.glb": { x: -0.01, z: -0.01, top: 0.95, r: 0.13, gear: { top: 0.97, r: 0.165 }, size: 0.88 },
  "wizard.glb": { x: 0.13, z: -0.047, top: 0.8, r: 0.105 },
  "space-police.glb": { x: 0.028, z: -0.035, top: 0.88, r: 0.112, cut: { top: 0.9, r: 0.98 } },
  "widow.glb": { x: 0.01, z: -0.17, top: 0.93, r: 0.1 },
  "skeleton.glb": { x: 0, z: 0, top: 0.84, r: 0.125, cut: { top: 0.76, r: 1.0 } },
  "blacktron.glb": { x: 0, z: 0, top: 0.93, r: 0.12, gear: { top: 0.99, r: 0.15 } },
  "insectoid.glb": { x: 0, z: 0, top: 0.92, r: 0.12, gear: { top: 1.0, r: 0.165 } },
  "gigabot.glb": { x: 0, z: 0, top: 0.92, r: 0.12 },
  "doom-bigbrick.glb": { x: 0, z: 0.05, top: 0.86, r: 0.11, cut: { r: 0.95 } },
};
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
 */
const HEADGEAR: Record<string, { gear: string[]; back?: string[]; behind?: number; wide?: number; skin?: string }> = {
  "widow.glb": { gear: [], back: ["Dark_Orange"], behind: 0.6 },
  "doom-bigbrick.glb": { gear: ["#008000"] },
  "space-police.glb": { gear: ["White", "Trans_Red"], skin: "Yellow" },
};
const propNames = (file: string) => [...(PROPS[file]?.held ?? []), ...(PROPS[file]?.face ?? [])];
const matName = (mesh: THREE.Mesh) => ((Array.isArray(mesh.material) ? mesh.material[0]?.name : mesh.material?.name) ?? "").trim();

const skullOf = (file: string): Skull => SKULL[file] ?? { x: 0, z: 0, top: 0.95, r: 0.12 };


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
    const skullB = skullOf(bodyFile);
    const root = new THREE.Group();

    // Torso, arms and anything worn on them (cape, shield) come from the body figure.
    const slotB = boxOf(bodyG.scene, LEGS);
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

    // Legs: the leg figure's legs fill the body figure's leg space.
    const legsL = lift(legsG.scene, LEGS);
    const slotL = boxOf(legsG.scene, LEGS);
    const sB = slotB.getSize(new THREE.Vector3());
    const sL = slotL.getSize(new THREE.Vector3());
    const cB = slotB.getCenter(new THREE.Vector3());
    const cL = slotL.getCenter(new THREE.Vector3());
    const k = new THREE.Vector3(sB.x / (sL.x || 1), sB.y / (sL.y || 1), sB.z / (sL.z || 1));
    const legsHolder = new THREE.Group();
    legsHolder.add(legsL);
    legsL.position.set(-cL.x, -slotL.min.y, -cL.z);
    legsHolder.scale.copy(k);
    legsHolder.position.set(cB.x, slotB.min.y, cB.z);
    root.add(legsHolder);

    // Head: the head figure's skull lands on the body figure's skull.
    const headFile = partFile(head);
    const skullH = skullOf(headFile);
    const headN = lift(headG.scene, ["head"], hasHat && !skullH.gear ? { skull: skullH } : undefined);
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
    const hk = (skullB.r / skullH.r) * (skullH.gear ? (skullH.size ?? 1) : 1);
    const headHolder = new THREE.Group();
    headHolder.add(headN);
    headN.position.set(-skullH.x, -(skullH.top - 2 * skullH.r), -skullH.z);
    headHolder.scale.setScalar(hk);
    headHolder.position.set(skullB.x, skullB.top - 2 * skullB.r, skullB.z);
    root.add(headHolder);

    // Where the hat goes: on the skull, or on top of a helmet the head keeps.
    const hatAt: Skull = skullH.gear
      ? { x: skullB.x, z: skullB.z, top: skullB.top + (skullH.gear.top - skullH.top) * hk, r: skullH.gear.r * hk }
      : skullB;
    const unit = sB.x;
    return { root, skull: skullB, hatAt, hand: handOf(bodyG.scene, unit, propNames(bodyFile)), unit };
  }, [bodyG.scene, headG.scene, legsG.scene, body, head, hasHat, weapon]);

  return (
    <group position={[0, 0, 1.2]} scale={1.15}>
      <group position={[-fig.skull.x, 0, -fig.skull.z]}>
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
