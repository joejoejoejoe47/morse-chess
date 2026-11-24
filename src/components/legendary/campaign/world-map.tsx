/**
 * The Campaign world map: a floating island at night with five lit arenas joined by a golden
 * road. All geometry is drawn in code (no downloaded models), so nothing needs a credit.
 */
import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import { Html, OrbitControls, Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import { CHAPTERS, type Chapter } from "./data";

const ROMAN = ["I", "II", "III", "IV", "V"];

/** Height of the island surface at (x, z). */
function heightAt(x: number, z: number) {
  const r = Math.hypot(x / 1.25, z);
  const edge = Math.max(0, 1 - Math.pow(r / 12.5, 4));
  return (0.35 * Math.sin(x * 0.55) * Math.cos(z * 0.48) + 0.22 * Math.sin(x * 1.3 + z * 0.7) + 0.6) * edge;
}

function Island() {
  const geo = useMemo(() => {
    const g = new THREE.CircleGeometry(12.6, 140, 0, Math.PI * 2);
    g.rotateX(-Math.PI / 2);
    g.scale(1.25, 1, 1);
    // subdivide radially by rebuilding as a plane is simpler: use a dense plane clipped by a circle
    const p = new THREE.PlaneGeometry(32, 26, 160, 130);
    p.rotateX(-Math.PI / 2);
    const pos = p.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const low = new THREE.Color("#1a0f26");
    const mid = new THREE.Color("#2a1840");
    const moss = new THREE.Color("#1d2a2a");
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const t = Math.min(1, h / 1.1);
      c.copy(low).lerp(mid, t).lerp(moss, Math.max(0, Math.sin(x * 0.9 + z * 0.6)) * 0.35);
      colors.push(c.r, c.g, c.b);
    }
    p.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    // drop the triangles outside the island edge
    const idx = p.index!;
    const keep: number[] = [];
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i);
      const ok = [a, idx.getX(i + 1), idx.getX(i + 2)].every((v) => Math.hypot(pos.getX(v) / 1.25, pos.getZ(v)) < 12.4);
      if (ok) keep.push(a, idx.getX(i + 1), idx.getX(i + 2));
    }
    p.setIndex(keep);
    p.computeVertexNormals();
    g.dispose();
    return p;
  }, []);
  return (
    <group>
      <mesh geometry={geo} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0.05} />
      </mesh>
      {/* cliff under the island */}
      <mesh position={[0, -2.2, 0]} scale={[1.25, 1, 1]}>
        <cylinderGeometry args={[12.4, 7.5, 4.4, 72, 3, true]} />
        <meshStandardMaterial color="#140a1e" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -5.6, 0]} scale={[1.25, 1, 1]}>
        <coneGeometry args={[7.5, 4.5, 48]} />
        <meshStandardMaterial color="#0e0716" roughness={1} />
      </mesh>
      {/* glowing rim */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.25, 1, 1]}>
        <ringGeometry args={[12.25, 12.45, 128]} />
        <meshBasicMaterial color="#b370ff" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

function gearShape(teeth: number, r: number, depth: number) {
  const s = new THREE.Shape();
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = i % 4 < 2 ? r : r - depth;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.32, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

export function Gear({ r = 0.8, teeth = 12, speed = 0.5, color = "#c08a3a", thick = 0.16, ...rest }: { r?: number; teeth?: number; speed?: number; color?: string; thick?: number } & ThreeElements["group"]) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.ExtrudeGeometry(gearShape(teeth, r, r * 0.16), { depth: thick, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }), [r, teeth, thick]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * speed;
  });
  return (
    <group {...rest}>
      <mesh ref={ref} geometry={geo} castShadow>
        <meshStandardMaterial color={color} metalness={0.9} roughness={0.32} emissive="#4a2a08" emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

export function Foundry({ dim }: { dim: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.75, 1.8, 10]} />
        <meshStandardMaterial color="#6a4422" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0.35, 2.1, 0.1]} castShadow>
        <cylinderGeometry args={[0.13, 0.16, 1.2, 10]} />
        <meshStandardMaterial color="#3a2612" metalness={0.6} roughness={0.5} />
      </mesh>
      <Gear position={[0, 1.2, 0.6]} r={0.62} speed={dim ? 0.1 : 0.6} />
      <Gear position={[0.72, 0.7, 0.45]} r={0.38} teeth={9} speed={dim ? -0.16 : -0.95} color="#d9a04a" />
      <Gear position={[-0.7, 1.7, 0.2]} r={0.34} teeth={8} speed={dim ? 0.12 : 0.8} color="#b07030" rotation={[0, 0.6, 0]} />
      <pointLight position={[0.35, 2.9, 0.1]} color="#ff9a3a" intensity={dim ? 2 : 9} distance={6} />
      {!dim ? <Sparkles position={[0.35, 3.1, 0.1]} count={14} scale={[0.6, 1.4, 0.6]} size={3} speed={0.6} color="#ffb060" /> : null}
    </group>
  );
}

