import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Color, PieceSymbol } from "chess.js";
import * as THREE from "three";
import { StonePerson, type Gait, type PeopleCast } from "@/components/chess/stone-people";
import { promotionDoor } from "@/components/chess/arena-bowl";
import { gladeHeight } from "@/components/chess/glade-field";
import { squareToWorld } from "@/lib/chess/board-math";
import type { Side } from "@/lib/mores-constants";

function Chair() {
  return (
    <group>
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[0.7, 0.09, 0.62]} />
        <meshStandardMaterial color="#6b3e22" roughness={0.74} />
      </mesh>
      <mesh position={[0, 0.92, -0.26]} castShadow>
        <boxGeometry args={[0.7, 0.84, 0.08]} />
        <meshStandardMaterial color="#7c4b2a" roughness={0.7} />
      </mesh>
      {[
        [-0.26, 0.22, -0.22],
        [0.26, 0.22, -0.22],
        [-0.26, 0.22, 0.22],
        [0.26, 0.22, 0.22],
      ].map((p) => (
        <mesh key={p.join()} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.08, 0.44, 0.08]} />
          <meshStandardMaterial color="#4a2914" roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}

export function PromoMarch({
  color,
  type,
  to,
  cast,
  you,
  pitch,
  onCheer,
  onDone,
}: {
  color: Color;
  type: PieceSymbol;
  from: string;
  to: string;
  cast: PeopleCast;
  you: Side;
  pitch: number;
  onCheer: (on: boolean) => void;
  onDone: () => void;
}) {
  const body = useRef<THREE.Group>(null);
  const chair = useRef<THREE.Group>(null);
  const bits = useRef<THREE.Group>(null);
  const dust = useRef<THREE.Mesh>(null);
  const gait = useRef<Gait>({ phase: 0, amp: 1, act: "walk", fade: 1 });
  const clock = useRef(0);
  const hailed = useRef(false);
  const finished = useRef(false);
  const smashed = useRef(false);
  const whoRef = useRef<PieceSymbol>("p");
  const [who, setWho] = useState<PieceSymbol>("p");
  const splinters = useRef(
    Array.from({ length: 7 }, (_, i) => ({
      p: new THREE.Vector3(),
      v: new THREE.Vector3((hash(i) - 0.5) * 3.2, 2.4 + hash(i + 2) * 2.2, (hash(i + 4) - 0.5) * 3.2),
      spin: hash(i + 6) * 6,
    })),
  );

  const home = squareToWorld(to, pitch);
  const sign = color === "w" ? -1 : 1;
  const door = promotionDoor(home[0], sign);
  const start = new THREE.Vector3(home[0], 0, home[2]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    clock.current += dt;
    const t = clock.current;
    const ground = (x: number, z: number) => gladeHeight(x, z);
    const pos = start.clone();
    let face = Math.atan2(door.into.x - start.x, door.into.z - start.z);
    let act: Gait["act"] = "walk";
    let fade = 1;
    const chairPos = door.chair.clone();
    let chairRot = 0;
    let kind: PieceSymbol = "p";
    const hand = new THREE.Vector3(door.stage.x, 1.2, door.stage.z);
    const slam = new THREE.Vector3(door.stage.x + sign * 0.15, 0.06, door.stage.z - sign * 0.35);

    if (t < 2.05) {
      const k = t / 2.05;
      pos.lerpVectors(start, door.into, k);
      face = Math.atan2(door.into.x - start.x, door.into.z - start.z);
      fade = k > 0.78 ? 1 - (k - 0.78) / 0.22 : 1;
    } else if (t < 2.45) {
      pos.copy(door.into);
      fade = 0;
      kind = type;
    } else if (t < 3.7) {
      const k = (t - 2.45) / 1.25;
      pos.lerpVectors(door.into, door.stage, Math.min(1, k));
      face = Math.atan2(door.stage.x - door.into.x, door.stage.z - door.into.z);
      fade = Math.min(1, k * 2.4);
      kind = type;
    } else if (t < 4.7) {
      pos.copy(door.stage);
      face = Math.atan2(door.chair.x - door.stage.x, door.chair.z - door.stage.z);
      act = "pickup";
      kind = type;
      const grab = Math.max(0, (t - 4.05) / 0.65);
      chairPos.lerpVectors(door.chair, hand, Math.min(1, grab));
    } else if (t < 5.55) {
      pos.copy(door.stage);
      face = Math.atan2(-door.stage.x, -door.stage.z);
      act = "attack";
      kind = type;
      const k = (t - 4.7) / 0.85;
      const fall = Math.min(1, k / 0.42);
      chairPos.lerpVectors(hand, slam, fall * fall);
      chairRot = fall * 1.35;
      if (k > 0.4 && !smashed.current) {
        smashed.current = true;
        splinters.current.forEach((bit, i) => {
          bit.p.copy(slam);
          bit.p.y += 0.2;
          bit.v.set((hash(i + 1) - 0.5) * 3.4, 1.8 + hash(i + 3) * 2.4, (hash(i + 5) - 0.5) * 3.4);
        });
      }
    } else if (t < 7.15) {
      pos.copy(door.stage);
      face = Math.atan2(-door.stage.x, -door.stage.z);
      act = "cheer";
      kind = type;
      if (!hailed.current) {
        hailed.current = true;
        onCheer(true);
      }
    } else if (t < 8.55) {
      const k = (t - 7.15) / 1.4;
      pos.lerpVectors(door.stage, start, Math.min(1, k));
      face = Math.atan2(start.x - door.stage.x, start.z - door.stage.z);
      act = "walk";
      kind = type;
    } else if (!finished.current) {
      finished.current = true;
      onCheer(false);
      onDone();
    }

    if (whoRef.current !== kind) {
      whoRef.current = kind;
      setWho(kind);
    }
    gait.current.act = act;
    gait.current.fade = fade;
    gait.current.amp = act === "walk" ? 1 : 0;
    if (body.current) {
      body.current.position.set(pos.x, ground(pos.x, pos.z), pos.z);
      body.current.rotation.y = face;
      body.current.visible = fade > 0.02;
    }
    if (chair.current) {
      chair.current.visible = !smashed.current;
      const gy = ground(chairPos.x, chairPos.z);
      chair.current.position.set(chairPos.x, gy + chairPos.y, chairPos.z);
      chair.current.rotation.x = chairRot;
      chair.current.rotation.z = chairRot * 0.35;
    }
    if (smashed.current && bits.current) {
      bits.current.visible = true;
      splinters.current.forEach((bit, i) => {
        bit.v.y -= dt * 9.5;
        bit.p.addScaledVector(bit.v, dt);
        const gy = ground(bit.p.x, bit.p.z) + 0.06;
        if (bit.p.y < gy) {
          bit.p.y = gy;
          bit.v.y *= -0.28;
          bit.v.x *= 0.72;
          bit.v.z *= 0.72;
        }
        const mesh = bits.current?.children[i] as THREE.Mesh | undefined;
        if (!mesh) return;
        mesh.position.copy(bit.p);
        mesh.rotation.x += bit.spin * dt;
        mesh.rotation.z += bit.spin * 0.7 * dt;
      });
    }
    if (dust.current) {
      const age = smashed.current ? Math.min(1, (t - 5.05) / 0.7) : 0;
      dust.current.visible = smashed.current && age < 1;
      dust.current.position.set(slam.x, ground(slam.x, slam.z) + 0.12, slam.z);
      const spread = 0.4 + age * 2.4;
      dust.current.scale.set(spread, 0.35, spread);
      const mat = dust.current.material as THREE.MeshBasicMaterial;
      mat.opacity = smashed.current ? (1 - age) * 0.45 : 0;
    }
  });

  return (
    <group>
      <group ref={body} position={[start.x, 0, start.z]}>
        <StonePerson key={who} type={who} white={color === "w"} cast={cast} sword={color !== you} gait={gait} flip={false} />
      </group>
      <group ref={chair} position={[door.chair.x, 0, door.chair.z]}>
        <Chair />
      </group>
      <group ref={bits} visible={false}>
        {splinters.current.map((_, i) => (
          <mesh key={i} castShadow>
            <boxGeometry args={[0.28 + (i % 3) * 0.08, 0.08, 0.16 + (i % 2) * 0.1]} />
            <meshStandardMaterial color={i % 2 ? "#6a3c20" : "#4a2814"} roughness={0.8} />
          </mesh>
        ))}
      </group>
      <mesh ref={dust} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[1, 18]} />
        <meshBasicMaterial color="#c4b19a" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
