import { useEffect, useRef, useState, type ReactNode } from "react";
import { ModelSlot } from "@/components/chess/load-guard";
import * as THREE from "three";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { Figurine } from "@/components/avatar/figurine";
import { RaShop } from "@/components/avatar/ra-buy";
import { PedestalStage, useKingThumbs } from "@/components/avatar/pedestal-king";
import { RaPawn, raUnitUrl } from "@/components/chess/ra-men";
import { StonePerson, type Gait } from "@/components/chess/stone-people";
import { RaCrown, WarDog } from "@/components/chess/war-dog";
import { FieldStage } from "@/components/avatar/field-stage";
import { LegoDress } from "@/components/avatar/lego-dress";
import { NamePlate } from "@/components/avatar/name-plate";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { keepWebGL } from "@/lib/gl-quiet";
import {
  ATTACKS,
  CHARACTERS,
  CROWNS,
  DEFAULT_LOADOUT,
  FINISHES,
  FRAMES,
  LG_HAIR,
  LG_WEAPONS,
  LEGO_PARTS,
  MOUNTS,
  SWORDS,
  characterById,
  crownArt,
  finishById,
  type AvatarLoadout,
  type GearItem,
  type PieceStyle,
} from "@/lib/avatar/catalog";
import { buyGear, getAvatar, saveAvatar } from "@/lib/server/avatar";
import { listAvatarModels, saveAvatarModel, wearAvatarModel } from "@/lib/server/store";
import { cn } from "@/lib/utils";
import { asset } from "@/lib/base";

export const Route = createFileRoute("/avatar")({ component: AvatarDoor });

function AvatarDoor() {
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return <AvatarStudio />;
}

function slotIds(kind: "king" | "swordId" | "mountId" | "crownId") {
  if (kind === "king") return CHARACTERS.map((item) => item.id);
  if (kind === "swordId") return SWORDS.map((item) => item.id);
  if (kind === "mountId") return MOUNTS.map((item) => item.id);
  return CROWNS.map((item) => item.id);
}

function previewLoadout(base: AvatarLoadout, pins: string[]): AvatarLoadout {
  const next = { ...base };
  for (const id of pins) {
    if (CHARACTERS.some((item) => item.id === id)) {
      if (next.style === "3d") next.kingId = id;
      else next.anId = id;
    } else if (SWORDS.some((item) => item.id === id)) next.swordId = id;
    else if (MOUNTS.some((item) => item.id === id)) next.mountId = id;
    else if (CROWNS.some((item) => item.id === id)) next.crownId = id;
  }
  return next;
}


type Category = "kings" | "swords" | "dog" | "crowns" | "frames" | "attacks";

const CATEGORIES: { id: Category; label: string; title: string; sub: string }[] = [
  { id: "kings", label: "King", title: "King pieces", sub: "Choose your king" },
  { id: "swords", label: "Swords", title: "Swords", sub: "Arm the silver knight" },
  { id: "dog", label: "Animals", title: "Animals", sub: "Who stands with the king" },
  { id: "crowns", label: "Crowns", title: "Crowns", sub: "Choose your crown" },
  { id: "frames", label: "Frames", title: "Frames", sub: "Around your name" },
  { id: "attacks", label: "Attacks", title: "Attacks", sub: "How the king strikes" },
];

const GRID_FINISHES = FINISHES.filter((item) => !item.legendary);

/** The letter on Royal Legacy pieces: the first letter of the username, upper case. */
function kitInitial(name: string) {
  const hit = name.match(/[\p{L}\p{N}]/u);
  return hit ? hit[0].toUpperCase() : "";
}
const LEGACY = FINISHES.find((item) => item.legendary)!;

const GOLD_BTN =
  "bg-[linear-gradient(180deg,#e9c766_0%,#c99a3a_55%,#a87a26_100%)] text-[#1b140a] border border-[#f3d98a] shadow-[0_6px_18px_rgba(201,154,58,0.25)]";

