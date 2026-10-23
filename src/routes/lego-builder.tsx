import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { keepWebGL } from "@/lib/gl-quiet";
import {
  BUILD_AREA,
  BuildBaseplate,
  LEGO_COLORS,
  PALETTE_URL,
  RESERVED,
  blocked,
  buildInstances,
  footprint,
  heightMap,
  loadPaletteMeta,
  pieceMatrix,
  pieceMaterial,
  restLevel,
  type LegoPiece,
  type PaletteItem,
} from "@/lib/lego-build";
import {
  buyLegoPart,
  deleteLegoBuild,
  getLegoBuild,
  legoBuilderState,
  putLegoBuildInUse,
  saveLegoBuild,
  type LegoBuilderState,
  type LegoBuildSummary,
} from "@/lib/server/lego-builder";

export const Route = createFileRoute("/lego-builder")({
  component: LegoBuilderRoute,
});

const MAX_PIECES = 2500;
const CATS: { id: string; label: string }[] = [
  { id: "Cool Pieces", label: "Cool pieces" },
  { id: "Bricks", label: "Bricks" },
  { id: "Plates", label: "Plates" },
  { id: "Tiles", label: "Tiles" },
  { id: "Curves & Arches", label: "Curves & arches" },
  { id: "Round", label: "Round" },
  { id: "Walls & Windows", label: "Walls & windows" },
];

function LegoBuilderRoute() {
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return <BuilderGate />;
}

type Palette = { items: PaletteItem[]; nodes: Map<string, THREE.Object3D> };
let paletteScene: Promise<Map<string, THREE.Object3D>> | null = null;
function loadPaletteNodes(): Promise<Map<string, THREE.Object3D>> {
  paletteScene ??= new GLTFLoader().loadAsync(PALETTE_URL).then((g) => {
    const m = new Map<string, THREE.Object3D>();
    const root = g.scene.children[0]?.name === "palette" ? g.scene.children[0] : g.scene;
    for (const c of root.children) m.set(c.name, c);
    return m;
  });
  return paletteScene;
}

function BuilderGate() {
  const [state, setState] = useState<LegoBuilderState | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([legoBuilderState(), loadPaletteMeta(), loadPaletteNodes()])
      .then(([s, items, nodes]) => {
        if (!live) return;
        setState(s);
        setPalette({ items, nodes });
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  if (error) return <Notice text={error} />;
  if (!state || !palette) return <Notice text="Opening the brick box…" />;
  if (!state.allowed)
    return <Notice text="Create Brick board is for owners of the Brick Heroes board. Get it in the board shop first." link />;
  return <Builder initial={state} palette={palette} />;
}

function Notice({ text, link }: { text: string; link?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#11162a] p-6 text-center text-[#f4f1e8]">
      <p className="max-w-md text-base">{text}</p>
      {link ? (
        <Link to="/" className="rounded-xl bg-[#f2cd37] px-4 py-2 text-sm font-medium text-[#1a140f]">
          Back to the club
        </Link>
      ) : null}
    </div>
  );
}

/** Small offscreen renderer that turns each palette item into a thumbnail picture. */
function useThumbnails(palette: Palette): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    const size = 112;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    let gl: THREE.WebGLRenderer;
    try {
      gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      return;
    }
    gl.setSize(size, size, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#667", 2.2));
    const sun = new THREE.DirectionalLight("#ffffff", 2.4);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
    const out: Record<string, string> = {};
    let i = 0;
    const step = () => {
      if (!live) return;
      const end = Math.min(i + 6, palette.items.length);
      for (; i < end; i++) {
        const it = palette.items[i];
        const node = palette.nodes.get(it.id);
        if (!node) continue;
        const obj = node.clone(true);
        obj.position.set(0, 0, 0);
        obj.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.material = pieceMaterial(m.material as THREE.Material, "#c91a09");
        });
        scene.add(obj);
        const box = new THREE.Box3().setFromObject(obj);
        const c = box.getCenter(new THREE.Vector3());
        const r = box.getSize(new THREE.Vector3()).length() / 2 || 1;
        const dir = new THREE.Vector3(1, 0.8, 1.25).normalize();
        cam.position.copy(c).addScaledVector(dir, r / Math.sin((cam.fov * Math.PI) / 360) * 1.02);
        cam.lookAt(c);
        gl.render(scene, cam);
        out[it.id] = canvas.toDataURL("image/png");
        scene.remove(obj);
      }
      setThumbs({ ...out });
      if (i < palette.items.length) requestAnimationFrame(step);
      else gl.dispose();
    };
    requestAnimationFrame(step);
    return () => {
      live = false;
      gl.dispose();
    };
  }, [palette]);
  return thumbs;
}

