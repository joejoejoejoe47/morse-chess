/**
 * Store: a bigger preview of an AV king listing. The king turns slowly, every mode he plays in
 * has a tab (2D, 3D, AN, plus RA and LG when the viewer owns them) and "Play attack" shows his
 * attack in that mode. About two thirds of the screen on a computer, almost all of it on a phone.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ModelSlot } from "@/components/chess/load-guard";
import { keepWebGL } from "@/lib/gl-quiet";
import { Figurine } from "@/components/avatar/figurine";
import { FieldStage } from "@/components/avatar/field-stage";
import { LegoDress } from "@/components/avatar/lego-dress";
import { PedestalStage } from "@/components/avatar/pedestal-king";
import { BlueRook, CrownFlat, RaPreview } from "@/components/avatar/king-bits";
import { AttackMark } from "@/components/avatar/attack-mark";
import { attackById, finishById, lgAttackById, type AvatarLoadout } from "@/lib/avatar/catalog";
import { cn } from "@/lib/utils";

export type PreviewMode = "2d" | "3d" | "an" | "ra" | "lg";

/** Same letter rule as the Royal Legacy kit: the first letter of the username, upper case. */
function kitInitial(name: string) {
  const hit = name.match(/[\p{L}\p{N}]/u);
  return hit ? hit[0].toUpperCase() : "";
}

const MODE_NAMES: Record<PreviewMode, string> = { "2d": "2D", "3d": "3D", an: "AN", ra: "RA", lg: "LG" };

/** Turns its children slowly, and hops them when `hop` flips on. */
function Turntable({ children, hop = false, speed = 0.45 }: { children: ReactNode; hop?: boolean; speed?: number }) {
  const ref = useRef<THREE.Group>(null);
  const hopT = useRef(-1);
  useEffect(() => {
    if (hop) hopT.current = 0;
  }, [hop]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.rotation.y += dt * speed;
    if (hopT.current >= 0) {
      hopT.current += dt;
      const k = Math.min(1, hopT.current / 0.9);
      g.position.y = Math.sin(Math.PI * k) * 0.55;
      g.rotation.y += dt * 9 * Math.sin(Math.PI * k);
      if (k >= 1) {
        hopT.current = -1;
        g.position.y = 0;
      }
    }
  });
  return <group ref={ref}>{children}</group>;
}

