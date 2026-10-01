import { Suspense, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { Figurine } from "@/components/avatar/figurine";
import { FieldStage } from "@/components/avatar/field-stage";
import { NamePlate } from "@/components/avatar/name-plate";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { keepWebGL } from "@/lib/gl-quiet";
import {
  ATTACKS,
  CHARACTERS,
  CROWNS,
  DEFAULT_LOADOUT,
  FRAMES,
  MOUNTS,
  SWORDS,
  characterById,
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
  const [owned, setOwned] = useState<string[]>(["piece", "none", "poly-band", "plain", "march"]);
  const [coins, setCoins] = useState(0);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pins, setPins] = useState<string[]>([]);

  const [strike, setStrike] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("morse-pins") || "[]");
      if (Array.isArray(saved)) setPins(saved.filter((id) => typeof id === "string"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let live = true;
    void getAvatar()
      .then((row) => {
        if (!live || !row) return;
        setLoadout(row.loadout);
        setOwned(row.owned);
        setCoins(row.coins);
        setUsername(row.username || "");
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

  function pinItem(kind: keyof AvatarLoadout, id: string, price: number) {
    setStrike(false);
    const on = pins.includes(id);
    setPins((cur) => {
      const next = on ? cur.filter((item) => item !== id) : [...cur, id];
      localStorage.setItem("morse-pins", JSON.stringify(next));
      return next;
    });
    if (!on) void equip(kind, id, price, true);
  }

  async function equip(kind: keyof AvatarLoadout, id: string, price: number, force = false) {
    setError(null);
    setStrike(false);
    const current = String(loadout[kind] ?? "");
    if (!force && pins.includes(current) && current !== id) {
      setError("Unpin it before you change it. The king does not stay stuck.");
      return;
    }
    if (kind === "crownId" && (loadout.style === "an" ? loadout.anId : loadout.kingId) === "royal") {
      setError("The royal king wears no crown.");
      return;
    }
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

  const [tab, setTab] = useState<"kings" | "swords" | "animals" | "crowns" | "frames" | "attacks">("kings");
  const characterId = loadout.style === "an" ? loadout.anId : loadout.kingId;
  const viewLabel = loadout.team === "w" ? "View black" : "View white";
  const tabs =
    loadout.style === "2d"
      ? ([["crowns", "Crowns"]] as const)
      : loadout.style === "an"
        ? ([
            ["swords", "Swords"],
            ["kings", "Kings"],
            ["animals", "Animals"],
            ["crowns", "Crowns"],
            ["frames", "Frames"],
            ["attacks", "Attacks"],
          ] as const)
        : ([
            ["kings", "King"],
            ["crowns", "Crowns"],
          ] as const);
  const shown = tabs.some(([id]) => id === tab) ? tab : tabs[0][0];

  return (
    <main className="relative h-dvh overflow-hidden bg-[#0c0d0b] text-ivory">
      <div className="absolute inset-0">
        {loadout.style === "2d" ? (
          <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,#2a241c_0%,#0c0d0b_68%)]">
            <div className="relative grid size-[min(68vh,26rem)] place-items-center border border-line bg-[#e7d7b4] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="absolute inset-3 border border-[#2a2118]/30" />
              <span className="relative font-display text-[11rem] leading-none text-[#1c140e]">♔</span>
              <CrownFlat id={loadout.crownId} dark={loadout.team === "b"} />
            </div>
          </div>
        ) : loadout.style === "3d" ? (
          <Canvas camera={{ position: [0.4, 4.8, 6.2], fov: 32 }} shadows onCreated={({ gl }) => keepWebGL(gl)}>
            <color attach="background" args={["#2a2118"]} />
            <Suspense fallback={null}>
              <KingTable crownId={loadout.crownId} team={loadout.team} />
            </Suspense>
            <OrbitControls enablePan={false} target={[0, 0.45, 0]} minDistance={3} maxDistance={12} maxPolarAngle={1.15} />
          </Canvas>
        ) : (
          <Canvas
            camera={{ position: [4.6, 2.35, 7.4], fov: 38 }}
            shadows
            onCreated={({ gl }) => keepWebGL(gl)}
          >
            <color attach="background" args={["#9eb8cc"]} />
            <Suspense fallback={null}>
              <FieldStage />
              <group position={[0, 0, 1.2]}>
                <Figurine
                  key={`${characterId}-${loadout.mountId}-${loadout.swordId}-${loadout.crownId}-${loadout.team}`}
                  characterId={characterId}
                  mountId={loadout.mountId}
                  swordId={loadout.swordId}
                  crownId={loadout.crownId}
                  team={loadout.team}
                  attackId={loadout.attackId}
                  striking={strike}
                />
              </group>
            </Suspense>
            <OrbitControls
              enablePan={false}
              target={[0, 1.15, 1]}
              minDistance={3.2}
              maxDistance={12}
              maxPolarAngle={Math.PI / 2.05}
            />
          </Canvas>
        )}
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-3">
        <Link
          to="/"
          className="pointer-events-auto rounded-full border border-line bg-ink/80 px-3 py-2 text-sm text-ivory backdrop-blur-md hover:border-line-strong"
        >
          Lounge
        </Link>
        <div className="pointer-events-auto flex rounded-full border border-line bg-ink/80 p-1 backdrop-blur-md">
          {(["2d", "3d", "an"] as PieceStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              className={cn(
                "min-h-10 rounded-full px-4 text-sm uppercase tracking-[0.14em]",
                loadout.style === style ? "bg-ivory text-ink" : "text-mist hover:text-ivory",
              )}
              onClick={() => void commit({ ...loadout, style })}
            >
              {style}
            </button>
          ))}
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-ink/80 px-3 py-1.5 backdrop-blur-md">
          <img src="/morse-coin.png" alt="" className="size-5" />
          <span className="font-display text-lg tabular-nums text-ivory">{coins.toLocaleString()}</span>
        </div>
      </header>

      <div className="pointer-events-none absolute bottom-24 left-4 z-20 sm:bottom-16">
        <NamePlate name={username || "You"} look={JSON.stringify(loadout)} />
      </div>

      {loadout.style !== "2d" ? (
        <p className="pointer-events-none absolute left-4 top-16 z-20 font-display text-3xl text-ivory">
          {characterById(characterId).name}
        </p>
      ) : null}

      <div className="pointer-events-none absolute bottom-[calc(44dvh+4.5rem)] left-1/2 z-20 flex -translate-x-1/2 gap-2 sm:bottom-5 sm:left-[38%] sm:translate-x-0">
        <button
          type="button"
          className="pointer-events-auto min-h-11 rounded-full border border-line bg-ink/85 px-4 text-sm text-ivory backdrop-blur-md hover:border-line-strong"
          onClick={() => void commit({ ...loadout, team: loadout.team === "w" ? "b" : "w" })}
        >
          {viewLabel}
        </button>
        {loadout.style !== "2d" ? (
          <button
            type="button"
            className="pointer-events-auto min-h-11 rounded-full border border-ivory bg-ivory px-4 text-sm text-ink"
            onClick={() => {
              setStrike(true);
              window.setTimeout(() => setStrike(false), 1600);
            }}
          >
            Try attack
          </button>
        ) : null}
      </div>

      <aside className="absolute inset-x-3 bottom-3 z-20 flex max-h-[42dvh] flex-col overflow-hidden rounded-3xl border border-[#3a3126] bg-[#16130f]/95 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-20 sm:max-h-none sm:w-[340px]">
        <div className="flex gap-1 overflow-x-auto px-2 py-2">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "min-h-9 shrink-0 rounded-full px-3 text-sm",
                shown === id ? "bg-[#f4efe6] text-[#1a140f]" : "text-[#cfc4b2] hover:bg-white/5",
              )}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
          {error ? <p className="rounded-xl bg-[#3a221c] px-3 py-2 text-sm text-[#f4d2c8]">{error}</p> : null}
          {characterId === "royal" && shown === "crowns" ? (
            <p className="rounded-xl border border-[#3a3126] px-3 py-2 text-sm text-[#d9c7a4]">The royal king wears no crown.</p>
          ) : null}
          {shown === "kings"
            ? CHARACTERS.filter((item) => loadout.style !== "3d" || item.id === "piece").map((item) => (
                <Portrait
                  key={item.id}
                  item={item}
                  picked={characterId === item.id}
                  owned={owned.includes(item.id) || item.price === 0}
                  onPick={() => void equip(loadout.style === "an" ? "anId" : "kingId", item.id, item.price)}
                  pinned={pins.includes(item.id)}
                  onPin={() => pinItem(loadout.style === "an" ? "anId" : "kingId", item.id, item.price)}
                />
              ))
            : null}
          {shown === "swords"
            ? SWORDS.map((item) => (
                <Portrait
                  key={item.id}
                  item={item}
                  picked={loadout.swordId === item.id}
                  owned={owned.includes(item.id) || item.price === 0}
                  onPick={() => void equip("swordId", item.id, item.price)}
                  pinned={pins.includes(item.id)}
                  onPin={() => pinItem("swordId", item.id, item.price)}
                />
              ))
            : null}
          {shown === "animals"
            ? MOUNTS.map((item) => (
                <Portrait
                  key={item.id}
                  item={item}
                  picked={loadout.mountId === item.id}
                  owned={owned.includes(item.id) || item.price === 0}
                  onPick={() => void equip("mountId", item.id, item.price)}
                  pinned={pins.includes(item.id)}
                  onPin={() => pinItem("mountId", item.id, item.price)}
                />
              ))
            : null}
          {shown === "crowns"
            ? CROWNS.map((item) => (
                <Portrait
                  key={item.id}
                  item={{ ...item, portrait: crownArt(item.id, loadout.team) }}
                  picked={loadout.crownId === item.id}
                  owned={owned.includes(item.id) || item.price === 0}
                  onPick={() => void equip("crownId", item.id, item.price)}
                  pinned={pins.includes(item.id)}
                  onPin={() => pinItem("crownId", item.id, item.price)}
                />
              ))
            : null}
          {shown === "frames"
            ? FRAMES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void equip("frameId", item.id, item.price)}
                  className={cn(
                    "w-full rounded-xl border p-2 text-left",
                    loadout.frameId === item.id ? "border-ivory" : "border-line",
                  )}
                >
                  <span className={cn("inline-flex rounded-lg px-3 py-1 font-display text-lg text-ivory", frameChip(item.id))}>
                    {username || "You"}
                  </span>
                  <span className="mt-1 block text-xs text-mist">
                    {item.name}
                    {item.price ? ` · ${item.price} coins` : " · Yours"}
                  </span>
                </button>
              ))
            : null}
          {shown === "attacks"
            ? ATTACKS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void equip("attackId", item.id, item.price)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-2 text-left",
                    loadout.attackId === item.id ? "border-ivory" : "border-line",
                  )}
                >
                  <AttackMark id={item.id} />
                  <span>
                    <span className="block text-sm text-ivory">{item.name}</span>
                    <span className="text-xs text-mist">{item.price ? `${item.price} coins · ${item.blurb}` : item.blurb}</span>
                  </span>
                </button>
              ))
            : null}
        </div>
      </aside>
    </main>
  );
}
function KingTable({ crownId, team }: { crownId: string; team: "w" | "b" }) {
  const wood = useTexture("/club/marquetry.png");
  const squares = [];
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const light = (file + rank) % 2 === 0;
      squares.push(
        <mesh key={`${file}${rank}`} position={[file - 3.5, 0.06, rank - 3.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[0.98, 0.98]} />
          <meshStandardMaterial color={light ? "#e7d3ae" : "#6a3e24"} roughness={0.78} />
        </mesh>,
      );
    }
  }
  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight position={[4, 8, 3]} intensity={1.25} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[18, 18]} />
        <meshStandardMaterial map={wood} roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.01, 0]} receiveShadow>
        <boxGeometry args={[8.7, 0.08, 8.7]} />
        <meshStandardMaterial color="#4a3018" roughness={0.7} />
      </mesh>
      {squares}
      <group position={[0, 0.1, 0]} scale={0.86}>
        <Figurine characterId="piece" mountId="none" swordId="none" crownId={crownId} team={team} />
      </group>
    </>
  );
}