function Builder({ initial, palette }: { initial: LegoBuilderState; palette: Palette }) {
  const items = useMemo(() => new Map(palette.items.map((i) => [i.id, i])), [palette]);
  const thumbs = useThumbnails(palette);
  const [coins, setCoins] = useState(initial.coins);
  const [prices] = useState(initial.prices);
  const [owned, setOwned] = useState(() => new Set(initial.owned));
  const [builds, setBuilds] = useState<LegoBuildSummary[]>(initial.builds);
  const [pieces, setPieces] = useState<LegoPiece[]>([]);
  const undoStack = useRef<LegoPiece[][]>([]);
  const redoStack = useRef<LegoPiece[][]>([]);
  const [selected, setSelected] = useState<string>(palette.items[0]?.id ?? "");
  const [color, setColor] = useState(LEGO_COLORS[4].hex);
  const [rot, setRot] = useState(0);
  const [mode, setMode] = useState<"place" | "erase">("place");
  const [buildId, setBuildId] = useState<string | null>(null);
  const [name, setName] = useState("My Brick board");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState<PaletteItem | null>(null);
  const [inUse, setInUse] = useState(false);
  const [dirty, setDirty] = useState(false);

  const priceOf = useCallback((id: string) => prices[id] ?? items.get(id)?.price ?? 0, [prices, items]);
  const usable = useCallback((id: string) => priceOf(id) === 0 || owned.has(id), [priceOf, owned]);

  const commit = useCallback((next: LegoPiece[]) => {
    setPieces((prev) => {
      undoStack.current.push(prev);
      if (undoStack.current.length > 200) undoStack.current.shift();
      redoStack.current = [];
      return next;
    });
    setDirty(true);
  }, []);
  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setPieces((cur) => {
      redoStack.current.push(cur);
      return prev;
    });
    setDirty(true);
  }, []);
  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setPieces((cur) => {
      undoStack.current.push(cur);
      return next;
    });
    setDirty(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && k === "y") {
        e.preventDefault();
        redo();
      } else if (k === "r") setRot((r) => (r + 1) % 4);
      else if (k === "e" || k === "x" || k === "delete") setMode((m) => (m === "erase" ? "place" : "erase"));
      else if (k === "escape") setMode("place");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const pick = (it: PaletteItem) => {
    setMode("place");
    if (usable(it.id)) setSelected(it.id);
    else setBuying(it);
  };

  const buy = async (it: PaletteItem) => {
    setBusy(true);
    try {
      const r = await buyLegoPart({ data: { id: it.id } });
      setCoins(r.coins);
      setOwned(new Set(r.owned));
      setSelected(it.id);
      setBuying(null);
      setStatus(`${it.name} is yours. Build away!`);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const place = useCallback(
    (pc: LegoPiece) => {
      if (pieces.length >= MAX_PIECES) {
        setStatus(`That's the limit of ${MAX_PIECES} pieces.`);
        return;
      }
      commit([...pieces, pc]);
    },
    [pieces, commit],
  );
  const erase = useCallback((i: number) => commit(pieces.filter((_, n) => n !== i)), [pieces, commit]);

  const save = async (): Promise<string | null> => {
    setBusy(true);
    try {
      const r = await saveLegoBuild({ data: { id: buildId ?? undefined, name, pieces } });
      setBuildId(r.id);
      setBuilds(r.builds);
      setDirty(false);
      setStatus("Saved.");
      return r.id;
    } catch (e) {
      setStatus((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const use = async () => {
    const id = dirty || !buildId ? await save() : buildId;
    if (!id) return;
    setBusy(true);
    try {
      const r = await putLegoBuildInUse({ data: { id } });
      setBuilds(r.builds);
      setInUse(true);
      setStatus("In use! Your build now surrounds the Brick chess board.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const load = async (id: string) => {
    if (dirty && pieces.length && !window.confirm("Drop the changes you have not saved?")) return;
    setBusy(true);
    try {
      const b = await getLegoBuild({ data: { id } });
      setBuildId(b.id);
      setName(b.name);
      undoStack.current = [];
      redoStack.current = [];
      setPieces(b.pieces);
      setDirty(false);
      setStatus(`Opened "${b.name}".`);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fresh = () => {
    if (dirty && pieces.length && !window.confirm("Drop the changes you have not saved?")) return;
    setBuildId(null);
    setName("My Brick board");
    undoStack.current = [];
    redoStack.current = [];
    setPieces([]);
    setDirty(false);
    setStatus("");
  };

  const remove = async () => {
    if (!buildId || !window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await deleteLegoBuild({ data: { id: buildId } });
      setBuilds(r.builds);
      setBuildId(null);
      setPieces([]);
      undoStack.current = [];
      setName("My Brick board");
      setStatus("Deleted.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sel = items.get(selected);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#11162a] text-[#f4f1e8]">
      {/* The big piece box on the left */}
      <aside className="flex h-full w-[360px] shrink-0 flex-col border-r border-white/10 bg-[#171d36]">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <Link to="/" className="text-sm text-[#cfd6ea] hover:text-white">
            ← Club
          </Link>
          <span className="rounded-full bg-[#f2cd37] px-3 py-1 text-xs font-semibold text-[#1a140f]" data-testid="coins">
            {coins.toLocaleString()} Morse coins
          </span>
        </div>
        <h1 className="px-4 pt-3 text-lg font-semibold">Brick pieces</h1>
        <p className="px-4 pb-2 text-xs text-[#aab3cf]">Most pieces are free. The coolest ones cost a few Morse coins, once.</p>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" data-testid="palette">
          {CATS.map((cat) => {
            const list = palette.items.filter((i) => i.cat === cat.id);
            if (!list.length) return null;
            return (
              <section key={cat.id} className="mt-3">
                <h2 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-[#f2cd37]">{cat.label}</h2>
                <div className="grid grid-cols-3 gap-2">
                  {list.map((it) => {
                    const price = priceOf(it.id);
                    const have = usable(it.id);
                    const on = selected === it.id && mode === "place";
                    return (
                      <button
                        key={it.id}
                        type="button"
                        title={it.name}
                        onClick={() => pick(it)}
                        className={`relative flex flex-col items-center rounded-xl border p-1 text-[10px] leading-tight transition ${
                          on ? "border-[#f2cd37] bg-[#2a3360]" : "border-white/10 bg-[#1f2646] hover:border-white/30"
                        }`}
                      >
                        {thumbs[it.id] ? (
                          <img src={thumbs[it.id]} alt="" className={`h-20 w-20 object-contain ${have ? "" : "opacity-70"}`} />
                        ) : (
                          <div className="h-20 w-20 animate-pulse rounded-lg bg-white/5" />
                        )}
                        <span className="mt-0.5 line-clamp-2 text-center">{it.name}</span>
                        {price > 0 ? (
                          <span
                            className={`absolute right-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                              have ? "bg-[#237841] text-white" : "bg-[#f2cd37] text-[#1a140f]"
                            }`}
                          >
                            {have ? "Owned" : `${price} 🪙`}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Top bar: name, save, builds, use */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#171d36] py-2 pl-3 pr-28">
          <input
            value={name}
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            className="w-48 rounded-lg border border-white/15 bg-[#11162a] px-2 py-1.5 text-sm"
            aria-label="Build name"
          />
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-[#36aebf] px-3 py-1.5 text-sm font-medium text-[#0b1020] disabled:opacity-50">
            Save
          </button>
          <button type="button" disabled={busy} onClick={() => void use()} className="rounded-lg bg-[#f2cd37] px-3 py-1.5 text-sm font-semibold text-[#1a140f] disabled:opacity-50">
            Use
          </button>
          <select
            value={buildId ?? ""}
            onChange={(e) => (e.target.value ? void load(e.target.value) : fresh())}
            className="rounded-lg border border-white/15 bg-[#11162a] px-2 py-1.5 text-sm"
            aria-label="My builds"
          >
            <option value="">+ New build</option>
            {builds.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.count}){b.active ? " ★ in use" : ""}
              </option>
            ))}
          </select>
          {buildId ? (
            <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-[#f4d2c8]">
              Delete
            </button>
          ) : null}
          <span className="ml-auto text-xs text-[#aab3cf]">
            {pieces.length} / {MAX_PIECES} pieces{dirty ? " · not saved" : ""}
          </span>
        </div>

        <div className="relative min-h-0 flex-1">
          <Canvas
            shadows
            camera={{ position: [0, 46, 70], fov: 40, near: 0.5, far: 1200 }}
            onCreated={({ gl }) => keepWebGL(gl)}
            data-testid="builder-canvas"
          >
            <BuilderScene
              pieces={pieces}
              items={items}
              nodes={palette.nodes}
              selected={sel}
              color={color}
              rot={rot}
              mode={mode}
              onPlace={place}
              onErase={erase}
            />
          </Canvas>

          {/* Tool bar */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3">
            {status ? <div className="pointer-events-auto rounded-lg bg-black/60 px-3 py-1.5 text-sm">{status}</div> : null}
            {inUse ? (
              <Link to="/" className="pointer-events-auto rounded-lg bg-[#237841] px-3 py-1.5 text-sm font-medium text-white">
                Play chess on it →
              </Link>
            ) : null}
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-[#171d36]/90 p-2 shadow-xl">
              <div className="flex flex-wrap gap-1" aria-label="Colours">
                {LEGO_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.name}
                    onClick={() => {
                      setColor(c.hex);
                      setMode("place");
                    }}
                    className={`h-6 w-6 rounded-md border-2 ${color === c.hex ? "border-white" : "border-transparent"}`}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
              <span className="mx-1 h-6 w-px bg-white/15" />
              <ToolButton label="Rotate (R)" onClick={() => setRot((r) => (r + 1) % 4)} />
              <ToolButton label={mode === "erase" ? "Erasing (E)" : "Erase (E)"} active={mode === "erase"} onClick={() => setMode((m) => (m === "erase" ? "place" : "erase"))} />
              <ToolButton label="Undo" onClick={undo} />
              <ToolButton label="Redo" onClick={redo} />
              <ToolButton
                label="Clear"
                onClick={() => {
                  if (pieces.length && window.confirm("Take every piece off?")) commit([]);
                }}
              />
            </div>
            <p className="text-[11px] text-white/60">
              Click to place {sel ? `"${sel.name}"` : "a piece"} · drag to look around · scroll to zoom · the chess board sits in the middle
            </p>
          </div>

          {buying ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="w-80 rounded-2xl bg-[#1f2646] p-5 text-center shadow-2xl">
                {thumbs[buying.id] ? <img src={thumbs[buying.id]} alt="" className="mx-auto h-24 w-24" /> : null}
                <h3 className="mt-2 text-lg font-semibold">{buying.name}</h3>
                <p className="mt-1 text-sm text-[#cfd6ea]">
                  Buy it for {priceOf(buying.id)} Morse coins? You keep it for every build.
                </p>
                {coins < priceOf(buying.id) ? <p className="mt-1 text-sm text-[#f4d2c8]">You have {coins} Morse coins.</p> : null}
                <div className="mt-4 flex gap-2">
                  <button type="button" className="flex-1 rounded-xl border border-white/15 py-2 text-sm" onClick={() => setBuying(null)}>
                    Not now
                  </button>
                  <button
                    type="button"
                    disabled={busy || coins < priceOf(buying.id)}
                    className="flex-1 rounded-xl bg-[#f2cd37] py-2 text-sm font-semibold text-[#1a140f] disabled:opacity-40"
                    onClick={() => void buy(buying)}
                  >
                    {busy ? "Buying…" : `Buy (${priceOf(buying.id)} 🪙)`}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function ToolButton({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm ${active ? "bg-[#c91a09] text-white" : "bg-[#2a3360] text-[#f4f1e8] hover:bg-[#34407a]"}`}
    >
      {label}
    </button>
  );
}

type SceneProps = {
  pieces: LegoPiece[];
  items: Map<string, PaletteItem>;
  nodes: Map<string, THREE.Object3D>;
  selected?: PaletteItem;
  color: string;
  rot: number;
  mode: "place" | "erase";
  onPlace: (pc: LegoPiece) => void;
  onErase: (index: number) => void;
};

function BuilderScene({ pieces, items, nodes, selected, color, rot, mode, onPlace, onErase }: SceneProps) {
  const build = useMemo(() => buildInstances(pieces, items, nodes), [pieces, items, nodes]);
  useEffect(() => () => build.children.forEach((c) => (c as THREE.InstancedMesh).dispose()), [build]);
  const hm = useMemo(() => heightMap(pieces, items), [pieces, items]);
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const [eraseHit, setEraseHit] = useState<number | null>(null);

  const ghostPiece = useMemo<{ pc: LegoPiece; ok: boolean } | null>(() => {
    if (!hover || !selected || mode !== "place") return null;
    const [fw, fd] = footprint(selected, rot);
    const x = Math.round(hover.x - fw / 2);
    const z = Math.round(hover.z - fd / 2);
    const y = restLevel(hm, x, z, fw, fd);
    return { pc: { p: selected.id, x, y, z, r: rot, c: color }, ok: !blocked(x, z, fw, fd) && y + selected.h <= 160 };
  }, [hover, selected, rot, hm, color, mode]);

  const ghost = useMemo(() => {
    if (!ghostPiece || !selected) return null;
    const node = nodes.get(selected.id);
    if (!node) return null;
    const g = node.clone(true);
    g.position.set(0, 0, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: ghostPiece.ok ? color : "#ff3030",
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = mat;
      o.raycast = () => {};
    });
    const wrap = new THREE.Group();
    wrap.add(g);
    wrap.matrixAutoUpdate = false;
    return wrap;
  }, [ghostPiece?.ok, selected, nodes, color]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ghost && ghostPiece && selected) {
      pieceMatrix(ghostPiece.pc, selected, ghost.matrix);
      ghost.matrixWorldNeedsUpdate = true;
    }
  }, [ghost, ghostPiece, selected]);

  const pieceAt = (e: ThreeEvent<PointerEvent | MouseEvent>): number | null => {
    const obj = e.object as THREE.InstancedMesh;
    const map = obj.userData?.pieceIndex as number[] | undefined;
    if (!map || e.instanceId == null) return null;
    return map[e.instanceId] ?? null;
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (mode === "erase") {
      setEraseHit(pieceAt(e));
      setHover(null);
      return;
    }
    // On top of a piece, nudge the point a little towards the camera side it was hit from.
    const p = e.point.clone();
    if (e.face) {
      const n = e.face.normal.clone().transformDirection(e.object.matrixWorld);
      if (Math.abs(n.y) < 0.5) p.addScaledVector(n, 0.5);
    }
    setHover({ x: p.x, z: p.z });
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return;
    if (mode === "erase") {
      const i = pieceAt(e);
      if (i != null) onErase(i);
      setEraseHit(null);
      return;
    }
    if (ghostPiece?.ok) onPlace(ghostPiece.pc);
  };

  const highlight = useMemo(() => {
    if (eraseHit == null) return null;
    const pc = pieces[eraseHit];
    const it = pc && items.get(pc.p);
    if (!pc || !it) return null;
    const [fw, fd] = footprint(it, pc.r);
    return { pos: [pc.x + fw / 2, (pc.y + it.h / 2) * 0.4, pc.z + fd / 2] as [number, number, number], size: [fw + 0.1, it.h * 0.4 + 0.3, fd + 0.1] as [number, number, number] };
  }, [eraseHit, pieces, items]);

  return (
    <>
      <color attach="background" args={["#9fc8ef"]} />
      <fog attach="fog" args={["#9fc8ef", 140, 320]} />
      <hemisphereLight args={["#ffffff", "#5a6a50", 1.6]} />
      <directionalLight
        position={[40, 80, 30]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />
      <OrbitControls makeDefault target={[0, 0, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={12} maxDistance={220} />
      <BuildBaseplate />
      <ChessBoardStandIn />
      <group onPointerMove={onMove} onPointerOut={() => (setHover(null), setEraseHit(null))} onClick={onClick}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.17, 0]}>
          <planeGeometry args={[BUILD_AREA * 2, BUILD_AREA * 2]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <primitive object={build} />
      </group>
      {ghost ? <primitive object={ghost} /> : null}
      {highlight ? (
        <mesh position={highlight.pos} raycast={() => {}}>
          <boxGeometry args={highlight.size} />
          <meshBasicMaterial color="#ff3030" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ) : null}
    </>
  );
}

/** Where the chess board goes: a checkered 32x32 stud board inside a grey keep-clear frame. */
function ChessBoardStandIn() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        g.fillStyle = (i + j) % 2 ? "#6a8bb8" : "#e9eef5";
        g.fillRect(i * 32, j * 32, 32, 32);
      }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  }, []);
  return (
    <group raycast={() => {}}>
      <mesh position={[0, 0.3, 0]} receiveShadow raycast={() => {}}>
        <boxGeometry args={[RESERVED * 2, 0.6, RESERVED * 2]} />
        <meshStandardMaterial color="#8a9099" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.62, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <planeGeometry args={[32, 32]} />
        <meshStandardMaterial map={tex} roughness={0.5} />
      </mesh>
    </group>
  );
}
