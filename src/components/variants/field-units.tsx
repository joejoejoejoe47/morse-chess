/**
 * Football field players: each player is one object for the whole game (keyed by its id), so every
 * move glides, captures are fought at a stand-off distance (AN: sword swing, LG: lasers / bombs /
 * bullets, 3D: a shove) and nobody ever stands inside anybody else.
 */
import { Suspense, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { PieceSymbol } from "chess.js";
import * as THREE from "three";
import { SculptedPiece } from "@/components/chess/sculpted-piece";
import { StonePerson, type Gait } from "@/components/chess/stone-people";
import { LEGO_CHARS, LEGO_ROSTER, LegoBurst, LegoRunner, legoAttack, legoMoveTime, type LegoCharId, type LegoDrive } from "@/components/chess/lego-board";
import { BALL_TRACK, TeamRing } from "@/components/variants/neon-stadium";
import { playLegoBeam, playLegoHit, playLegoWhoosh } from "@/lib/lego-sfx";

type FieldLook = "2d" | "3d" | "an" | "lg";

export type FieldUnitLike = { id?: string; r: number; f: number; side: "w" | "b"; kind: PieceSymbol; hidden?: boolean; ball?: boolean };

export type FieldCue = {
  id: number;
  unit?: string;
  from: [number, number];
  to: [number, number];
  capture: boolean;
  thrown: boolean;
  goal?: boolean;
  side: "w" | "b";
  kind: PieceSymbol;
  victim?: PieceSymbol;
  victimSide?: "w" | "b";
};

/** AN players are a little smaller on the football field (owner, 2026-10-28). */
export const AN_FIELD_SCALE = 0.84;
export const SELECT_RING = "#ffe14a";
const FIELD_Y = 0.14;

export function fieldSpot(r: number, f: number, rows: number, cols: number, y = FIELD_Y): THREE.Vector3 {
  return new THREE.Vector3(f - (cols - 1) / 2, y, (rows - 1) / 2 - r);
}

const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

/** walking time on the field for a non-LEGO player */
function walkTime(dist: number) {
  return dist < 0.05 ? 0 : Math.min(1.3, 0.4 + dist * 0.11);
}

function legoId(side: "w" | "b", kind: PieceSymbol): LegoCharId {
  return LEGO_ROSTER[side][kind];
}

export type ShotKind = "beam" | "bomb" | "bullets";
function shotKind(id: LegoCharId): ShotKind {
  const a = LEGO_CHARS[id].attack;
  if (a === "bomb") return "bomb";
  if (a === "repulsor" || a === "blast" || a === "spell" || a === "webkick" || a === "skystrike") return "beam";
  return "bullets";
}

/** How far short of the victim the attacker stops. */
const REACH: Record<FieldLook, number> = { "2d": 0.7, "3d": 0.72, an: 0.82, lg: 1.6 };

export type CapPlan = {
  from: THREE.Vector3;
  near: THREE.Vector3;
  to: THREE.Vector3;
  dir: THREE.Vector3;
  yaw: number;
  approach: number;
  /** LG: wind-up ends and the shot leaves */
  launch: number;
  strikeEnd: number;
  hit: number;
  stepIn: number;
  step: number;
  shot: ShotKind;
};

/** One timeline shared by the attacker and the victim, so they meet exactly. */
export function capturePlan(look: FieldLook, side: "w" | "b", kind: PieceSymbol, from: THREE.Vector3, to: THREE.Vector3): CapPlan {
  const d = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
  const dist = d.length();
  const dir = dist > 1e-4 ? d.divideScalar(dist) : new THREE.Vector3(0, 0, -1);
  const reach = Math.min(REACH[look], Math.max(0, dist - 0.02));
  const near = new THREE.Vector3(to.x - dir.x * reach, from.y, to.z - dir.z * reach);
  const id = legoId(side, kind);
  const walk = (x: number) => (x < 0.05 ? 0 : look === "lg" ? legoMoveTime(id, x) : walkTime(x));
  const approach = Math.max(0.25, walk(dist - reach));
  const yaw = Math.atan2(dir.x, dir.z);
  let launch = approach;
  // AN: the sword swing connects ~0.45 s in; the attacker waits for the victim to go down before stepping in
  let strikeEnd = approach + 1.05;
  let hit = approach + 0.45;
  let stepIn = hit + 1.6;
  const shot = shotKind(id);
  if (look === "lg") {
    const mv = legoAttack(id);
    launch = approach + Math.max(0.3, Math.min(0.6, mv.wind));
    strikeEnd = launch + Math.max(0.2, Math.min(0.45, mv.strike));
    hit = launch + (shot === "bomb" ? 0.62 : shot === "beam" ? 0.18 : 0.34);
    stepIn = Math.max(strikeEnd, hit) + 0.55;
  } else if (look !== "an") {
    // 3D: wind-up, shoulder charge, follow-through; the victim falls, gets up and leaves before the step in
    hit = approach + 0.4;
    strikeEnd = hit + 0.4;
    stepIn = hit + 1.75;
  }
  const step = Math.max(0.3, walk(reach));
  return { from: from.clone(), near, to: to.clone(), dir, yaw, approach, launch, strikeEnd, hit, stepIn, step, shot };
}

/** A football (a fresh object per carrier so it can live in a hand bone). */
export function makeBall(size = 1) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.13 * size, 18, 12), new THREE.MeshStandardMaterial({ color: "#6b3418", roughness: 0.55 }));
  m.scale.set(1.2, 0.72, 0.72);
  m.castShadow = true;
  const lace = new THREE.Mesh(new THREE.BoxGeometry(0.11 * size, 0.012 * size, 0.022 * size), new THREE.MeshStandardMaterial({ color: "#f4efe6", roughness: 0.6 }));
  lace.position.set(0, 0.092 * size, 0);
  g.add(m, lace);
  return g;
}

