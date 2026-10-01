import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useAnimations, useFBX, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { characterById, crownById, mountById, type TeamView } from "@/lib/avatar/catalog";

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

function fitCrown(source: THREE.Object3D) {
  const obj = source.clone(true);
  obj.name = "kit-crown";
  obj.userData.kit = true;
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    }
  });
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 0.001);
  const fit = 0.18 / span;
  obj.scale.setScalar(fit);
  obj.position.y = -box.min.y * fit;
  return obj;
}

function fitHandSword(source: THREE.Object3D) {
  const obj = source.clone(true);
  obj.name = "kit-sword-r";
  obj.userData.kit = true;
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    }
  });
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const fit = 0.55 / Math.max(size.y, size.x, size.z, 0.001);
  obj.scale.setScalar(fit);
  obj.position.set(0, 0.05, 0.02);
  obj.rotation.set(-0.4, 0, 0.2);
  return obj;
}

function swordFile(id: string) {
  if (id === "talwar") return "/avatars/swords/talwar.glb";
  return "/avatars/swords/devil.glb";
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

function seatCrown(head: THREE.Object3D, crown: THREE.Object3D) {
  head.add(crown);
  crown.position.set(0, 0, 0);
  crown.updateWorldMatrix(true, true);
  const crownBox = new THREE.Box3().setFromObject(crown);
  const crownSize = crownBox.getSize(new THREE.Vector3());
  const headBox = new THREE.Box3();
  head.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.kit) headBox.expandByObject(mesh);
  });
  const headWidth = headBox.isEmpty() ? 0.2 : Math.max(headBox.getSize(new THREE.Vector3()).x, 0.12);
  const fit = (headWidth * 0.68) / Math.max(crownSize.x, crownSize.z, 0.001);
  crown.scale.multiplyScalar(fit);
  crown.updateWorldMatrix(true, true);
  const fitted = new THREE.Box3().setFromObject(crown);
  const top = headBox.isEmpty() ? new THREE.Vector3(0, 0.14, 0) : headBox.max.clone();
  const bottom = fitted.min.clone();
  head.worldToLocal(top);
  head.worldToLocal(bottom);
  crown.position.y += top.y - bottom.y + 0.005;
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
  crownId = "poly-band",
  team = "w",
  sit = false,
  wearCrown = true,
  pace = null,
  striking = false,
}: {
  url: string;
  height: number;
  dark: boolean;
  kit?: string;
  crownId?: string;
  team?: TeamView;
  sit?: boolean;
  wearCrown?: boolean;
  pace?: MutableRefObject<{ act: string }> | null;
  striking?: boolean;
}) {
  const gltf = useGLTF(url);
  const crownSpec = crownById(crownId);
  const crownFile = useGLTF(crownSpec.model || "/avatars/crowns/poly-band.glb");
  const bladeFile = useGLTF(swordFile(kit));
  const scene = useMemo(() => prep(gltf.scene, height, dark), [gltf.scene, height, dark]);
  const { actions } = useAnimations(gltf.animations, scene);
  const clipMode = useRef("");
  useEffect(() => {
    if (pace) return;
    const list = Object.values(actions).filter((clip): clip is NonNullable<typeof clip> => Boolean(clip));
    const idle =
      list.find((clip) => /idle[_\s-]?neutral|\|idle$/i.test(clip.getClip().name)) ||
      list.find((clip) => /idle/i.test(clip.getClip().name)) ||
      null;
    idle?.reset().fadeIn(0.2).play();
    return () => {
      idle?.fadeOut(0.1);
    };
  }, [actions, pace]);
  useFrame(() => {
    if (!pace && !striking) return;
    const want = striking || pace?.current.act === "attack" ? "attack" : pace?.current.act === "walk" ? "walk" : "idle";
    if (want === clipMode.current) return;
    const list = Object.values(actions).filter((clip): clip is NonNullable<typeof clip> => Boolean(clip));
    const named = (clip: { getClip: () => { name: string } }) => clip.getClip().name;
    const next =
      want === "walk"
        ? list.find((clip) => /\|walk$/i.test(named(clip))) || list.find((clip) => /walk/i.test(named(clip)) && !/back|left|right/i.test(named(clip)))
        : want === "attack"
          ? list.find((clip) => /1H_Melee_Attack_Chop/i.test(named(clip))) ||
            list.find((clip) => /Melee_Attack_Stab|Melee_Attack_Slice_Horizontal|Unarmed_Melee_Attack_Kick/i.test(named(clip))) ||
            list.find((clip) => /attack/i.test(named(clip)) && !/death|hit|spin|ranged|block/i.test(named(clip)))
          : list.find((clip) => /idle_neutral|\|idle$/i.test(named(clip))) || list.find((clip) => /idle/i.test(named(clip)));
    const prev = list.find((clip) => clip.isRunning());
    prev?.fadeOut(0.15);
    if (next) {
      next.reset();
      next.setLoop(want === "attack" ? THREE.LoopOnce : THREE.LoopRepeat, want === "attack" ? 1 : Infinity);
      next.clampWhenFinished = want === "attack";
      next.fadeIn(0.12).play();
    }
    clipMode.current = want;
  });
  useEffect(() => {
    clearKit(scene);
    hideCarried(scene);
    const right = findSlot(scene, "r");
    const head = findSlot(scene, "head");
    if (kit === "devil" || kit === "talwar") {
      const sword = fitHandSword(bladeFile.scene);
      (right ?? scene).add(sword);
    }
    if (wearCrown) {
      const crown = crownSpec.model ? fitCrown(crownFile.scene) : makeCrown(crownId, team);
      if (head) seatCrown(head, crown);
      else {
        scene.add(crown);
        crown.position.set(0, height * 0.92, 0);
      }
    }
    return () => clearKit(scene);
  }, [scene, kit, crownId, team, wearCrown, crownFile.scene, bladeFile.scene, height]);
  useFrame(() => {
    if (!sit) return;
    const pose = (bone: THREE.Bone, euler: THREE.Euler) => {
      const data = bone.userData as { sitRest?: THREE.Quaternion };
      if (!data.sitRest) data.sitRest = bone.quaternion.clone();
      bone.quaternion.copy(data.sitRest).multiply(new THREE.Quaternion().setFromEuler(euler));
    };
    scene.traverse((obj) => {
      const bone = obj as THREE.Bone;
      if (!bone.isBone) return;
      const name = bone.name.toLowerCase();
      const left = name.includes("left") || name.endsWith(".l") || name.includes("_l");
      const right = name.includes("right") || name.endsWith(".r") || name.includes("_r");
      if (!left && !right) return;
      if (/upperleg|thigh/.test(name)) pose(bone, new THREE.Euler(-1.2, 0, (left ? 1 : -1) * 0.85));
      else if (/lowerleg|calf|shin/.test(name)) pose(bone, new THREE.Euler(0.15, 0, 0));
    });
  });
  return <primitive object={scene} />;
}

