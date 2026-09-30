import { Suspense, useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { Figurine } from "@/components/avatar/figurine";
import { useClubDoor } from "@/lib/auth/use-club-door";
import {
  ATTACKS,
  CHARACTERS,
  CROWNS,
  DEFAULT_LOADOUT,
  FRAMES,
  MOUNTS,
  SWORDS,
  crownArt,
  type AvatarLoadout,
  type GearItem,
  type PieceStyle,
} from "@/lib/avatar/catalog";
import { buyGear, getAvatar, saveAvatar } from "@/lib/server/avatar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/avatar")({ ssr: false, component: AvatarDoor });

function AvatarDoor() {
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return <AvatarStudio />;
}

function AvatarStudio() {
  const [loadout, setLoadout] = useState<AvatarLoadout>(DEFAULT_LOADOUT);
  const [owned, setOwned] = useState<string[]>(["royal", "none", "circlet", "plain", "march"]);
  const [coins, setCoins] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [strike, setStrike] = useState(false);

  useEffect(() => {
    let live = true;
    void getAvatar()
      .then((row) => {
        if (!live || !row) return;
        setLoadout(row.loadout);
        setOwned(row.owned);
        setCoins(row.coins);
        setReady(true);
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : "The cabinet did not open.");
      });
    return () => {
      live = false;
    };
  }, []);

  async function commit(next: AvatarLoadout) {
    setLoadout(next);
    setError(null);
    try {
      const row = await saveAvatar({ data: { loadout: next } });
      setLoadout(row.loadout);
      setCoins(row.coins);
      setOwned(row.owned);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the king.");
    }
  }

  async function equip(kind: keyof AvatarLoadout, id: string, price: number) {
    setError(null);
    try {
      if (price > 0 && !owned.includes(id)) {
        const bought = await buyGear({ data: { id } });
        setCoins(bought.coins);
        setOwned(bought.owned);
      }
      const next = { ...loadout, [kind]: id } as AvatarLoadout;
      if (loadout.style === "an" && kind === "kingId") next.anId = id;
      if (loadout.style === "3d" && kind === "anId") next.kingId = id;
      await commit(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not enough Morse coins.");
    }
  }

  const characterId = loadout.style === "an" ? loadout.anId : loadout.kingId;
  const viewLabel = loadout.team === "w" ? "View black" : "View white";

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-3 py-3 sm:px-6">
      <div className="check-wash pointer-events-none absolute inset-0" />
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-sm text-mist hover:text-ivory">
          ← Lounge
        </Link>
        <div className="flex items-center gap-2">
          <img src="/morse-coin.png" alt="" className="size-8" />
          <span className="font-display text-2xl text-[#f6e7b2]">{coins}</span>
        </div>
      </header>
      <div className="relative z-10 mt-3 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="relative min-h-[70vh] overflow-hidden rounded-2xl border border-line bg-[#14110e]">
          <div className="absolute left-4 top-4 z-10">
            <p className="text-[11px] uppercase tracking-[0.22em] text-gold-line">The square</p>
            <h1 className="font-display text-3xl text-ivory">Your king</h1>
          </div>
          <div className="absolute right-4 top-4 z-10 flex gap-2">
            {(["2d", "3d", "an"] as PieceStyle[]).map((style) => (
              <button
                key={style}
                type="button"
                className={cn(
                  "min-h-11 rounded-full px-4 text-sm font-medium uppercase",
                  loadout.style === style ? "bg-ivory text-ink" : "border border-line text-mist",
                )}
                onClick={() => void commit({ ...loadout, style })}
              >
                {style}
              </button>
            ))}
          </div>
          {loadout.style === "2d" ? (
            <div className="grid h-full min-h-[70vh] place-items-center">
              <div className="grid size-64 place-items-center rounded-xl border-8 border-[#3a2a1c] bg-[#f3e6c8] shadow-2xl">
                <span className="font-display text-[9rem] leading-none text-[#1c140e]">♔</span>
              </div>
            </div>
          ) : (
            <Canvas camera={{ position: [1.55, 1.25, 2.05], fov: 34 }} shadows>
              <color attach="background" args={["#14110e"]} />
              <hemisphereLight args={["#fff6e4", "#3a2a1c", 0.85]} />
              <ambientLight intensity={0.7} />
              <directionalLight position={[3, 6, 2]} intensity={2.2} castShadow />
              <Suspense fallback={null}>
                <group position={[0, 0.02, 0]}>
                  <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                    <boxGeometry args={[2.2, 2.2, 0.18]} />
                    <meshStandardMaterial color={loadout.team === "w" ? "#f7ecd2" : "#3a2e28"} roughness={0.8} />
                  </mesh>
                  <mesh position={[0, 0.1, 0]}>
                    <boxGeometry args={[2.35, 0.08, 2.35]} />
                    <meshStandardMaterial color="#3a2a1c" />
                  </mesh>
                  <group position={[0, 0.16, 0]}>
                    <Figurine
                      characterId={characterId}
                      mountId={loadout.style === "3d" ? loadout.mountId : "none"}
                      swordId={loadout.style === "3d" ? loadout.swordId : "none"}
                      crownId={loadout.crownId}
                      team={loadout.team}
                      attackId={loadout.attackId}
                      striking={strike}
                    />
                  </group>
                </group>
                <ContactShadows opacity={0.45} scale={6} blur={2.2} far={3} />
              </Suspense>
              <OrbitControls enablePan={false} minDistance={2.4} maxDistance={6} maxPolarAngle={Math.PI / 2.05} />
            </Canvas>
          )}
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
            <button
              type="button"
              className="min-h-11 rounded-full border border-gold-line bg-walnut px-5 text-sm text-ivory"
              onClick={() => void commit({ ...loadout, team: loadout.team === "w" ? "b" : "w" })}
            >
              {viewLabel}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-full bg-ivory px-5 text-sm text-ink"
              onClick={() => {
                setStrike(true);
                window.setTimeout(() => setStrike(false), 1600);
              }}
            >
              Try attack
            </button>
          </div>
          {!ready ? <p className="absolute bottom-4 left-4 text-xs text-mist">Opening the cabinet…</p> : null}
        </section>
        <aside className="felt-inset max-h-[78vh] space-y-5 overflow-y-auto rounded-2xl border border-line p-3">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Rail
            title={loadout.style === "an" ? "AN characters" : "Kings"}
            hint="The picture is the king. Tap the portrait."
          >
            {CHARACTERS.map((item) => (
              <Portrait
                key={item.id}
                item={item}
                picked={(loadout.style === "an" ? loadout.anId : loadout.kingId) === item.id}
                owned={owned.includes(item.id) || item.price === 0}
                onPick={() => void equip(loadout.style === "an" ? "anId" : "kingId", item.id, item.price)}
              />
            ))}
          </Rail>
          <Rail title="Swords">
            {SWORDS.map((item) => (
              <Portrait
                key={item.id}
                item={item}
                picked={loadout.swordId === item.id}
                owned={owned.includes(item.id) || item.price === 0}
                onPick={() => void equip("swordId", item.id, item.price)}
              />
            ))}
          </Rail>
          <Rail title={loadout.team === "b" ? "Dark crowns" : "Gold crowns"}>
            {CROWNS.map((item) => (
              <Portrait
                key={item.id}
                item={{ ...item, portrait: crownArt(item.id, loadout.team) }}
                picked={loadout.crownId === item.id}
                owned={owned.includes(item.id) || item.price === 0}
                onPick={() => void equip("crownId", item.id, item.price)}
              />
            ))}
          </Rail>
          <Rail title="Mounts">
            {MOUNTS.map((item) => (
              <Portrait
                key={item.id}
                item={item}
                picked={loadout.mountId === item.id}
                owned={owned.includes(item.id) || item.price === 0}
                onPick={() => void equip("mountId", item.id, item.price)}
              />
            ))}
          </Rail>
          <Rail title="Name frames" hint="The other player sees this around your name.">
            {FRAMES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void equip("frameId", item.id, item.price)}
                className={cn(
                  "w-full rounded-xl border p-2 text-left",
                  loadout.frameId === item.id ? "border-gold-line" : "border-line",
                )}
              >
                <span className={cn("inline-flex rounded-lg px-3 py-1 font-display text-lg text-ivory", frameChip(item.id))}>
                  Your name
                </span>
                <span className="mt-1 block text-xs text-mist">
                  {item.name}
                  {item.price ? ` · ${item.price} coins` : " · Yours"}
                </span>
              </button>
            ))}
          </Rail>
          <Rail title="King attacks" hint="The one you start with is free.">
            {ATTACKS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void equip("attackId", item.id, item.price)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-2 text-left",
                  loadout.attackId === item.id ? "border-gold-line" : "border-line",
                )}
              >
                <AttackMark id={item.id} />
                <span>
                  <span className="block text-sm text-ivory">{item.name}</span>
                  <span className="text-xs text-mist">{item.price ? `${item.price} coins · ${item.blurb}` : item.blurb}</span>
                </span>
              </button>
            ))}
          </Rail>
        </aside>
      </div>
    </main>
  );
}

