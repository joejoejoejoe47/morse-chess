import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import type { PieceSymbol } from "chess.js";
import * as THREE from "three";
import { SculptedPiece } from "@/components/chess/sculpted-piece";
import { StonePerson, WarCorpse, type Gait } from "@/components/chess/stone-people";
import { LEGO_CHARS, LEGO_ROSTER, LegoWalker, LegoWorld, type LegoCharId } from "@/components/chess/lego-board";
import { SkyArenaWorld } from "@/components/chess/sky-arena-board";
import { asset } from "@/lib/base";
import { fixLegoWinding } from "@/lib/avatar/lego-winding";
const ParkField = lazy(() => import("@/components/variants/park-field").then((m) => ({ default: m.ParkField })));
import { Arc, FadingArc, NeonStadium, TargetMark, TeamRing, TEAM, type HomeTeam, type Scoreboard, type StadiumShow } from "@/components/variants/neon-stadium";
import { FieldActor, FieldThrow, FieldVictim, LooseBall, SELECT_RING, type KingDress } from "@/components/variants/field-units";

export type { HomeTeam, Scoreboard, StadiumShow };

export type Look = "2d" | "3d" | "an" | "lg" | "ra";
export type Sky = "table" | "lego" | "arena";

const GLYPH: Record<PieceSymbol, string> = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" };

export type StageUnit = {
  r: number;
  f: number;
  side: "w" | "b";
  kind: PieceSymbol;
  label?: string;
  hidden?: boolean;
  ball?: boolean;
  /** football: the same player keeps the same id all game, so moves glide */
  id?: string;
};

export type MoveCue = {
  id: number;
  from: [number, number];
  to: [number, number];
  capture: boolean;
  thrown: boolean;
  side: "w" | "b";
  kind: PieceSymbol;
  victim?: PieceSymbol;
  victimSide?: "w" | "b";
  /** football: id of the player who moved */
  unit?: string;
  /** football: a kick / throw at the posts */
  goal?: boolean;
  /** football: the kick missed (owner t238u) */
  miss?: boolean;
};

/** Football extras for the field. */
export type FieldOpts = {
  /** bump to snap every player to their square (replay start / end, kickoff) */
  epoch: number;
  colors: { w: string; b: string };
  /** throw mode: show the goal-post target (field goal) */
  goal?: boolean;
  onGoal?: () => void;
  /** the touchdown replay: players just move, no path/trail lines (owner, v4) */
  replay?: boolean;
  /** LG kings dressed from each player's saved body (viewer must be in LG to see them) */
  kings?: { w?: KingDress | null; b?: KingDress | null };
};

function Pigskin() {
  return (
    <mesh scale={[1.2, 0.72, 0.72]} rotation={[0.3, 0.4, 0.5]} castShadow>
      <sphereGeometry args={[0.13, 18, 12]} />
      <meshStandardMaterial color="#6b3418" roughness={0.55} />
    </mesh>
  );
}

function OrangeBall() {
  return (
    <mesh castShadow>
      <sphereGeometry args={[0.16, 24, 16]} />
      <meshStandardMaterial color="#e85d04" roughness={0.42} />
    </mesh>
  );
}

function Hoop({ at }: { at: [number, number, number] }) {
  return (
    <group position={at}>
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.04, 0.045, 2.3, 8]} />
        <meshStandardMaterial color="#d9dde4" metalness={0.55} roughness={0.28} />
      </mesh>
      <mesh position={[0, 2.05, 0]}>
        <boxGeometry args={[0.92, 0.58, 0.05]} />
        <meshStandardMaterial color="#f7f7f4" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.82, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.02, 8, 22]} />
        <meshStandardMaterial color="#ee6a12" metalness={0.35} roughness={0.35} />
      </mesh>
    </group>
  );
}

function spot(r: number, f: number, rows: number, cols: number, y = 0.14): [number, number, number] {
  return [f - (cols - 1) / 2, y, (rows - 1) / 2 - r];
}

