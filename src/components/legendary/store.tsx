/**
 * Morse Chess Legendary store (store-ref.png): browse panel, rarity filter, rarity-bordered cards
 * and a "Legendary board of the week" banner. Everything sold here is the real Morse Chess catalog,
 * bought with the same RPCs as the classic site (buyBoard, buyGear, buyMarketListing).
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Crown, Gem, LayoutGrid, Lock, Package, Shield, Sparkles } from "lucide-react";
import { BOARD_CATALOG, boardUnlocked, type BoardSkin } from "@/lib/chess/board-skins";
import { CHARACTERS, CROWNS, FINISHES, FRAMES, MOUNTS, SWORDS, ATTACKS, type GearItem } from "@/lib/avatar/catalog";
import { getHomeState, buyBoard } from "@/lib/server/mores";
import { buyGear, getAvatar } from "@/lib/server/avatar";
import { buyMarketListing, listMarket } from "@/lib/server/store";
import { useKingThumbs } from "@/components/avatar/pedestal-king";
import { RARITY, RARITY_ORDER, rarityForCoins, rarityForElo, chicagoDate, type Rarity } from "@/lib/legendary/theme";
import { playSfx } from "@/lib/legendary/sfx";
import { Coin, CrownMark, PlayerAvatar, RarityTag, SeasonBackdrop, hms, useCountdown, useMyPhoto } from "@/components/legendary/bits";
import { useSeason } from "@/components/legendary/lounge";
import { cn } from "@/lib/utils";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

type Cat = "all" | "boards" | "pieces" | "gear" | "bundles" | "exclusive";

type Item = {
  key: string;
  cat: Exclude<Cat, "all" | "exclusive">;
  name: string;
  blurb: string;
  rarity: Rarity;
  price: number;
  /** Elo boards are earned, not bought. */
  lockElo?: number;
  owned: boolean;
  thumb: ReactNode;
  buy?: () => Promise<number>;
};

type Listing = { id: string; seller: string; mine: boolean; kind: string; name: string; price: number; blurb: string; shot: string };

const CATS: { id: Cat; name: string; icon: ReactNode }[] = [
  { id: "all", name: "All Items", icon: <LayoutGrid className="size-4" /> },
  { id: "boards", name: "Boards", icon: <span className="text-base leading-none">♜</span> },
  { id: "pieces", name: "Piece Sets", icon: <span className="text-base leading-none">♚</span> },
  { id: "gear", name: "Frames & Gear", icon: <Shield className="size-4" /> },
  { id: "bundles", name: "Bundles", icon: <Package className="size-4" /> },
  { id: "exclusive", name: "Exclusive", icon: <Sparkles className="size-4" /> },
];

/** Gear costs 2–200 coins; its rarity bands are tighter than boards'. */
function gearRarity(item: GearItem & { legendary?: boolean }): Rarity {
  if (item.legendary || item.price >= 20) return "legendary";
  if (item.price >= 8) return "epic";
  if (item.price >= 5) return "rare";
  return "common";
}

function boardRarity(b: BoardSkin): Rarity {
  return (b.coinCost ?? 0) > 0 ? rarityForCoins(b.coinCost ?? 0) : rarityForElo(b.cost);
}

/** Milliseconds until next Monday 00:00 in America/Chicago, and the Chicago week number. */
function chicagoWeek(now = Date.now()) {
  const { y, m, d } = chicagoDate(new Date(now));
  const day = new Date(Date.UTC(y, m - 1, d));
  const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
  const week = Math.floor((day.getTime() / 86_400_000 + 3) / 7);
  // Chicago wall-clock "now" as if it were UTC, to measure the time to midnight there.
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" })
    .formatToParts(new Date(now))
    .reduce<Record<string, number>>((a, p) => (p.type === "literal" ? a : { ...a, [p.type]: Number(p.value) }), {});
  const sinceMidnight = ((parts.hour ?? 0) * 3600 + (parts.minute ?? 0) * 60 + (parts.second ?? 0)) * 1000;
  return { week, endsAt: now + (7 - dow) * 86_400_000 - sinceMidnight };
}

