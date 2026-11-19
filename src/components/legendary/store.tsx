/**
 * Morse Chess Legendary store (store-ref.png): browse panel, rarity filter, rarity-bordered cards
 * and a "Legendary board of the week" banner. Everything sold here is the real Morse Chess catalog,
 * bought with the same RPCs as the classic site (buyBoard, buyGear, buyMarketListing).
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, LayoutGrid, Lock, Package, Search, Shield, Sparkles } from "lucide-react";
import { asset } from "@/lib/base";
import { BOARD_CATALOG, boardUnlocked, type BoardSkin } from "@/lib/chess/board-skins";
import { CHARACTERS, CROWNS, FINISHES, FRAMES, MOUNTS, SWORDS, ATTACKS, type GearItem } from "@/lib/avatar/catalog";
import { getHomeState, buyBoard } from "@/lib/server/mores";
import { buyGear, getAvatar } from "@/lib/server/avatar";
import { buyMarketListing, listMarket } from "@/lib/server/store";
import { useKingThumbs } from "@/components/avatar/pedestal-king";
import { RARITY, RARITY_ORDER, rarityForCoins, rarityForElo, chicagoDate, type Rarity } from "@/lib/legendary/theme";
import { playSfx } from "@/lib/legendary/sfx";
import { Coin, PlayerAvatar, SeasonBackdrop, hms, ui, useCountdown, useMyPhoto } from "@/components/legendary/bits";
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
  { id: "all", name: "All Items", icon: <LayoutGrid className="size-[1em]" /> },
  { id: "boards", name: "Boards", icon: <span className="leading-none">♟</span> },
  { id: "pieces", name: "Piece Sets", icon: <Search className="size-[1em]" /> },
  { id: "gear", name: "Frames & Gear", icon: <Shield className="size-[1em]" /> },
  { id: "bundles", name: "Bundles", icon: <Package className="size-[1em]" /> },
  { id: "exclusive", name: "Exclusive", icon: <Sparkles className="size-[1em]" /> },
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

const BOARD_ART = new Set(["walnut", "crimson", "frost", "emerald", "gilt", "cherry", "tide", "aurora", "marble", "mahogany", "ring-host", "grassland", "castle", "rocco", "sky-arena", "lego-universe", "classic", "parlor"]);
const GEAR_ART = new Set(["devil", "talwar", "rook", "halo", "royal-crown", "dog", "chop", "whirl", "leap", "fireball", "thunder"]);
const storeArt = (name: string) => asset(`/legendary/store/${name}.webp`);

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
        thumb: BOARD_ART.has(b.id) ? <ImgThumb src={storeArt(`board-${b.id}`)} /> : <BoardThumb board={b} />,
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
          thumb: GEAR_ART.has(g.id) ? <ImgThumb src={storeArt(`gear-${g.id}`)} /> : g.portrait ? <ImgThumb src={g.portrait} /> : <GlyphThumb glyph={glyph} rarity={gearRarity(g)} />,
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

  const navs: { label: string; to: string; on?: boolean }[] = [
    { label: "Store", to: "/store", on: true },
    { label: "Play", to: "/" },
    { label: "Career", to: "/history" },
    { label: "Collection", to: "/boards" },
  ];

  return (
    <main className="mcl-store relative min-h-dvh text-[#efe6d2]" data-legendary-store>
      <div className="mcl-s-bg" aria-hidden>
        <div className="absolute inset-0 opacity-[0.16]">
          <SeasonBackdrop season={season} dim />
        </div>
      </div>
      <div className="mcl-s-stage">
        <header className="mcl-s-head">
          <Link to="/" className="mcl-s-logo" data-store-back aria-label="Back to the lounge" onClick={() => playSfx("tap")}>
            <img src={ui("logo-shield.webp")} alt="" className="mcl-s-shield" draggable={false} />
            <span className="mcl-s-word">
              <span className="mcl-s-wordtop">Morse Chess</span>
              <span className="mcl-s-wordsub">Legendary</span>
            </span>
          </Link>
          <nav className="mcl-s-nav" aria-label="Sections">
            {navs.map((n) => (
              <Link key={n.label} to={n.to} className={cn("mcl-s-navlink", n.on && "is-on")} onClick={() => playSfx("tap")}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mcl-s-right">
            <span className="mcl-s-chip" data-store-coins title="Coins">
              <Coin className="mcl-s-chipicon" />
              <b className="tabular-nums">{coins == null ? "…" : coins.toLocaleString()}</b>
              <span className="mcl-s-plus">+</span>
            </span>
            <span className="mcl-s-chip max-md:!hidden" title="Your Elo rating">
              <img src={ui("gem.webp")} alt="" className="mcl-s-chipicon" draggable={false} />
              <b className="tabular-nums">{score.toLocaleString()}</b>
              <span className="mcl-s-plus">+</span>
            </span>
            <Link to="/bell" className="mcl-s-bell max-md:!hidden" aria-label="Notifications" onClick={() => playSfx("tap")}>
              <Bell className="size-full" fill="url(#mcl-s-gold)" stroke="#8a5a12" strokeWidth={1.2} />
            </Link>
            <Link to="/avatar" className="mcl-s-me" aria-label="My AV king" onClick={() => playSfx("tap")}>
              <PlayerAvatar userId={userId} photo={photo} letter={photo?.letter || (username || "M").slice(0, 1).toUpperCase()} size={44} frame="plain" />
            </Link>
          </div>
          <svg width="0" height="0" className="absolute" aria-hidden>
            <defs>
              <linearGradient id="mcl-s-gold" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#fff0b0" />
                <stop offset=".45" stopColor="#f2c445" />
                <stop offset="1" stopColor="#b97d10" />
              </linearGradient>
            </defs>
          </svg>
        </header>

        <h1 className="mcl-s-title">
          <span className="mcl-s-orn" aria-hidden />
          <span className="mcl-s-titletext">Legendary Store</span>
          <span className="mcl-s-orn is-right" aria-hidden />
        </h1>

        <aside className="mcl-s-side">
          <nav className="mcl-s-panel mcl-s-browse" aria-label="Browse">
            <p className="mcl-s-plabel">Browse</p>
            <div className="mcl-s-rows">
              {CATS.map((c) => (
                <button key={c.id} type="button" className={cn("mcl-s-row", cat === c.id && "is-on")} onClick={() => { setCat(c.id); playSfx("tap"); }} data-store-cat={c.id}>
                  <span className="mcl-s-rowicon">{c.icon}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </nav>
          <div className="mcl-s-panel mcl-s-rarity">
            <p className="mcl-s-plabel">Rarity filter</p>
            <div className="mcl-s-rows">
              {RARITY_ORDER.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={cn("mcl-s-rrow", filter.has(r) && "is-on")}
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
                  <span className="mcl-s-dot" style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${RARITY[r].color} 45%, color-mix(in oklab, ${RARITY[r].color} 55%, black))`, boxShadow: `0 0 6px ${RARITY[r].glow}` }} />
                  <span style={{ color: r === "legendary" ? RARITY[r].color : r === "common" ? "#e8e2ea" : RARITY[r].color }}>{RARITY[r].name}</span>
                </button>
              ))}
            </div>
          </div>
          <a href="/chess/store" className="mcl-s-sell">Sell your own king or brick board →</a>
        </aside>

        <section className="mcl-s-grid-wrap">
          {msg ? (
            <p className={cn("mcl-s-msg", msg.ok ? "is-ok" : "is-bad")} role="status">
              {msg.text}
            </p>
          ) : null}
          {shown.length === 0 ? (
            <div className="mcl-s-empty">{cat === "bundles" ? "No player bundles are listed right now." : "Nothing matches that filter."}</div>
          ) : (
            <div className="mcl-s-grid" data-store-grid>
              {shown.map((it) => (
                <StoreCard key={it.key} item={it} busy={busy === it.key} score={score} coins={coins} onBuy={() => void buy(it)} />
              ))}
            </div>
          )}
        </section>

        {featured ? (
          <section className="mcl-s-week" data-board-of-week={featured.id}>
            <div className="mcl-s-weekart">
              {BOARD_ART.has(featured.id) ? <img src={storeArt(`board-${featured.id}`)} alt="" draggable={false} /> : <img src={storeArt("banner-week")} alt="" draggable={false} />}
            </div>
            <div className="mcl-s-weektext">
              <h2 className="mcl-s-weektitle">Legendary board of the week</h2>
              <p className="mcl-s-weekname">{featured.name}</p>
              <p className="mcl-s-weekblurb">This week only! {featured.blurb}</p>
            </div>
            <div className="mcl-s-weektime">
              <p className="mcl-s-weeklabel">Time left</p>
              <p className="mcl-s-clock" data-week-countdown>
                {days > 0 ? (
                  <>
                    <span>{days}d</span>
                    <i>:</i>
                  </>
                ) : null}
                <span>{days > 0 ? h : h}</span>
                <i>:</i>
                <span>{m}</span>
                <i>:</i>
                <span>{s}</span>
              </p>
              <p className="mcl-s-clocklabels">
                {days > 0 ? <span>Days</span> : null}
                <span>Hrs</span>
                <span>Min</span>
                <span>Sec</span>
              </p>
            </div>
            {featuredItem?.owned ? (
              <Link to="/boards" className="mcl-s-feature is-owned" onClick={() => playSfx("tap")}>
                Owned · Play it
              </Link>
            ) : featuredItem ? (
              <button
                type="button"
                className="mcl-s-feature"
                onClick={() => {
                  playSfx("tap");
                  setCat("all");
                  setFilter(new Set());
                  window.setTimeout(() => {
                    const el = document.querySelector<HTMLElement>(`[data-store-item="board:${featured.id}"]`);
                    if (!el) return;
                    el.scrollIntoView({ block: "center", behavior: "smooth" });
                    el.classList.remove("is-flash");
                    void el.offsetWidth;
                    el.classList.add("is-flash");
                  }, 60);
                }}
                title={`${featured.name}: ${featuredItem.price} coins`}
                data-feature-buy
              >
                <span>View Feature</span>
                <span className="mcl-s-featgem" aria-hidden />
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function StoreCard({ item, busy, score, coins, onBuy }: { item: Item; busy: boolean; score: number; coins: number | null; onBuy: () => void }) {
  const r = RARITY[item.rarity];
  const short = coins != null && item.price > coins;
  return (
    <article className="mcl-s-card" style={{ "--rc": r.color, "--rg": r.glow } as CSSProperties} data-store-item={item.key} data-rarity={item.rarity}>
      <span className="mcl-s-tag">{r.name}</span>
      <div className="mcl-s-thumb">{item.thumb}</div>
      <h3 className="mcl-s-name">{item.name}</h3>
      <p className="mcl-s-blurb">{item.blurb}</p>
      <p className="mcl-s-price">
        {item.lockElo ? (
          <>
            <img src={ui("gem.webp")} alt="" className="mcl-s-pricecoin" draggable={false} /> {item.lockElo.toLocaleString()} Elo
          </>
        ) : (
          <>
            <Coin className="mcl-s-pricecoin" /> {item.price.toLocaleString()}
          </>
        )}
      </p>
      {item.owned ? (
        <span className="mcl-s-buy is-owned">Owned</span>
      ) : item.lockElo ? (
        <span className="mcl-s-buy is-locked" title={`Reach ${item.lockElo} Elo to unlock`}>
          <Lock className="mcl-s-lock" /> {Math.max(0, item.lockElo - score)} to go
        </span>
      ) : (
        <button type="button" className={cn("mcl-s-buy", short && "is-short")} onClick={onBuy} disabled={busy} title={short ? "Not enough coins yet" : undefined} data-buy={item.key}>
          {busy ? "…" : "Buy"}
        </button>
      )}
    </article>
  );
}