function Person({ type, white }: { type: PieceSymbol; white: boolean }) {
  const gait = useRef<Gait>({ phase: Math.random() * 8, amp: 0.15, act: "idle", fade: 0 });
  return <StonePerson type={type} white={white} cast="stone" gait={gait} />;
}

function LegoFig({ id }: { id: LegoCharId }) {
  const gltf = useGLTF(asset(`/lego/chars/${LEGO_CHARS[id].file}`));
  const scene = useMemo(() => {
    fixLegoWinding(gltf.scene);
    return gltf.scene.clone(true);
  }, [gltf]);
  return <primitive object={scene} scale={LEGO_CHARS[id].height} />;
}

function PieceMesh({ unit, look }: { unit: StageUnit; look: Look }) {
  const white = unit.side === "w";
  const color = white ? "w" : "b";
  if (unit.hidden) {
    if (look === "lg") {
      return (
        <Suspense fallback={null}>
          <LegoFig id={LEGO_ROSTER.b.p} />
        </Suspense>
      );
    }
    if (look === "an") return <Person type="p" white={false} />;
    return (
      <group scale={0.92}>
        <SculptedPiece type="p" color="b" />
      </group>
    );
  }
  if (look === "2d") {
    return (
      <Html center position={[0, 0.35, 0]} style={{ pointerEvents: "none" }} zIndexRange={[8, 0]}>
        <span className="font-display text-3xl leading-none drop-shadow" style={{ color: white ? "#fffaf0" : "#1a120c" }}>
          {unit.label ?? GLYPH[unit.kind]}
        </span>
      </Html>
    );
  }
  if (look === "lg") {
    return (
      <Suspense fallback={null}>
        <group position={[0, 0.02, 0]}>
          <LegoFig id={LEGO_ROSTER[color][unit.kind]} />
        </group>
      </Suspense>
    );
  }
  if (look === "an") {
    return (
      <group rotation={[0, white ? 0 : Math.PI, 0]}>
        <Person type={unit.kind} white={white} />
      </group>
    );
  }
  return (
    <group rotation={[0, white ? 0 : Math.PI, 0]} scale={0.92}>
      <SculptedPiece type={unit.kind} color={color} />
    </group>
  );
}