function AvatarStudio() {
  const navigate = useNavigate();
  const [worn, setWorn] = useState<AvatarLoadout>(DEFAULT_LOADOUT);
  const [owned, setOwned] = useState<string[]>(["piece", "none", "poly-band", "plain", "march"]);
  const [raTrial, setRaTrial] = useState(false);
  const [coins, setCoins] = useState(0);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pins, setPins] = useState<string[]>([]);
  const [finishDraft, setFinishDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [kingName, setKingName] = useState("");
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [past, setPast] = useState<AvatarLoadout[]>([]);
  const [future, setFuture] = useState<AvatarLoadout[]>([]);
  const [board, setBoard] = useState(false);
  const controls = useRef<{ reset: () => void } | null>(null);

  const [strike, setStrike] = useState(false);
  const [offer, setOffer] = useState(false);
  const [buyingRa, setBuyingRa] = useState(false);
  const ownsKit = owned.includes(LEGACY.id);
  const kitLetter = kitInitial(username);
  const thumbs = useKingThumbs(FINISHES, ownsKit, kitLetter);

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
      .then(async (row) => {
        if (!live || !row) return;
        setWorn(row.loadout);
        setOwned(row.owned);
        setRaTrial(Boolean(row.raTrial));
        setCoins(row.coins);
        setUsername(row.username || "");
        setReady(true);
        try {
          const named = await listAvatarModels();
          if (live) setModels((named.models ?? []).filter((m: { id: string }) => m.id !== "current"));
        } catch {
          /* store can be empty on an older server */
        }
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : "The cabinet did not open.");
      });
    return () => {
      live = false;
    };
  }, []);

  async function commit(next: AvatarLoadout, track = true) {
    if (track) {
      setPast((cur) => [...cur.slice(-29), { ...worn, finishId: finishDraft ?? worn.finishId }]);
      setFuture([]);
    }
    setWorn(next);
    setError(null);
    try {
      const row = await saveAvatar({ data: { loadout: next } });
      setWorn(row.loadout);
      setCoins(row.coins);
      setOwned(row.owned);
      return row.loadout as AvatarLoadout;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the king.");
      return null;
    }
  }

  function pinItem(kind: "king" | "swordId" | "mountId" | "crownId", id: string) {
    setStrike(false);
    setError(null);
    const slot = slotIds(kind);
    setPins((cur) => {
      const on = cur.includes(id);
      const next = on ? cur.filter((item) => item !== id) : [...cur.filter((item) => !slot.includes(item)), id];
      localStorage.setItem("morse-pins", JSON.stringify(next));
      return next;
    });
  }

  async function equip(kind: keyof AvatarLoadout, id: string, price: number) {
    setError(null);
    setStrike(false);
    if (kind === "crownId" && worn.style === "an" && worn.anId === "royal") {
      setError("The royal king wears no crown.");
      return;
    }
    try {
      if (price > 0 && !owned.includes(id)) {
        if (coins < price) {
          setError(`That costs ${price} Morse coins. You have ${coins.toLocaleString()}.`);
          return;
        }
        const bought = await buyGear({ data: { id } });
        setCoins(bought.coins);
        setOwned(bought.owned);
      }
      const next = { ...worn, finishId: finishDraft ?? worn.finishId, [kind]: id } as AvatarLoadout;
      if ((worn.style === "an" || worn.style === "ra") && kind === "kingId") next.anId = id;
      if (worn.style === "3d" && kind === "anId") next.kingId = id;
      if ((kind === "anId" || kind === "kingId") && id !== "knight" && next.swordId === "rook") next.swordId = "none";
      const slot = kind === "anId" || kind === "kingId" ? "king" : kind === "swordId" || kind === "mountId" || kind === "crownId" ? kind : null;
      if (slot) {
        const drop = slotIds(slot);
        setPins((cur) => {
          const cleared = cur.filter((item) => !drop.includes(item));
          localStorage.setItem("morse-pins", JSON.stringify(cleared));
          return cleared;
        });
      }
      const done = await commit(next);
      if (done) setFinishDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not enough Morse coins.");
    }
  }

  /** King pieces: free ones preview at once and are kept by SAVE AVATAR; the legendary one is bought first. */
  async function pickFinish(id: string, price: number) {
    setError(null);
    setSaved("idle");
    if (price > 0 && !owned.includes(id)) {
      if (coins < price) {
        setError(`The Royal Legacy kit costs ${price.toLocaleString()} Morse coins. You have ${coins.toLocaleString()}.`);
        return;
      }
      try {
        const bought = await buyGear({ data: { id } });
        setCoins(bought.coins);
        setOwned(bought.owned);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Not enough Morse coins.");
        return;
      }
    }
    setPast((cur) => [...cur.slice(-29), { ...worn, finishId: finishDraft ?? worn.finishId }]);
    setFuture([]);
    setFinishDraft(id === worn.finishId ? null : id);
  }

  async function saveLook() {
    setSaved("saving");
    const done = await commit({ ...worn, finishId: finishDraft ?? worn.finishId }, false);
    if (done) {
      const label = kingName.trim() || `${username || "My"} king`;
      try {
        const savedRow = await saveAvatarModel({ data: { name: label, loadout: done } });
        setModels(savedRow.models ?? []);
        if (!kingName.trim()) setKingName(label);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Saved the look, but not a named model.");
      }
      setFinishDraft(null);
      setSaved("saved");
      window.setTimeout(() => setSaved((cur) => (cur === "saved" ? "idle" : cur)), 2200);
    } else setSaved("idle");
  }

  function sellKing() {
    const look = { ...worn, finishId: finishDraft ?? worn.finishId };
    let shot = "";
    const canvas = document.querySelector("#king-stage canvas");
    if (canvas instanceof HTMLCanvasElement) {
      try {
        shot = canvas.toDataURL("image/jpeg", 0.72);
      } catch {
        shot = "";
      }
    }
    try {
      sessionStorage.setItem(
        "morse-sell-open",
        JSON.stringify({ kind: "av", name: kingName.trim() || `${username || "My"} king`, shot, loadout: look, sourceId: "current" }),
      );
    } catch {
      /* ignore */
    }
    void navigate({ to: "/store" });
  }

  async function travel(dir: "undo" | "redo") {
    const here = { ...worn, finishId: finishDraft ?? worn.finishId ?? DEFAULT_LOADOUT.finishId };
    const stack = dir === "undo" ? past : future;
    const target = stack[stack.length - 1];
    if (!target) return;
    if (dir === "undo") {
      setPast(stack.slice(0, -1));
      setFuture((cur) => [...cur, here]);
    } else {
      setFuture(stack.slice(0, -1));
      setPast((cur) => [...cur, here]);
    }
    const { finishId, ...rest } = target;
    const same = (Object.keys(rest) as (keyof AvatarLoadout)[]).every((key) => worn[key] === target[key]);
    if (!same) await commit({ ...target, finishId: worn.finishId }, false);
    setFinishDraft(finishId === worn.finishId ? null : finishId);
  }

  const loadout = { ...previewLoadout(worn, pins), finishId: finishDraft ?? worn.finishId ?? DEFAULT_LOADOUT.finishId };
  const unsaved = finishDraft !== null && finishDraft !== worn.finishId;

  const [tab, setTab] = useState<Category>("kings");
  const ownsRoyal = owned.includes("royal");
  const animated = loadout.style === "an" || loadout.style === "ra";
  const characterId = loadout.style === "ra" ? "royal" : animated ? loadout.anId : loadout.kingId;
  const silver = loadout.style === "an" && loadout.anId === "knight";
  const pedestal = loadout.style === "3d";
  const finish = finishById(loadout.finishId);
  const category = CATEGORIES.find((item) => item.id === tab)!;
  const canStrike = loadout.style !== "2d";
  const own = (item: GearItem) => owned.includes(item.id) || item.price === 0;

  return (
    <main className="relative h-dvh overflow-hidden bg-[#0d0b09] text-ivory">
      <div id="king-stage" className="absolute inset-0">
        {loadout.style === "2d" ? (
          <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,#2a241c_0%,#0c0d0b_68%)]">
            <div className="relative grid size-[min(68vh,26rem)] place-items-center border border-line bg-[#e7d7b4] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="absolute inset-3 border border-[#2a2118]/30" />
              <span className="relative font-display text-[11rem] leading-none text-[#1c140e]">♔</span>
              <CrownFlat id={loadout.crownId} dark={loadout.team === "b"} />
            </div>
          </div>
        ) : pedestal ? (
          <Canvas
            camera={{ position: [0.25, 2.5, 6.1], fov: 34 }}
            shadows
            gl={{ toneMapping: THREE.ACESFilmicToneMapping, preserveDrawingBuffer: true }}
            onCreated={({ gl }) => keepWebGL(gl)}
          >
            <color attach="background" args={["#0f0c0a"]} />
            <fog attach="fog" args={["#0f0c0a", 7, 16]} />
            <ModelSlot>
              <PedestalStage
                finish={finish}
                crownId={loadout.crownId}
                team={loadout.team}
                board={board}
                spin={strike}
                legacy={ownsKit}
                letter={kitLetter}
              />
            </ModelSlot>
            <OrbitControls
              ref={controls as never}
              enablePan
              target={[0, 1.0, 0]}
              minDistance={2.2}
              maxDistance={9}
              maxPolarAngle={1.5}
            />
          </Canvas>
        ) : loadout.style === "ra" ? (
          <Canvas camera={{ position: [4.6, 2.35, 7.4], fov: 38 }} shadows gl={{ preserveDrawingBuffer: true }} onCreated={({ gl }) => keepWebGL(gl)}>
            <color attach="background" args={["#9eb8cc"]} />
            <ModelSlot>
              <FieldStage />
              <group position={[0, 0, 1.2]}>
                <RaPreview team={loadout.team} crownId={loadout.crownId} dog={loadout.mountId === "dog"} />
              </group>
            </ModelSlot>
            <OrbitControls ref={controls as never} enablePan target={[0, 1.1, 1.2]} minDistance={3} maxDistance={12} maxPolarAngle={1.35} />
          </Canvas>
        ) : loadout.style === "lg" ? (
          <Canvas camera={{ position: [4.2, 2.4, 7.2], fov: 38 }} shadows gl={{ preserveDrawingBuffer: true }} onCreated={({ gl }) => keepWebGL(gl)}>
            <color attach="background" args={["#9eb8cc"]} />
            <ModelSlot>
              <FieldStage />
              <LegoDress
                body={loadout.lgBody}
                head={loadout.lgHead}
                hair={loadout.lgHair}
                legs={loadout.lgLegs}
                weapon={loadout.lgWeapon}
              />
            </ModelSlot>
            <OrbitControls ref={controls as never} enablePan target={[0, 1.15, 1]} minDistance={3.2} maxDistance={12} maxPolarAngle={1.35} />
          </Canvas>
        ) : (
          <Canvas camera={{ position: [4.6, 2.35, 7.4], fov: 38 }} shadows gl={{ preserveDrawingBuffer: true }} onCreated={({ gl }) => keepWebGL(gl)}>
            <color attach="background" args={["#9eb8cc"]} />
            <ModelSlot>
              <FieldStage />
              <group position={[0, 0, 1.2]}>
                {loadout.anId === "knight" && loadout.swordId === "rook" ? (
                  <group scale={1.45}>
                    <BlueRook />
                  </group>
                ) : (
                  <Figurine
                    key={`${characterId}-${loadout.mountId}-${loadout.swordId}-${loadout.crownId}-${loadout.team}`}
                    characterId={characterId}
                    mountId="none"
                    swordId="none"
                    crownId={loadout.crownId}
                    team={loadout.team}
                    attackId={loadout.attackId}
                    striking={strike}
                  />
                )}
              </group>
            </ModelSlot>
            <OrbitControls
              ref={controls as never}
              enablePan
              target={[0, 1.15, 1]}
              minDistance={3.2}
              maxDistance={12}
              maxPolarAngle={Math.PI / 2.05}
            />
          </Canvas>
        )}
      </div>

      {/* Top bar: lounge, piece style, coins. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-3 py-3 sm:left-[248px] sm:right-[392px]">
        <Link
          to="/"
          className="pointer-events-auto rounded-md border border-[#4a3d2a] bg-[#14110d]/90 px-3 py-2 text-sm uppercase tracking-[0.14em] text-[#e9d9b6] hover:border-[#c99a3a] sm:hidden"
        >
          Lounge
        </Link>
        <div className="pointer-events-auto mx-auto flex rounded-md border border-[#4a3d2a] bg-[#14110d]/90 p-1 backdrop-blur-md">
          {(["2d", "3d", "an", "lg", "ra"] as PieceStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              className={cn(
                "min-h-9 rounded px-3.5 text-xs font-semibold uppercase tracking-[0.16em]",
                loadout.style === style ? GOLD_BTN : "border border-transparent text-[#b9a98a] hover:text-[#f3e3bd]",
              )}
              onClick={() => {
                if (style === "ra" && !owned.includes("royal") && !raTrial) {
                  setError(null);
                  setOffer(true);
                  return;
                }
                void commit({ ...worn, finishId: finishDraft ?? worn.finishId, style });
              }}
            >
              {style === "ra" ? (ownsRoyal ? "RA" : raTrial ? "RA (free game)" : "Buy RA") : style}
            </button>
          ))}
        </div>
        <Link to="/store" className="pointer-events-auto flex items-center gap-2 rounded-md border border-[#4a3d2a] bg-[#14110d]/90 px-3 py-1.5 backdrop-blur-md sm:hidden" title="Morse store">
          <img src={asset("/morse-coin.png")} alt="" className="size-5" />
          <span className="font-display text-lg tabular-nums text-ivory">{coins.toLocaleString()}</span>
        </Link>
      </header>

      {/* Left: category column + SAVE AVATAR. */}
      <nav className="absolute inset-x-3 top-[3.75rem] z-20 flex gap-2 overflow-x-auto rounded-lg border border-[#3a3024] bg-[linear-gradient(180deg,#1a1612,#100d0a)] p-2 shadow-[0_24px_60px_rgba(0,0,0,0.5)] sm:inset-x-auto sm:bottom-4 sm:left-4 sm:top-4 sm:w-[220px] sm:flex-col sm:overflow-visible">
        <Link
          to="/"
          className="hidden items-center gap-2 px-2 pb-2 text-xs uppercase tracking-[0.22em] text-[#a8977a] hover:text-[#f0d68a] sm:flex"
        >
          <span aria-hidden>‹</span> Lounge
        </Link>
        {CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-pressed={tab === item.id}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-3 rounded-md border px-3 text-left text-sm font-semibold uppercase tracking-[0.16em] sm:min-h-[52px]",
              tab === item.id
                ? "border-[#d6ad4f] bg-[linear-gradient(180deg,rgba(214,173,79,0.38),rgba(140,104,36,0.28))] text-[#fbe7b0] shadow-[inset_0_1px_0_rgba(255,230,160,0.25)]"
                : "border-[#2e261d] bg-[#171310] text-[#d7c9ae] hover:border-[#5a4a33]",
            )}
          >
            <CategoryIcon id={item.id} gold={tab === item.id} />
            {item.label}
          </button>
        ))}
        <div className="hidden flex-1 sm:block" />
        <div className="hidden items-center justify-between gap-2 px-1 pb-2 text-sm sm:flex">
          <span className="truncate font-display text-lg text-[#f3e6c8]">{username || "You"}</span>
          <span className="flex items-center gap-1.5">
            <Link to="/store" className="flex items-center gap-1.5" title="Morse store">
              <img src={asset("/morse-coin.png")} alt="" className="size-5" />
              <span className="font-display text-lg tabular-nums text-[#f0d68a]">{coins.toLocaleString()}</span>
            </Link>
          </span>
        </div>
        <input
          value={kingName}
          onChange={(e) => setKingName(e.target.value)}
          placeholder="Name this king"
          className="min-h-10 rounded-md border border-[#3a3024] bg-black/30 px-2 text-sm text-[#f4e7cb]"
        />
        <button
          type="button"
          disabled={!ready || saved === "saving"}
          onClick={() => void saveLook()}
          className={cn(
            "flex min-h-11 shrink-0 items-center justify-center gap-2.5 rounded-md px-4 text-sm font-bold uppercase tracking-[0.16em] disabled:opacity-60 sm:min-h-[52px]",
            GOLD_BTN,
          )}
        >
          <SaveIcon />
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved ✓" : unsaved ? "Save avatar •" : "Save avatar"}
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={sellKing}
          className="flex min-h-11 shrink-0 items-center justify-center rounded-md border border-[#d6ad4f] px-4 text-sm font-bold uppercase tracking-[0.16em] text-[#f0d68a]"
        >
          Sell
        </button>
        {models.length ? (
          <div className="max-h-28 space-y-1 overflow-auto">
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                className="block w-full truncate rounded px-2 py-1 text-left text-xs text-[#e6c56a] hover:bg-white/5"
                onClick={() => {
                  void wearAvatarModel({ data: { id: model.id } }).then((row) => {
                    if (row?.loadout) setWorn(row.loadout);
                  }).catch((err) => setError(err instanceof Error ? err.message : "Could not wear that king."));
                }}
              >
                {model.name}
              </button>
            ))}
          </div>
        ) : null}
      </nav>

      {/* Centre overlays: name plate, hint, toolbar. */}
      <div className="pointer-events-none absolute left-4 top-[8.5rem] z-10 sm:left-[256px] sm:top-16">
        <NamePlate name={username || "You"} look={JSON.stringify(loadout)} />
      </div>
      {loadout.style !== "2d" ? (
        <p className="pointer-events-none absolute left-4 top-[11.5rem] z-10 font-display text-2xl text-ivory sm:left-[256px] sm:top-28">
          {pedestal ? finish.name : characterById(characterId).name}
        </p>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(42dvh+0.75rem)] z-20 flex flex-col items-center gap-3 sm:bottom-4 sm:left-[236px] sm:right-[380px]">
        {loadout.style !== "2d" ? (
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-[#cbbd9f] [text-shadow:0_1px_3px_#000] sm:block">
            Drag to rotate <span className="mx-1.5 text-[#c99a3a]">•</span> <span className="text-[#e9c766]">Scroll</span> to zoom{" "}
            <span className="mx-1.5 text-[#c99a3a]">•</span> <span className="text-[#e9c766]">Right click</span> to pan
          </p>
        ) : null}
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-[#3a3024] bg-[#14110d]/92 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.5)] backdrop-blur-md">
          <ToolButton label="Undo" disabled={!past.length} onClick={() => void travel("undo")}>
            <path d="M9 7H4V2 M4 7c2.5-3 5.5-4.5 9-4 5 .7 8 5 7.5 9.5S15.5 20 11 20" />
          </ToolButton>
          <ToolButton label="Redo" disabled={!future.length} onClick={() => void travel("redo")}>
            <path d="M15 7h5V2 M20 7c-2.5-3-5.5-4.5-9-4C6 3.7 3 8 3.5 12.5S8.5 20 13 20" />
          </ToolButton>
          <span className="mx-1 h-8 w-px bg-[#3a3024]" />
          <button
            type="button"
            title={loadout.team === "w" ? "View black" : "View white"}
            onClick={() => void commit({ ...worn, finishId: finishDraft ?? worn.finishId, team: worn.team === "w" ? "b" : "w" })}
            className="flex min-h-10 items-center gap-2 rounded-md border border-[#6e5528] bg-[linear-gradient(180deg,rgba(214,173,79,0.3),rgba(120,88,30,0.25))] px-3.5 text-xs font-bold uppercase tracking-[0.18em] text-[#f6dfa0]"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
            View {loadout.team === "w" ? "black" : "white"}
          </button>
          <ToolButton label={board ? "Hide board" : "Show board"} active={board} disabled={!pedestal} onClick={() => setBoard((cur) => !cur)}>
            <path d="M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z" />
          </ToolButton>
          <ToolButton
            label="Try attack"
            disabled={!canStrike}
            active={strike}
            onClick={() => {
              setStrike(true);
              window.setTimeout(() => setStrike(false), 1600);
            }}
          >
            <circle cx="12" cy="7" r="4" />
            <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
          </ToolButton>
          <span className="mx-1 h-8 w-px bg-[#3a3024]" />
          <button
            type="button"
            title="Reset view"
            onClick={() => {
              controls.current?.reset();
              setBoard(false);
            }}
            className="flex min-h-10 items-center gap-2 rounded-md px-3 text-xs font-bold uppercase tracking-[0.18em] text-[#d7c9ae] hover:text-[#f6dfa0]"
          >
            Reset
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M20 12a8 8 0 1 1-2.4-5.7 M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Right: the chosen category. */}
      <aside className="absolute inset-x-3 bottom-3 z-20 flex max-h-[42dvh] flex-col overflow-hidden rounded-lg border border-[#3a3024] bg-[linear-gradient(180deg,#1a1612,#100d0a)] shadow-[0_24px_60px_rgba(0,0,0,0.5)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:max-h-none sm:w-[360px]">
        <div className="flex items-center gap-3 border-b border-[#2e261d] px-4 py-3.5">
          <CategoryIcon id={tab} gold big />
          <div>
            <h2 className="text-lg font-bold uppercase leading-tight tracking-[0.12em] text-[#f6e7c3]">
              {loadout.style === "lg" && tab === "kings" ? "LG minifig" : category.title}
            </h2>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a8977a]">
              {loadout.style === "lg" && tab === "kings" ? "Body, head, hair, legs, weapon" : category.sub}
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {error ? <p className="rounded-md border border-[#6a2c22] bg-[#3a1c16] px-3 py-2 text-sm text-[#f4d2c8]">{error}</p> : null}

          {tab === "kings" && (loadout.style === "3d" || loadout.style === "2d") ? (
            <>
              {loadout.style === "2d" ? (
                <Note>King pieces show in 3D. Pick one here, then switch to 3D to see it on the pedestal.</Note>
              ) : null}
              <div className="grid grid-cols-3 gap-2">
                {GRID_FINISHES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    title={item.name}
                    aria-pressed={loadout.finishId === item.id}
                    onClick={() => void pickFinish(item.id, item.price)}
                    className={cn(
                      "relative aspect-[5/6] overflow-hidden rounded-md border bg-[radial-gradient(circle_at_50%_35%,#2a241d,#14110e_75%)]",
                      loadout.finishId === item.id
                        ? "border-[#e2b84e] shadow-[0_0_0_1px_rgba(226,184,78,0.5),0_0_18px_rgba(226,184,78,0.18)]"
                        : "border-[#2e261d] hover:border-[#5a4a33]",
                    )}
                  >
                    {thumbs[item.id] ? (
                      <img src={thumbs[item.id]} alt={item.name} className="size-full object-contain" />
                    ) : (
                      <span className="grid size-full place-items-center text-3xl" style={{ color: item.body }}>
                        ♚
                      </span>
                    )}
                    {loadout.finishId === item.id ? <GoldCheck /> : null}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void pickFinish(LEGACY.id, LEGACY.price)}
                aria-pressed={loadout.finishId === LEGACY.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border bg-[#16120e] p-3 text-left",
                  loadout.finishId === LEGACY.id ? "border-[#e2b84e]" : "border-[#3a3024] hover:border-[#5a4a33]",
                )}
              >
                {own(LEGACY) && thumbs[LEGACY.id] ? (
                  <img src={thumbs[LEGACY.id]} alt="" className="h-12 w-10 object-contain" />
                ) : (
                  <svg viewBox="0 0 24 24" className="size-9 shrink-0 text-[#cbbd9f]" fill="currentColor" aria-hidden>
                    <path d="M7 10V7a5 5 0 0 1 10 0v3h1.5c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5h-13C4.7 22 4 21.3 4 20.5v-9C4 10.7 4.7 10 5.5 10zm2 0h6V7a3 3 0 0 0-6 0z" />
                  </svg>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold uppercase tracking-[0.12em] text-[#f6e7c3]">Royal Legacy kit</span>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a8977a]">
                    {own(LEGACY) ? "Unlocked · Royal Legacy King" : "Legendary · unlock"}
                  </span>
                </span>
                {own(LEGACY) ? (
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e9c766]">Owned</span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <img src={asset("/morse-coin.png")} alt="" className="size-5" />
                    <span className="font-display text-lg tabular-nums text-[#f3e6c8]">{LEGACY.price.toLocaleString()}</span>
                  </span>
                )}
              </button>
              {loadout.style === "3d" ? (
                <Note>
                  {ownsKit
                    ? `Royal Legacy kit: in 3D games your king is this king and all your pieces are pearl and gold with your letter${kitLetter ? ` "${kitLetter}"` : ""}. Playing black makes the set darker. ${finish.blurb} Press Save avatar to keep it.`
                    : `In 3D games all your pieces are the colour of this king (darker when you play black). ${finish.blurb} Unlock the Royal Legacy kit for ${LEGACY.price} coins to get the Royal Legacy king and pearl and gold pieces with your letter.`}
                </Note>
              ) : null}
            </>
          ) : null}

          {tab === "kings" && animated ? (
            <div className="grid grid-cols-3 gap-2">
              {CHARACTERS.filter((item) => item.id !== "hooded" && (loadout.style === "ra" ? item.id === "royal" : item.id !== "piece" && item.id !== "royal")).map((item) => (
                <Tile
                  key={item.id}
                  item={item}
                  picked={characterId === item.id}
                  owned={own(item)}
                  onPick={() => void equip(animated ? "anId" : "kingId", item.id, item.price)}
                  pinned={pins.includes(item.id)}
                  onPin={() => pinItem("king", item.id)}
                />
              ))}
            </div>
          ) : null}
          {tab === "kings" && loadout.style === "lg" ? (
            <div className="space-y-4">
              <Note>Swap each piece. Hair is a hat. The weapon sits in the right hand. Brick Verse has to be yours or the lounge will not keep LG.</Note>
              <PartRow label="Body" value={loadout.lgBody} options={LEGO_PARTS} onPick={(id) => void equip("lgBody", id, 0)} />
              <PartRow label="Head" value={loadout.lgHead} options={LEGO_PARTS} onPick={(id) => void equip("lgHead", id, 0)} />
              <PartRow label="Hair" value={loadout.lgHair} options={LG_HAIR} onPick={(id) => void equip("lgHair", id, 0)} />
              <PartRow label="Legs" value={loadout.lgLegs} options={LEGO_PARTS} onPick={(id) => void equip("lgLegs", id, 0)} />
              <PartRow label="Weapon" value={loadout.lgWeapon} options={LG_WEAPONS} onPick={(id) => void equip("lgWeapon", id, 0)} />
            </div>
          ) : null}
          {tab === "kings" && (characterId === "rogue" || characterId === "hooded") && (owned.includes("rogue") || characterId === "hooded") ? (
            <button
              type="button"
              className="w-full rounded-md border border-[#4a4034] px-3 py-3 text-left text-sm text-[#f4efe6]"
              onClick={() => void equip("anId", characterId === "hooded" ? "rogue" : "hooded", 0)}
            >
              {characterId === "hooded" ? "Hood is on. Take it off." : "Add a hood"}
            </button>
          ) : null}

          {tab === "swords" ? (
            silver ? (
              <div className="grid grid-cols-3 gap-2">
                {SWORDS.filter((item) => item.id === "none" || item.id === "rook").map((item) => (
                  <Tile
                    key={item.id}
                    item={item}
                    picked={loadout.swordId === item.id}
                    owned={own(item)}
                    onPick={() => void equip("swordId", item.id, item.price)}
                    pinned={pins.includes(item.id)}
                    onPin={() => pinItem("swordId", item.id)}
                  />
                ))}
              </div>
            ) : (
              <Note>Swords belong to the Silver Knight. Switch to AN and pick the knight to arm him.</Note>
            )
          ) : null}

          {tab === "dog" ? (
            loadout.style === "ra" ? (
              <>
                <Note>Crown or dog. The dog costs coins. In a game he runs out and tears the enemy to bits.</Note>
                <div className="grid grid-cols-3 gap-2">
                  {MOUNTS.map((item) => (
                    <Tile
                      key={item.id}
                      item={item}
                      picked={loadout.mountId === item.id}
                      owned={own(item)}
                      onPick={() => void equip("mountId", item.id, item.price)}
                      pinned={pins.includes(item.id)}
                      onPin={() => pinItem("mountId", item.id)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <Note>The war dog runs with the RA king. Switch to RA to bring him.</Note>
            )
          ) : null}

          {tab === "crowns" ? (
            <>
              {loadout.style === "an" && characterId === "royal" ? <Note>The royal king wears no crown.</Note> : null}
              <div className="grid grid-cols-3 gap-2">
                {CROWNS.map((item) => (
                  <Tile
                    key={item.id}
                    item={{ ...item, portrait: crownArt(item.id, loadout.team) }}
                    picked={loadout.crownId === item.id}
                    owned={own(item)}
                    onPick={() => void equip("crownId", item.id, item.price)}
                    pinned={pins.includes(item.id)}
                    onPin={() => pinItem("crownId", item.id)}
                  />
                ))}
              </div>
            </>
          ) : null}

          {tab === "frames" ? (
            <div className="grid grid-cols-2 gap-2">
              {FRAMES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void equip("frameId", item.id, item.price)}
                  className={cn(
                    "relative rounded-md border bg-[#16120e] p-2.5 text-left",
                    loadout.frameId === item.id ? "border-[#e2b84e]" : "border-[#2e261d] hover:border-[#5a4a33]",
                  )}
                >
                  <span className={cn("inline-flex max-w-full truncate rounded px-2.5 py-1 font-display text-base text-ivory", frameChip(item.id))}>
                    {username || "You"}
                  </span>
                  <span className="mt-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8977a]">
                    {item.name}
                    {own(item) ? " · Owned" : ` · ${item.price} coins`}
                  </span>
                  {loadout.frameId === item.id ? <GoldCheck /> : null}
                </button>
              ))}
            </div>
          ) : null}

          {tab === "attacks" ? (
            <>
              {!animated ? <Note>Attacks play with AN and RA kings. Try one with the person button.</Note> : null}
              {ATTACKS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void equip("attackId", item.id, item.price)}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-md border bg-[#16120e] p-2.5 text-left",
                    loadout.attackId === item.id ? "border-[#e2b84e]" : "border-[#2e261d] hover:border-[#5a4a33]",
                  )}
                >
                  <AttackMark id={item.id} />
                  <span>
                    <span className="block text-sm font-bold uppercase tracking-[0.12em] text-[#f6e7c3]">{item.name}</span>
                    <span className="text-xs text-[#a8977a]">{own(item) ? item.blurb : `${item.price} coins · ${item.blurb}`}</span>
                  </span>
                  {loadout.attackId === item.id ? <GoldCheck /> : null}
                </button>
              ))}
            </>
          ) : null}
        </div>
      </aside>
      <RaShop
        open={offer}
        coins={coins}
        busy={buyingRa}
        onClose={() => setOffer(false)}
        onBuy={() => {
          if (coins < 200 || buyingRa) return;
          setBuyingRa(true);
          setError(null);
          void buyGear({ data: { id: "royal" } })
            .then(async (bought) => {
              setCoins(bought.coins);
              setOwned(bought.owned);
              await commit({ ...worn, finishId: finishDraft ?? worn.finishId, style: "ra" });
              setOffer(false);
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Not enough Morse coins."))
            .finally(() => setBuyingRa(false));
        }}
      />
    </main>
  );
}

