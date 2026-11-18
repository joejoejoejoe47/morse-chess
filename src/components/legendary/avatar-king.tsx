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

/**
 * Every AV style comes from a different file at a different size and offset (LG minifigs sit
 * forward and are measured in brick units), so the home king is measured after it loads and
 * re-fitted: feet on the floor, centred, and always the same height in front of the camera.
 */
const FIT_HEIGHT = 2;
function Fit({ children }: { children: React.ReactNode }) {
  const outer = useRef<THREE.Group>(null);
  const sig = useRef("");
  const tick = useRef(0);
  useFrame(() => {
    const g = outer.current;
    if (!g || tick.current++ % 6 !== 0) return;
    let meshes = 0;
    let verts = 0;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.visible) {
        meshes++;
        verts += m.geometry?.getAttribute("position")?.count ?? 0;
      }
    });
    const key = `${meshes}:${verts}`;
    if (key === sig.current || meshes === 0) return;
    // Measure the figure with no fit applied.
    // Measure unturned, so the figure's centre lands on the turning axis of <Sway>.
    const par = g.parent;
    const ry = par?.rotation.y ?? 0;
    if (par) par.rotation.y = 0;
    g.scale.setScalar(1);
    g.position.set(0, 0, 0);
    (par ?? g).updateMatrixWorld(true);
    // Flat things (shadow discs, floor circles) are not the figure: measure only solid meshes.
    const box = new THREE.Box3();
    const part = new THREE.Box3();
    const ps = new THREE.Vector3();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      const mat = m.material as THREE.Material | THREE.Material[];
      if (!Array.isArray(mat) && (mat as THREE.Material).type === "ShadowMaterial") return;
      part.setFromObject(m);
      if (part.isEmpty()) return;
      part.getSize(ps);
      if (ps.y < 0.02 * Math.max(ps.x, ps.z)) return;
      box.union(part);
    });
    if (par) par.rotation.y = ry;
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const tall = Math.max(size.y, size.x * 1.5, size.z * 1.5, 1e-4);
    const k = FIT_HEIGHT / tall;
    const c = box.getCenter(new THREE.Vector3());
    g.scale.setScalar(k);
    g.position.set(-c.x * k, -box.min.y * k, -c.z * k);
    g.visible = true;
    sig.current = key;
  });
  return (
    <group ref={outer} visible={false}>
      {children}
    </group>
  );
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
      camera={{ position: [0, 1.15, 6.2], fov: 30, near: 0.05, far: 100 }}
      shadows
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, preserveDrawingBuffer: true }}
      onCreated={({ gl, camera }) => {
        keepWebGL(gl);
        gl.setClearColor(0x000000, 0);
        camera.lookAt(0, 1.0, 0);
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
              <Fit>
                {lego ? (
                  <LegoDress body={loadout.lgBody} head={loadout.lgHead} hair={loadout.lgHair} legs={loadout.lgLegs} weapon={loadout.lgWeapon} />
                ) : (
                  <Figurine characterId={style === "ra" ? "royal" : loadout.anId} mountId="none" swordId="none" crownId={loadout.crownId} team={loadout.team} attackId={loadout.attackId} />
                )}
              </Fit>
              </Sway>
            </>
          ) : (
            <Sway>
            <Fit>
              <PedestalStage finish={finish} crownId={loadout.crownId} team={loadout.team} board={false} spin={false} legacy={Boolean(finish.legendary)} letter={kitInitial(username)} bare />
            </Fit>
            </Sway>
          )}
        </ModelSlot>
      </Suspense>
    </Canvas>
  );
}