function Rail({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl text-ivory">{title}</h2>
      {hint ? <p className="mb-2 text-xs text-mist">{hint}</p> : <div className="mb-2" />}
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function Portrait({
  item,
  picked,
  owned,
  onPick,
}: {
  item: GearItem;
  picked: boolean;
  owned: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-ink/40 p-1.5 text-left",
        picked ? "border-gold-line" : "border-line hover:border-line-strong",
      )}
    >
      {item.portrait ? (
        <img src={item.portrait} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-walnut font-display text-lg text-cream">
          {item.name.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm text-ivory">{item.name}</span>
        <span className="block text-xs text-mist">{owned ? "Owned" : `${item.price} Morse coins`}</span>
      </span>
    </button>
  );
}

function frameChip(id: string) {
  if (id === "gold") return "border-2 border-[#e6c56a] shadow-[0_0_12px_rgba(230,197,106,0.35)]";
  if (id === "laurel") return "border border-[#d7b56a] shadow-[inset_0_0_0_3px_rgba(90,122,78,0.65)]";
  if (id === "night") return "border border-[#7eb6ff] shadow-[0_0_12px_rgba(80,140,255,0.45)]";
  if (id === "check")
    return "border-2 border-transparent bg-[linear-gradient(#14120f,#14120f),repeating-conic-gradient(#f4efe4_0_25%,#1c1914_0_50%)] bg-origin-border [background-clip:padding-box,border-box]";
  if (id === "coin") return "border border-[#e6c56a]";
  return "border border-line";
}

function AttackMark({ id }: { id: string }) {
  const path =
    id === "slam"
      ? "M12 3v12M8 11l4 4 4-4"
      : id === "sweep"
        ? "M4 16c6-10 10-10 16 0"
        : id === "charge"
          ? "M3 14h12l-3-3M15 14l-3 3"
          : id === "flash"
            ? "M13 2L6 13h6l-1 9 8-12h-6l0-8z"
            : id === "bow"
              ? "M6 18c2-8 10-8 12 0"
              : "M5 17l7-7 7 7";
  return (
    <svg viewBox="0 0 24 24" className="size-10 shrink-0 rounded-lg bg-walnut p-1 text-cream" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