function gaitClip(
  actions: Record<string, THREE.AnimationAction | null>,
  want: "walk" | "idle",
) {
  const list = Object.values(actions).filter((clip): clip is THREE.AnimationAction => Boolean(clip));
  const named = (clip: THREE.AnimationAction) => clip.getClip().name;
  return want === "walk"
    ? list.find((clip) => /\|Walk$/i.test(named(clip))) || list.find((clip) => /walk/i.test(named(clip)) && !/jump/i.test(named(clip)))
    : list.find((clip) => /\|Idle$/i.test(named(clip))) || list.find((clip) => /^Idle$/i.test(named(clip))) || list.find((clip) => /idle/i.test(named(clip)) && !/hit|head/i.test(named(clip)));
}

function MountClips({
  actions,
  pace,
}: {
  actions: Record<string, THREE.AnimationAction | null>;
  pace?: MutableRefObject<{ act: string }> | null;
}) {
  const mode = useRef("");
  useFrame(() => {
    const want = pace?.current.act === "walk" ? "walk" : "idle";
    if (want === mode.current) return;
    const list = Object.values(actions).filter((clip): clip is THREE.AnimationAction => Boolean(clip));
    const next = gaitClip(actions, want);
    list.forEach((clip) => {
      if (clip !== next && clip.isRunning()) clip.fadeOut(0.15);
    });
    if (next) next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.12).play();
    mode.current = want;
  });
  return null;
}

function GlbMount({
  url,
  height,
  dark,
  pace,
}: {
  url: string;
  height: number;
  dark: boolean;
  pace?: MutableRefObject<{ act: string }> | null;
}) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const obj = prep(gltf.scene, height, dark);
    obj.traverse((node) => {
      if (/crown/i.test(node.name)) node.visible = false;
    });
    return obj;
  }, [gltf.scene, height, dark]);
  const { actions } = useAnimations(gltf.animations, scene);
  return (
    <>
      <primitive object={scene} />
      <MountClips actions={actions} pace={pace} />
    </>
  );
}

function FbxMount({
  url,
  height,
  dark,
  pace,
}: {
  url: string;
  height: number;
  dark: boolean;
  pace?: MutableRefObject<{ act: string }> | null;
}) {
  const fbx = useFBX(url);
  const scene = useMemo(() => {
    const obj = prep(fbx, height, dark);
    obj.traverse((node) => {
      if (/crown/i.test(node.name)) node.visible = false;
    });
    return obj;
  }, [fbx, height, dark]);
  const { actions } = useAnimations(fbx.animations, scene);
  return (
    <>
      <primitive object={scene} />
      <MountClips actions={actions} pace={pace} />
    </>
  );
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
  wearCrown = true,
  pace = null,
  striking = false,
}: {
  url: string;
  kind: "glb" | "fbx";
  height: number;
  dark: boolean;
  kit?: string;
  crownId?: string;
  team?: TeamView;
  sit?: boolean;
  wearCrown?: boolean;
  pace?: MutableRefObject<{ act: string }> | null;
  striking?: boolean;
}) {
  if (kind === "fbx") return <FbxBody url={url} height={height} dark={dark} />;
  return <GlbBody url={url} height={height} dark={dark} kit={kit} crownId={crownId} team={team} sit={sit} wearCrown={wearCrown} pace={pace} striking={striking} />;
}