function PartRow({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onPick: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a8977a]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item.id)}
            className={cn(
              "rounded-md border px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em]",
              value === item.id ? GOLD_BTN : "border-[#3a3024] text-[#d7c9ae] hover:border-[#5a4a33]",
            )}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-[#3a3024] bg-[#15110d] px-3 py-2 text-sm text-[#d9c7a4]">{children}</p>;
}

function GoldCheck() {
  return (
    <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-[#e2b84e] text-[#1b140a] shadow" aria-hidden>
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-10 place-items-center rounded-md border disabled:opacity-35",
        active ? "border-[#d6ad4f] text-[#f6dfa0]" : "border-transparent text-[#d7c9ae] hover:text-[#f6dfa0]",
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M4 3h13l4 4v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 2v5h9V5zm5 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    </svg>
  );
}

function CategoryIcon({ id, gold, big }: { id: Category; gold?: boolean; big?: boolean }) {
  const cls = cn(big ? "size-8" : "size-6", "shrink-0", gold ? "text-[#e9c766]" : "text-[#d7c9ae]");
  if (id === "kings" || id === "crowns")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="currentColor" aria-hidden>
        <path d="M3 8l4.5 3.5L12 4l4.5 7.5L21 8l-2 10H5z M5 19.5h14V21H5z" />
        {id === "kings" ? <circle cx="12" cy="3" r="1.4" /> : null}
      </svg>
    );
  if (id === "swords")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M4 4l11 11 M20 4L9 15 M13 17l4 4 M11 17l-4 4 M16 13l3 3 M8 13l-3 3" />
      </svg>
    );
  if (id === "dog")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="currentColor" aria-hidden>
        <path d="M8 21h10c0-4-1.5-6-1.5-9 0-2 .5-3.5 2-4.5-1-2-3.5-4.5-7-4.5L10 2 9 4.5C6.5 6 5 8 4.5 10.5l-.5 2 2.5 1 2-1.5 2 .5C9 15 8 17.5 8 21z" />
      </svg>
    );
  if (id === "frames")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M6 6h12v12H6z M3 3h3v3H3z M18 3h3v3h-3z M3 18h3v3H3z M18 18h3v3h-3z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="currentColor" aria-hidden>
      <path d="M13 2L5 14h6l-1 8 9-13h-6z" />
    </svg>
  );
}