export function Citadel({ dim }: { dim: boolean }) {
  const spin = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.7;
  });
  const spires: [number, number, number, number][] = [[0, 0, 0, 2.6], [0.55, 0, 0.2, 1.7], [-0.5, 0, 0.25, 1.9], [0.15, 0, -0.5, 1.5], [-0.2, 0, 0.6, 1.2]];
  return (
    <group>
      {spires.map(([x, , z, h], i) => (
        <mesh key={i} position={[x, h / 2, z]} castShadow>
          <coneGeometry args={[0.22 + h * 0.05, h, 6]} />
          <meshStandardMaterial color="#cfe8ff" metalness={0.3} roughness={0.05} emissive="#4a8ac0" emissiveIntensity={dim ? 0.1 : 0.45} transparent opacity={0.85} />
        </mesh>
      ))}
      <mesh ref={spin} position={[0, 3.2, 0]}>
        <octahedronGeometry args={[0.3]} />
        <meshStandardMaterial color="#ffffff" emissive="#a8d8ff" emissiveIntensity={dim ? 0.2 : 1.2} />
      </mesh>
      <pointLight position={[0, 2.5, 0.4]} color="#a8d8ff" intensity={dim ? 2 : 8} distance={6} />
    </group>
  );
}

export function Ramparts({ dim }: { dim: boolean }) {
  const towers: [number, number][] = [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.7], [0.9, 0.7]];
  return (
    <group>
      {towers.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.75, 0]} castShadow>
            <cylinderGeometry args={[0.28, 0.32, 1.5, 8]} />
            <meshStandardMaterial color="#4a4448" roughness={0.9} />
          </mesh>
          {Array.from({ length: 6 }, (_, j) => (
            <mesh key={j} position={[Math.cos((j / 6) * Math.PI * 2) * 0.27, 1.58, Math.sin((j / 6) * Math.PI * 2) * 0.27]}>
              <boxGeometry args={[0.1, 0.16, 0.1]} />
              <meshStandardMaterial color="#4a4448" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      {[[0, -0.5, 1.8, 0], [0, 0.7, 1.8, 0], [-0.9, 0.1, 1.2, Math.PI / 2], [0.9, 0.1, 1.2, Math.PI / 2]].map(([x, z, l, ry], i) => (
        <mesh key={i} position={[x, 0.45, z]} rotation={[0, ry, 0]} castShadow>
          <boxGeometry args={[l, 0.9, 0.22]} />
          <meshStandardMaterial color="#3a3438" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 0.06, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.6, 24]} />
        <meshBasicMaterial color="#ff6a30" transparent opacity={dim ? 0.25 : 0.85} />
      </mesh>
      <pointLight position={[0, 0.8, 0.1]} color="#ff5a20" intensity={dim ? 2 : 10} distance={5} />
      {!dim ? <Sparkles position={[0, 1, 0.1]} count={16} scale={[1.2, 1.6, 1.2]} size={3} speed={0.8} color="#ff8040" /> : null}
    </group>
  );
}

export function Marsh({ dim }: { dim: boolean }) {
  const wisps = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    wisps.current?.children.forEach((m, i) => {
      const t = clock.elapsedTime * 0.6 + i * 1.7;
      m.position.set(Math.sin(t) * 0.9, 0.7 + Math.sin(t * 1.7) * 0.25, Math.cos(t * 0.8) * 0.8);
    });
  });
  const trees: [number, number, number][] = [[-0.7, -0.3, 1.5], [0.6, 0.4, 1.8], [0.1, -0.7, 1.2], [-0.3, 0.7, 1.1]];
  return (
    <group>
      {trees.map(([x, z, h], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, h / 2, 0]} rotation={[0, 0, 0.12 * (i % 2 ? 1 : -1)]}>
            <cylinderGeometry args={[0.03, 0.08, h, 6]} />
            <meshStandardMaterial color="#1c2420" roughness={1} />
          </mesh>
          <mesh position={[0.18, h * 0.72, 0]} rotation={[0, 0, -0.9]}>
            <cylinderGeometry args={[0.015, 0.03, 0.5, 5]} />
            <meshStandardMaterial color="#1c2420" roughness={1} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.5, 32]} />
        <meshBasicMaterial color="#9fe8d0" transparent opacity={dim ? 0.08 : 0.22} depthWrite={false} />
      </mesh>
      <group ref={wisps}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshBasicMaterial color="#5affc8" transparent opacity={dim ? 0.3 : 1} />
          </mesh>
        ))}
      </group>
      <pointLight position={[0, 1, 0]} color="#5affc8" intensity={dim ? 1.5 : 6} distance={5} />
    </group>
  );
}

