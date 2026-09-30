import { useEffect, useMemo, useRef } from "react";
import { useAnimations, useFBX, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { characterById, mountById, type TeamView } from "@/lib/avatar/catalog";

function prep(source: THREE.Object3D, height: number, dark: boolean) {
  const obj = cloneSkeleton(source);
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((mat) => {
      const copy = mat.clone() as THREE.MeshStandardMaterial;
      if ("skinning" in copy) (copy as THREE.MeshStandardMaterial & { skinning?: boolean }).skinning = true;
      if (dark && copy.color) copy.color = copy.color.clone().multiplyScalar(0.38);
      return copy;
    });
    mesh.material = next.length === 1 ? next[0] : next;
  });
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(height / (size.y || 1));
  obj.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(obj);
  obj.position.y -= grounded.min.y;
  return obj;
}

function metal(color: string, shine = 0.72) {
  return new THREE.MeshStandardMaterial({ color, metalness: shine, roughness: 0.28 });
}

function makeSword() {
  const group = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.62, 0.018), metal("#e7ebf2", 0.82));
  blade.position.y = 0.42;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), metal("#c6a15a", 0.7));
  guard.position.y = 0.08;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), metal("#3a2416", 0.15));
  grip.position.y = -0.04;
  group.add(blade, guard, grip);
  group.userData.kit = true;
  return group;
}

function makeShield() {
  const group = new THREE.Group();
  const board = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 6), metal("#8a6840", 0.45));
  board.rotation.x = Math.PI / 2;
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), metal("#e6c56a", 0.8));
  boss.position.z = 0.03;
  group.add(board, boss);
  group.userData.kit = true;
  return group;
}

function makeStaff() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.15, 8), metal("#6a5030", 0.2));
  pole.position.y = 0.35;
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), metal("#d7e7ff", 0.55));
  head.position.y = 0.96;
  group.add(pole, head);
  group.userData.kit = true;
  return group;
}

function makeCrown(id: string, team: TeamView) {
  const gold = team !== "b";
  const color = gold ? "#e8c56a" : "#1c1814";
  const shine = gold ? 0.86 : 0.55;
  const group = new THREE.Group();
  group.name = "kit-crown";
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.115, 0.04, 18), metal(color, shine));
  group.add(band);
  const spikes = id === "sun" ? 8 : id === "arched" ? 4 : id === "laurel" ? 6 : 5;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const spike =
      id === "laurel"
        ? new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), metal(gold ? "#b7c98a" : "#2a241c", 0.3))
        : new THREE.Mesh(new THREE.ConeGeometry(0.026, id === "sun" ? 0.09 : 0.13, 5), metal(color, shine));
    spike.position.set(Math.cos(a) * 0.1, 0.07, Math.sin(a) * 0.1);
    group.add(spike);
  }
  if (id === "arched") {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.01, 6, 12, Math.PI), metal(color, shine));
    arch.rotation.z = Math.PI;
    arch.position.y = 0.06;
    group.add(arch);
  }
  group.userData.kit = true;
  return group;
}

function findSlot(root: THREE.Object3D, side: "r" | "l" | "head") {
  const names =
    side === "head"
      ? ["Head", "head", "mixamorigHead"]
      : side === "r"
        ? ["handslot.r", "hand.r", "RightHand", "mixamorigRightHand", "Wrist.R", "wrist.r", "LowerArm.R", "lowerarm.r"]
        : ["handslot.l", "hand.l", "LeftHand", "mixamorigLeftHand", "Wrist.L", "wrist.l", "LowerArm.L", "lowerarm.l"];
  for (const name of names) {
    const hit = root.getObjectByName(name);
    if (hit) return hit;
  }
  return null;
}

function hideCarried(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (/sword|knife|shield|axe|staff|cutlass|weapon|wand|crossbow|dagger|blade/i.test(obj.name)) {
      obj.visible = false;
    }
  });
}