function Actor({
  unit,
  look,
  rows,
  cols,
  spawn,
  slay,
  orange = false,
}: {
  unit: StageUnit;
  look: Look;
  rows: number;
  cols: number;
  spawn: [number, number] | null;
  slay: boolean;
  orange?: boolean;
}) {
  const home = spot(unit.r, unit.f, rows, cols);
  const from = spawn ? spot(spawn[0], spawn[1], rows, cols) : home;
  const ref = useRef<THREE.Group>(null);
  const gait = useRef<Gait>({ phase: Math.random() * 8, amp: 0, act: "idle", fade: 1 });
  const pos = useRef(new THREE.Vector3(from[0], 0, from[2]));
  const trip = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t: number } | null>(null);
  const swung = useRef(false);
  const attackUntil = useRef(0);
  const live = look === "an" || look === "lg";
  useFrame((_, raw) => {
    const node = ref.current;
    if (!node || look === "lg") return;
    if (!live) {
      node.position.set(home[0], home[1], home[2]);
      node.rotation.y = unit.side === "w" ? Math.PI : 0;
      return;
    }
    const dt = Math.min(raw, 0.1);
    const target = new THREE.Vector3(home[0], 0, home[2]);
    if (!trip.current || trip.current.to.distanceTo(target) > 0.01) {
      trip.current = { from: pos.current.clone(), to: target.clone(), t: pos.current.distanceTo(target) > 0.05 ? 0 : 1 };
    }
    const span = trip.current.from.distanceTo(trip.current.to);
    if (span > 0.04) trip.current.t = Math.min(1, trip.current.t + dt / 0.72);
    else trip.current.t = 1;
    pos.current.lerpVectors(trip.current.from, trip.current.to, trip.current.t);
    node.position.set(pos.current.x, 0.14, pos.current.z);
    const traveling = trip.current.t < 1;
    gait.current.amp += ((traveling ? 1 : 0) - gait.current.amp) * (1 - Math.exp(-8 * dt));
    if (traveling) gait.current.phase += dt * 9;
    if (!traveling && slay && !swung.current) {
      swung.current = true;
      attackUntil.current = performance.now() + 1700;
    }
    gait.current.act = performance.now() < attackUntil.current ? "attack" : traveling ? "walk" : "idle";
    const dx = target.x - pos.current.x;
    const dz = target.z - pos.current.z;
    if (Math.hypot(dx, dz) > 0.08) node.rotation.y = Math.atan2(dx, dz);
    else if (gait.current.act !== "attack") node.rotation.y = unit.side === "w" ? Math.PI : 0;
  });
  if (look === "lg" && !unit.hidden) {
    const color = unit.side === "w" ? "w" : "b";
    return (
      <group>
        <Suspense fallback={null}>
          <LegoWalker
            id={LEGO_ROSTER[color][unit.kind]}
            color={color}
            from={from}
            to={home}
            slay={slay}
            carry={Boolean(unit.ball)}
          />
        </Suspense>
      </group>
    );
  }
  return (
    <group ref={ref} position={home}>
      {look === "an" ? (
        <StonePerson type={unit.hidden ? "p" : unit.kind} white={!unit.hidden && unit.side === "w"} cast="stone" gait={gait} sword={false} clash={slay} />
      ) : (
        <PieceMesh unit={unit} look={look} />
      )}
      {unit.ball && look !== "lg" ? (
        <group position={[0.18, 0.72, 0.12]}>
          {orange ? <OrangeBall /> : <Pigskin />}
        </group>
      ) : null}
    </group>
  );
}

function Throw({ from, to, rows, cols, orange = false }: { from: [number, number]; to: [number, number]; rows: number; cols: number; orange?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const a = spot(from[0], from[1], rows, cols, 0.7);
  const b = spot(to[0], to[1], rows, cols, 0.7);
  useFrame(({ clock }) => {
    const node = ref.current;
    if (!node) return;
    if (born.current == null) born.current = clock.elapsedTime;
    const u = Math.min(1, (clock.elapsedTime - born.current) / 0.72);
    const arc = Math.sin(u * Math.PI) * ((orange ? 1.4 : 0.55) + Math.hypot(b[0] - a[0], b[2] - a[2]) * (orange ? 0.28 : 0.18));
    node.position.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u + arc, a[2] + (b[2] - a[2]) * u);
    const dir = new THREE.Vector3(b[0] - a[0], 0.15, b[2] - a[2]);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
    dir.normalize();
    node.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    node.rotateX(u * 14);
  });
  return (
    <group ref={ref}>
      {orange ? <OrangeBall /> : <Pigskin />}
    </group>
  );
}

/** Throw mode: the goal posts light up as a target; tap it to kick / throw a field goal. */
function GoalTarget({ rows, cols, from }: { rows: number; cols: number; from: { r: number; f: number } }) {
  const z = -rows / 2 - 0.35;
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5) * 0.08);
  });
  return (
    <group>
      <group ref={ref} position={[0, 0.15, z]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
          <ringGeometry args={[0.5, 0.66, 40]} />
          <meshBasicMaterial color="#ffe14a" transparent opacity={0.95} toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
      {/* a big invisible tap target around the posts */}
      <mesh position={[0, 1.1, z]} userData={{ pick: "goal" }}>
        <boxGeometry args={[2.4, 2.4, 1.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <Arc from={spot(from.r, from.f, rows, cols, 0.3)} to={[0, 1.7, z]} color="#ffe14a" opacity={0.9} lift={1.1} />
    </group>
  );
}

/** Football (owner t239u): a square painted PASS_BG is a teammate you can pass / hand the ball to. */
export const PASS_BG = "#ffe14a";
const markBg = (bg: string) => bg === "#e6c56a" || bg === PASS_BG;

/** A glowing ring under a teammate who can catch a pass, with a bobbing football over his head. */
function PassMark({ position }: { position: [number, number, number] }) {
  const ball = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ball.current) ball.current.position.y = 1.45 + Math.sin(clock.elapsedTime * 4) * 0.08;
  });
  return (
    <group position={position}>
      <TargetMark position={[0, 0, 0]} color={PASS_BG} strong />
      <group ref={ball}>
        <Html center zIndexRange={[5, 0]} style={{ pointerEvents: "none", fontSize: 26, filter: "drop-shadow(0 0 6px #ffe14a)" }}>
          🏈
        </Html>
      </group>
    </group>
  );
}