export function Pigskin() {
  const ball = useMemo(() => makeBall(), []);
  return <primitive object={ball} />;
}

function restYaw(side: "w" | "b") {
  return side === "w" ? Math.PI : 0;
}

type Trip = { t0: number; from: THREE.Vector3; to: THREE.Vector3; dur: number; cap: CapPlan | null };

/** One player on the field: moves, fights and carries the ball. */
export function FieldActor({
  unit,
  look,
  rows,
  cols,
  act,
  epoch,
  selected,
  ring,
  hideBall = false,
}: {
  unit: FieldUnitLike;
  look: FieldLook;
  rows: number;
  cols: number;
  /** the latest move cue for THIS player (if any) */
  act: FieldCue | null;
  /** bumping this snaps everyone straight to their squares (replay start / end, kickoff) */
  epoch: number;
  selected: boolean;
  ring: string;
  hideBall?: boolean;
}) {
  const home = fieldSpot(unit.r, unit.f, rows, cols);
  const node = useRef<THREE.Group>(null);
  const pos = useRef(home.clone());
  const trip = useRef<Trip | null>(null);
  const seenEpoch = useRef(epoch);
  const usedAct = useRef<number | null>(act?.id ?? null);
  const gait = useRef<Gait>({ phase: Math.random() * 8, amp: 0, act: "idle", fade: 1 });
  const drive = useRef<LegoDrive>({ mode: "idle", a: new THREE.Vector3(), b: new THREE.Vector3(), u: 0, yaw: 0, side: unit.side });
  const lunge = useRef(0);
  const tilt = useRef<THREE.Group>(null);
  const yawNow = useRef(restYaw(unit.side));
  const ball = useMemo(() => makeBall(look === "an" ? 0.82 : 0.9), [look]);
  const holding = Boolean(unit.ball) && !hideBall;
  const shotFx = useRef<number | null>(null);
  useFrame(({ clock }, rawDt) => {
    const g = node.current;
    if (!g) return;
    const now = clock.elapsedTime;
    const dt = Math.min(0.05, rawDt);
    if (seenEpoch.current !== epoch) {
      seenEpoch.current = epoch;
      pos.current.copy(home);
      trip.current = null;
      usedAct.current = act?.id ?? null;
    }
    const cur = trip.current;
    if ((!cur || cur.to.distanceTo(home) > 0.01) && pos.current.distanceTo(home) > 0.02) {
      const fresh = act && act.id !== usedAct.current && act.capture && !act.thrown;
      if (act) usedAct.current = act.id;
      if (fresh) {
        const cap = capturePlan(look, unit.side, unit.kind, fieldSpot(act.from[0], act.from[1], rows, cols), home);
        cap.from.copy(pos.current);
        trip.current = { t0: now, from: pos.current.clone(), to: home.clone(), dur: cap.stepIn + cap.step, cap };
      } else {
        const dist = pos.current.distanceTo(home);
        const dur = look === "lg" ? legoMoveTime(legoId(unit.side, unit.kind), dist) : walkTime(dist);
        trip.current = { t0: now, from: pos.current.clone(), to: home.clone(), dur: Math.max(0.3, dur), cap: null };
      }
    }
    const tr = trip.current;
    let mode: LegoDrive["mode"] = "idle";
    let yaw = restYaw(unit.side);
    let a = pos.current;
    let b = pos.current;
    let u = 0;
    let attacking = false;
    let lean = 0;
    let hop = 0;
    lunge.current = 0;
    // knights jump over whoever is in the way instead of walking through them
    const jumper = unit.kind === "n" && look !== "lg";
    if (tr) {
      const t = now - tr.t0;
      const c = tr.cap;
      if (!c) {
        u = clamp01(t / tr.dur);
        a = tr.from;
        b = tr.to;
        pos.current.lerpVectors(tr.from, tr.to, look === "lg" ? u : ease(u));
        if (u < 1) {
          mode = "walk";
          yaw = Math.atan2(tr.to.x - tr.from.x, tr.to.z - tr.from.z);
          if (jumper && tr.from.distanceTo(tr.to) > 1.2) hop = Math.sin(u * Math.PI) * 0.55;
        } else trip.current = null;
      } else if (t < c.approach) {
        u = clamp01(t / c.approach);
        a = c.from;
        b = c.near;
        if (c.from.distanceTo(c.near) > 0.05) {
          pos.current.lerpVectors(c.from, c.near, look === "lg" ? u : ease(u));
          mode = "walk";
          if (jumper && c.from.distanceTo(c.near) > 1.2) hop = Math.sin(u * Math.PI) * 0.55;
        }
        yaw = c.yaw;
      } else if (t < c.stepIn) {
        pos.current.copy(c.near);
        yaw = c.yaw;
        if (look === "lg") {
          if (t < c.launch) {
            mode = "wind";
            u = (t - c.approach) / (c.launch - c.approach);
          } else if (t < c.strikeEnd) {
            mode = "strike";
            u = (t - c.launch) / (c.strikeEnd - c.launch);
          }
        } else if (look === "an") {
          attacking = t < c.strikeEnd;
          // a step into the swing as it connects
          const k = clamp01((t - (c.hit - 0.22)) / 0.55);
          lunge.current = Math.sin(k * Math.PI) * 0.12;
        } else {
          // 3D: lean back (wind-up), drive the shoulder in, then settle back
          const w = t - c.approach;
          const at = c.hit - c.approach;
          const wind = Math.max(0.05, at - 0.16);
          if (w < wind) {
            const k = ease(w / wind);
            lunge.current = -0.08 * k;
            lean = -0.2 * k;
          } else if (w < at) {
            const k = ease((w - wind) / (at - wind));
            lunge.current = -0.08 + 0.36 * k;
            lean = -0.2 + 0.62 * k;
          } else {
            const k = ease(clamp01((w - at) / 0.45));
            lunge.current = 0.28 * (1 - k);
            lean = 0.42 * (1 - k);
          }
        }
        if (look === "lg" && t >= c.launch && shotFx.current !== tr.t0) {
          shotFx.current = tr.t0;
          if (c.shot === "beam") playLegoBeam(false);
          else if (c.shot === "bomb") playLegoWhoosh(true);
          else playLegoHit(false);
        }
      } else {
        u = clamp01((t - c.stepIn) / c.step);
        a = c.near;
        b = c.to;
        pos.current.lerpVectors(c.near, c.to, look === "lg" ? u : ease(u));
        yaw = c.yaw;
        if (u < 1) mode = "walk";
        else trip.current = null;
      }
    }
    const walking = mode === "walk";
    // 3D pieces bob along at a jog instead of sliding
    const jog = look === "3d" && walking && hop === 0 ? Math.abs(Math.sin(gait.current.phase * 2.2)) * 0.05 : 0;
    if (look === "3d" && walking && hop === 0) lean = 0.1;
    g.position.set(pos.current.x + Math.sin(yaw) * lunge.current, FIELD_Y + hop + jog, pos.current.z + Math.cos(yaw) * lunge.current);
    if (tilt.current) tilt.current.rotation.x += (lean - tilt.current.rotation.x) * Math.min(1, dt * 22);
    if (look === "lg") {
      const d = drive.current;
      d.mode = mode;
      d.a.copy(a);
      d.b.copy(b);
      d.u = u;
      d.yaw = yaw;
      d.side = unit.side;
      g.rotation.y = 0;
    } else {
      const body = g.children[1] as THREE.Object3D | undefined;
      const want = walking || attacking || lunge.current !== 0 || (tr && tr.cap) ? yaw : restYaw(unit.side);
      // turn smoothly instead of snapping round
      let d = want - yawNow.current;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yawNow.current += d * Math.min(1, dt * 14);
      if (body) body.rotation.y = yawNow.current;
      gait.current.amp += ((walking ? 1 : 0) - gait.current.amp) * 0.2;
      if (walking) gait.current.phase += 0.15;
      gait.current.act = attacking ? "attack" : walking ? "walk" : "idle";
      if (look === "an") {
        const span = tr ? (tr.cap ? tr.cap.from.distanceTo(tr.cap.near) : tr.from.distanceTo(tr.to)) : 0;
        if (walking && hop > 0) {
          gait.current.clip = "Jump_Idle";
          gait.current.once = false;
          gait.current.speed = 1;
        } else if (walking) {
          // a proper run for longer moves, a walk for one square
          gait.current.clip = span > 1.3 ? "Running_A" : "Walking_A";
          gait.current.once = false;
          gait.current.speed = span > 1.3 ? 1.15 : 1.3;
        } else gait.current.clip = undefined;
      }
    }
    if (unit.ball && !hideBall && now > BALL_TRACK.lock) {
      BALL_TRACK.pos.set(g.position.x, 0.6, g.position.z);
      BALL_TRACK.seen = now;
    }
  });
  const white = !unit.hidden && unit.side === "w";
  const kind = unit.hidden ? "p" : unit.kind;
  return (
    <group ref={node} position={home.toArray()}>
      <group>
        <TeamRing side={unit.side} color={selected || unit.ball ? SELECT_RING : ring} position={[0, 0.006, 0]} />
        {unit.ball ? <CarrierHalo /> : null}
        {selected ? <SelectPulse /> : null}
      </group>
      <group>
        {look === "lg" ? (
          <Suspense fallback={null}>
            <LegoRunner id={legoId(unit.hidden ? "b" : unit.side, kind)} drive={drive} carry={holding ? ball : null} />
          </Suspense>
        ) : look === "an" ? (
          <group scale={AN_FIELD_SCALE}>
            <StonePerson type={kind} white={white} cast="stone" gait={gait} blade carry={holding ? ball : null} />
          </group>
        ) : (
          <group scale={0.92} ref={tilt}>
            <SculptedPiece type={kind} color={white ? "w" : "b"} />
            {holding ? (
              <group position={[0.3, 0.5, 0.06]} rotation={[0, 0, 0.5]}>
                <primitive object={ball} />
              </group>
            ) : null}
          </group>
        )}
      </group>
    </group>
  );
}

