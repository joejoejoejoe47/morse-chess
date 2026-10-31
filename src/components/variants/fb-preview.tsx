import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { StonePerson, type Gait } from "@/components/chess/stone-people";
import { NeonStadium, type StadiumShow } from "@/components/variants/neon-stadium";

/** The pin preview: a man runs the end zone, then the celebration you pinned. */
function TdRun({ onDone }: { onDone: () => void }) {
  const g = useRef<THREE.Group>(null);
  const gait = useRef<Gait>({ phase: 0, amp: 1, act: "walk", fade: 1, clip: "Running_A", speed: 1.15 });
  const t = useRef(0);
  const done = useRef(false);
  useFrame((_, dt) => {
    const node = g.current;
    if (!node) return;
    t.current += dt;
    gait.current.phase += dt * 8;
    const u = Math.min(1, t.current / 2.5);
    gait.current.amp = u < 1 ? 1 : 0;
    node.position.set(0, 0, 2.4 - u * 8.6);
    node.rotation.y = Math.PI;
    if (u >= 1 && !done.current) {
      done.current = true;
      onDone();
    }
  });
  return (
    <group ref={g} position={[0, 0, 2.4]} scale={0.72}>
      <StonePerson type="k" white cast="stone" gait={gait} />
    </group>
  );
}

export function FbPreview({ kind }: { kind: string }) {
  const [show, setShow] = useState<StadiumShow>({ hype: { id: 1, level: 0.45 } });
  useEffect(() => {
    setShow({ hype: { id: 1, level: 0.45 } });
  }, [kind]);
  return (
    <Canvas camera={{ position: [9, 7, 10], fov: 40 }} shadows gl={{ antialias: true, alpha: false }}>
      <NeonStadium rows={14} cols={8} show={show} home={{ name: "Knights", color: "#2ee6ff" }} />
      <TdRun
        key={kind}
        onDone={() =>
          setShow(
            kind === "fireworks"
              ? { hype: { id: 2, level: 1 }, fireworks: { id: 2, z: -6.2 } }
              : { hype: { id: 2, level: 1 }, fly: { id: 2, kind } },
          )
        }
      />
    </Canvas>
  );
}
