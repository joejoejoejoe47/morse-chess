import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { Color, PieceSymbol } from "chess.js";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { asset } from "@/lib/base";
import { DEFAULT_LOADOUT, finishById, parseLoadout, type AvatarLoadout, type KingFinish } from "@/lib/avatar/catalog";
import { LEGACY_HEAD, buildKing, shieldTexture } from "@/components/avatar/pedestal-king";
import { FINIAL_FROM, KingCrown, STAUNTON_HEAD, crownCoversFinial, hideFinial } from "@/components/chess/sculpted-piece";

/**
 * The AV set: in 3D every piece of a player follows the king they built in AV.
 * Without the Royal Legacy kit: the normal Staunton pieces, painted the king's colour.
 * With the kit: pearl and gold Royal Legacy pieces with the player's letter, and their AV king.
 * Playing black makes the whole set a darker shade of the same colours.
 */

export const LEGACY_KIT_ID = "king-royal-legacy";

const STAUNTON: Record<Color, Record<PieceSymbol, string>> = {
  w: {
    k: asset("/pieces/01_king_light.glb"),
    q: asset("/pieces/03_queen_light.glb"),
    b: asset("/pieces/05_bishop_light.glb"),
    n: asset("/pieces/07_knight_light.glb"),
    r: asset("/pieces/09_rook_light.glb"),
    p: asset("/pieces/11_pawn_light.glb"),
  },
  b: {
    k: asset("/pieces/02_king_dark.glb"),
    q: asset("/pieces/04_queen_dark.glb"),
    b: asset("/pieces/06_bishop_dark.glb"),
    n: asset("/pieces/08_knight_dark.glb"),
    r: asset("/pieces/10_rook_dark.glb"),
    p: asset("/pieces/12_pawn_dark.glb"),
  },
};

const HEIGHT: Record<PieceSymbol, number> = { k: 1.12, q: 1.04, b: 0.9, n: 0.84, r: 0.86, p: 0.66 };

/** What one side's AV look says about its 3D pieces. */
export type SideLook = { finish: KingFinish; legacy: boolean; letter: string; crownId: string };

/** The paint a side's whole set uses in one game. */
export type SetPaint = {
  /** King finish after the black shade (and the white lift, if the sides would look the same). */
  finish: KingFinish;
  legacy: boolean;
  letter: string;
  crownId: string;
  dark: boolean;
  /** Pearl and gold of the kit pieces. */
  pearl: string;
  gold: string;
};

function readObject(look?: string | null): Record<string, unknown> | null {
  if (!look) return null;
  try {
    const raw = JSON.parse(look);
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The AV loadout inside a game look, without the kit fields the server adds. Null when the player never saved one. */
export function lookLoadout(look?: string | null): AvatarLoadout | null {
  const src = readObject(look);
  if (!src) return null;
  const rest = { ...src };
  delete rest.kit;
  delete rest.letter;
  if (Object.keys(rest).length === 0) return null;
  return parseLoadout(rest);
}

export function readSideLook(look?: string | null): SideLook | null {
  const src = readObject(look);
  if (!src) return null;
  const loadout = lookLoadout(look) ?? DEFAULT_LOADOUT;
  const legacy = src.kit === "legacy";
  const letter = typeof src.letter === "string" ? src.letter.slice(0, 2).toUpperCase() : "";
  return { finish: finishById(loadout.finishId), legacy, letter, crownId: loadout.crownId };
}

function lightness(hex: string) {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(hsl, THREE.SRGBColorSpace);
  return hsl.l;
}

function scaleLight(hex: string, k: number, floor = 0, sat = 1) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, Math.min(1, hsl.s * sat), Math.max(floor, hsl.l * k), THREE.SRGBColorSpace);
  return `#${c.getHexString()}`;
}

/** The black-side version of a king: the same colours, clearly darker. */
export function darkFinish(f: KingFinish): KingFinish {
  // Light colours drop a lot; colours that are already deep drop less and get a touch more colour,
  // so a navy king turns a deeper navy, not black.
  const body = lightness(f.body) > 0.25 ? scaleLight(f.body, 0.52) : scaleLight(f.body, 0.8, 0, 1.3);
  return { ...f, body, trim: scaleLight(f.trim, 0.68), crown: scaleLight(f.crown, 0.68) };
}

/** A light tint of the same hue, used only when both sides would otherwise be the same dark colour. */
function liftFinish(f: KingFinish): KingFinish {
  const c = new THREE.Color(f.body);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, Math.min(hsl.s, 0.45), 0.76, THREE.SRGBColorSpace);
  return { ...f, body: `#${c.getHexString()}` };
}

