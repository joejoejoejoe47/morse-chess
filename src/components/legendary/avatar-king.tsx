/**
 * Legendary home: the player's own AV king, standing in the middle of the still season picture.
 * The camera never moves (owner t335u); the king only breathes / turns a little.
 * Style follows the AV loadout: 3D Staunton king (finish + crown), AN character, or LG minifig.
 */
import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ModelSlot } from "@/components/chess/load-guard";
import { keepWebGL } from "@/lib/gl-quiet";
import { Figurine } from "@/components/avatar/figurine";
import { LegoDress } from "@/components/avatar/lego-dress";
import { PedestalStage } from "@/components/avatar/pedestal-king";
import { finishById, type AvatarLoadout } from "@/lib/avatar/catalog";

function Sway({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    g.rotation.y = Math.sin(t * 0.35) * 0.35;
  });
  return <group ref={ref}>{children}</group>;
}

function kitInitial(name: string) {
  const hit = name.match(/[\p{L}\p{N}]/u);
  return hit ? hit[0].toUpperCase() : "";
}

export function AvatarKing({ loadout, username }: { loadout: AvatarLoadout; username: string }) {
  const style = loadout.style;
  const finish = finishById(loadout.finishId);
  const figure = style === "an" || style === "ra";
  const lego = style === "lg";
  return (
    <Canvas
      className="!absolute inset-0"
      camera={{ position: [0, figure || lego ? 1.25 : 1.55, figure || lego ? 4.6 : 5.2], fov: 30 }}
      shadows
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, preserveDrawingBuffer: true }}
      onCreated={({ gl, camera }) => {
        keepWebGL(gl);
        gl.setClearColor(0x000000, 0);
        camera.lookAt(0, figure || lego ? 0.95 : 1.2, 0);
      }}
      data-avatar-king={style}
    >
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#ffe2b0", "#3a1d10", 0.7]} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} color="#ffd59a" castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2, -3]} intensity={1.4} color="#c79bff" />
      <Suspense fallback={null}>
        <ModelSlot>
          {figure || lego ? (
            <>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
                <circleGeometry args={[2, 48]} />
                <shadowMaterial transparent opacity={0.45} />
              </mesh>
              <Sway>
                {lego ? (
                  <LegoDress body={loadout.lgBody} head={loadout.lgHead} hair={loadout.lgHair} legs={loadout.lgLegs} weapon={loadout.lgWeapon} />
                ) : (
                  <Figurine characterId={style === "ra" ? "royal" : loadout.anId} mountId="none" swordId="none" crownId={loadout.crownId} team={loadout.team} attackId={loadout.attackId} />
                )}
              </Sway>
            </>
          ) : (
            <Sway>
              <PedestalStage finish={finish} crownId={loadout.crownId} team={loadout.team} board={false} spin={false} legacy={Boolean(finish.legendary)} letter={kitInitial(username)} bare />
            </Sway>
          )}
        </ModelSlot>
      </Suspense>
    </Canvas>
  );
}
