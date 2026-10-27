import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KingCrown } from "@/components/chess/sculpted-piece";
import { PaintedStaunton, darkFinish } from "@/components/chess/av-set";
import { asset } from "@/lib/base";
import type { KingFinish } from "@/lib/avatar/catalog";

/** Lathe profile of the AV king (radius, height). Base sits at y=0, head top near y=0.98. */
const BODY: [number, number][] = [
  [0, 0],
  [0.37, 0],
  [0.37, 0.05],
  [0.33, 0.085],
  [0.3, 0.12],
  [0.27, 0.15],
  [0.25, 0.19],
  [0.215, 0.24],
  [0.185, 0.32],
  [0.165, 0.42],
  [0.15, 0.52],
  [0.145, 0.6],
  [0.16, 0.66],
  [0.215, 0.7],
  [0.22, 0.725],
  [0.16, 0.75],
  [0.14, 0.77],
  [0.155, 0.82],
  [0.175, 0.88],
  [0.17, 0.93],
  [0.14, 0.965],
  [0, 0.975],
];

/** Gold shield with the owner's letter painted on a canvas (a small cross when there is no letter). */
export function shieldTexture(trim: string, field: string, letter = "") {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 300;
  const g = c.getContext("2d")!;
  const path = new Path2D("M128 10 L236 44 L236 140 C236 214 186 262 128 290 C70 262 20 214 20 140 L20 44 Z");
  g.fillStyle = trim;
  g.fill(path);
  g.save();
  g.translate(128, 150);
  g.scale(0.84, 0.84);
  g.translate(-128, -150);
  g.fillStyle = field;
  g.fill(path);
  g.restore();
  g.fillStyle = trim;
  if (letter) {
    g.font = "bold 150px Georgia, 'Times New Roman', serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const wide = g.measureText(letter).width;
    if (wide > 170) {
      g.save();
      g.translate(128, 158);
      g.scale(170 / wide, 1);
      g.fillText(letter, 0, 0);
      g.restore();
    } else g.fillText(letter, 128, 158);
  } else {
    g.fillRect(114, 80, 28, 150);
    g.fillRect(74, 120, 108, 28);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Builds the king as plain Three.js meshes. coronet=false leaves the head bare for a catalog crown. */
export function buildKing(finish: KingFinish, coronet: boolean, letter = ""): THREE.Group {
  const king = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: finish.body,
    metalness: finish.metal,
    roughness: finish.metal > 0.7 ? 0.28 : 0.34,
  });
  const trim = new THREE.MeshStandardMaterial({ color: finish.trim, metalness: 1, roughness: 0.26 });
  const crownMat = new THREE.MeshStandardMaterial({ color: finish.crown, metalness: 1, roughness: 0.22 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    king.add(mesh);
    return mesh;
  };
  add(new THREE.LatheGeometry(BODY.map(([r, y]) => new THREE.Vector2(r, y)), 64), body);
  // Gold bands: base, waist, collar.
  add(new THREE.TorusGeometry(0.365, 0.014, 12, 72), trim, 0.052).rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(0.27, 0.016, 12, 72), trim, 0.152).rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(0.222, 0.018, 12, 72), trim, 0.712).rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(0.142, 0.012, 12, 72), trim, 0.768).rotation.x = Math.PI / 2;
  // Chest shield.
  const shield = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.235),
    new THREE.MeshStandardMaterial({
      map: shieldTexture(finish.trim, finish.body, letter),
      transparent: true,
      metalness: 0.6,
      roughness: 0.35,
    }),
  );
  shield.position.set(0, 0.43, 0.168);
  shield.rotation.x = -0.12;
  king.add(shield);
  // The same shield on the back, so both players can read the letter.
  const back = shield.clone();
  back.position.set(0, 0.43, -0.168);
  back.rotation.set(0.12, Math.PI, 0);
  king.add(back);

  if (coronet) {
    const band = add(new THREE.CylinderGeometry(0.185, 0.165, 0.075, 48, 1, true), crownMat, 0.975);
    (band.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    add(new THREE.TorusGeometry(0.168, 0.014, 10, 48), crownMat, 0.94).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(0.186, 0.012, 10, 48), crownMat, 1.012).rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const tall = i % 2 === 0;
      const spike = add(new THREE.ConeGeometry(0.03, tall ? 0.12 : 0.08, 12), crownMat, 1.012 + (tall ? 0.06 : 0.04));
      spike.position.x = Math.sin(a) * 0.18;
      spike.position.z = Math.cos(a) * 0.18;
      spike.rotation.z = -Math.sin(a) * 0.28;
      spike.rotation.x = Math.cos(a) * 0.28;
      const ball = add(new THREE.SphereGeometry(0.022, 12, 10), crownMat, 1.012 + (tall ? 0.125 : 0.085));
      ball.position.x = Math.sin(a) * (tall ? 0.2 : 0.195);
      ball.position.z = Math.cos(a) * (tall ? 0.2 : 0.195);
    }
    add(new THREE.SphereGeometry(0.13, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), body, 0.975);
  }
  // Cross finial (ruby on the legendary king).
  const crossMat = finish.legendary
    ? new THREE.MeshStandardMaterial({ color: "#b3122a", emissive: "#5a0612", metalness: 0.3, roughness: 0.15 })
    : crownMat;
  const top = coronet ? 1.1 : 1.02;
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16), crownMat, top);
  add(new THREE.BoxGeometry(0.05, 0.16, 0.05), crossMat, top + 0.1);
  add(new THREE.BoxGeometry(0.15, 0.05, 0.05), crossMat, top + 0.12);
  return king;
}

