import { useEffect, useRef, useState } from "react";
import { Center } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { FontLoader, type Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import * as THREE from "three";

function Line({ font, text }: { font: Font; text: string }) {
  const ref = useRef<THREE.Group>(null);
  const geo = useState(
    () =>
      new TextGeometry(text, {
        font,
        size: 0.42,
        depth: 0.12,
        curveSegments: 3,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.012,
        bevelSegments: 2,
      }),
  )[0];

  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.6) * 0.4;
  });

  return (
    <group ref={ref}>
      <Center>
        <mesh geometry={geo} castShadow>
          <meshStandardMaterial color="#f4efe4" metalness={0.42} roughness={0.28} />
        </mesh>
      </Center>
    </group>
  );
}

export function LoadingTitle({ text }: { text: string }) {
  const [font, setFont] = useState<Font | null>(null);

  useEffect(() => {
    let live = true;
    new FontLoader().load("/fonts/optimer_bold.typeface.json", (next) => {
      if (live) setFont(next);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="grid h-full min-h-36 place-items-center">
      <div className="h-36 w-[min(92vw,720px)]">
        {font ? (
          <Canvas camera={{ position: [0, 0.2, 6.2], fov: 35 }} gl={{ alpha: true, antialias: true }}>
            <ambientLight intensity={0.55} />
            <directionalLight position={[3, 5, 6]} intensity={1.6} />
            <Line font={font} text={text} />
          </Canvas>
        ) : null}
      </div>
    </div>
  );
}