function placeKit(scene: THREE.Object3D, name: string, slot: THREE.Object3D | null, lift: number, size: number) {
  const obj = scene.getObjectByName(name);
  if (!obj) return;
  const anchor = slot ?? scene;
  anchor.updateWorldMatrix(true, false);
  const pos = new THREE.Vector3();
  anchor.getWorldPosition(pos);
  pos.y += lift;
  const parent = obj.parent ?? scene;
  parent.updateWorldMatrix(true, false);
  parent.worldToLocal(pos);
  obj.position.copy(pos);
  const parentQuat = new THREE.Quaternion();
  parent.getWorldQuaternion(parentQuat);
  obj.quaternion.copy(parentQuat.invert());
  const world = new THREE.Vector3();
  parent.getWorldScale(world);
  const inv = 1 / (Math.max(world.x, world.y, world.z) || 1);
  obj.scale.setScalar(inv * size);
}

function clearKit(root: THREE.Object3D) {
  const gone: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj.userData.kit) gone.push(obj);
  });
  for (const obj of gone) obj.parent?.remove(obj);
}

function GlbBody({
  url,
  height,
  dark,
  kit = "none",
  crownId = "circlet",
  team = "w",
  sit = false,
}: {
  url: string;
  height: number;
  dark: boolean;
  kit?: string;
  crownId?: string;
  team?: TeamView;
  sit?: boolean;
}) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => prep(gltf.scene, height, dark), [gltf.scene, height, dark]);
  const { actions } = useAnimations(gltf.animations, scene);
  useEffect(() => {
    const list = Object.values(actions).filter((clip): clip is NonNullable<typeof clip> => Boolean(clip));
    const idle =
      list.find((clip) => /idle[_\s-]?neutral|\|idle$/i.test(clip.getClip().name)) ||
      list.find((clip) => /idle/i.test(clip.getClip().name)) ||
      null;
    idle?.reset().fadeIn(0.2).play();
    return () => {
      idle?.fadeOut(0.1);
    };
  }, [actions]);
  useEffect(() => {
    clearKit(scene);
    hideCarried(scene);
    const right = findSlot(scene, "r");
    const left = findSlot(scene, "l");
    const head = findSlot(scene, "head");
    if (kit === "sword" || kit === "dual" || kit === "shield" || kit === "staff") {
      const sword = makeSword();
      sword.name = "kit-sword-r";
      scene.add(sword);
    }
    if (kit === "dual") {
      const sword = makeSword();
      sword.name = "kit-sword-l";
      scene.add(sword);
    }
    if (kit === "shield") {
      const shield = makeShield();
      shield.name = "kit-off-l";
      scene.add(shield);
    }
    if (kit === "staff") {
      const staff = makeStaff();
      staff.name = "kit-off-l";
      scene.add(staff);
    }
    const crown = makeCrown(crownId, team);
    scene.add(crown);
    placeKit(scene, "kit-crown", head, 0.18, 1);
    placeKit(scene, "kit-sword-r", right, 0.02, 0.42);
    placeKit(scene, "kit-sword-l", left, 0.02, 0.42);
    placeKit(scene, "kit-off-l", left, 0.04, kit === "staff" ? 0.55 : 0.7);
    return () => clearKit(scene);
  }, [scene, kit, crownId, team]);
  useFrame(() => {
    const right = findSlot(scene, "r");
    const left = findSlot(scene, "l");
    const head = findSlot(scene, "head");
    placeKit(scene, "kit-crown", head, 0.18, 1);
    placeKit(scene, "kit-sword-r", right, 0.02, 0.42);
    placeKit(scene, "kit-sword-l", left, 0.02, 0.42);
    placeKit(scene, "kit-off-l", left, 0.04, kit === "staff" ? 0.55 : 0.7);
    if (!sit) return;
    const bend = (re: RegExp, rad: number) => {
      const found: THREE.Bone[] = [];
      scene.traverse((obj) => {
        const next = obj as THREE.Bone;
        if (!next.isBone || !re.test(next.name)) return;
        found.push(next);
      });
      found.sort((a, b) => a.name.length - b.name.length);
      const bone = found[0];
      if (!bone) return;
      bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rad));
    };
    bend(/upperleg/i, -1.05);
    bend(/lowerleg/i, 1.2);
  });
  return <primitive object={scene} />;
}

function FbxBody({ url, height, dark }: { url: string; height: number; dark: boolean }) {
  const fbx = useFBX(url);
  const scene = useMemo(() => prep(fbx, height, dark), [fbx, height, dark]);
  return <primitive object={scene} />;
}