/** Owner (t191u): whoever has the ball, on either team, always wears a bright yellow circle,
 *  also mid-throw (the catcher gets it), on the catch and in the replay. */
function CarrierHalo() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} renderOrder={3}>
      <ringGeometry args={[0.43, 0.5, 48]} />
      <meshBasicMaterial color={SELECT_RING} transparent opacity={0.95} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** A soft yellow pulse around the selected player. */
function SelectPulse() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const k = (clock.elapsedTime * 1.4) % 1;
    m.scale.setScalar(1 + k * 0.6);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} renderOrder={3}>
      <ringGeometry args={[0.4, 0.46, 40]} />
      <meshBasicMaterial color={SELECT_RING} transparent opacity={0.7} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** Where the tackled player falls: away from the attacker, onto a free square (never onto a teammate or a rival). */
function fallWay(cue: FieldCue, dir: THREE.Vector3, rows: number, cols: number, taken: FieldUnitLike[]) {
  const busy = new Set(taken.map((u) => `${u.r},${u.f}`));
  let best: THREE.Vector3 | null = null;
  let score = -Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (!dr && !df) continue;
      const r = cue.to[0] + dr;
      const f = cue.to[1] + df;
      if (r < -1 || r > rows || f < 0 || f >= cols) continue;
      if (busy.has(`${r},${f}`)) continue;
      const v = new THREE.Vector3(df, 0, -dr).normalize();
      const s = v.dot(dir);
      if (s < -0.05) continue; // never back into the attacker
      if (s > score) {
        score = s;
        best = v;
      }
    }
  }
  return best ? { v: best, room: true } : { v: dir.clone(), room: false };
}

