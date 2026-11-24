/** /campaign/army: the persistent army. 16 pieces, levels 1-10, tiers, perks, titles. */
import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { PieceMark } from "@/components/chess/marks";
import { playSfx } from "@/lib/legendary/sfx";
import { cn } from "@/lib/utils";
import { kindOfSlot, levelProgress, looksFor, PERK_LEVEL, PERKS, setArmyPerk, SLOT_ORDER, slotName, slotSquare, TIERS, tierFor, VETERAN_PROMOS, VETERAN_TITLE, type ArmySlot } from "./data";
import { ArmyPiece } from "./pieces3d";
import { CampaignDoor, CampaignHeader, LoadingCampaign, useCampaign } from "./shell";

function Turntable({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.45;
  });
  return <group ref={g}>{children}</group>;
}

function Pedestal({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, -0.09, 0]} receiveShadow>
        <cylinderGeometry args={[0.62, 0.7, 0.18, 48]} />
        <meshStandardMaterial color="#1e1030" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.56, 0.62, 64]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function Viewer({ slot }: { slot: ArmySlot }) {
  const kind = kindOfSlot(slot.slot);
  const tier = tierFor(slot.level);
  const veteran = kind === "p" && slot.promos >= VETERAN_PROMOS;
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.15, 2.6], fov: 34 }} gl={{ antialias: true, preserveDrawingBuffer: true }} data-army-viewer={slot.slot}>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#fff2d6", "#2a1a3a", 0.6]} />
      <spotLight position={[2.5, 4, 2.5]} angle={0.5} penumbra={0.6} intensity={60} castShadow color="#fff0d8" />
      <pointLight position={[-2, 1.5, -1.5]} intensity={14} color="#9b5cff" />
      <pointLight position={[1.6, 0.6, -2]} intensity={6} color={tier.ring} />
      <Suspense fallback={null}>
        <Turntable>
          <ArmyPiece kind={kind} look={{ level: slot.level, veteran }} yaw={0} />
        </Turntable>
      </Suspense>
      <Pedestal color={tier.ring} />
      <ContactShadows position={[0, 0.003, 0]} opacity={0.6} scale={2.4} blur={2.2} far={1.5} />
      <Sparkles count={26} scale={[2.4, 2, 2.4]} position={[0, 1, 0]} size={2} speed={0.3} color="#d8b8ff" />
      <OrbitControls target={[0, 0.5, 0]} enablePan={false} enableZoom={false} minPolarAngle={0.9} maxPolarAngle={1.55} />
    </Canvas>
  );
}

export function ArmyPage() {
  return (
    <CampaignDoor>
      <ArmyInner />
    </CampaignDoor>
  );
}