export function Figurine({
  characterId,
  mountId = "none",
  swordId = "none",
  crownId = "poly-band",
  team = "w",
  attackId = "march",
  striking = false,
  dance = false,
  pace = null,
}: {
  characterId: string;
  mountId?: string;
  swordId?: string;
  crownId?: string;
  team?: TeamView;
  attackId?: string;
  striking?: boolean;
  dance?: boolean;
  pace?: MutableRefObject<{ act: string }> | null;
}) {
  const ref = useRef<THREE.Group>(null);
  const mountRef = useRef<THREE.Group>(null);
  const riderRef = useRef<THREE.Group>(null);
  const character = characterById(characterId);
  const mount = mountById(mountId);
  const dark = team === "b";
  const riding = Boolean(mount.url && mount.kind);
  const royal = character.id === "royal";
  const plainKing = character.id === "piece";

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
    const step = pace?.current.act === "walk";
    if (riding && mountRef.current && riderRef.current) {
      const back = mountRef.current.getObjectByName("Back") || mountRef.current.getObjectByName("Torso") || mountRef.current;
      const spot = new THREE.Vector3();
      back.getWorldPosition(spot);
      riderRef.current.parent?.worldToLocal(spot);
      riderRef.current.position.set(spot.x, spot.y - character.height * 0.53, spot.z);
      riderRef.current.rotation.set(0, character.yaw ?? 0, 0);
    }
    if (pace) {
      group.rotation.y = 0;
      if (!riding) group.position.y = step ? Math.abs(Math.sin(t * 8)) * 0.05 : 0;
      return;
    }
    group.position.y = 0;
    group.rotation.y = Math.sin(t * 0.7) * 0.18 + (team === "b" ? Math.PI : 0);
  });

  return (
    <group ref={ref}>
      {riding && mount.url && mount.kind ? (
        <group ref={mountRef}>
          {mount.kind === "fbx" ? (
            <FbxMount url={mount.url} height={mount.height ?? 1} dark={dark} pace={pace} />
          ) : (
            <GlbMount url={mount.url} height={mount.height ?? 1} dark={dark} pace={pace} />
          )}
        </group>
      ) : null}
      <group ref={riderRef}>
        {plainKing ? (
          <StauntonKing white={!dark} crownId={crownId} team={team} swordId="none" />
        ) : (
          <Body
            url={character.url}
            kind={character.kind}
            height={character.height}
            dark={dark}
            kit={swordId}
            crownId={crownId}
            team={team}
            sit={riding}
            wearCrown={!royal}
            pace={pace}
            striking={striking}
          />
        )}
      </group>
    </group>
  );
}

function StauntonKing({
  white,
  crownId,
  team,
  swordId,
}: {
  white: boolean;
  crownId: string;
  team: TeamView;
  swordId: string;
}) {
  const spec = crownById(crownId);
  const file = useGLTF(spec.model || "/avatars/crowns/poly-band.glb");
  const crown = useMemo(
    () => (spec.model ? fitCrown(file.scene) : makeCrown(crownId, team)),
    [spec.model, file.scene, crownId, team],
  );
  const blade = useMemo(() => (swordId === "none" ? null : makeSword()), [swordId]);
  const color = white ? "#f7f1e6" : "#241c16";
  return (
    <group>
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.34, 0.16, 24]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.16} />
      </mesh>
      <mesh position={[0, 0.26, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.24, 0.2, 20]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.16} />
      </mesh>
      <mesh position={[0, 0.62, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.13, 0.5, 16]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.16} />
      </mesh>
      <mesh position={[0, 0.94, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.15, 0.12, 18]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.16} />
      </mesh>
      <mesh position={[0, 1.12, 0]} castShadow>
        <boxGeometry args={[0.045, 0.2, 0.045]} />
        <meshStandardMaterial color="#e6c56a" metalness={0.72} roughness={0.28} />
      </mesh>
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[0.16, 0.04, 0.04]} />
        <meshStandardMaterial color="#e6c56a" metalness={0.72} roughness={0.28} />
      </mesh>
      <primitive object={crown} position={[0, 1.02, 0]} />
      {blade ? <primitive object={blade} position={[0.28, 0.7, 0]} /> : null}
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
useGLTF.preload("/avatars/crowns/poly-band.glb");
useGLTF.preload("/avatars/crowns/poly-arch.glb");
useGLTF.preload("/avatars/swords/devil.glb");
useGLTF.preload("/avatars/swords/talwar.glb");