function CrownFlat({ id, dark }: { id: string; dark: boolean }) {
  const metal = dark ? "#2a241c" : "#e4c56a";
  const edge = dark ? "#0c0a08" : "#7a5620";
  const leaf = dark ? "#3e4a36" : "#8fa56a";
  const crown =
    id === "poly-arch"
      ? "M10 58 L22 30 Q50 4 78 30 L90 58 Z"
      : "M12 58 L18 40 L32 48 L50 28 L68 48 L82 40 L88 58 Z";
  return (
    <svg
      viewBox="0 0 100 70"
      className="pointer-events-none absolute left-1/2 top-[27%] w-[34%] -translate-x-1/2"
      aria-hidden
    >
      {id === "laurel" ? (
        <g fill={leaf} stroke={edge} strokeWidth="1.2">
          {[-1, 1].map((side) => (
            <g key={side} transform={`translate(50 48) scale(${side} 1)`}>
              {[0, 1, 2, 3, 4].map((i) => (
                <ellipse
                  key={i}
                  cx={8 + i * 6}
                  cy={-4 + i * 2}
                  rx="6"
                  ry="3.2"
                  transform={`rotate(${-36 + i * 14} ${8 + i * 6} ${-4 + i * 2})`}
                />
              ))}
            </g>
          ))}
        </g>
      ) : (
        <path d={crown} fill={metal} stroke={edge} strokeWidth="2" strokeLinejoin="round" />
      )}
      <rect x="8" y="54" width="84" height="8" rx="1.5" fill={metal} stroke={edge} strokeWidth="1.5" />
    </svg>
  );
}