function Deck({
  rows,
  cols,
  paint,
  onPick,
  units,
  look,
  ball,
  cue,
  stadium = false,
  sel = null,
  field = null,
  court = false,
}: {
  rows: number;
  cols: number;
  paint: (r: number, f: number) => { bg: string };
  onPick: (r: number, f: number) => void;
  units: StageUnit[];
  look: Look;
  ball: { r: number; f: number } | null;
  cue: MoveCue | null;
  stadium?: boolean;
  sel?: { r: number; f: number; throwing: boolean } | null;
  field?: FieldOpts | null;
  court?: boolean;
}) {
  const homeCol = field?.colors.w ?? TEAM.w;
  const awayCol = field?.colors.b ?? TEAM.b;
  // recent moves: the fights and throws keep playing even when the next move starts
  const [recent, setRecent] = useState<MoveCue[]>([]);
  const [flying, setFlying] = useState<number | null>(null);
  useEffect(() => {
    if (!cue || !stadium) return;
    setRecent((list) => (list.some((c) => c.id === cue.id) ? list : [...list.slice(-5), cue]));
    if (cue.thrown) setFlying(cue.id);
    const id = cue.id;
    const timer = window.setTimeout(() => setRecent((list) => list.filter((c) => c.id !== id)), cue.thrown ? 30000 : 6500); // a slow device must not lose a ball mid-air
    return () => window.clearTimeout(timer);
  }, [cue?.id, stadium]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // a new kickoff / replay: no leftover fights
    setRecent([]);
    setFlying(null);
  }, [field?.epoch]);
  const squares = [];
  const arcs = [];
  for (let r = 0; r < rows; r++) {
    for (let f = 0; f < cols; f++) {
      const [x, , z] = spot(r, f, rows, cols, 0);
      squares.push(
        stadium && !markBg(paint(r, f).bg) ? null : stadium && paint(r, f).bg === PASS_BG ? (
          <PassMark key={`${r}:${f}`} position={[x, 0.15, z]} />
        ) : stadium ? (
          <group key={`${r}:${f}`}>
            <TargetMark position={[x, 0.15, z]} color={sel?.throwing ? "#ffe14a" : sel?.r === r && sel?.f === f ? SELECT_RING : homeCol} strong={sel?.r === r && sel?.f === f} />
          </group>
        ) : (
          <mesh key={`${r}:${f}`} position={[x, 0.08, z]} receiveShadow onClick={(e) => { e.stopPropagation(); onPick(r, f); }}>
            <boxGeometry args={[0.96, 0.08, 0.96]} />
            <meshStandardMaterial color={paint(r, f).bg} roughness={0.55} metalness={0.04} />
          </mesh>
        ),
      );
      if (stadium && sel && markBg(paint(r, f).bg) && !(sel.r === r && sel.f === f)) {
        const toss = sel.throwing || paint(r, f).bg === PASS_BG;
        arcs.push(<Arc key={`a${r}:${f}`} from={spot(sel.r, sel.f, rows, cols, 0.3)} to={spot(r, f, rows, cols, 0.2)} color={toss ? "#ffe14a" : homeCol} opacity={0.85} lift={toss ? 0.9 : 0.3} />);
      }
    }
  }
  // Stadium picking: one handler for the whole field. A tap is read against the
  // invisible ground plane AND every player it passes through, so a tall player
  // standing in front of a gold target square can no longer swallow the tap.
  const marked = (r: number, f: number) => r >= 0 && r < rows && f >= 0 && f < cols && markBg(paint(r, f).bg);
  const stadiumPick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // A drag that spins the camera is not a tap (fingers wobble a little, so allow some).
    if (e.delta > 18) return;
    let ground: [number, number] | null = null;
    let hitUnit: [number, number] | null = null;
    for (const hit of e.intersections) {
      let node: THREE.Object3D | null = hit.object;
      while (node && !node.userData.pick) node = node.parent;
      const tag = node?.userData.pick as "ground" | "goal" | [number, number] | undefined;
      if (!tag) continue;
      if (tag === "goal") {
        field?.onGoal?.();
        return;
      }
      if (tag === "ground") {
        if (!ground) ground = [Math.round((rows - 1) / 2 - hit.point.z), Math.round(hit.point.x + (cols - 1) / 2)];
      } else if (!hitUnit) hitUnit = tag;
    }
    if (ground && (ground[0] < 0 || ground[0] >= rows || ground[1] < 0 || ground[1] >= cols)) ground = null;
    const same = (a: [number, number] | null, b: [number, number] | null) => Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
    const selected: [number, number] | null = sel ? [sel.r, sel.f] : null;
    let pickSq: [number, number] | null = null;
    if (hitUnit && same(hitUnit, ground)) pickSq = hitUnit;
    else if (selected && ground && marked(ground[0], ground[1]) && !same(ground, selected)) pickSq = ground;
    else if (hitUnit) pickSq = hitUnit;
    else pickSq = ground;
    if (pickSq) onPick(pickSq[0], pickSq[1]);
  };
  return (
    <group onClick={stadium ? stadiumPick : undefined}>
      {stadium ? (
        <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} userData={{ pick: "ground" }}>
          <planeGeometry args={[cols, rows]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      ) : null}
      {stadium ? null : court ? (
        <>
          <mesh position={[0, 0.01, 0]} receiveShadow>
            <boxGeometry args={[cols + 1.2, 0.08, rows + 1.4]} />
            <meshStandardMaterial color="#c4843a" roughness={0.72} />
          </mesh>
          <Hoop at={spot(-0.55, Math.floor(cols / 2), rows, cols, 0)} />
          <Hoop at={spot(rows - 0.45, Math.floor(cols / 2), rows, cols, 0)} />
        </>
      ) : (
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[cols + 0.8, 0.08, rows + 0.8]} />
        <meshStandardMaterial color="#3c261c" roughness={0.7} />
      </mesh>
      )}
      {field?.replay ? null : squares}
      {field?.replay ? null : arcs}
      {stadium && cue && !cue.goal && !field?.replay ? (
        <FadingArc key={`cue${cue.id}`} from={spot(cue.from[0], cue.from[1], rows, cols, 0.3)} to={spot(cue.to[0], cue.to[1], rows, cols, 0.2)} color={cue.thrown ? "#ffe14a" : cue.side === "w" ? homeCol : awayCol} />
      ) : null}
      {stadium && field?.goal && sel && !field.replay ? <GoalTarget rows={rows} cols={cols} from={sel} /> : null}
      {stadium && field
        ? units.map((unit) => {
            const inAir = flying != null ? recent.find((c) => c.id === flying) ?? null : null;
            const mine = unit.id ? [...recent].reverse().find((c) => c.unit === unit.id && !c.thrown) ?? null : null;
            const caught = Boolean(flying != null && unit.ball);
            return (
              <group key={unit.id ?? `${unit.side}${unit.kind}${unit.r}:${unit.f}`} userData={{ pick: [unit.r, unit.f] }}>
                <FieldActor
                  unit={unit}
                  look={look}
                  rows={rows}
                  cols={cols}
                  act={mine}
                  epoch={field.epoch}
                  selected={Boolean(sel && sel.r === unit.r && sel.f === unit.f)}
                  ring={unit.side === "w" ? homeCol : awayCol}
                  hideBall={caught}
                  receive={caught && inAir && !inAir.goal ? inAir.from : null}
                  bare={Boolean(field.replay)}
                  dress={unit.kind === "k" ? field.kings?.[unit.side] ?? null : null}
                />
              </group>
            );
          })
        : null}
      {stadium && field
        ? recent.filter((c) => c.capture && !c.thrown).map((c) => <FieldVictim key={`v${c.id}`} cue={c} look={look} rows={rows} cols={cols} taken={units} />)
        : null}
      {stadium && field
        ? recent.filter((c) => c.thrown && c.id === flying).map((c) => <FieldThrow key={`t${c.id}`} cue={c} rows={rows} cols={cols} units={units} onDone={() => setFlying((f) => (f === c.id ? null : f))} />)
        : null}
      {stadium && field && ball && flying == null ? <LooseBall r={ball.r} f={ball.f} rows={rows} cols={cols} /> : null}
      {stadium && !field && units.length ? units.map((unit) => <TeamRing key={`ring${unit.side}${unit.r}:${unit.f}`} side={unit.side} position={spot(unit.r, unit.f, rows, cols, 0.145)} />) : null}
      {(stadium && field ? [] : units).map((unit) => {
        const moving = cue && cue.side === unit.side && cue.to[0] === unit.r && cue.to[1] === unit.f && !cue.thrown;
        return (
          <group
            key={`${unit.side}${unit.kind}${unit.r}:${unit.f}${unit.label ?? ""}`}
            userData={{ pick: [unit.r, unit.f] }}
            onClick={stadium ? undefined : (e) => { e.stopPropagation(); onPick(unit.r, unit.f); }}
          >
            <Actor
              unit={unit}
              look={look}
              rows={rows}
              cols={cols}
              spawn={moving ? cue.from : null}
              slay={Boolean(moving && cue.capture)}
              orange={court}
            />
          </group>
        );
      })}
      {!field && cue?.capture && look === "an" && cue.victim ? (
        <group key={cue.id} position={spot(cue.to[0], cue.to[1], rows, cols, 0.08)}>
          <WarCorpse type={cue.victim} white={cue.victimSide === "w"} cast="stone" sword={false} clash delay={0.55} onDone={() => undefined} />
        </group>
      ) : null}
      {!field && cue?.thrown ? <Throw key={cue.id} from={cue.from} to={cue.to} rows={rows} cols={cols} orange={court} /> : null}
      {!field && ball && !cue?.thrown ? (
        <group position={spot(ball.r, ball.f, rows, cols, 0.22)}>
          {court ? <OrangeBall /> : <Pigskin />}
        </group>
      ) : null}
    </group>
  );
}

