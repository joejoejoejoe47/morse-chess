import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { asset } from "@/lib/base";

const MODELS: Record<string, string> = {
  horse: asset("/avatars/horse.glb"),
  husky: asset("/avatars/husky.glb"),
  pirate: asset("/avatars/pirate.glb"),
  carrier: asset("/lego/sky/helicarrier.glb"),
};

function fitted(scene: THREE.Object3D, size: number) {
  const copy = cloneSkeleton(scene);
  copy.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    }
  });
  const box = new THREE.Box3().setFromObject(copy);
  const span = box.getSize(new THREE.Vector3());
  const max = Math.max(span.x, span.y, span.z) || 1;
  copy.scale.multiplyScalar(size / max);
  const next = new THREE.Box3().setFromObject(copy);
  copy.position.y -= next.min.y;
  return copy;
}

function GlideModel({ url, size, y, flap }: { url: string; size: number; y: number; flap?: boolean }) {
  const gltf = useGLTF(url);
  const model = useMemo(() => fitted(gltf.scene, size), [gltf, size]);
  const wing = useRef(0);
  useFrame((_, dt) => {
    if (!flap) return;
    wing.current += dt * 9;
    model.rotation.z = Math.sin(wing.current) * 0.18;
  });
  return <primitive object={model} position={[0, y, 0]} />;
}

/** A dragon that was not in the cabinet: it comes out of the dark and flaps the length of the field. */
function Dragon() {
  const wingL = useRef<THREE.Group>(null);
  const wingR = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const s = Math.sin(clock.elapsedTime * 11);
    if (wingL.current) wingL.current.rotation.z = -0.4 + s * 0.7;
    if (wingR.current) wingR.current.rotation.z = 0.4 - s * 0.7;
  });
  const hide = new THREE.MeshStandardMaterial({ color: "#2a6b45", roughness: 0.45, metalness: 0.15 });
  const belly = new THREE.MeshStandardMaterial({ color: "#d7c07a", roughness: 0.55 });
  return (
    <group rotation={[0, Math.PI / 2, 0]} scale={1.35}>
      <mesh material={hide} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.28, 1.5, 6, 10]} />
      </mesh>
      <mesh position={[0.95, 0.12, 0]} material={hide} castShadow>
        <coneGeometry args={[0.26, 0.7, 8]} />
      </mesh>
      <mesh position={[0.55, 0.22, 0.16]} material={belly}>
        <sphereGeometry args={[0.08, 8, 8]} />
      </mesh>
      <mesh position={[-1.15, 0.05, 0]} material={hide} rotation={[0, 0, 0.4]} castShadow>
        <coneGeometry args={[0.12, 1.1, 6]} />
      </mesh>
      <group ref={wingL} position={[0.1, 0.15, 0.15]}>
        <mesh material={hide} position={[0, 0, 0.7]} rotation={[0.2, 0, 0]} castShadow>
          <boxGeometry args={[0.7, 0.05, 1.3]} />
        </mesh>
      </group>
      <group ref={wingR} position={[0.1, 0.15, -0.15]}>
        <mesh material={hide} position={[0, 0, -0.7]} rotation={[-0.2, 0, 0]} castShadow>
          <boxGeometry args={[0.7, 0.05, 1.3]} />
        </mesh>
      </group>
    </group>
  );
}

function Flyer({ kind }: { kind: string }) {
  if (kind === "dragon") return <Dragon />;
  if (kind === "horse") return <GlideModel url={MODELS.horse} size={2.1} y={0} />;
  if (kind === "husky") return <GlideModel url={MODELS.husky} size={1.15} y={0} />;
  if (kind === "pirate") return <GlideModel url={MODELS.pirate} size={1.7} y={0} />;
  if (kind === "carrier") return <GlideModel url={MODELS.carrier} size={6.5} y={1.2} />;
  return <Dragon />;
}

/** Celebration that is not fireworks: it appears off the stadium and crosses before the replay. */
export function ScoreFly({ fly }: { fly: { id: number; kind: string } | null }) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const seen = useRef<number | null>(null);
  const kind = fly?.kind ?? "";
  useFrame(({ clock }) => {
    const node = ref.current;
    if (!node || !fly) return;
    if (seen.current !== fly.id) {
      seen.current = fly.id;
      born.current = clock.elapsedTime;
    }
    const u = Math.min(1, (clock.elapsedTime - (born.current ?? clock.elapsedTime)) / 3.1);
    const air = kind === "dragon" || kind === "carrier";
    const y = air ? 5.2 + Math.sin(u * Math.PI) * 2.4 : 0.15 + Math.abs(Math.sin(u * 18)) * 0.18;
    node.position.set(-16 + u * 32, y, air ? 0.4 : -5.2);
    node.rotation.y = air ? 0 : Math.PI / 2;
    node.visible = u < 1;
  });
  if (!fly || kind === "fireworks") return null;
  return (
    <group ref={ref} position={[-16, 6, 0]}>
      <Suspense fallback={null}>
        <Flyer kind={kind} />
      </Suspense>
    </group>
  );
}