function Tile({
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
        "relative flex flex-col overflow-hidden rounded-md border bg-[#16120e]",
        picked ? "border-[#e2b84e] shadow-[0_0_0_1px_rgba(226,184,78,0.45)]" : "border-[#2e261d] hover:border-[#5a4a33]",
      )}
    >
      <button type="button" onClick={onPick} className="flex flex-1 flex-col items-center gap-1.5 p-2 text-center">
        {item.portrait ? (
          <img src={item.portrait} alt="" className="aspect-square w-full rounded object-cover" />
        ) : item.id === "piece" ? (
          <span className="grid aspect-square w-full place-items-center rounded bg-[#c4a574] text-[#2a1c10]">
            <svg viewBox="0 0 32 32" className="size-9" aria-hidden>
              <path fill="currentColor" d="M14 4h4v3h3v3h-3v2h4l2 14H8L10 12h4V10H11V7h3V4z" />
            </svg>
          </span>
        ) : (
          <GearMark id={item.id} />
        )}
        <span className="block w-full truncate text-[11px] font-bold uppercase tracking-[0.1em] text-[#f6e7c3]">{item.name}</span>
        <span className="block text-[10px] uppercase tracking-[0.14em] text-[#a8977a]">{owned ? "Owned" : `${item.price} coins`}</span>
      </button>
      {onPin ? (
        <button
          type="button"
          aria-pressed={pinned}
          onClick={onPin}
          className={cn(
            "border-t py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
            pinned ? "border-[#e2b84e] bg-[#e2b84e] text-[#1a140f]" : "border-[#2e261d] text-[#cbbd9f] hover:text-[#f6dfa0]",
          )}
        >
          {pinned ? "Pinned" : "Pin"}
        </button>
      ) : null}
      {picked ? <GoldCheck /> : null}
    </div>
  );
}