export function Colosseum({ dim }: { dim: boolean }) {
  const core = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (core.current) {
      core.current.rotation.y = clock.elapsedTime * 0.5;
      core.current.position.y = 2 + Math.sin(clock.elapsedTime * 1.3) * 0.12;
    }
  });
  const arches = 16;
  return (
    <group>
      {Array.from({ length: arches }, (_, i) => {
        const a = (i / arches) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 1.15, 0.6, Math.sin(a) * 1.15]} rotation={[0, -a, 0]} castShadow>
            <boxGeometry args={[0.16, 1.2, 0.3]} />
            <meshStandardMaterial color="#d8c8a8" roughness={0.8} />
          </mesh>
        );
      })}
      <mesh position={[0, 1.25, 0]}>
        <torusGeometry args={[1.15, 0.09, 8, 48]} />
        <meshStandardMaterial color="#c8b898" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.05, 32]} />
        <meshStandardMaterial color="#3a1a5a" roughness={0.6} />
      </mesh>
      <group ref={core} position={[0, 2, 0]}>
        <mesh>
          <icosahedronGeometry args={[0.34, 1]} />
          <meshStandardMaterial color="#ffd86b" emissive="#ffb020" emissiveIntensity={dim ? 0.3 : 1.4} metalness={1} roughness={0.2} />
        </mesh>
        <mesh rotation={[Math.PI / 2.4, 0, 0]}>
          <torusGeometry args={[0.6, 0.025, 8, 48]} />
          <meshBasicMaterial color="#ffd86b" />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2.6]}>
          <torusGeometry args={[0.75, 0.02, 8, 48]} />
          <meshBasicMaterial color="#b370ff" />
        </mesh>
      </group>
      <pointLight position={[0, 2, 0]} color="#ffd86b" intensity={dim ? 2 : 12} distance={7} />
    </group>
  );
}

const LANDMARK = [Foundry, Citadel, Ramparts, Marsh, Colosseum];

export type MapNode = { chapter: Chapter; state: "locked" | "open" | "cleared" | "soon" };

function Landmark({ node, selected, onSelect }: { node: MapNode; selected: boolean; onSelect: () => void }) {
  const c = node.chapter;
  const [x, z] = c.at;
  const y = heightAt(x, z);
  const ring = useRef<THREE.Mesh>(null);
  const dim = node.state === "locked" || node.state === "soon";
  const Body = LANDMARK[c.n - 1];
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const s = 1 + (selected ? Math.sin(clock.elapsedTime * 3) * 0.08 : 0);
    ring.current.scale.setScalar(s);
  });
  return (
    <group position={[x, y, z]} onClick={(e) => { e.stopPropagation(); onSelect(); }} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
      {/* plinth */}
      <mesh position={[0, 0.08, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.55, 1.75, 0.22, 40]} />
        <meshStandardMaterial color="#1e1030" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh ref={ring} position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.5, 1.66, 64]} />
        <meshBasicMaterial color={node.state === "cleared" ? "#8ff0b0" : dim ? "#5a4a6a" : "#ffd86b"} transparent opacity={selected ? 1 : 0.75} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <group position={[0, 0.19, 0]}>
        <Body dim={dim} />
      </group>
      <Html position={[0, 3.6, 0]} center distanceFactor={11} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div className={`mcc-maplabel ${selected ? "is-on" : ""} is-${node.state}`} data-map-label={c.n}>
          <span className="r">{ROMAN[c.n - 1]}</span>
          <span className="t">{c.arena}</span>
          {node.state === "locked" ? <span className="s">🔒 Locked</span> : node.state === "soon" ? <span className="s">Opens soon</span> : node.state === "cleared" ? <span className="s">✓ Cleared</span> : <span className="s">Battle ready</span>}
        </div>
      </Html>
    </group>
  );
}