function ArmyInner() {
  const { state, setState, error, reload } = useCampaign();
  const [sel, setSel] = useState("q");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const bySlot = useMemo(() => new Map((state?.army ?? []).map((a) => [a.slot, a])), [state]);
  const slot = bySlot.get(sel);
  const kind = kindOfSlot(sel);
  const perk = PERKS[kind];
  const prog = slot ? levelProgress(slot.xp) : null;
  const tier = slot ? tierFor(slot.level) : TIERS[0];
  const looks = slot ? looksFor(slot.level) : null;
  const veteran = kind === "p" && (slot?.promos ?? 0) >= VETERAN_PROMOS;

  async function togglePerk() {
    if (!slot || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await setArmyPerk({ data: { slot: slot.slot, on: !slot.perkOn } });
      setState((s) => (s ? { ...s, army: r.army } : s));
      playSfx("tap");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rows = [SLOT_ORDER.slice(0, 8), SLOT_ORDER.slice(8)];
  return (
    <main className="mcc overflow-auto" data-campaign-army>
      <CampaignHeader on="army" coins={state?.coins} frame={state?.rewards.includes("gear-frame") ? "gear" : undefined} />
      {!state ? <LoadingCampaign error={error} onRetry={reload} /> : null}
      {state && slot && prog ? (
        <>
          <div className="mcc-army-title">
            <div className="t mcc-goldtext" role="heading" aria-level={1}>Your Legendary Army</div>
            <div className="mcc-orn mt-2"><span className="mcc-label">Every piece remembers its battles</span></div>
          </div>
          <div className="mcc-army">
            <section className="mcc-panel mcc-viewer" data-army-detail={slot.slot}>
              <div className="stage">
                <Viewer slot={slot} />
                <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                  {looks?.scars ? <span className="mcc-tierchip">⚔ Battle scars</span> : null}
                  {looks?.banner ? <span className="mcc-tierchip">⚑ Banner</span> : null}
                  {looks?.aura ? <span className="mcc-tierchip">✦ Aura</span> : null}
                </div>
              </div>
              <div className="who">
                <div className="min-w-0">
                  <div className="nm mcc-goldtext" role="heading" aria-level={2}>{slotName(slot.slot)}</div>
                  <div className="tier" style={{ color: tier.ring }}>{tier.name} · starts on {slotSquare(slot.slot)}</div>
                  {veteran ? <div className="mt-1.5"><span className="mcc-title-badge" data-veteran>👑 {VETERAN_TITLE}</span></div> : null}
                </div>
                <div className="mcc-lv" data-army-level={slot.level}><small>LV</small><b>{slot.level}</b></div>
              </div>
              <div className="mt-2">
                <div className="mcc-bar"><span style={{ width: `${Math.round(prog.pct * 100)}%` }} /></div>
                <div className="mcc-xpline">
                  <span>{slot.xp.toLocaleString()} XP</span>
                  <span>{slot.level >= 10 ? "Max level" : `${prog.span - prog.into} XP to level ${slot.level + 1}`}</span>
                </div>
              </div>
              <div className="mcc-stats">
                <div className="mcc-stat"><b>{slot.games}</b><span>Battles</span></div>
                <div className="mcc-stat"><b>{slot.survived}</b><span>Survived</span></div>
                <div className="mcc-stat"><b>{slot.captures}</b><span>Captures</span></div>
                <div className="mcc-stat"><b>{slot.mates}</b><span>Mates</span></div>
                <div className="mcc-stat"><b>{slot.checks}</b><span>Checks</span></div>
                <div className="mcc-stat"><b>{slot.bigCaptures}</b><span>Giant kills</span></div>
                <div className="mcc-stat"><b>{slot.promos}</b><span>Promotions</span></div>
                <div className="mcc-stat"><b>{slot.level}</b><span>Level</span></div>
              </div>
            </section>

            <section className="flex min-w-0 flex-col gap-4">
              <div className="mcc-panel mcc-roster" data-army-roster>
                <div className="flex items-center justify-between gap-2">
                  <span className="mcc-label">Starting lineup</span>
                  <div className="mcc-tiers">
                    {TIERS.map((t) => (
                      <span key={t.id} className="mcc-tierchip" title={`Levels ${t.from}–${t.from + 1}`}>
                        <i style={{ background: t.color, boxShadow: `0 0 6px ${t.ring}` }} />
                        {t.name.replace("Glowing ", "")} {t.from}+
                      </span>
                    ))}
                  </div>
                </div>
                {rows.map((row, ri) => (
                  <div key={ri} className="mcc-row">
                    {row.map((id) => {
                      const a = bySlot.get(id);
                      if (!a) return null;
                      const t = tierFor(a.level);
                      const p = levelProgress(a.xp);
                      const k = kindOfSlot(id);
                      return (
                        <button key={id} type="button" className={cn("mcc-card", sel === id && "is-on")} onClick={() => { setSel(id); playSfx("tap"); }} data-army-card={id} title={slotName(id)}>
                          {k !== "k" && a.level >= PERK_LEVEL && a.perkOn ? <span className="perkdot" title="Perk on" /> : null}
                          {k === "p" && a.promos >= VETERAN_PROMOS ? <span className="crown">👑</span> : null}
                          <span className="glyph" style={{ color: t.color, filter: `drop-shadow(0 0 ${a.level >= 7 ? 8 : 3}px ${t.ring})` }}>
                            <PieceMark kind={k} className="size-full" />
                          </span>
                          <span className="lvl">LV {a.level}</span>
                          <span className="mini"><span style={{ width: `${Math.round(p.pct * 100)}%` }} /></span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="mcc-panel p-4">
                <span className="mcc-label">Signature perk · 1 passive slot</span>
                {perk ? (
                  <div className="mcc-perk mt-2" data-perk={perk.id}>
                    <div className="hd">
                      <div>
                        <div className="pt">{perk.title}</div>
                        <div className="pn">{perk.name}</div>
                      </div>
                      {slot.level >= PERK_LEVEL ? (
                        <button type="button" className={cn("mcc-toggle", slot.perkOn && "is-on")} aria-pressed={slot.perkOn} aria-label={slot.perkOn ? "Perk on" : "Perk off"} onClick={() => void togglePerk()} disabled={busy} data-perk-toggle />
                      ) : (
                        <span className="mcc-tierchip">🔒 Level {PERK_LEVEL}</span>
                      )}
                    </div>
                    <p>{perk.text}</p>
                    <p className="how">{perk.how}</p>
                    <p className="how">Works in Campaign boss battles (and Raids and custom Arenas when they open). Normal games stay normal chess.</p>
                  </div>
                ) : (
                  <div className="mcc-perk mt-2">
                    <div className="pn">The King's Burden</div>
                    <p>The king has no perk. His job is to survive: every boss battle he lives through still earns him XP.</p>
                  </div>
                )}
                {msg ? <p className="mt-2 text-sm text-[#ffb08a]">{msg}</p> : null}
              </div>

              <div className="mcc-panel p-4 text-sm leading-relaxed text-[#e6dcf0]">
                <span className="mcc-label">How pieces earn XP</span>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  <li>⚔ Survive a battle: +20 win · +10 draw · +5 loss</li>
                  <li>♛ Each check: +4 (up to 5 a game)</li>
                  <li>✦ Each capture: +3 · a bigger piece: +10 more</li>
                  <li>👑 Final checkmate: +40 · promotion: +15</li>
                  <li>🏰 Boss win: +10 for every survivor</li>
                  <li>♟ Your normal Legendary games count too</li>
                </ul>
                <p className="mt-2 text-xs text-[#a99ab8]">Level 4 earns battle scars, level 6 a banner, level 8 an aura. A pawn that promotes in {VETERAN_PROMOS} different battles wins the golden crown and the title “{VETERAN_TITLE}”.</p>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