const PEARL = { w: "#f3eee3", b: "#6c665e" };
const GOLD = { w: "#e2b850", b: "#9a7630" };

/** Body lightness of a side's men, for telling the two sides apart. Plain pieces count as ivory / ebony. */
function menLight(paint: SetPaint | null, color: Color) {
  if (!paint) return color === "w" ? 0.9 : 0.1;
  return paint.legacy ? lightness(paint.pearl) : lightness(paint.finish.body);
}

/** Both sides' paint for a game. A side without an AV look keeps the board's own pieces (null). */
export function setPaints(kings?: { w?: string | null; b?: string | null }): Record<Color, SetPaint | null> {
  const make = (color: Color): SetPaint | null => {
    const side = readSideLook(kings?.[color]);
    if (!side) return null;
    const dark = color === "b";
    return {
      finish: dark ? darkFinish(side.finish) : side.finish,
      legacy: side.legacy,
      letter: side.letter,
      crownId: side.crownId,
      dark,
      pearl: PEARL[color],
      gold: GOLD[color],
    };
  };
  const w = make("w");
  const b = make("b");
  // White's army must read as the lighter one. If a dark king colour (the house Onyx king is the default, or Navy)
  // would make white as dark as, or darker than, black's army, white's men get a light tint of the same colour.
  // A Royal Legacy side is pearl, so it never needs the lift.
  if (w && !w.legacy && menLight(w, "w") < menLight(b, "b") + 0.15) w.finish = liftFinish(w.finish);
  return { w, b };
}

// ── shared materials / textures ───────────────────────────────────────────

const cache = new Map<string, THREE.Material | THREE.Texture | THREE.BufferGeometry>();
function cached<T extends THREE.Material | THREE.Texture | THREE.BufferGeometry>(key: string, make: () => T): T {
  let hit = cache.get(key) as T | undefined;
  if (!hit) {
    hit = make();
    cache.set(key, hit);
  }
  return hit;
}

function pearlMat(color: string) {
  return cached(`pearl:${color}`, () => {
    const dark = lightness(color) < 0.5;
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.28,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      sheen: 1,
      sheenRoughness: 0.35,
      sheenColor: new THREE.Color(dark ? "#b9a7c9" : "#ffe6ef"),
      iridescence: 0.45,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [220, 480],
    });
  });
}

function goldMat(color: string) {
  return cached(`gold:${color}`, () => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.24 }));
}

function shieldMat(trim: string, field: string, letter: string) {
  return cached(
    `shield:${trim}:${field}:${letter}`,
    () =>
      new THREE.MeshStandardMaterial({
        map: shieldTexture(trim, field, letter),
        transparent: true,
        metalness: 0.55,
        roughness: 0.35,
        side: THREE.DoubleSide,
      }),
  );
}

function lathe(key: string, pts: [number, number][]) {
  return cached(`lathe:${key}`, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 56));
}

const BASE: [number, number][] = [
  [0, 0],
  [0.33, 0],
  [0.33, 0.045],
  [0.3, 0.075],
  [0.27, 0.1],
  [0.24, 0.13],
];

const PROFILES: Record<Exclude<PieceSymbol, "k" | "n">, [number, number][]> = {
  p: [
    [0, 0], [0.29, 0], [0.29, 0.04], [0.26, 0.07], [0.22, 0.1], [0.19, 0.13], [0.15, 0.19], [0.12, 0.27],
    [0.1, 0.34], [0.15, 0.37], [0.155, 0.39], [0.1, 0.41], [0.085, 0.43], [0, 0.43],
  ],
  r: [
    ...BASE, [0.22, 0.17], [0.2, 0.26], [0.19, 0.4], [0.195, 0.55], [0.22, 0.62], [0.255, 0.66], [0.255, 0.75], [0, 0.75],
  ],
  b: [
    ...BASE, [0.2, 0.18], [0.16, 0.27], [0.125, 0.38], [0.11, 0.47], [0.17, 0.5], [0.175, 0.52], [0.11, 0.545], [0, 0.545],
  ],
  q: [
    ...BASE, [0.21, 0.18], [0.175, 0.28], [0.145, 0.42], [0.13, 0.56], [0.14, 0.64], [0.2, 0.68], [0.205, 0.7], [0.15, 0.72],
    [0.14, 0.75], [0.17, 0.83], [0.2, 0.89], [0, 0.89],
  ],
};