function useKing(finish: KingFinish, coronet: boolean, letter: string) {
  const king = useMemo(() => buildKing(finish, coronet, letter), [finish, coronet, letter]);
  useEffect(
    () => () =>
      king.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.dispose();
      }),
    [king],
  );
  return king;
}

/**
 * The AV centre stage: dark wood, a round pedestal and the chosen king.
 * legacy = the Royal Legacy kit is unlocked: the Royal Legacy king with the player's letter.
 * Otherwise the normal Staunton king (the one in 3D games), painted the chosen colour.
 * Black view shows the darker shade the king (and set) gets when playing black.
 */
export function PedestalStage({
  finish: chosen,
  crownId,
  team,
  board,
  spin,
  legacy = false,
  letter = "",
}: {
  finish: KingFinish;
  crownId: string;
  team: "w" | "b";
  board: boolean;
  spin: boolean;
  legacy?: boolean;
  letter?: string;
}) {
  const finish = useMemo(() => (team === "b" ? darkFinish(chosen) : chosen), [chosen, team]);
  const coronet = legacy && crownId === "poly-band";
  const turn = useRef<THREE.Group>(null);
  const spun = useRef(0);
  useFrame((_, dt) => {
    if (!turn.current) return;
    if (spin) spun.current = Math.min(spun.current + dt * 5.2, Math.PI * 2);
    else spun.current = 0;
    turn.current.rotation.y = spun.current;
    turn.current.position.y = 0.26 + Math.sin((spun.current / (Math.PI * 2)) * Math.PI) * 0.35;
  });
  return (
    <>
      <ambientLight intensity={0.35} />
      <spotLight position={[2.4, 6, 3.4]} angle={0.42} penumbra={0.7} intensity={70} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2.5, -2.5]} intensity={1.1} color="#ffd9a0" />
      <pointLight position={[0, 1.4, 2.6]} intensity={2.2} color="#fff1d6" />
      {board ? <BoardFloor /> : <WoodFloor />}
      <mesh position={[0, 0.07, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.25, 1.32, 0.14, 96]} />
        <meshStandardMaterial color="#1c1a18" roughness={0.55} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.19, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.02, 1.08, 0.1, 96]} />
        <meshStandardMaterial color="#232120" roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.141, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.255, 0.008, 8, 128]} />
        <meshStandardMaterial color="#8a6a2c" metalness={1} roughness={0.35} />
      </mesh>
      <group ref={turn} position={[0, 0.26, 0]} rotation={[0, 0, 0]}>
        {legacy ? (
          <LegacyKing finish={finish} coronet={coronet} letter={letter} crownId={crownId} team={team} />
        ) : (
          <group scale={1.45} rotation={[0, team === "b" ? Math.PI : 0, 0]}>
            <PaintedStaunton type="k" color="w" finish={finish} />
            {crownId !== "none" ? (
              <group position={[0, 0.92, 0]} rotation={[0, Math.PI, 0]}>
                <KingCrown id={crownId} team={team} />
              </group>
            ) : null}
          </group>
        )}
      </group>
    </>
  );
}