export function VariantStage({
  rows,
  cols,
  paint,
  onPick,
  units,
  look,
  sky,
  ball = null,
  cue = null,
  stadium = false,
  sel = null,
  show = null,
  onReady,
  field = null,
  home = null,
  park = false,
  court = false,
}: {
  rows: number;
  cols: number;
  paint: (r: number, f: number) => { bg: string; fg: string; text: string };
  onPick: (r: number, f: number) => void;
  units: StageUnit[];
  look: Look;
  sky: Sky;
  onReady?: () => void;
  ball?: { r: number; f: number } | null;
  cue?: MoveCue | null;
  stadium?: boolean;
  sel?: { r: number; f: number; throwing: boolean } | null;
  show?: StadiumShow | null;
  field?: FieldOpts | null;
  home?: HomeTeam | null;
  /** the daytime Park Field instead of the neon stadium (football, picked on the Boards page) */
  park?: boolean;
  court?: boolean;
}) {
  const span = Math.max(rows, cols);
  const cam: [number, number, number] = [0, span * 1.05, span * 0.78];
  return (
    <div className="h-full w-full">
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: cam, fov: 34, near: 0.1, far: 400 }} gl={{ antialias: true, alpha: false }}>
        {stadium ? null : <color attach="background" args={[sky === "table" ? "#14110e" : "#87a0c4"]} />}
        {stadium && !park ? <NeonStadium rows={rows} cols={cols} show={show} home={home} /> : null}
        {stadium && park ? (
          <Suspense fallback={null}>
            <ParkField rows={rows} cols={cols} show={show} home={home} />
          </Suspense>
        ) : null}
        {!stadium && sky === "table" ? (
          <>
            <hemisphereLight args={["#ffe7c2", "#2a2118", 0.7]} />
            <directionalLight position={[6, 12, 8]} intensity={1.3} castShadow />
          </>
        ) : null}
        {stadium ? null : sky === "lego" ? <LegoWorld /> : null}
        {!stadium && sky === "arena" ? <SkyArenaWorld squaresBottom={0.02} plinth={false} /> : null}
        <Deck rows={rows} cols={cols} paint={paint} onPick={onPick} units={units} look={look} ball={ball} cue={cue} stadium={stadium} sel={sel} field={field} court={court} />
        <OrbitControls makeDefault target={[0, 0, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={4} maxDistance={span * 3} />
        {onReady ? <Ready onReady={onReady} /> : null}
      </Canvas>
    </div>
  );
}