export function BoardThumb({ board, className }: { board: BoardSkin; className?: string }) {
  const squares = useMemo(() => Array.from({ length: 64 }, (_, i) => ((i >> 3) + i) % 2 === 0), []);
  return (
    <div className={cn("grid size-full place-items-center [perspective:600px]", className)} aria-hidden>
      <div className="relative w-[64%] [transform:rotateX(56deg)_rotateZ(-38deg)] [transform-style:preserve-3d]">
        <div
          className="grid aspect-square grid-cols-8 p-[7%]"
          style={{
            background: `linear-gradient(135deg, ${board.table}, ${board.felt})`,
            boxShadow: `0 1px 0 ${board.table}, 0 2px 0 ${board.table}, 0 3px 0 ${board.table}, 0 4px 0 ${board.table}, 0 5px 0 rgba(0,0,0,.6), 0 26px 30px -6px rgba(0,0,0,.85)`,
          }}
        >
          {squares.map((light, i) => (
            <span key={i} style={{ background: light ? board.lightSq : board.darkSq }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GlyphThumb({ glyph, rarity }: { glyph: string; rarity: Rarity }) {
  return (
    <div className="grid size-full place-items-center">
      <span className="font-[Cinzel] text-5xl" style={{ color: RARITY[rarity].color, textShadow: `0 0 22px ${RARITY[rarity].glow}` }}>
        {glyph}
      </span>
    </div>
  );
}

function ImgThumb({ src }: { src: string }) {
  return <img src={src} alt="" className="size-full object-cover" loading="lazy" draggable={false} />;
}

export function LegendaryStore() {
  const season = useSeason();
  const { photo } = useMyPhoto();
  const [cat, setCat] = useState<Cat>("all");
  const [filter, setFilter] = useState<Set<Rarity>>(new Set());
  const [coins, setCoins] = useState<number | null>(null);
  const [score, setScore] = useState(1200);
  const [username, setUsername] = useState("");
  const userId = useCurrentUserState().user?.id ?? null;
  const [ownedBoards, setOwnedBoards] = useState<string[]>([]);
  const [ownedGear, setOwnedGear] = useState<string[]>([]);
  const [market, setMarket] = useState<Listing[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const legacy = useMemo(() => FINISHES.filter((f) => f.price > 0), []);
  const kingThumbs = useKingThumbs(legacy, true, (username || "M").slice(0, 1).toUpperCase());

  async function refresh() {
    const [home, av, m] = await Promise.all([
      getHomeState().catch(() => null),
      getAvatar().catch(() => null),
      listMarket({ data: { q: "" } }).catch(() => null),
    ]);
    if (home?.profile) {
      setScore(home.profile.score);
      setUsername(home.profile.username);
      setOwnedBoards(home.profile.ownedBoards ?? []);
      setCoins(home.profile.coins);
    }
    if (av) setOwnedGear(av.owned ?? []);
    if (m) setMarket((m.listings ?? []).filter((l: Listing) => !l.mine));
  }
  useEffect(() => {
    void refresh();
  }, []);

  const paid = (n: number) => {
    setCoins(n);
    window.dispatchEvent(new CustomEvent("morse-coins", { detail: { coins: n } }));
    playSfx("coin");
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const b of BOARD_CATALOG) {
      const coinCost = b.coinCost ?? 0;
      if (coinCost <= 0 && b.cost === 0) continue; // starter boards are free for everyone
      if (b.sealed && !boardUnlocked(score, b, username, ownedBoards)) continue;
      out.push({
        key: `board:${b.id}`,
        cat: "boards",
        name: b.name,
        blurb: b.blurb,
        rarity: boardRarity(b),
        price: coinCost,
        lockElo: coinCost > 0 ? undefined : b.cost,
        owned: boardUnlocked(score, b, username, ownedBoards),
        thumb: <BoardThumb board={b} />,
        buy:
          coinCost > 0
            ? async () => {
                const r = await buyBoard({ data: { boardId: b.id } });
                if (!r.ok) throw new Error(r.error ?? "Could not buy that board.");
                setOwnedBoards(r.owned);
                return r.coins;
              }
            : undefined,
      });
    }
    const gear = async (id: string) => {
      const r = await buyGear({ data: { id } });
      setOwnedGear(r.owned ?? []);
      return r.coins as number;
    };
    for (const c of CHARACTERS.filter((x) => x.price > 0)) {
      out.push({ key: `gear:${c.id}`, cat: "pieces", name: `${c.name} King`, blurb: c.blurb, rarity: gearRarity(c), price: c.price, owned: ownedGear.includes(c.id), thumb: c.portrait ? <ImgThumb src={c.portrait} /> : <GlyphThumb glyph="♚" rarity={gearRarity(c)} />, buy: () => gear(c.id) });
    }
    for (const f of legacy) {
      out.push({
        key: `gear:${f.id}`,
        cat: "pieces",
        name: f.name,
        blurb: f.blurb,
        rarity: gearRarity(f),
        price: f.price,
        owned: ownedGear.includes(f.id),
        thumb: kingThumbs[f.id] ? <img src={kingThumbs[f.id]} alt="" className="mx-auto h-full object-contain" /> : <GlyphThumb glyph="♚" rarity="legendary" />,
        buy: () => gear(f.id),
      });
    }
    for (const fr of FRAMES.filter((x) => x.price > 0)) {
      out.push({
        key: `gear:${fr.id}`,
        cat: "gear",
        name: `${fr.name} frame`,
        blurb: `Avatar frame. ${fr.blurb}`,
        rarity: gearRarity(fr),
        price: fr.price,
        owned: ownedGear.includes(fr.id),
        thumb: (
          <div className="grid size-full place-items-center">
            <PlayerAvatar userId={userId} photo={photo} letter={username.slice(0, 1)} size={72} frame={fr.id} />
          </div>
        ),
        buy: () => gear(fr.id),
      });
    }
    for (const [list, glyph, label] of [
      [CROWNS, "♛", "Crown"],
      [SWORDS, "⚔", "Blade"],
      [MOUNTS, "🐺", "Companion"],
      [ATTACKS, "✦", "Attack"],
    ] as const) {
      for (const g of (list as readonly GearItem[]).filter((x) => x.price > 0)) {
        out.push({
          key: `gear:${g.id}`,
          cat: "gear",
          name: g.name,
          blurb: `${label}. ${g.blurb}`,
          rarity: gearRarity(g),
          price: g.price,
          owned: ownedGear.includes(g.id),
          thumb: g.portrait ? <ImgThumb src={g.portrait} /> : <GlyphThumb glyph={glyph} rarity={gearRarity(g)} />,
          buy: () => gear(g.id),
        });
      }
    }
    for (const l of market) {
      out.push({
        key: `market:${l.id}`,
        cat: "bundles",
        name: l.name,
        blurb: `${l.kind === "lg" ? "Brick board" : "AV king"} bundle by ${l.seller}. ${l.blurb}`,
        rarity: rarityForCoins(l.price),
        price: l.price,
        owned: false,
        thumb: l.shot ? <ImgThumb src={l.shot} /> : <GlyphThumb glyph="♚" rarity={rarityForCoins(l.price)} />,
        buy: async () => {
          const r = await buyMarketListing({ data: { id: l.id } });
          setMarket((m) => m.filter((x) => x.id !== l.id));
          return r.coins as number;
        },
      });
    }
    return out;
  }, [score, username, ownedBoards, ownedGear, market, kingThumbs, legacy, photo, userId]);

  const shown = items
    .filter((i) => (cat === "all" ? true : cat === "exclusive" ? i.rarity === "legendary" : i.cat === cat))
    .filter((i) => filter.size === 0 || filter.has(i.rarity))
    .sort((a, b) => Number(a.owned) - Number(b.owned) || RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || b.price - a.price);

  // Board of the week: rotates through the legendary-rarity boards every Monday (Chicago).
  const { week, endsAt } = chicagoWeek();
  const featuredPool = BOARD_CATALOG.filter((b) => boardRarity(b) === "legendary" && !b.sealed);
  const featured = featuredPool.length ? featuredPool[week % featuredPool.length] : null;
  const left = useCountdown(endsAt);
  const days = Math.floor(left / 86_400_000);
  const [h, m, s] = hms(left % 86_400_000);
  const featuredItem = featured ? items.find((i) => i.key === `board:${featured.id}`) : undefined;

  async function buy(item: Item) {
    if (!item.buy || busy) return;
    setBusy(item.key);
    setMsg(null);
    try {
      const n = await item.buy();
      paid(n);
      setMsg({ ok: true, text: `${item.name} is yours.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not buy that." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-x-hidden text-[#efe6d2]" data-legendary-store>
      <SeasonBackdrop season={season} dim />
      <div className="relative z-10 mx-auto flex max-w-[1400px] flex-col gap-4 px-3 pb-6 pt-3 sm:px-5">
        <header className="flex items-center justify-between gap-3">
          <Link to="/" className="mcl-chip gap-2" data-store-back>
            <ArrowLeft className="size-4" /> Lounge
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/boards" className="mcl-chip hidden sm:inline-flex">My boards</Link>
            <Link to="/avatar" className="mcl-chip hidden sm:inline-flex">My AV king</Link>
            <span className="mcl-chip gap-2" data-store-coins>
              <Coin /> <b className="tabular-nums">{coins == null ? "…" : coins.toLocaleString()}</b>
            </span>
          </div>
        </header>
        <div className="relative text-center">
          <h1 className="mcl-title inline-flex items-center gap-4 text-[clamp(28px,5vw,58px)] leading-none">
            <span className="mcl-flourish" aria-hidden />
            Legendary Store
            <span className="mcl-flourish is-right" aria-hidden />
          </h1>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row">
          <aside className="flex shrink-0 flex-col gap-3 lg:w-56">
            <nav className="mcl-panel rounded-xl p-2" aria-label="Browse">
              <p className="mcl-label px-3 pb-1 pt-2">Browse</p>
              <div className="flex gap-1 overflow-x-auto lg:flex-col">
                {CATS.map((c) => (
                  <button key={c.id} type="button" className={cn("mcl-row shrink-0", cat === c.id && "is-on")} onClick={() => { setCat(c.id); playSfx("tap"); }} data-store-cat={c.id}>
                    <span className="grid w-5 place-items-center text-[#d9b45a]">{c.icon}</span>
                    {c.name}
                    <span className="ml-auto pl-2 text-[11px] tabular-nums text-[#8f8296]">
                      {c.id === "all" ? items.length : c.id === "exclusive" ? items.filter((i) => i.rarity === "legendary").length : items.filter((i) => i.cat === c.id).length}
                    </span>
                  </button>
                ))}
              </div>
            </nav>
            <div className="mcl-panel rounded-xl p-2">
              <p className="mcl-label px-3 pb-1 pt-2">Rarity filter</p>
              <div className="flex flex-wrap gap-1 lg:flex-col">
                {RARITY_ORDER.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={cn("mcl-row", filter.has(r) && "is-on")}
                    onClick={() =>
                      setFilter((f) => {
                        const n = new Set(f);
                        if (n.has(r)) n.delete(r);
                        else n.add(r);
                        return n;
                      })
                    }
                    aria-pressed={filter.has(r)}
                    data-rarity-filter={r}
                  >
                    <span className="size-3 rounded-full" style={{ background: RARITY[r].color, boxShadow: `0 0 8px ${RARITY[r].glow}` }} />
                    <span style={{ color: RARITY[r].color }}>{RARITY[r].name}</span>
                  </button>
                ))}
              </div>
            </div>
            <Link to="/store" search={{ classic: 1 } as never} className="hidden px-3 text-xs text-[#9f93ad] underline-offset-4 hover:underline lg:block" onClick={(e) => { e.preventDefault(); window.location.href = "/chess/store"; }}>
              Sell your own king or brick board in the classic store →
            </Link>
          </aside>

          <section className="min-w-0 flex-1">
            {msg ? (
              <p className={cn("mb-3 rounded-lg border px-3 py-2 text-sm", msg.ok ? "border-[#5bd18b]/50 bg-[#0f2a1a]/80 text-[#a9f0c4]" : "border-[#ff6b6b]/50 bg-[#2a0f12]/80 text-[#ffb3b3]")} role="status">
                {msg.text}
              </p>
            ) : null}
            {shown.length === 0 ? (
              <div className="mcl-panel grid h-64 place-items-center rounded-xl text-sm text-[#a99fb4]">
                {cat === "bundles" ? "No player bundles are listed right now." : "Nothing matches that filter."}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" data-store-grid>
                {shown.map((it) => (
                  <StoreCard key={it.key} item={it} busy={busy === it.key} score={score} coins={coins} onBuy={() => void buy(it)} />
                ))}
              </div>
            )}
          </section>
        </div>

        {featured ? (
          <section className="mcl-panel mcl-feature relative grid items-center gap-4 overflow-hidden rounded-xl p-3 sm:grid-cols-[220px_1fr_auto_auto] sm:p-4" data-board-of-week={featured.id}>
            <div className="h-28 overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_40%,#3b2a5c,#0d0716)] sm:h-32">
              <BoardThumb board={featured} />
            </div>
            <div>
              <h2 className="mcl-title text-[clamp(18px,2.4vw,28px)] leading-tight">Legendary board of the week</h2>
              <p className="font-[Cinzel] text-sm font-bold uppercase tracking-[0.3em] text-[#c17dff]">{featured.name}</p>
              <p className="mt-1 text-sm text-[#cfc3dc]">{featured.blurb}</p>
            </div>
            <div className="text-center sm:border-l sm:border-[#d9b45a]/25 sm:px-5">
              <p className="mcl-label">Time left</p>
              <p className="font-[Cinzel] text-3xl font-bold tabular-nums text-[#f6efe0]" data-week-countdown>
                {days > 0 ? `${days}d ` : ""}
                {h}:{m}:{s}
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#8f8296]">{days > 0 ? "days · hrs · min · sec" : "hrs · min · sec"}</p>
            </div>
            {featuredItem?.owned ? (
              <span className="mcl-btn mcl-btn-ghost justify-center">Owned</span>
            ) : featuredItem ? (
              <button type="button" className="mcl-btn mcl-btn-gold justify-center text-base" onClick={() => void buy(featuredItem)} disabled={busy !== null}>
                <Crown className="size-4" /> Buy · <Coin className="size-4" /> {featuredItem.price}
              </button>
            ) : null}
          </section>
        ) : null}
        <p className="text-center text-[11px] text-[#7f7489]">
          Same coins, boards and kings as Morse Chess. Board pictures are drawn from each board's real colours.
        </p>
      </div>
    </main>
  );
}

function StoreCard({ item, busy, score, coins, onBuy }: { item: Item; busy: boolean; score: number; coins: number | null; onBuy: () => void }) {
  const r = RARITY[item.rarity];
  const short = coins != null && item.price > coins;
  return (
    <article className="mcl-store-card group relative flex flex-col overflow-hidden rounded-lg" style={{ "--rc": r.color, "--rg": r.glow } as CSSProperties} data-store-item={item.key} data-rarity={item.rarity}>
      <div className="px-2.5 pt-2">
        <RarityTag rarity={item.rarity} />
      </div>
      <div className="relative h-28 overflow-hidden sm:h-32">{item.thumb}</div>
      <div className="flex flex-1 flex-col items-center px-2 pb-2.5 text-center">
        <h3 className="font-[Cinzel] text-[13px] font-bold uppercase leading-tight tracking-wide text-[#f6efe0]">{item.name}</h3>
        <p className="mt-0.5 line-clamp-2 min-h-[2.2em] text-[11px] leading-snug text-[#b7aec2]">{item.blurb}</p>
        <p className="mt-1 flex items-center gap-1 text-sm font-bold tabular-nums text-[#f2d27a]">
          {item.lockElo ? (
            <>
              <Gem className="size-3.5" /> {item.lockElo} Elo
            </>
          ) : (
            <>
              <Coin className="size-4" /> {item.price.toLocaleString()}
            </>
          )}
        </p>
        {item.owned ? (
          <span className="mcl-buy is-owned mt-1.5">Owned</span>
        ) : item.lockElo ? (
          <span className="mcl-buy is-locked mt-1.5" title={`Reach ${item.lockElo} Elo to unlock`}>
            <Lock className="size-3" /> {Math.max(0, item.lockElo - score)} Elo to go
          </span>
        ) : (
          <button type="button" className={cn("mcl-buy mt-1.5", short && "is-short")} onClick={onBuy} disabled={busy} title={short ? "Not enough coins yet" : undefined} data-buy={item.key}>
            {busy ? "…" : "Buy"}
          </button>
        )}
      </div>
      {item.rarity === "legendary" ? <CrownMark className="pointer-events-none absolute right-2 top-1.5 h-4 w-5 opacity-80" /> : null}
    </article>
  );
}