function Road({ nodes }: { nodes: MapNode[] }) {
  const { curve, cleared } = useMemo(() => {
    const pts = nodes.map((n) => new THREE.Vector3(n.chapter.at[0], heightAt(...n.chapter.at) + 0.08, n.chapter.at[1]));
    const start = new THREE.Vector3(-10, heightAt(-10, 6.5) + 0.08, 6.5);
    const curve = new THREE.CatmullRomCurve3([start, ...pts], false, "catmullrom", 0.4);
    const cleared = nodes.filter((n) => n.state === "cleared").length;
    return { curve, cleared };
  }, [nodes]);
  const dots = useRef<THREE.InstancedMesh>(null);
  const N = 120;
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const m = dots.current;
    if (!m) return;
    for (let i = 0; i < N; i++) {
      const t = ((i / N + clock.elapsedTime * 0.012) % 1);
      const p = curve.getPointAt(t);
      p.y = heightAt(p.x, p.z) + 0.12;
      tmp.position.copy(p);
      tmp.scale.setScalar(0.07);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  const tube = useMemo(() => {
    const pts = curve.getSpacedPoints(200).map((p) => new THREE.Vector3(p.x, heightAt(p.x, p.z) + 0.05, p.z));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 300, 0.07, 6, false);
  }, [curve]);
  return (
    <group>
      <mesh geometry={tube}>
        <meshStandardMaterial color="#8a6a2a" emissive="#f2b630" emissiveIntensity={0.35 + cleared * 0.1} metalness={0.8} roughness={0.35} />
      </mesh>
      <instancedMesh ref={dots} args={[undefined, undefined, N]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color="#ffe08a" />
      </instancedMesh>
    </group>
  );
}

function Rig({ focus }: { focus: [number, number] | null }) {
  const controls = useRef<OrbitImpl>(null);
  const { camera } = useThree();
  const goal = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    if (focus) goal.set(focus[0] * 0.55, 0.4, focus[1] * 0.55 + 0.6);
    else goal.set(0.4, 0.3, 1.2);
    c.target.lerp(goal, Math.min(1, dt * 2.2));
    c.update();
  });
  void camera;
  return <OrbitControls ref={controls} enablePan={false} enableDamping dampingFactor={0.08} minDistance={9} maxDistance={30} minPolarAngle={0.35} maxPolarAngle={Math.PI * 0.42} autoRotate={!focus} autoRotateSpeed={0.25} />;
}

export function WorldMap({ nodes, selected, onSelect, narrow }: { nodes: MapNode[]; selected: number | null; onSelect: (n: number) => void; narrow: boolean }) {
  const sel = selected ? nodes.find((n) => n.chapter.n === selected)?.chapter.at ?? null : null;
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: narrow ? [0, 25, 29] : [0, 16, 21], fov: narrow ? 48 : 42, near: 0.1, far: 220 }} gl={{ antialias: true, preserveDrawingBuffer: true }} data-world-map>
      <color attach="background" args={["#0a0514"]} />
      <fog attach="fog" args={["#0a0514", 26, 70]} />
      <Stars radius={90} depth={40} count={2600} factor={3.5} saturation={0.4} fade speed={0.6} />
      <ambientLight intensity={0.45} color="#b8a0e0" />
      <hemisphereLight args={["#c8b0ff", "#1a0a20", 0.55]} />
      <directionalLight position={[-8, 14, 6]} intensity={1.3} color="#ffe6c0" castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} />
      <pointLight position={[0, 9, -14]} intensity={40} color="#9b5cff" distance={50} />
      {/* the moon */}
      <mesh position={[-22, 20, -40]}>
        <sphereGeometry args={[3.2, 32, 32]} />
        <meshBasicMaterial color="#fff2d0" />
      </mesh>
      <Island />
      <Road nodes={nodes} />
      {nodes.map((n) => (
        <Landmark key={n.chapter.n} node={n} selected={selected === n.chapter.n} onSelect={() => onSelect(n.chapter.n)} />
      ))}
      <Sparkles count={60} scale={[30, 6, 26]} position={[0, 3, 0]} size={2.2} speed={0.25} color="#d8b8ff" opacity={0.6} />
      {/* the sea of clouds below */}
      <mesh position={[0, -3.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[90, 64]} />
        <meshStandardMaterial color="#160a26" roughness={1} transparent opacity={0.92} />
      </mesh>
      <Rig focus={sel} />
    </Canvas>
  );
}

export { CHAPTERS };