function GearMark({ id }: { id: string }) {
  const path =
    id === "dual"
      ? "M8 19 L12 4 M16 19 L12 4 M7 8h10"
      : id === "shield"
        ? "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"
        : id === "staff"
          ? "M12 21V4 M12 6l3 2 M12 6l-3 2"
          : id === "none"
            ? "M8 16c2-4 6-4 8 0"
            : "M12 20V5 M8 9h8";
  return (
    <span className="grid size-20 shrink-0 place-items-center rounded-lg border border-line bg-[#1a1916]">
      <svg viewBox="0 0 24 24" className="size-10 text-ivory" aria-hidden>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Portrait({
  item,
  picked,
  owned,
  onPick,
  pinned,
  onPin,
}: {
  item: GearItem;
  picked: boolean;
  owned: boolean;
  onPick: () => void;
  pinned?: boolean;
  onPin?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-[#1c1814] p-2",
        picked ? "border-[#e6c56a] shadow-[0_0_0_1px_rgba(230,197,106,0.35)]" : "border-[#3a3126]",
      )}
    >
      <button type="button" onClick={onPick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {item.portrait ? (
          <img src={item.portrait} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
        ) : item.id === "piece" ? (
          <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-[#c4a574] text-[#2a1c10]">
            <svg viewBox="0 0 32 32" className="size-9" aria-hidden>
              <path fill="currentColor" d="M14 4h4v3h3v3h-3v2h4l2 14H8L10 12h4V10H11V7h3V4z" />
            </svg>
          </span>
        ) : (
          <GearMark id={item.id} />
        )}
        <span className="min-w-0">
          <span className="block truncate font-display text-xl leading-none text-[#f7f1e6]">{item.name}</span>
          <span className="mt-1 block text-xs text-[#b7ad9e]">{owned ? "Owned" : `${item.price} Morse coins`}</span>
        </span>
      </button>
      {onPin ? (
        <button
          type="button"
          aria-pressed={pinned}
          onClick={onPin}
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]",
            pinned ? "bg-[#e6c56a] text-[#1a140f]" : "border border-[#4a4034] text-[#d9c7a4]",
          )}
        >
          {pinned ? "Pinned" : "Pin"}
        </button>
      ) : null}
    </div>
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
