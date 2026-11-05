/**
 * The star player (owner t245u): in football the king is the QB, and he wears the look the player
 * built in AV > FB mode, the AN figure (character, crown, attack) or the LG minifig (body, head,
 * hat, legs, weapon). The other player sees it too (online the server sends both loadouts).
 */
import { useLayoutEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Figurine } from "@/components/avatar/figurine";
import { LegoDress } from "@/components/avatar/lego-dress";
import type { Gait } from "@/components/chess/stone-people";
import type { LegoDrive } from "@/components/chess/lego-board";
import type { AvatarLoadout } from "@/lib/avatar/catalog";

/** The bits of a loadout the star needs (also what the server sends for the opponent). */
export type StarLook = Pick<AvatarLoadout, "anId" | "crownId" | "attackId" | "lgBody" | "lgHead" | "lgHair" | "lgLegs" | "lgWeapon"> & {
  celebId?: string;
  songId?: string;
};

/** Field heights, matched to the stock players (AN knight ~1.45, LG figure ~1.25 on this field). */
export const STAR_AN_HEIGHT = 1.45;
export const STAR_LG_HEIGHT = 1.3;

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _c = new THREE.Vector3();

/** Scales its children to `height`, feet on y=0 and centred on x/z (measured once, when the model is in). */
export function FitHeight({ height, children }: { height: number; children: ReactNode }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const done = useRef(false);
  const tries = useRef(0);
  const measure = () => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || done.current) return;
    i.position.set(0, 0, 0);
    i.scale.setScalar(1);
    i.updateWorldMatrix(true, true);
    // measure in the inner group's own space
    const inv = new THREE.Matrix4().copy(i.matrixWorld).invert();
    _box.makeEmpty();
    i.traverse((n) => {
      const m = n as THREE.Mesh;
      if (!m.isMesh || !m.geometry || !m.visible) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      _box.union(bb);
    });
    if (_box.isEmpty()) return;
    _box.getSize(_size);
    _box.getCenter(_c);
    if (_size.y < 1e-3) return;
    const k = height / _size.y;
    i.scale.setScalar(k);
    i.position.set(-_c.x * k, -_box.min.y * k, -_c.z * k);
    done.current = true;
  };
  useLayoutEffect(measure);
  useFrame(() => {
    if (done.current || tries.current > 600) return;
    tries.current++;
    measure();
  });
  return (
    <group ref={outer}>
      <group ref={inner}>{children}</group>
    </group>
  );
}

function anCharacter(id: string) {
  return id === "piece" || id === "royal" ? "knight" : id;
}

/** AN star: the AV figure, walking / running / striking with the field's gait. */
export function StarAn({ look, gait, carry }: { look: StarLook; gait: MutableRefObject<Gait>; carry: THREE.Object3D | null }) {
  return (
    <group>
      <FitHeight height={STAR_AN_HEIGHT}>
        <Figurine
          key={`${look.anId}-${look.crownId}-${look.attackId}`}
          characterId={anCharacter(look.anId)}
          mountId="none"
          swordId="none"
          crownId={look.crownId}
          team="w"
          attackId={look.attackId}
          pace={gait as unknown as MutableRefObject<{ act: string }>}
        />
      </FitHeight>
      {carry ? (
        <group position={[0.3, STAR_AN_HEIGHT * 0.5, 0.16]} rotation={[0.25, 0, 0.5]}>
          <primitive object={carry} />
        </group>
      ) : null}
    </group>
  );
}

function yawTo(a: THREE.Vector3, b: THREE.Vector3) {
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/** LG star: the AV minifig; it bounces along when it runs and faces where it goes or hits. */
export function StarLego({ look, drive, carry }: { look: StarLook; drive: MutableRefObject<LegoDrive>; carry: THREE.Object3D | null }) {
  const body = useRef<THREE.Group>(null);
  const yaw = useRef<number | null>(null);
  useFrame(({ clock }, dt) => {
    const g = body.current;
    if (!g) return;
    const d = drive.current;
    const t = clock.elapsedTime;
    const rest = d.side === "w" ? Math.PI : 0;
    const want = d.mode === "walk" ? yawTo(d.a, d.b) : d.mode === "idle" ? rest : d.yaw;
    if (yaw.current == null) yaw.current = want;
    let dy = want - yaw.current;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    yaw.current += dy * Math.min(1, dt * 14);
    g.rotation.set(0, yaw.current, 0);
    g.position.set(0, 0, 0);
    if (d.mode === "walk") {
      g.position.y = Math.abs(Math.sin(t * 11)) * 0.09;
      g.rotation.z = Math.sin(t * 11) * 0.09;
    } else if (d.mode === "wind") {
      g.rotation.x = -0.18 * d.u;
    } else if (d.mode === "strike") {
      const k = Math.sin(Math.min(1, d.u) * Math.PI);
      g.position.x = Math.sin(yaw.current) * k * 0.2;
      g.position.z = Math.cos(yaw.current) * k * 0.2;
      g.rotation.x = 0.3 * k;
    } else {
      g.position.y = Math.abs(Math.sin(t * 1.6)) * 0.01;
    }
  });
  return (
    <group ref={body}>
      <FitHeight height={STAR_LG_HEIGHT}>
        <LegoDress body={look.lgBody} head={look.lgHead} hair={look.lgHair} legs={look.lgLegs} weapon={look.lgWeapon} />
      </FitHeight>
      {carry ? (
        <group position={[0.34, STAR_LG_HEIGHT * 0.42, 0.12]} rotation={[0.2, 0, 0.45]}>
          <primitive object={carry} />
        </group>
      ) : null}
    </group>
  );
}
