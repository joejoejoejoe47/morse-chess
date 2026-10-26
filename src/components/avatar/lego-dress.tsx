import { useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { KingCrown } from "@/components/chess/sculpted-piece";
import { asset } from "@/lib/base";
import { legoPartById } from "@/lib/avatar/catalog";

const partUrl = (id: string) => asset(`/lego/chars/${legoPartById(id).file}`);
const swordUrl = (id: string) => asset(id === "talwar" ? "/avatars/swords/talwar.glb" : "/avatars/swords/devil.glb");

function swap(root: THREE.Object3D, name: string, donor: THREE.Object3D) {
  const dst = root.getObjectByName(name);
  const src = donor.getObjectByName(name);
  if (!dst?.parent || !src) return;
  const copy = src.clone(true);
  copy.name = name;
  copy.position.copy(dst.position);
  copy.quaternion.copy(dst.quaternion);
  copy.scale.copy(dst.scale);
  dst.parent.add(copy);
  dst.removeFromParent();
}

function anchor(root: THREE.Object3D, name: string, top: boolean) {
  const node = root.getObjectByName(name);
  if (!node) return null;
  const box = new THREE.Box3().setFromObject(node);
  if (box.isEmpty()) return null;
  const point = new THREE.Vector3();
  box.getCenter(point);
  point.y = top ? box.max.y : box.min.y;
  root.worldToLocal(point);
  return point;
}

/** A Brick Verse minifig built from a body, a head, a hat, a pair of legs, and a weapon. */
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
  const root = useMemo(() => {
    const scene = bodyG.scene.clone(true);
    swap(scene, "head", headG.scene);
    swap(scene, "legL", legsG.scene);
    swap(scene, "legR", legsG.scene);
    scene.scale.setScalar(1.15);
    return scene;
  }, [bodyG.scene, headG.scene, legsG.scene]);
  const hat = useRef<THREE.Group>(null);
  const hand = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const top = anchor(root, "head", true);
    if (hat.current && top) hat.current.position.copy(top);
    const grip = anchor(root, "armR", false);
    if (hand.current && grip) hand.current.position.copy(grip);
  }, [root, hair, weapon]);

  return (
    <group position={[0, 0, 1.2]}>
      <primitive object={root} />
      <group ref={hat} scale={0.42}>
        {hair !== "none" ? <KingCrown id={hair} team="w" /> : null}
      </group>
      <group ref={hand} scale={0.28} rotation={[0.6, 0.4, 0]}>
        {weapon !== "none" ? <SwordBit id={weapon} /> : null}
      </group>
    </group>
  );
}

function SwordBit({ id }: { id: string }) {
  const gltf = useGLTF(swordUrl(id));
  const obj = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  return <primitive object={obj} />;
}
