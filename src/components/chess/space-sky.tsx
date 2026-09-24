import { useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function loadMap(url: string) {
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function Stars() {
  const geo = useMemo(() => {
    const count = 1100;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 34 + Math.random() * 18;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) * 0.62 + 4;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  const bright = useMemo(() => {
    const count = 70;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 32 + Math.random() * 16;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) * 0.5 + 5;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  return (
    <>
      <points geometry={geo}>
        <pointsMaterial color="#f4efe4" size={0.16} sizeAttenuation depthWrite={false} />
      </points>
      <points geometry={bright}>
        <pointsMaterial color="#fff8e8" size={0.42} sizeAttenuation depthWrite={false} />
      </points>
    </>
  );
}

function Body({
  map,
  radius,
  position,
  spin,
  unlit,
  ring,
}: {
  map: string;
  radius: number;
  position: [number, number, number];
  spin: number;
  unlit?: boolean;
  ring?: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const tex = useMemo(() => loadMap(map), [map]);
  const ringTex = useMemo(() => (ring ? loadMap("/space/ring.png") : null), [ring]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += spin * dt;
  });
  return (
    <group ref={ref} position={position}>
      <mesh>
        <sphereGeometry args={[radius, 64, 48]} />
        {unlit ? (
          <meshBasicMaterial map={tex} />
        ) : (
          <meshStandardMaterial map={tex} roughness={0.72} metalness={0.04} />
        )}
      </mesh>
      {ring && ringTex ? (
        <mesh rotation={[Math.PI / 2.35, 0.2, 0.15]}>
          <ringGeometry args={[radius * 1.25, radius * 2.25, 96]} />
          <meshBasicMaterial map={ringTex} transparent side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

export function SpaceSky() {
  return (
    <group>
      <Stars />
      <Body map="/space/sun.jpg" radius={5.2} position={[-38, 26, -16]} spin={0.05} unlit />
      <Body map="/space/venus.jpg" radius={1.35} position={[34, 22, 28]} spin={0.1} />
      <Body map="/space/earth.jpg" radius={1.55} position={[-22, 8, 46]} spin={0.18} />
      <Body map="/space/mars.jpg" radius={1.05} position={[48, 2, -14]} spin={0.16} />
      <Body map="/space/jupiter.jpg" radius={4.8} position={[-6, 18, -62]} spin={0.22} unlit />
      <Body map="/space/saturn.jpg" radius={3.5} position={[16, -2, 58]} spin={0.18} unlit ring />
    </group>
  );
}

export function ModelSky({ url }: { url: string }) {
  const gltf = useGLTF(url);
  const group = useMemo(() => {
    const src = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(src);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    src.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const g = new THREE.Group();
    g.add(src);
    g.scale.setScalar(30 / maxDim);
    return g;
  }, [gltf]);
  return <primitive object={group} position={[0, 2.2, -18]} />;
}
