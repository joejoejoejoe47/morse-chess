import { useMemo } from "react";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { asset } from "@/lib/base";

useGLTF.preload(asset("/glade/trees.glb"));
useGLTF.preload(asset("/arena/coliseum.glb"));

export function FieldStage() {
  const maps = useTexture({
    map: asset("/glade/ground/diff.jpg"),
    normalMap: asset("/glade/ground/nor.jpg"),
    roughnessMap: asset("/glade/ground/rough.jpg"),
  });
  const treesGltf = useGLTF(asset("/glade/trees.glb"));
  const bowl = useGLTF(asset("/arena/coliseum.glb"));

  const ground = useMemo(() => {
    for (const tex of [maps.map, maps.normalMap, maps.roughnessMap]) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(8, 8);
    }
    maps.map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: 1,
      metalness: 0,
    });
  }, [maps]);

  const trees = useMemo(() => {
    return [
      [-6, -2],
      [6.5, -1],
      [-7, 4],
      [7, 5],
      [-3, 7],
      [3.5, 8],
    ].map(([x, z], i) => {
      const tree = treesGltf.scene.clone(true);
      tree.scale.setScalar(0.85 + (i % 3) * 0.15);
      tree.position.set(x, 0, z);
      tree.rotation.y = i * 0.7;
      return tree;
    });
  }, [treesGltf.scene]);

  const coliseum = useMemo(() => {
    const root = bowl.scene.clone(true);
    root.scale.setScalar(2.4);
    root.position.set(0, 0.2, -16);
    return root;
  }, [bowl.scene]);

  return (
    <group>
      <hemisphereLight args={["#d7e7f6", "#3d6a32", 0.85]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[8, 12, 6]} intensity={1.5} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={ground}>
        <planeGeometry args={[80, 80]} />
      </mesh>
      {trees.map((tree, i) => (
        <primitive key={i} object={tree} />
      ))}
      <primitive object={coliseum} />
    </group>
  );
}