function RaPreview({ team, crownId, dog }: { team: "w" | "b"; crownId: string; dog: boolean }) {
  const gait = useRef<Gait>({ phase: 0, amp: 0, act: "idle", fade: 1 });
  return (
    <group>
      <RaPawn gait={gait} url={raUnitUrl("k")} team={team === "b" ? "red" : "blue"} role="k" />
      <RaCrown crownId={crownId} team={team} />
      {dog ? (
        <group position={[0.75, 0, 0.2]}>
          <WarDog act="idle" />
        </group>
      ) : null}
    </group>
  );
}

function BlueRook() {
  const gait = useRef<Gait>({ phase: 0, amp: 0, act: "idle", fade: 1 });
  return <StonePerson type="r" white cast="stone" gait={gait} flip={false} />;
}


function CrownFlat({ id, dark }: { id: string; dark: boolean }) {
  const metal = dark ? "#2a241c" : "#e4c56a";
  const edge = dark ? "#0c0a08" : "#7a5620";
  const leaf = dark ? "#3e4a36" : "#8fa56a";
  const crown =
    id === "halo"
      ? ""
      : id === "royal-crown"
        ? "M8 58 L16 22 L28 40 L50 8 L72 40 L84 22 L92 58 Z"
        : id === "poly-arch"
          ? "M10 58 L22 30 Q50 4 78 30 L90 58 Z"
          : "M12 58 L18 40 L32 48 L50 28 L68 48 L82 40 L88 58 Z";
  return (
    <svg
      viewBox="0 0 100 70"
      className="pointer-events-none absolute left-1/2 top-[27%] w-[34%] -translate-x-1/2"
      aria-hidden
    >
      {id === "halo" ? (
        <ellipse cx="50" cy="36" rx="28" ry="10" fill="none" stroke={metal} strokeWidth="5" />
      ) : id === "laurel" ? (
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
          : id === "rook"
            ? "M12 20V5 M8 9h8 M6 20h12v-5H6z"
            : id === "halo"
              ? "M12 5a7 7 0 1 0 0.01 0"
              : id === "royal-crown"
                ? "M4 18 L8 6 L12 14 L16 4 L20 14 L24 6 L20 18 Z"
                : id === "dog"
                  ? "M4 14c2-5 4-6 6-4 1 0 2 1 2 1s1-1 2-1c2-2 4-1 6 4 0 4-2 6-4 6H8c-2 0-4-2-4-6z"
                  : id === "none"
            ? "M8 16c2-4 6-4 8 0"
            : "M12 20V5 M8 9h8";
  return (
    <span className="grid aspect-square w-full place-items-center rounded border border-[#2e261d] bg-[#1a1612]">
      <svg viewBox="0 0 24 24" className="size-10 text-ivory" aria-hidden>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
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
