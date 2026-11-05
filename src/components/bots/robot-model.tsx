/**
 * One of the player's robot buddies in 3D. Both models are CC-BY Sketchfab downloads
 * (see public/bots/CREDITS.md). The model is measured and scaled to ~2 units tall, idles with a
 * gentle bob and does a little trick (spin + hop, or a pose) every few seconds.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, useAnimations, useGLTF } from "@react-three/drei";
import { Box3, Group, LoopOnce, LoopRepeat, Vector3, type AnimationAction } from "three";
import { SkeletonUtils } from "three-stdlib";
import { asset } from "@/lib/base";
import { BOT_MODELS, type BotModelId } from "@/lib/bots/store";

export type RobotMood = "idle" | "point-left" | "point-right" | "walk" | "fly" | "talk";

const POSE: Record<BotModelId, Partial<Record<RobotMood | "trick", string>>> = {
  cute: {},
  poddy: {
    idle: "pose 4 - warm welcome",
    trick: "pose 2 - omfg",
    talk: "pose 3 - hello",
    "point-left": "pose 6 - presentation flipped",
    "point-right": "pose 1 - presentation",
    walk: "pose 4 - warm welcome",
    fly: "pose 2 - omfg",
  },
};

/** Extra yaw so each model's face points at the camera (+z). The cute robot is authored facing +x. */
const FACE_YAW: Record<BotModelId, number> = { cute: -Math.PI / 2, poddy: 0 };

function Robot({ model, mood, trickEvery }: { model: BotModelId; mood: RobotMood; trickEvery: number }) {
  const spec = BOT_MODELS.find((m) => m.id === model) ?? BOT_MODELS[0];
  const { scene, animations } = useGLTF(asset(spec.url));
  const obj = useMemo(() => SkeletonUtils.clone(scene) as Group, [scene]);
  const fit = useMemo(() => {
    obj.updateMatrixWorld(true);
    const box = new Box3().setFromObject(obj);
    const size = box.getSize(new Vector3());
    const c = box.getCenter(new Vector3());
    const s = 2 / Math.max(size.y, 0.001);
    return { s, x: -c.x * s, y: -box.min.y * s, z: -c.z * s };
  }, [obj]);
  const root = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const { actions, names } = useAnimations(animations, root);
  const trickAt = useRef(performance.now() + trickEvery * 1000);
  const tricking = useRef(0);
  const current = useRef<AnimationAction | null>(null);

  function play(name: string | undefined, loop: boolean) {
    const a = name ? actions[name] : names[0] ? actions[names[0]] : undefined;
    if (!a) return;
    if (current.current && current.current !== a) current.current.fadeOut(0.25);
    a.reset();
    a.setLoop(loop ? LoopRepeat : LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.fadeIn(0.25).play();
    current.current = a;
  }

  // Cute robot's only clip is a blink (~0.6s). Never loop it — that looked like
  // blink-blink-blink every second. Hold eyes open and blink sparsely instead.
  const nextBlink = useRef(Number.POSITIVE_INFINITY);
  useEffect(() => {
    if (model === "cute") {
      // Stop any looping blink; eyes stay open until we fire a one-shot.
      current.current?.stop();
      current.current = null;
      obj.traverse((n) => {
        const m = n as { morphTargetInfluences?: number[] };
        if (m.morphTargetInfluences) m.morphTargetInfluences.fill(0);
      });
      // First blink after 3–6s so load doesn't look like a twitch.
      nextBlink.current = performance.now() + 3000 + Math.random() * 3000;
      return;
    }
    play(POSE[model][mood] ?? POSE[model].idle, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, model, actions]);

  useFrame((state, dt) => {
    const g = spin.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const now = performance.now();
    if (model === "cute" && now >= nextBlink.current) {
      // Short one-shot blink, then wait another 3–6s. Never rapid-fire or loop.
      nextBlink.current = now + 3000 + Math.random() * 3000;
      const blinkName = names.find((n) => /anim|blink/i.test(n)) ?? names[0];
      const a = blinkName ? actions[blinkName] : undefined;
      if (a) {
        a.reset();
        a.setLoop(LoopOnce, 1);
        a.clampWhenFinished = true;
        // ~0.35–0.45s blink — quick like a real lid, not a sleepy close.
        a.timeScale = 1.25 + Math.random() * 0.25;
        a.fadeIn(0.02).play();
        window.setTimeout(() => {
          a.fadeOut(0.04);
          obj.traverse((n) => {
            const m = n as { morphTargetInfluences?: number[] };
            if (m.morphTargetInfluences) m.morphTargetInfluences.fill(0);
          });
        }, 380);
      }
    }
    if (mood === "idle" && now > trickAt.current) {
      trickAt.current = now + trickEvery * 1000 + Math.random() * 2500;
      tricking.current = 1;
      if (POSE[model].trick) play(POSE[model].trick, false);
    }
    let y = Math.sin(t * 2.2) * 0.05;
    let ry = Math.sin(t * 0.7) * 0.12;
    let rz = 0;
    if (tricking.current > 0) {
      tricking.current = Math.max(0, tricking.current - dt / 1.3);
      const p = 1 - tricking.current;
      ry = p * Math.PI * 2;
      y += Math.sin(p * Math.PI) * 0.45;
      if (tricking.current === 0 && POSE[model].idle) play(POSE[model].idle, false);
    }
    if (mood === "walk") {
      y = Math.abs(Math.sin(t * 9)) * 0.12;
      rz = Math.sin(t * 9) * 0.08;
    }
    if (mood === "fly") {
      y = 0.2 + Math.sin(t * 6) * 0.08;
      rz = 0.25;
    }
    if (mood === "point-left") ry = -0.6;
    if (mood === "point-right") ry = 0.6;
    if (mood === "talk") y += Math.abs(Math.sin(t * 8)) * 0.04;
    g.position.y = y;
    g.rotation.y = FACE_YAW[model] + ry;
    g.rotation.z = rz;
  });

  return (
    <group ref={spin}>
      <group ref={root} position={[fit.x, fit.y, fit.z]} scale={fit.s}>
        <primitive object={obj} />
      </group>
    </group>
  );
}

/** A self-contained transparent canvas with the robot in it. */
export function RobotStage({
  model,
  mood = "idle",
  trickEvery = 6,
  className,
  zoom = 1,
}: {
  model: BotModelId;
  mood?: RobotMood;
  trickEvery?: number;
  className?: string;
  zoom?: number;
}) {
  const [gen, setGen] = useState(0);
  const onLost = () => window.setTimeout(() => setGen((g) => g + 1), 300);
  return (
    <div className={className} data-robot-stage={model}>
      <Canvas
        key={gen}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        camera={{ position: [0, 1.25, 5.0 / zoom], fov: 38 }}
        onCreated={({ camera, gl }) => {
          // Frame from below the feet to well above the head so hops and flips never clip.
          camera.lookAt(0, 1.25, 0);
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            onLost();
          });
        }}
      >
        <hemisphereLight args={["#fff6e0", "#2a2030", 1.6]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} />
        <directionalLight position={[-4, 2, -2]} intensity={0.5} color="#9ecbff" />
        <Suspense fallback={null}>
          <Robot key={model} model={model} mood={mood} trickEvery={trickEvery} />
        </Suspense>
        <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={4} blur={2.4} far={2} />
      </Canvas>
    </div>
  );
}


export default RobotStage;