export function KingPreview({
  loadout,
  name,
  seller,
  modes,
  onClose,
}: {
  loadout: AvatarLoadout;
  name: string;
  seller: string;
  /** RA / LG only when the viewer owns them. */
  modes: PreviewMode[];
  onClose: () => void;
}) {
  const first: PreviewMode = modes.includes(loadout.style as PreviewMode) ? (loadout.style as PreviewMode) : "3d";
  const [mode, setMode] = useState<PreviewMode>(first);
  const [strike, setStrike] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const keep = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = keep;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [onClose]);

  const attack = attackById(loadout.attackId);
  const lgAttack = lgAttackById(loadout.lgAttackId);
  const animated = mode === "an" || mode === "ra";
  const characterId = mode === "ra" ? "royal" : loadout.anId;
  const finish = finishById(loadout.finishId);
  const legacy = Boolean(finish.legendary);

  function play() {
    if (timer.current) window.clearTimeout(timer.current);
    setStrike(false);
    // a fresh render first so the same attack can replay
    window.requestAnimationFrame(() => {
      setStrike(true);
      timer.current = window.setTimeout(() => setStrike(false), Math.max(1600, (attack.ms ?? 980) + 700));
    });
  }

  const shown = mode === "lg" ? lgAttack : attack;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-2 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${name}`}
      data-king-preview
    >
      <div
        className="flex h-[min(88dvh,820px)] w-[96vw] flex-col overflow-hidden rounded-xl border border-gold-line bg-[#15110d] shadow-[0_30px_90px_rgba(0,0,0,0.6)] md:w-[66vw] md:min-w-[620px] md:max-w-[1100px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[#3a3024] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-2xl text-ivory">{name}</h2>
            <p className="truncate text-xs text-mist">AV king · {seller}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-[#5a4a33] text-xl text-[#e8d9b8] hover:border-[#d6ad4f] hover:text-ivory"
          >
            ×
          </button>
        </div>
        <div className="flex gap-1 border-b border-[#3a3024] px-3 py-2">
          {modes.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                setStrike(false);
              }}
              className={cn(
                "min-w-12 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em]",
                mode === id ? "bg-[linear-gradient(180deg,#e9c766_0%,#c99a3a_100%)] text-[#1b140a]" : "text-mist hover:text-ivory",
              )}
            >
              {MODE_NAMES[id]}
            </button>
          ))}
        </div>
        <div className="relative min-h-0 flex-1">
          {mode === "2d" ? (
            <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,#2a241c_0%,#0c0d0b_68%)]">
              <div
                className={cn(
                  "relative grid size-[min(48vh,22rem)] place-items-center border border-line bg-[#e7d7b4] shadow-[0_30px_80px_rgba(0,0,0,0.45)] transition-transform duration-700",
                  strike && "rotate-[360deg] scale-110",
                )}
              >
                <div className="absolute inset-3 border border-[#2a2118]/30" />
                <span className="relative font-display text-[9rem] leading-none text-[#1c140e]">♔</span>
                <CrownFlat id={loadout.crownId} dark={loadout.team === "b"} />
              </div>
            </div>
          ) : (
            <Canvas
              key={mode}
              camera={{ position: mode === "3d" ? [0.2, 1.95, 4.3] : mode === "ra" ? [1.7, 1.55, 3.9] : [2.5, 1.8, 4.9], fov: mode === "3d" ? 34 : 38 }}
              shadows
              gl={{ toneMapping: THREE.ACESFilmicToneMapping, preserveDrawingBuffer: true }}
              onCreated={({ gl }) => keepWebGL(gl)}
            >
              <color attach="background" args={[mode === "3d" ? "#0f0c0a" : "#9eb8cc"]} />
              {mode === "3d" ? <fog attach="fog" args={["#0f0c0a", 7, 16]} /> : null}
              <ModelSlot>
                {mode === "3d" ? (
                  <Turntable>
                    <PedestalStage
                      finish={finish}
                      crownId={loadout.crownId}
                      team={loadout.team}
                      board={false}
                      spin={strike}
                      legacy={legacy}
                      letter={kitInitial(seller)}
                    />
                  </Turntable>
                ) : (
                  <>
                    <FieldStage />
                    <group position={[0, 0, 1.2]}>
                      <Turntable speed={strike && animated ? 0 : 0.45} hop={mode === "lg" && strike}>
                        {mode === "ra" ? (
                          <RaPreview team={loadout.team} crownId={loadout.crownId} dog={loadout.mountId === "dog"} striking={strike} />
                        ) : mode === "lg" ? (
                          <group position={[0, 0, -1.2]}>
                            <LegoDress body={loadout.lgBody} head={loadout.lgHead} hair={loadout.lgHair} legs={loadout.lgLegs} weapon={loadout.lgWeapon} />
                          </group>
                        ) : loadout.anId === "knight" && loadout.swordId === "rook" ? (
                          <group scale={1.45}>
                            <BlueRook />
                          </group>
                        ) : (
                          <Figurine
                            characterId={characterId}
                            mountId="none"
                            swordId="none"
                            crownId={loadout.crownId}
                            team={loadout.team}
                            attackId={loadout.attackId}
                            striking={strike}
                          />
                        )}
                      </Turntable>
                    </group>
                  </>
                )}
              </ModelSlot>
              <OrbitControls enablePan={false} target={mode === "3d" ? [0, 0.95, 0] : mode === "ra" ? [0, 0.8, 1.2] : [0, 1.05, 1.2]} minDistance={1.8} maxDistance={12} maxPolarAngle={1.45} />
            </Canvas>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-[#3a3024] px-4 py-3">
          <AttackMark id={shown.id} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#f6e7c3]">{mode === "lg" ? "LG attack" : "Attack"} · {shown.name}</p>
            <p className="truncate text-xs text-[#a8977a]">{shown.blurb}</p>
          </div>
          <button
            type="button"
            onClick={play}
            data-play-attack
            className="rounded-md border border-[#f3d98a] bg-[linear-gradient(180deg,#e9c766_0%,#c99a3a_55%,#a87a26_100%)] px-5 py-2.5 text-sm font-bold uppercase tracking-[0.16em] text-[#1b140a]"
          >
            Play attack
          </button>
        </div>
      </div>
    </div>
  );
}