function LegacyKing({ finish, coronet, letter, crownId, team }: { finish: KingFinish; coronet: boolean; letter: string; crownId: string; team: "w" | "b" }) {
  const king = useKing(finish, coronet, letter);
  return (
    <group scale={1.55} rotation={[0, team === "b" ? Math.PI : 0, 0]}>
      <primitive object={king} />
      {coronet || crownId === "none" ? null : (
        <group position={[0, 0.94, 0]} scale={1.35}>
          <KingCrown id={crownId} team={team} />
        </group>
      )}
    </group>
  );
}

function WoodFloor() {
  const wood = useTexture(asset("/club/marquetry.png"));
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[30, 30]} />
      <meshStandardMaterial map={wood} color="#4a3a2c" roughness={0.8} />
    </mesh>
  );
}

function BoardFloor() {
  const squares = [];
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const light = (file + rank) % 2 === 0;
      squares.push(
        <mesh key={`${file}${rank}`} position={[(file - 3.5) * 0.9, 0.001, (rank - 3.5) * 0.9]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[0.9, 0.9]} />
          <meshStandardMaterial color={light ? "#cdb68e" : "#4b2c19"} roughness={0.7} />
        </mesh>,
      );
    }
  }
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#17110c" roughness={0.9} />
      </mesh>
      {squares}
    </>
  );
}

const STAUNTON_KING = asset("/pieces/01_king_light.glb");

/** A painted copy of the Staunton king for a thumbnail, about 1.12 tall like in games. */
function paintedKing(src: THREE.Object3D, finish: KingFinish) {
  const obj = src.clone(true);
  const metal = Math.min(finish.metal, 0.85);
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = new THREE.MeshStandardMaterial({ color: finish.body, metalness: metal, roughness: metal > 0.7 ? 0.26 : 0.34 });
  });
  obj.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  obj.scale.multiplyScalar(1.12 / (size.y || 1));
  obj.updateMatrixWorld(true);
  obj.position.y -= new THREE.Box3().setFromObject(obj).min.y;
  obj.rotation.y = Math.PI;
  const holder = new THREE.Group();
  holder.add(obj);
  return holder;
}

/**
 * Renders each king once with an offscreen Three.js renderer and hands back image URLs for the grid.
 * legacy: the Royal Legacy king with the letter; otherwise the painted Staunton king.
 */
export function useKingThumbs(finishes: KingFinish[], legacy = true, letter = "") {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const key = `${finishes.map((f) => f.id).join(",")}|${legacy ? "legacy" : "staunton"}|${letter}`;
  const [staunton, setStaunton] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    if (legacy || staunton) return;
    let live = true;
    new GLTFLoader()
      .loadAsync(STAUNTON_KING)
      .then((gltf) => {
        if (live) setStaunton(gltf.scene);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [legacy, staunton]);
  useEffect(() => {
    if (!legacy && !staunton) return;
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(1);
    renderer.setSize(220, 260, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight("#ffffff", 0.55));
    const key1 = new THREE.DirectionalLight("#fff3dc", 2.6);
    key1.position.set(2, 4, 4);
    scene.add(key1);
    const rim = new THREE.DirectionalLight("#ffd28a", 1.4);
    rim.position.set(-3, 2, -3);
    scene.add(rim);
    const fill = new THREE.PointLight("#ffffff", 1.6);
    fill.position.set(0, 1, 2.5);
    scene.add(fill);
    const camera = new THREE.PerspectiveCamera(30, 220 / 260, 0.1, 50);
    camera.position.set(0, 0.85, 3.05);
    camera.lookAt(0, 0.62, 0);
    const out: Record<string, string> = {};
    for (const finish of finishes) {
      const king = legacy || !staunton ? buildKing(finish, true, letter) : paintedKing(staunton, finish);
      scene.add(king);
      renderer.render(scene, camera);
      out[finish.id] = renderer.domElement.toDataURL("image/png");
      scene.remove(king);
      king.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.dispose();
      });
    }
    renderer.dispose();
    renderer.forceContextLoss();
    setThumbs(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, staunton]);
  return thumbs;
}