function Body({
  url,
  kind,
  height,
  dark,
  kit,
  crownId,
  team,
  sit = false,
}: {
  url: string;
  kind: "glb" | "fbx";
  height: number;
  dark: boolean;
  kit?: string;
  crownId?: string;
  team?: TeamView;
  sit?: boolean;
}) {
  if (kind === "fbx") return <FbxBody url={url} height={height} dark={dark} />;
  return <GlbBody url={url} height={height} dark={dark} kit={kit} crownId={crownId} team={team} sit={sit} />;
}

export function Figurine({
  characterId,
  mountId = "none",
  swordId = "none",
  crownId = "circlet",
  team = "w",
  attackId = "march",
  striking = false,
  dance = false,
}: {
  characterId: string;
  mountId?: string;
  swordId?: string;
  crownId?: string;
  team?: TeamView;
  attackId?: string;
  striking?: boolean;
  dance?: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const character = characterById(characterId);
  const mount = mountById(mountId);
  const dark = team === "b";
  const riding = Boolean(mount.url && mount.kind);

  useFrame(({ clock }) => {
    const group = ref.current;
    if (!group) return;
    const t = clock.elapsedTime;
    group.position.x = 0;
    group.position.z = 0;
    group.rotation.x = 0;
    group.rotation.z = 0;
    if (dance) {
      group.rotation.y = t * 2.4;
      group.position.y = Math.abs(Math.sin(t * 6)) * 0.18;
      return;
    }
    group.position.y = 0;
    if (!striking) {
      group.rotation.y = Math.sin(t * 0.7) * 0.18 + (team === "b" ? Math.PI : 0);
      return;
    }
    if (attackId === "slam") {
      group.position.y = Math.abs(Math.sin(t * 9)) * 0.42;
      group.rotation.y = team === "b" ? Math.PI : 0;
    } else if (attackId === "sweep") {
      group.rotation.y = Math.sin(t * 7) * 1.1;
    } else if (attackId === "charge") {
      group.position.z = Math.sin(t * 6) * 0.35;
      group.rotation.y = team === "b" ? Math.PI : 0;
    } else if (attackId === "bow") {
      group.rotation.x = Math.abs(Math.sin(t * 3)) * 0.45;
      group.rotation.y = team === "b" ? Math.PI : 0;
    } else if (attackId === "flash") {
      group.position.y = Math.sin(t * 14) * 0.08;
      group.rotation.y = t * 3;
    } else {
      group.rotation.y = t * 0.8;
    }
  });

  return (
    <group ref={ref}>
      {riding && mount.url && mount.kind ? (
        <Body url={mount.url} kind={mount.kind} height={mount.height ?? 1} dark={dark} />
      ) : null}
      <group
        position={[0, riding ? (mount.height ?? 1) * 0.72 : 0, riding ? 0.02 : 0]}
        rotation={[riding ? -0.18 : 0, 0, 0]}
      >
        <Body
          url={character.url}
          kind={character.kind}
          height={riding ? character.height * 0.58 : character.height}
          dark={dark}
          kit={swordId}
          crownId={crownId}
          team={team}
          sit={riding}
        />
      </group>
    </group>
  );
}

export function StauntonKnight({ white }: { white: boolean }) {
  const gltf = useGLTF("/avatars/knight-piece.glb");
  const scene = useMemo(() => {
    const obj = gltf.scene.clone(true);
    const tint = new THREE.Color(white ? "#f4efe4" : "#2a211c");
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mat = new THREE.MeshStandardMaterial({
        color: tint,
        roughness: white ? 0.35 : 0.5,
        metalness: white ? 0.18 : 0.08,
      });
      mesh.material = mat;
    });
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(0.92 / (size.y || 1));
    obj.updateMatrixWorld(true);
    const grounded = new THREE.Box3().setFromObject(obj);
    obj.position.y -= grounded.min.y;
    if (!white) obj.rotation.y = Math.PI;
    return obj;
  }, [gltf.scene, white]);
  return <primitive object={scene} />;
}

useGLTF.preload("/avatars/knight-piece.glb");
useGLTF.preload("/avatars/king-an.glb");
useGLTF.preload("/avatars/pirate.glb");
useGLTF.preload("/avatars/horse.glb");
