import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { asset } from "@/lib/base";
import { buyMarketListing, createMarketListing, listMarket, mySellables } from "@/lib/server/store";

export const Route = createFileRoute("/store")({
  component: StoreDoor,
});

type Card = {
  id: string;
  seller: string;
  mine: boolean;
  kind: string;
  name: string;
  price: number;
  blurb: string;
  shot: string;
};

type AvatarRow = { id: string; name: string; loadout?: unknown };
type BoardRow = { id: string; name: string; count: number };

function StoreDoor() {
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return <Store />;
}

function paintCard(title: string, sub: string) {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 480;
  const g = c.getContext("2d");
  if (!g) return "";
  g.fillStyle = "#1a140f";
  g.fillRect(0, 0, 640, 480);
  g.strokeStyle = "#d6ad4f";
  g.lineWidth = 8;
  g.strokeRect(16, 16, 608, 448);
  g.fillStyle = "#f4e7cb";
  g.font = "120px serif";
  g.textAlign = "center";
  g.fillText(sub.slice(0, 2) || "K", 320, 250);
  g.font = "32px serif";
  g.fillText(title.slice(0, 28), 320, 360);
  return c.toDataURL("image/jpeg", 0.72);
}

async function shrink(dataUrl: string) {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  const img = new Image();
  const loaded = new Promise<string>((resolve) => {
    img.onload = () => {
      const c = document.createElement("canvas");
      const scale = Math.min(1, 640 / Math.max(1, img.width));
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const g = c.getContext("2d");
      if (!g) {
        resolve(dataUrl);
        return;
      }
      g.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(dataUrl);
  });
  img.src = dataUrl;
  return loaded;
}

function Store() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [coins, setCoins] = useState(0);
  const [listings, setListings] = useState<Card[]>([]);
  const [open, setOpen] = useState<Card | null>(null);
  const [sell, setSell] = useState<null | "pick" | "av" | "lg" | "form">(null);
  const [kind, setKind] = useState<"av" | "lg">("av");
  const [avatars, setAvatars] = useState<AvatarRow[]>([]);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [loadout, setLoadout] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("25");
  const [blurb, setBlurb] = useState("");
  const [shot, setShot] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(query = q) {
    const row = await listMarket({ data: { q: query } });
    setListings(row.listings ?? []);
    setCoins(row.coins ?? 0);
  }

  useEffect(() => {
    void refresh("").catch((err) => setError(err instanceof Error ? err.message : "The store did not open."));
    try {
      const raw = sessionStorage.getItem("morse-sell-open");
      if (!raw) return;
      sessionStorage.removeItem("morse-sell-open");
      const draft = JSON.parse(raw) as { kind?: string; name?: string; shot?: string; loadout?: unknown; sourceId?: string };
      setKind(draft.kind === "lg" ? "lg" : "av");
      setName(draft.name || "");
      setShot(draft.shot || "");
      setLoadout(draft.loadout ?? null);
      setSourceId(draft.sourceId || "current");
      setSell("form");
    } catch {
      /* ignore */
    }
    // first paint only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openSell() {
    setError("");
    setSell("pick");
    try {
      const row = await mySellables();
      setAvatars(row.avatars ?? []);
      setBoards(row.boards ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your models.");
    }
  }

  function chooseSource(nextKind: "av" | "lg", id: string, label: string, extra?: unknown) {
    setKind(nextKind);
    setSourceId(id);
    setName(label);
    setLoadout(extra ?? null);
    setShot(paintCard(label, nextKind === "lg" ? "LG" : "AV"));
    setSell("form");
  }

  async function publish() {
    setBusy(true);
    setError("");
    try {
      const picture = await shrink(shot || paintCard(name || "King", kind === "lg" ? "LG" : "AV"));
      await createMarketListing({
        data: { kind, sourceId, name, price: Number(price), blurb, shot: picture, loadout },
      });
      setSell(null);
      setOpen(null);
      await refresh("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list that.");
    } finally {
      setBusy(false);
    }
  }

  async function buy(card: Card) {
    if (card.mine || coins < card.price) return;
    setBusy(true);
    setError("");
    try {
      const row = await buyMarketListing({ data: { id: card.id } });
      setCoins(row.coins);
      window.dispatchEvent(new CustomEvent("morse-coins", { detail: { coins: row.coins } }));
      setOpen(null);
      await refresh("");
      if (row.kind === "av") void navigate({ to: "/avatar" });
      else void navigate({ to: "/lego-builder" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not buy that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#120e0b] text-[#f4e7cb]">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-[#3a3024] bg-[#120e0b]/95 px-3 py-3">
        <Link to="/" className="shrink-0 text-xs uppercase tracking-[0.16em] text-[#cbb892]">Lounge</Link>
        <button type="button" onClick={() => void openSell()} className="shrink-0 rounded-md border border-[#d6ad4f] bg-[#3a2c16] px-4 py-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#f0d68a]">
          Sell
        </button>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            void refresh(e.target.value).catch(() => undefined);
          }}
          placeholder="Search models"
          className="min-w-0 flex-1 rounded-md border border-[#3a3024] bg-black/40 px-3 py-2 text-sm outline-none"
        />
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#6d5a32] bg-black/50 px-3 py-1.5">
          <img src={asset("/morse-coin.png")} alt="" className="size-5" />
          <span className="font-display tabular-nums">{coins.toLocaleString()}</span>
        </span>
      </header>

      {error ? <p className="px-4 pt-3 text-sm text-[#e07a7a]">{error}</p> : null}

      <section className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.length === 0 ? <p className="text-sm text-[#b7a88c]">Nothing is for sale yet. Press Sell to list a king or a Lego board.</p> : null}
        {listings.map((card) => (
          <button key={card.id} type="button" onClick={() => setOpen(card)} className="overflow-hidden rounded-xl border border-[#3a3024] bg-[#1b1612] text-left">
            <img src={card.shot} alt="" className="aspect-[4/3] w-full object-cover" />
            <div className="flex items-center justify-between gap-2 px-3 py-3">
              <span>
                <span className="block font-display text-xl">{card.name}</span>
                <span className="text-xs uppercase tracking-[0.14em] text-[#b7a88c]">{card.kind === "lg" ? "LG board" : "AV"} · {card.seller}</span>
              </span>
              <span className="font-display text-lg text-[#f0d68a]">{card.price}</span>
            </div>
          </button>
        ))}
      </section>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(null)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-xl border border-[#6d5a32] bg-[#1b1612] p-4" onClick={(e) => e.stopPropagation()}>
            <img src={open.shot} alt="" className="w-full rounded-md" />
            <h2 className="mt-3 font-display text-3xl">{open.name}</h2>
            <p className="text-sm text-[#b7a88c]">{open.kind === "lg" ? "LG board" : "AV king"} · {open.seller}</p>
            {open.blurb ? <p className="mt-3 text-sm leading-relaxed text-[#f4e7cb]">{open.blurb}</p> : null}
            <button
              type="button"
              disabled={busy || open.mine || coins < open.price}
              onClick={() => void buy(open)}
              className="mt-4 w-full rounded-md border border-[#d6ad4f] bg-[#3a2c16] py-3 font-display text-2xl text-[#f0d68a] disabled:opacity-40"
            >
              {open.mine ? "Your listing" : coins < open.price ? `Need ${open.price} coins` : `Buy now · ${open.price}`}
            </button>
          </div>
        </div>
      ) : null}

      {sell ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-xl border border-[#6d5a32] bg-[#1b1612] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-2xl">{sell === "pick" ? "What are you selling?" : sell === "form" ? "List it" : sell === "av" ? "Your kings" : "Your boards"}</h2>
              <button type="button" onClick={() => setSell(null)} className="text-sm text-[#b7a88c]">Close</button>
            </div>
            {sell === "pick" ? (
              <div className="grid gap-3">
                <button type="button" className="rounded-md border border-[#d6ad4f] px-4 py-4 text-left" onClick={() => setSell("av")}>AV — a king you saved</button>
                <button type="button" className="rounded-md border border-[#d6ad4f] px-4 py-4 text-left" onClick={() => setSell("lg")}>LG chess board</button>
              </div>
            ) : null}
            {sell === "av" ? (
              <div className="grid max-h-80 gap-2 overflow-auto">
                {avatars.length === 0 ? <p className="text-sm text-[#b7a88c]">Save a king on the AV page first. It gets a name and shows up here.</p> : null}
                {avatars.map((row) => (
                  <button key={row.id} type="button" onClick={() => chooseSource("av", row.id, row.name, row.loadout)} className="rounded-md border border-[#3a3024] px-3 py-3 text-left hover:border-[#d6ad4f]">
                    {row.name}
                  </button>
                ))}
              </div>
            ) : null}
            {sell === "lg" ? (
              <div className="grid max-h-80 gap-2 overflow-auto">
                {boards.length === 0 ? <p className="text-sm text-[#b7a88c]">Build and save an LG board first.</p> : null}
                {boards.map((row) => (
                  <button key={row.id} type="button" onClick={() => chooseSource("lg", row.id, row.name)} className="rounded-md border border-[#3a3024] px-3 py-3 text-left hover:border-[#d6ad4f]">
                    {row.name} · {row.count} pieces
                  </button>
                ))}
              </div>
            ) : null}
            {sell === "form" ? (
              <div className="space-y-3">
                {shot ? <img src={shot} alt="" className="w-full rounded-md" /> : null}
                <label className="block text-xs uppercase tracking-[0.14em] text-[#b7a88c]">Name
                  <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-[#3a3024] bg-black/30 px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs uppercase tracking-[0.14em] text-[#b7a88c]">Price in Morse coins
                  <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} className="mt-1 w-full rounded-md border border-[#3a3024] bg-black/30 px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs uppercase tracking-[0.14em] text-[#b7a88c]">Ad text
                  <textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-[#3a3024] bg-black/30 px-3 py-2 text-sm" placeholder="Shown under the picture when someone opens it" />
                </label>
                <button type="button" disabled={busy} onClick={() => void publish()} className="w-full rounded-md border border-[#d6ad4f] py-3 font-display text-2xl text-[#f0d68a] disabled:opacity-40">
                  {busy ? "Selling…" : "Sell"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