/** Horse head silhouette (x forward, y up), extruded for the kit knight. */
function knightHead() {
  return cached("knight-head", () => {
    const s = new THREE.Shape();
    s.moveTo(-0.17, 0);
    s.lineTo(0.15, 0);
    s.quadraticCurveTo(0.14, 0.1, 0.08, 0.17);
    s.quadraticCurveTo(0.18, 0.22, 0.27, 0.27);
    s.quadraticCurveTo(0.31, 0.32, 0.26, 0.37);
    s.lineTo(0.15, 0.4);
    s.quadraticCurveTo(0.11, 0.48, 0.05, 0.53);
    s.lineTo(0.02, 0.6);
    s.lineTo(-0.03, 0.53);
    s.quadraticCurveTo(-0.16, 0.47, -0.2, 0.32);
    s.quadraticCurveTo(-0.23, 0.15, -0.17, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 4, curveSegments: 18 });
    geo.translate(0, 0, -0.075);
    return geo;
  });
}

const torus = (r: number, t: number) => cached(`torus:${r}:${t}`, () => new THREE.TorusGeometry(r, t, 10, 56));
const plane = (w: number, h: number) => cached(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));
const box = (x: number, y: number, z: number) => cached(`box:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
const ball = (r: number) => cached(`ball:${r}`, () => new THREE.SphereGeometry(r, 20, 14));

/** Shield anchors per piece: height, distance out, size and lean. */
const SHIELD: Record<Exclude<PieceSymbol, "k" | "n">, { y: number; z: number; w: number; lean: number }> = {
  p: { y: 0.2, z: 0.16, w: 0.12, lean: -0.38 },
  r: { y: 0.4, z: 0.196, w: 0.17, lean: 0.02 },
  b: { y: 0.3, z: 0.158, w: 0.13, lean: -0.32 },
  q: { y: 0.38, z: 0.162, w: 0.14, lean: -0.2 },
};

function KitMan({ type, paint }: { type: Exclude<PieceSymbol, "k">; paint: SetPaint }) {
  const pearl = pearlMat(paint.pearl);
  const gold = goldMat(paint.gold);
  const crest = shieldMat(paint.gold, paint.pearl, paint.letter);
  const knight = type === "n";
  const shield = knight ? null : SHIELD[type];
  return (
    <group>
      {knight ? (
        <>
          <mesh geometry={lathe("n-base", [...BASE, [0.21, 0.17], [0.19, 0.22], [0.2, 0.25], [0, 0.25]])} material={pearl} castShadow receiveShadow />
          <mesh geometry={knightHead()} material={pearl} position={[0, 0.22, 0]} castShadow receiveShadow />
          {/* Gold mane ridge and eyes. */}
          {[0.36, 0.46, 0.56, 0.66, 0.76].map((y, i) => (
            <mesh key={y} geometry={ball(0.034)} material={gold} position={[-0.2 + i * 0.045 - (i > 2 ? 0.02 : 0), y, 0]} castShadow />
          ))}
          <mesh geometry={ball(0.022)} material={gold} position={[0.14, 0.64, 0.105]} />
          <mesh geometry={ball(0.022)} material={gold} position={[0.14, 0.64, -0.105]} />
          <mesh geometry={plane(0.12, 0.141)} material={crest} position={[-0.03, 0.42, 0.117]} />
          <mesh geometry={plane(0.12, 0.141)} material={crest} position={[-0.03, 0.42, -0.117]} rotation={[0, Math.PI, 0]} />
        </>
      ) : (
        <mesh geometry={lathe(type, PROFILES[type])} material={pearl} castShadow receiveShadow />
      )}
      {/* Gold bands: base and waist. */}
      <mesh geometry={torus(type === "p" ? 0.285 : 0.325, 0.013)} material={gold} position={[0, 0.045, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={torus(type === "p" ? 0.2 : 0.245, 0.014)} material={gold} position={[0, type === "p" ? 0.12 : 0.135, 0]} rotation={[Math.PI / 2, 0, 0]} />
      {type === "p" ? (
        <>
          <mesh geometry={torus(0.152, 0.013)} material={gold} position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={ball(0.115)} material={pearl} position={[0, 0.53, 0]} castShadow />
        </>
      ) : null}
      {type === "r" ? (
        <>
          <mesh geometry={torus(0.23, 0.014)} material={gold} position={[0, 0.635, 0]} rotation={[Math.PI / 2, 0, 0]} />
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
            return (
              <mesh key={i} geometry={box(0.11, 0.11, 0.09)} material={pearl} position={[Math.sin(a) * 0.205, 0.8, Math.cos(a) * 0.205]} rotation={[0, a, 0]} castShadow />
            );
          })}
          <mesh geometry={torus(0.255, 0.012)} material={gold} position={[0, 0.75, 0]} rotation={[Math.PI / 2, 0, 0]} />
        </>
      ) : null}
      {type === "b" ? (
        <>
          <mesh geometry={torus(0.175, 0.013)} material={gold} position={[0, 0.51, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={ball(0.13)} material={pearl} position={[0, 0.66, 0]} scale={[1, 1.32, 1]} castShadow />
          <mesh geometry={box(0.022, 0.15, 0.27)} material={gold} position={[0, 0.7, 0]} rotation={[0.55, 0, 0]} />
          <mesh geometry={ball(0.04)} material={gold} position={[0, 0.85, 0]} />
        </>
      ) : null}
      {type === "q" ? (
        <>
          <mesh geometry={torus(0.205, 0.014)} material={gold} position={[0, 0.69, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={torus(0.2, 0.014)} material={gold} position={[0, 0.89, 0]} rotation={[Math.PI / 2, 0, 0]} />
          {Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            return <mesh key={i} geometry={ball(0.03)} material={gold} position={[Math.sin(a) * 0.19, 0.925, Math.cos(a) * 0.19]} />;
          })}
          <mesh geometry={ball(0.11)} material={pearl} position={[0, 0.89, 0]} scale={[1, 0.6, 1]} />
          <mesh geometry={ball(0.05)} material={gold} position={[0, 0.99, 0]} />
        </>
      ) : null}
      {shield ? (
        <>
          <mesh geometry={plane(shield.w, shield.w * 1.175)} material={crest} position={[0, shield.y, shield.z]} rotation={[shield.lean, 0, 0]} />
          <mesh geometry={plane(shield.w, shield.w * 1.175)} material={crest} position={[0, shield.y, -shield.z]} rotation={[-shield.lean, Math.PI, 0]} />
        </>
      ) : null}
    </group>
  );
}

function KitKing({ paint }: { paint: SetPaint }) {
  const coronet = paint.crownId === "poly-band";
  const bare = coronet || paint.crownId === "none";
  const finial = !crownCoversFinial(paint.crownId);
  const king = useMemo(() => buildKing(paint.finish, coronet, paint.letter, finial), [paint.finish, coronet, paint.letter, finial]);
  return (
    <group scale={0.9}>
      <primitive object={king} />
      {bare ? null : (
        <group position={[0, 0.94, 0]} scale={1.35}>
          <KingCrown id={paint.crownId} team={paint.dark ? "b" : "w"} head={LEGACY_HEAD} />
        </group>
      )}
    </group>
  );
}

/** The Staunton piece, painted in the AV king's colour. */
/** crowned: a hat that covers the head is on, so the cross finial is hidden (set invisible). */
export function PaintedStaunton({ type, color, finish, crowned = false }: { type: PieceSymbol; color: Color; finish: KingFinish; crowned?: boolean }) {
  const gltf = useGLTF(STAUNTON[color][type]);
  const scene = useMemo(() => {
    const obj = cloneSkeleton(gltf.scene);
    const metal = Math.min(finish.metal, 0.85);
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.material = new THREE.MeshStandardMaterial({
        color: finish.body,
        metalness: metal,
        roughness: metal > 0.7 ? 0.26 : 0.34,
        envMapIntensity: 1,
      });
    });
    obj.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    if (crowned && type === "k") hideFinial(obj, FINIAL_FROM[color]);
    obj.scale.multiplyScalar(HEIGHT[type] / (size.y || 1));
    obj.updateMatrixWorld(true);
    obj.position.y -= new THREE.Box3().setFromObject(obj).min.y;
    obj.rotation.y = color === "w" ? Math.PI : 0;
    return obj;
  }, [gltf.scene, type, color, finish.body, finish.metal, crowned]);
  return <primitive object={scene} />;
}

/** One 3D piece of an AV set. */
export function AvPiece({ type, color, paint }: { type: PieceSymbol; color: Color; paint: SetPaint }) {
  if (paint.legacy) {
    if (type === "k") return <KitKing paint={paint} />;
    return (
      <group rotation={[0, type === "n" ? (color === "w" ? Math.PI / 2 : -Math.PI / 2) : 0, 0]}>
        <KitMan type={type} paint={paint} />
      </group>
    );
  }
  return (
    <>
      <PaintedStaunton type={type} color={color} finish={paint.finish} crowned={crownCoversFinial(paint.crownId)} />
      {type === "k" && paint.crownId && paint.crownId !== "none" ? (
        <group position={[0, 0.92, 0]} rotation={[0, color === "w" ? Math.PI : 0, 0]}>
          <KingCrown id={paint.crownId} team={paint.dark ? "b" : "w"} head={STAUNTON_HEAD[color]} />
        </group>
      ) : null}
    </>
  );
}