const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/**
 * The tackled player (owner, t192u: "they do not even fight"): braces / blocks as the attacker comes in,
 * takes the hit, is knocked back onto a free square, falls, lies there a moment, gets back up and leaves the field.
 */
export function FieldVictim({ cue, look, rows, cols, taken = [] }: { cue: FieldCue; look: FieldLook; rows: number; cols: number; taken?: FieldUnitLike[] }) {
  const plan = useMemo(
    () => capturePlan(look, cue.side, cue.kind, fieldSpot(cue.from[0], cue.from[1], rows, cols), fieldSpot(cue.to[0], cue.to[1], rows, cols)),
    [cue.id], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const way = useMemo(() => fallWay(cue, plan.dir, rows, cols, taken), [cue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const kind = cue.victim ?? "p";
  const vside = cue.victimSide ?? (cue.side === "w" ? "b" : "w");
  const node = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const tip = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const [burst, setBurst] = useState(false);
  const [gone, setGone] = useState(false);
  const drive = useRef<LegoDrive>({ mode: "idle", a: new THREE.Vector3(), b: new THREE.Vector3(), u: 0, yaw: 0, side: vside });
  const gait = useRef<Gait>({ phase: 0, amp: 0, act: "idle", fade: 1 });
  const face = plan.yaw + Math.PI; // looks at the attacker
  const fallYaw = Math.atan2(way.v.x, way.v.z);
  const knock = way.room ? (look === "an" ? 0.45 : 0.42) : 0.12;
  useFrame(({ clock }) => {
    if (born.current == null) born.current = clock.elapsedTime;
    const t = clock.elapsedTime - born.current;
    const g = node.current;
    if (!g || gone) return;
    const after = t - plan.hit;
    const at = (k: number, y = FIELD_Y) => g.position.set(plan.to.x + way.v.x * knock * k, y, plan.to.z + way.v.z * knock * k);
    if (look === "an") {
      const G = gait.current;
      G.act = "idle";
      let yaw = face;
      if (after < 0) {
        // block: shield / arms up as the attacker swings
        if (t > plan.hit - 0.5) {
          G.clip = "Block";
          G.once = true;
          G.speed = 1.5;
        } else G.clip = undefined;
        at(0);
      } else if (after < 0.3) {
        // the hit lands: rocked back, spun toward the free side
        G.clip = "Hit_A";
        G.once = true;
        G.speed = 1.3;
        const k = ease(after / 0.3);
        at(k * 0.6);
        yaw = lerpAngle(face, fallYaw + Math.PI, k);
      } else if (after < 1.75) {
        // falls flat on his back onto the free square and stays down a moment
        G.clip = "Death_A";
        G.once = true;
        G.speed = 0.95;
        at(0.6 + 0.4 * ease((after - 0.3) / 0.4));
        yaw = fallYaw + Math.PI;
        if (!way.room) G.fade = Math.max(0, 1 - (after - 0.3) / 0.6);
      } else if (after < 3.3) {
        // gets back up
        G.clip = "Lie_StandUp";
        G.once = true;
        G.speed = 1.5;
        at(1);
        yaw = fallYaw + Math.PI;
      } else {
        // ...and jogs off (fades away where he stands, so he never walks through anybody)
        G.clip = undefined;
        at(1);
        yaw = fallYaw + Math.PI;
        G.fade = Math.max(0, 1 - (after - 3.3) / 0.5);
      }
      if (turn.current) turn.current.rotation.y = yaw;
      if (G.fade <= 0.01) setGone(true);
    } else if (look === "lg") {
      if (after >= 0 && !burst) setBurst(true);
    } else {
      const tp = tip.current;
      const b = body.current;
      if (!tp || !b) return;
      const flat = (Math.PI / 2) * 0.92;
      let lean = 0;
      let y = FIELD_Y;
      let s = 1;
      if (after < 0) {
        // brace: lean into the attacker and crouch a touch
        const k = ease(clamp01((t - (plan.hit - 0.35)) / 0.3));
        lean = -0.14 * k;
        b.scale.set(0.92 * (1 + 0.04 * k), 0.92 * (1 - 0.07 * k), 0.92 * (1 + 0.04 * k));
        at(0);
      } else if (after < 0.42) {
        const k = ease(after / 0.42);
        lean = -0.14 + (flat + 0.14) * k;
        y += Math.sin(k * Math.PI) * 0.14;
        b.scale.setScalar(0.92);
        at(k);
      } else if (after < 1.0) {
        // a bounce on landing, then lies there
        const k = clamp01((after - 0.42) / 0.16);
        lean = flat - Math.sin(k * Math.PI) * 0.1;
        at(1);
        if (!way.room) s = Math.max(0, 1 - (after - 0.42) / 0.4);
      } else if (after < 1.45) {
        // gets up with a little overshoot
        const k = ease((after - 1.0) / 0.45);
        lean = flat * (1 - k) - Math.sin(k * Math.PI) * 0.12;
        y += Math.sin(k * Math.PI) * 0.08;
        at(1);
      } else if (after < 1.7) {
        const k = (after - 1.45) / 0.25;
        lean = Math.sin(k * Math.PI * 3) * 0.06 * (1 - k);
        at(1);
      } else {
        // off he goes
        const k = ease(clamp01((after - 1.7) / 0.35));
        s = 1 - k;
        y -= 0.25 * k;
        at(1);
      }
      g.position.y = y;
      tp.rotation.x = lean;
      if (after >= 0) b.scale.setScalar(0.92 * s);
      if (s <= 0.01) setGone(true);
    }
  });
  if (gone) return null;
  return (
    <group>
      <group ref={node} position={plan.to.toArray()}>
        {look === "an" ? (
          <group ref={turn} rotation={[0, face, 0]} scale={AN_FIELD_SCALE}>
            <StonePerson type={kind} white={vside === "w"} cast="stone" gait={gait} />
          </group>
        ) : look === "lg" ? (
          burst ? null : (
            <group rotation={[0, face - Math.PI, 0]}>
              <Suspense fallback={null}>
                <LegoRunner id={legoId(vside, kind)} drive={drive} />
              </Suspense>
            </group>
          )
        ) : (
          <group rotation={[0, fallYaw, 0]}>
            <group ref={tip}>
              <group rotation={[0, face - fallYaw, 0]}>
                <group ref={body} scale={0.92}>
                  <SculptedPiece type={kind} color={vside === "w" ? "w" : "b"} />
                </group>
              </group>
            </group>
          </group>
        )}
      </group>
      {look === "lg" && burst ? (
        <LegoBurst
          burst={{ id: `fb${cue.id}`, victim: legoId(vside, kind), at: plan.to.clone(), dir: plan.dir.clone(), seed: cue.id * 7.13, delay: 0, limit: 9 }}
        />
      ) : null}
      {look === "lg" ? <FieldShot plan={plan} color={LEGO_CHARS[legoId(cue.side, cue.kind)].fx} /> : null}
    </group>
  );
}

/** LG ranged attack: a laser beam, an arcing bomb or a burst of tracer bullets. */
function FieldShot({ plan, color }: { plan: CapPlan; color: string }) {
  const born = useRef<number | null>(null);
  const beam = useRef<THREE.Group>(null);
  const bomb = useRef<THREE.Group>(null);
  const bullets = useRef<(THREE.Mesh | null)[]>([]);
  const a = useMemo(() => new THREE.Vector3(plan.near.x + plan.dir.x * 0.22, 0.62, plan.near.z + plan.dir.z * 0.22), [plan]);
  const b = useMemo(() => new THREE.Vector3(plan.to.x, 0.5, plan.to.z), [plan]);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    if (born.current == null) born.current = clock.elapsedTime;
    const t = clock.elapsedTime - born.current;
    const fly = plan.hit - plan.launch;
    const u = (t - plan.launch) / Math.max(0.05, fly);
    if (beam.current) {
      const on = plan.shot === "beam" && u >= 0 && t < plan.hit + 0.16;
      beam.current.visible = on;
      if (on) {
        const reach = clamp01(u);
        tmp.lerpVectors(a, b, reach);
        const len = Math.max(0.01, a.distanceTo(tmp));
        beam.current.position.copy(a).add(tmp).multiplyScalar(0.5);
        beam.current.quaternion.setFromUnitVectors(up, tmp.clone().sub(a).normalize());
        const w = 0.035 * (1 + Math.sin(t * 60) * 0.15);
        beam.current.scale.set(w / 0.035, len, w / 0.035);
      }
    }
    if (bomb.current) {
      const on = plan.shot === "bomb" && u >= 0 && u < 1;
      bomb.current.visible = on;
      if (on) {
        bomb.current.position.lerpVectors(a, b, u);
        bomb.current.position.y += Math.sin(u * Math.PI) * 0.8;
        bomb.current.rotation.set(u * 9, 0, u * 5);
      }
    }
    bullets.current.forEach((m, i) => {
      if (!m) return;
      const v = u - i * 0.28;
      const on = plan.shot === "bullets" && v >= 0 && v < 1;
      m.visible = on;
      if (on) {
        m.position.lerpVectors(a, b, v);
        m.quaternion.setFromUnitVectors(up, tmp.copy(b).sub(a).normalize());
      }
    });
  });
  return (
    <group>
      <group ref={beam} visible={false}>
        <mesh>
          <cylinderGeometry args={[0.035, 0.035, 1, 10, 1, true]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.1, 0.1, 1, 12, 1, true]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      <group ref={bomb} visible={false}>
        <mesh castShadow>
          <sphereGeometry args={[0.11, 16, 12]} />
          <meshStandardMaterial color="#1b1b22" roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.13, 0]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshBasicMaterial color="#ffb347" toneMapped={false} />
        </mesh>
      </group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => void (bullets.current[i] = m)} visible={false}>
          <capsuleGeometry args={[0.022, 0.16, 4, 8]} />
          <meshBasicMaterial color="#fff3a0" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** The ball in the air: to a teammate (who catches it) or over the posts for a field goal. */
export function FieldThrow({ cue, rows, cols, onDone }: { cue: FieldCue; rows: number; cols: number; onDone: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const done = useRef(false);
  const a = fieldSpot(cue.from[0], cue.from[1], rows, cols, 0.72);
  // field goal: through the uprights, above the crossbar, and on past the end line
  const posts = cue.side === "w" ? -rows / 2 : rows / 2;
  const b = cue.goal ? new THREE.Vector3(0, 1.75, posts + Math.sign(posts) * 0.35) : fieldSpot(cue.to[0], cue.to[1], rows, cols, 0.66);
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const dur = cue.goal ? 0.9 + dist * 0.07 : 0.55 + dist * 0.06;
  const lift = cue.goal ? 1.2 + dist * 0.12 : 0.55 + dist * 0.16;
  useFrame(({ clock }) => {
    const node = ref.current;
    if (!node) return;
    const now = clock.elapsedTime;
    if (born.current == null) born.current = now;
    const u = Math.min(1, (now - born.current) / dur);
    node.position.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * lift, a.z + (b.z - a.z) * u);
    node.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
    node.rotateX(u * 14);
    BALL_TRACK.pos.copy(node.position);
    BALL_TRACK.seen = now;
    BALL_TRACK.lock = now + 0.05;
    if (u >= 1 && !done.current) {
      done.current = true;
      onDone();
    }
  });
  return (
    <group ref={ref} position={a.toArray()}>
      <Pigskin />
    </group>
  );
}

/** The ball lying on the field. */
export function LooseBall({ r, f, rows, cols }: { r: number; f: number; rows: number; cols: number }) {
  const p = fieldSpot(r, f, rows, cols, 0.22);
  useFrame(({ clock }) => {
    if (clock.elapsedTime <= BALL_TRACK.lock) return;
    BALL_TRACK.pos.set(p.x, 0.4, p.z);
    BALL_TRACK.seen = clock.elapsedTime;
  });
  return (
    <group position={p.toArray()}>
      <Pigskin />
    </group>
  );
}