/** Tells the page once the 3D scene has really drawn a few frames (models loaded, shaders built). */
function Ready({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current || ++frames.current < 12) return;
    fired.current = true;
    onReady();
  });
  return null;
}

export function ShopPreview({
  kind,
  look,
  onShot,
}: {
  kind: "av" | "lg";
  look: Look;
  onShot?: (dataUrl: string) => void;
}) {
  const [armed, setArmed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  function shoot() {
    const canvas = box.current?.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    try {
      onShot?.(canvas.toDataURL("image/jpeg", 0.72));
    } catch {
      /* ignore */
    }
    setArmed(false);
  }
  return (
    <div ref={box} className="relative h-72 overflow-hidden rounded-md border border-[#6d5a32] bg-[#14110e]">
      <Canvas shadows camera={{ position: [1.4, 1.5, 2.8], fov: 34 }} gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}>
        <color attach="background" args={["#241910"]} />
        <hemisphereLight args={["#ffe7c2", "#2a2118", 0.8]} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        {look === "lg" ? <LegoWorld /> : null}
        {look === "an" && kind === "av" ? <SkyArenaWorld squaresBottom={-0.2} plinth={false} /> : null}
        <group>
          {look === "2d" ? (
            <Html center>
              <span className="font-display text-7xl text-[#f6e7c1]">{kind === "lg" ? "▦" : "♔"}</span>
            </Html>
          ) : null}
          {look === "3d" && kind === "av" ? <SculptedPiece type="k" color="w" /> : null}
          {look === "3d" && kind === "lg" ? (
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[1.6, 0.08, 1.6]} />
              <meshStandardMaterial color="#6c6e68" />
            </mesh>
          ) : null}
          {look === "an" && kind === "av" ? <Person type="k" white /> : null}
          {look === "lg" ? (
            <Suspense fallback={null}>
              <group position={[0, 0.05, 0]}>
                <LegoFig id={kind === "av" ? "cap" : "hulk"} />
              </group>
            </Suspense>
          ) : null}
        </group>
        <OrbitControls enablePan target={[0, 0.4, 0]} />
      </Canvas>
      <div className="pointer-events-none absolute inset-3 border border-[#e6c56a]/70" />
      {onShot ? (
        <button
          type="button"
          onClick={() => (armed ? shoot() : setArmed(true))}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-[#d6ad4f] bg-[#1b140a]/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#f0d68a]"
        >
          {armed ? "Screenshot" : "Frame the cover"}
        </button>
      ) : null}
    </div>
  );
}
