/**
 * Morse Chess Legendary home (home-ref.png): the still season picture, the player's own AV king in
 * the middle, top bar, leaderboard, daily challenge and "playing now". The menu (Play Online,
 * Play MorseBot, Create Bot, Boards, Store, AV, Settings) sits behind a small gear at the bottom
 * centre and slides up on hover (tap on touch screens).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bot, Cpu, Eye, Globe, LayoutGrid, Mail, Settings, ShoppingCart, Swords, Users, X } from "lucide-react";
import { getAvatar } from "@/lib/server/avatar";
import { parseLoadout, type AvatarLoadout } from "@/lib/avatar/catalog";
import { claimLegendaryDaily, legendaryDaily, legendaryLobby, legendaryPhotos, type Daily, type Lobby, type PhotoInfo } from "@/lib/server/legendary";
import { activeSeason, rankFor, RANKS, type Season } from "@/lib/legendary/theme";
import { playSfx } from "@/lib/legendary/sfx";
import { openGc } from "@/components/gc-mail";
import { AvatarKing } from "@/components/legendary/avatar-king";
import { Coin, CrownMark, frameIdOf, GoldPanel, hms, PlayerAvatar, RankBadge, SeasonBackdrop, useCountdown, useMyPhoto } from "@/components/legendary/bits";
import { PhotoSetup } from "@/components/legendary/photo-setup";
import { LegendarySettings } from "@/components/legendary/settings";
import { cn } from "@/lib/utils";

export function useSeason(): Season {
  const [s, setS] = useState<Season>(() => activeSeason());
  useEffect(() => {
    const on = () => setS(activeSeason());
    window.addEventListener("mcl-season", on);
    const id = window.setInterval(on, 60_000);
    return () => {
      window.removeEventListener("mcl-season", on);
      window.clearInterval(id);
    };
  }, []);
  return s;
}

const RANK_SEEN = "mcl-rank-seen";

export function LegendaryLounge({
  userId,
  username,
  score,
  coins,
  email,
  onPlayOnline,
  onPlayBot,
  challenges,
  inboxCount,
  error,
}: {
  userId: string;
  username: string;
  score: number;
  coins: number;
  email?: string | null;
  onPlayOnline: () => void;
  onPlayBot: () => void;
  challenges: ReactNode;
  inboxCount: number;
  error?: string | null;
}) {
  const navigate = useNavigate();
  const season = useSeason();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [daily, setDaily] = useState<(Daily & { endsAt: number }) | null>(null);
  const [loadout, setLoadout] = useState<AvatarLoadout | null>(null);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState<null | "main" | "photo">(null);
  const [rankings, setRankings] = useState(false);
  const [leaderPhotos, setLeaderPhotos] = useState<Record<string, PhotoInfo>>({});
  const [claiming, setClaiming] = useState(false);
  const [purse, setPurse] = useState(coins);
  const [rankUp, setRankUp] = useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const { photo, loaded } = useMyPhoto();
  const closeTimer = useRef<number | undefined>(undefined);
  const userLetter = (email || username).match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? "M";
  const rank = rankFor(score);

  useEffect(() => setPurse(coins), [coins]);

  useEffect(() => {
    let live = true;
    void getAvatar()
      .then((row) => {
        if (live) setLoadout(parseLoadout((row as { loadout?: unknown } | null)?.loadout ?? {}));
      })
      .catch(() => live && setLoadout(parseLoadout({})));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    const pull = () =>
      legendaryLobby()
        .then((l) => {
          if (!live) return;
          setLobby(l);
          const ids = l.leaders.map((x) => x.userId);
          if (ids.length) void legendaryPhotos({ data: { ids } }).then((p) => live && setLeaderPhotos(p)).catch(() => undefined);
        })
        .catch(() => undefined);
    void pull();
    const id = window.setInterval(pull, 6000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  const pullDaily = () =>
    legendaryDaily()
      .then((d) => setDaily({ ...d, endsAt: Date.now() + d.resetsInMs }))
      .catch(() => undefined);
  useEffect(() => {
    void pullDaily();
    const id = window.setInterval(pullDaily, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Rank up: the first time this browser sees a higher tier, play the badge animation.
  useEffect(() => {
    try {
      const seen = localStorage.getItem(`${RANK_SEEN}:${username}`);
      const seenIdx = RANKS.findIndex((r) => r.id === seen);
      if (seen && seenIdx >= 0 && rank.index > seenIdx) {
        setRankUp(rank.tier.id);
        playSfx("rankup");
      }
      localStorage.setItem(`${RANK_SEEN}:${username}`, rank.tier.id);
    } catch {
      /* ignore */
    }
  }, [rank.index, rank.tier.id, username]);

  const left = useCountdown(daily?.endsAt ?? null);
  const [hh, mm, ss] = hms(left);

  async function claim() {
    if (!daily || claiming) return;
    setClaiming(true);
    try {
      const r = await claimLegendaryDaily();
      setPurse(r.coins);
      if (r.paid > 0) {
        playSfx("coin");
        window.dispatchEvent(new Event("morse-coins"));
      }
      await pullDaily();
    } catch {
      /* the box shows the real state on the next pull */
    } finally {
      setClaiming(false);
    }
  }

  function openMenu() {
    window.clearTimeout(closeTimer.current);
    if (!menu) playSfx("whoosh");
    setMenu(true);
  }
  function closeMenuSoon() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMenu(false), 260);
  }

  const items: { label: string; icon: ReactNode; act: () => void; key: string }[] = [
    { key: "online", label: "Play Online", icon: <Globe className="size-[18px]" />, act: onPlayOnline },
    { key: "bot", label: "Play MorseBot", icon: <Bot className="size-[18px]" />, act: onPlayBot },
    { key: "create", label: "Create Bot", icon: <Cpu className="size-[18px]" />, act: () => void navigate({ to: "/bot-maker" }) },
    { key: "boards", label: "Boards", icon: <LayoutGrid className="size-[18px]" />, act: () => void navigate({ to: "/boards" }) },
    { key: "store", label: "Store", icon: <ShoppingCart className="size-[18px]" />, act: () => void navigate({ to: "/store" }) },
    { key: "av", label: "AV King", icon: <Swords className="size-[18px]" />, act: () => void navigate({ to: "/avatar" }) },
    { key: "settings", label: "Settings", icon: <Settings className="size-[18px]" />, act: () => setSettings("main") },
  ];

  const leaders = lobby?.leaders ?? [];
  const firstLogin = loaded && photo && !photo.set;

  return (
    <main className="mcl-home relative h-dvh w-full overflow-hidden text-[#f4e9cf]" data-legendary-home>
      <SeasonBackdrop season={season} />

      {/* the king */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[14%] top-[12%] z-[1] mx-auto w-[min(70vw,520px)] sm:bottom-[10%]">
        {loadout ? <AvatarKing loadout={loadout} username={username} /> : null}
      </div>

      {/* top bar */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 px-3 pt-[max(0.6rem,env(safe-area-inset-top))] sm:px-5 sm:pt-4">
        <button type="button" className="flex min-w-0 items-center gap-2.5 text-left sm:gap-3" onClick={() => setSettings("photo")} data-me-card>
          <PlayerAvatar userId={userId} photo={photo} letter={photo?.letter || userLetter} size={58} frame={loadout?.frameId ?? "gold"} className="max-sm:!size-12" />
          <span className="min-w-0">
            <span className="block truncate font-[Cinzel] text-[15px] font-bold leading-tight text-[#fff3d1] sm:text-base">{username}</span>
            <span className="block whitespace-nowrap text-[12px] leading-tight text-[#d9c79c]">
              {rank.tier.name} · {score}<span className="hidden sm:inline"> Elo</span>
            </span>
            <span className="mt-1 block h-[7px] w-28 overflow-hidden rounded-full border border-black/50 bg-black/55 sm:w-36" title={rank.next ? `${rank.next.min - score} Elo to ${rank.next.name}` : "Top rank"}>
              <span className="block h-full rounded-full bg-[linear-gradient(90deg,#f7d774,#d29b2a)]" style={{ width: `${Math.round(rank.progress * 100)}%` }} />
            </span>
          </span>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link to="/store" className="mcl-chip" data-coins onClick={() => playSfx("tap")}>
            <Coin className="size-6" />
            <span className="font-[Cinzel] text-[15px] font-bold tabular-nums">{purse.toLocaleString()}</span>
            <span className="mcl-chip-plus hidden sm:grid">+</span>
          </Link>
          <span className="mcl-chip hidden md:inline-flex" data-rank-chip>
            <RankBadge score={score} size={30} />
            <span className="leading-none">
              <span className="block font-[Cinzel] text-[13px] font-bold uppercase" style={{ color: rank.tier.color }}>{rank.tier.name}</span>
              <span className="block text-[11px] text-[#d9c79c]">{lobby?.myRank ? `Rank ${lobby.myRank}` : "Ranked"}</span>
            </span>
          </span>
          <Link to="/club" className="mcl-icon-btn" aria-label="Friends and clubs" title="Chess Club" onClick={() => playSfx("tap")}>
            <Users className="size-[22px]" />
          </Link>
          <button type="button" className="mcl-icon-btn relative" aria-label="Mail and challenges" title="Mail & challenges" onClick={() => { playSfx("tap"); if (inboxCount > 0) setInboxOpen(true); else openGc(); }} data-mail>
            <Mail className="size-[22px]" />
            {inboxCount > 0 ? <span className="absolute -right-0.5 -top-0.5 grid size-[18px] place-items-center rounded-full bg-[#ff3b5c] text-[10px] font-bold text-white">{inboxCount}</span> : null}
          </button>
          <button type="button" className="mcl-icon-btn" aria-label="Settings" onClick={() => { playSfx("tap"); setSettings("main"); }} data-settings>
            <Settings className="size-[22px]" />
          </button>
        </div>
      </header>

      {error ? <p className="absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-sm text-[#ff9a9a]">{error}</p> : null}

      {/* leaderboard */}
      <GoldPanel crown title="Leaderboard" className="absolute right-3 top-[86px] z-10 hidden w-[256px] pb-3 md:block lg:right-5 lg:top-[92px] lg:w-[284px]" data-leaderboard>
        <ol className="mt-2 space-y-2 px-3">
          {leaders.length === 0 ? <li className="py-3 text-center text-xs text-[#bfae86]">Loading…</li> : null}
          {leaders.map((p) => (
            <li key={p.username} className={cn("flex items-center gap-2.5 rounded-lg border border-[#e2b84e]/25 bg-black/35 px-2 py-1.5", p.you && "border-[#f2c94c]/80 bg-[#3a2410]/50")}>
              <PlaceBadge place={p.place} />
              <PlayerAvatar userId={p.userId} photo={leaderPhotos[p.userId]} letter={p.username[0]} size={42} frame={frameIdOf(p.look)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[#fff3d1]">{p.username}</span>
                <span className="block font-[Cinzel] text-[15px] font-bold leading-tight text-[#f2d27a] tabular-nums">{p.score.toLocaleString()}</span>
              </span>
              <RankBadge score={p.score} size={24} />
            </li>
          ))}
        </ol>
        <button type="button" className="mcl-btn mcl-btn-ghost mx-3 mt-3 w-[calc(100%-1.5rem)] !min-h-9 text-[12px]" onClick={() => setRankings(true)}>
          View full rankings ›
        </button>
      </GoldPanel>

      {/* watch live */}
      {lobby?.watch ? (
        <button type="button" className="mcl-watch absolute left-1/2 top-[84px] z-20 -translate-x-1/2" onClick={() => void navigate({ to: "/watch/$gameId", params: { gameId: lobby.watch!.gameId } })} data-watch-live>
          <span className="mcl-live-dot" /> <Eye className="size-4" /> Watch live<span className="hidden sm:inline">: {lobby.watch.white} vs {lobby.watch.black}</span>
        </button>
      ) : null}

      {/* daily challenge */}
      {daily ? (
        <GoldPanel className={cn("absolute bottom-[max(4.6rem,calc(env(safe-area-inset-bottom)+4.2rem))] left-3 z-10 w-[min(92vw,300px)] p-3 transition-opacity sm:bottom-6 sm:left-5 sm:w-[320px]", menu && "max-md:pointer-events-none max-md:opacity-0")} data-daily>
          <div className="flex items-center justify-between">
            <h3 className="mcl-title text-[14px]">Daily Challenge</h3>
            <span className="font-mono text-[11px] tabular-nums text-[#cdb98c]" title="Resets at midnight (Chicago time)">
              {hh}:{mm}:{ss}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-[#e8c25a]/60 bg-[radial-gradient(circle,#4a2580,#1d0e36)]">
              <CrownMark className="h-6 w-8" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[#fff3d1]">{daily.title}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/60">
                  <span className="block h-full rounded-full bg-[linear-gradient(90deg,#f7d774,#d29b2a)] transition-[width] duration-700" style={{ width: `${(daily.progress / daily.goal) * 100}%` }} />
                </span>
                <span className="text-[12px] tabular-nums text-[#e9d9b0]">{daily.progress}/{daily.goal}</span>
              </div>
            </div>
            <div className="border-l border-[#e8c25a]/30 pl-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#cdb98c]">Reward</p>
              {daily.claimed ? (
                <p className="mt-0.5 text-[12px] font-bold text-[#7be3a0]">Claimed</p>
              ) : daily.progress >= daily.goal ? (
                <button type="button" className="mcl-btn mcl-btn-gold mt-1 !min-h-8 !px-3 text-[12px]" disabled={claiming} onClick={() => void claim()} data-daily-claim>
                  <Coin className="size-4" /> {daily.reward}
                </button>
              ) : (
                <p className="mt-0.5 inline-flex items-center gap-1 font-[Cinzel] text-[15px] font-bold text-[#f2d27a]"><Coin className="size-5" />{daily.reward}</p>
              )}
            </div>
          </div>
        </GoldPanel>
      ) : null}

      {/* playing now (real counts) */}
      {lobby ? (
        <div className="mcl-panel absolute bottom-6 right-5 z-10 hidden items-center gap-3 rounded-xl px-4 py-3 md:flex" data-playing-now>
          <svg viewBox="0 0 60 24" className="h-6 w-14 text-[#b06bff]" aria-hidden>
            <path d="M0 12h10l4-9 6 18 6-14 4 8 4-4h26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <span className="leading-tight">
            <span className="block font-[Cinzel] text-[26px] font-bold tabular-nums text-[#f6e3ff]">{lobby.online.toLocaleString()}</span>
            <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#d6b8ff]">online now · {lobby.liveGames} live {lobby.liveGames === 1 ? "game" : "games"}</span>
          </span>
          <span className="mcl-live-dot" />
        </div>
      ) : null}

      {/* the gear menu */}
      <div
        className="absolute bottom-0 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onMouseEnter={openMenu}
        onMouseLeave={closeMenuSoon}
        data-gear-menu={menu ? "open" : "closed"}
      >
        <nav className={cn("mcl-menu flex w-[min(78vw,236px)] flex-col gap-1.5", menu ? "is-open" : "")} aria-hidden={!menu}>
          {items.map((it, i) => (
            <button
              key={it.key}
              type="button"
              tabIndex={menu ? 0 : -1}
              className="mcl-menu-btn"
              style={{ transitionDelay: menu ? `${(items.length - 1 - i) * 32}ms` : "0ms" }}
              onClick={() => {
                playSfx("whoosh");
                setMenu(false);
                it.act();
              }}
              data-menu={it.key}
            >
              <span className="text-[#f2d27a]">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className={cn("mcl-gear mt-2", menu && "is-open")}
          aria-label={menu ? "Close menu" : "Open menu"}
          aria-expanded={menu}
          onClick={() => (menu ? setMenu(false) : openMenu())}
          data-gear
        >
          {menu ? <X className="size-5" /> : <Settings className="size-6" />}
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-1 left-3 z-[5] hidden text-[10px] text-white/45 lg:block">© 2026 Morse Chess Legendary · same club, same coins</p>

      {rankings ? <RankingsModal lobby={lobby} photos={leaderPhotos} onClose={() => setRankings(false)} /> : null}
      {inboxOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setInboxOpen(false)}>
          <div className="mcl-panel max-h-[80dvh] w-full max-w-xl overflow-y-auto rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="mcl-title text-xl">Challenges</h2>
              <button type="button" className="mcl-icon-btn" aria-label="Close" onClick={() => setInboxOpen(false)}><X className="size-5" /></button>
            </div>
            {challenges}
            <button type="button" className="mcl-btn mcl-btn-ghost mt-4 w-full" onClick={() => { setInboxOpen(false); openGc(); }}>Open mail</button>
          </div>
        </div>
      ) : inboxCount > 0 ? (
        <div className="absolute left-1/2 top-[124px] z-20 w-[min(92vw,520px)] -translate-x-1/2" data-incoming>
          <div className="mcl-panel rounded-xl p-3">{challenges}</div>
        </div>
      ) : null}
      {settings ? <LegendarySettings start={settings} userId={userId} letter={photo?.letter || userLetter} onClose={() => setSettings(null)} /> : null}
      {firstLogin && !settings ? <PhotoSetup letter={photo?.letter || userLetter} onDone={() => undefined} /> : null}
      {rankUp ? <RankUp tierId={rankUp} score={score} onDone={() => setRankUp(null)} /> : null}
    </main>
  );
}

function PlaceBadge({ place }: { place: number }) {
  const color = place === 1 ? "#f2c94c" : place === 2 ? "#b58cff" : "#d7a46a";
  return (
    <span className="relative grid h-9 w-8 shrink-0 place-items-center" aria-label={`Place ${place}`}>
      <svg viewBox="0 0 32 36" className="absolute inset-0 size-full" aria-hidden>
        <path d="M16 1 30 6.5v11C30 26 23.5 32 16 35 8.5 32 2 26 2 17.5v-11Z" fill="#1b0f2c" stroke={color} strokeWidth="2" />
      </svg>
      <span className="relative font-[Cinzel] text-[15px] font-bold" style={{ color }}>{place}</span>
    </span>
  );
}

function RankingsModal({ lobby, photos, onClose }: { lobby: Lobby | null; photos: Record<string, PhotoInfo>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="mcl-panel w-full max-w-md rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="mcl-title text-xl">Rankings</h2>
          <button type="button" className="mcl-icon-btn" aria-label="Close" onClick={onClose}><X className="size-5" /></button>
        </div>
        <ol className="mt-3 space-y-2">
          {(lobby?.leaders ?? []).map((p) => (
            <li key={p.username} className="mcl-row flex items-center gap-3 rounded-lg px-3 py-2">
              <PlaceBadge place={p.place} />
              <PlayerAvatar userId={p.userId} photo={photos[p.userId]} letter={p.username[0]} size={36} />
              <span className="flex-1 truncate text-sm font-semibold">{p.username}</span>
              <RankBadge score={p.score} size={24} showName />
              <span className="w-14 text-right font-[Cinzel] font-bold text-[#f2d27a] tabular-nums">{p.score}</span>
            </li>
          ))}
        </ol>
        {lobby?.myRank ? <p className="mt-4 text-center text-sm text-[#d9c79c]">You are #{lobby.myRank} of all players.</p> : null}
        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[10px] text-[#cdb98c] sm:grid-cols-7">
          {RANKS.map((r) => (
            <span key={r.id} className="flex flex-col items-center gap-1">
              <RankBadge score={r.min} size={26} />
              {r.name}
              <span className="text-[#8f80ad]">{r.min}+</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function RankUp({ tierId, score, onDone }: { tierId: string; score: number; onDone: () => void }) {
  const tier = RANKS.find((r) => r.id === tierId) ?? RANKS[0];
  useEffect(() => {
    const id = window.setTimeout(onDone, 4200);
    return () => window.clearTimeout(id);
  }, [onDone]);
  return (
    <div className="mcl-rankup fixed inset-0 z-[70] grid place-items-center bg-black/60" onClick={onDone} data-rank-up={tier.id}>
      <div className="flex flex-col items-center text-center">
        <span className="mcl-rankup-badge" style={{ filter: `drop-shadow(0 0 28px ${tier.glow})` }}>
          <RankBadge score={score} size={150} />
        </span>
        <p className="mcl-title mt-4 text-sm tracking-[0.3em]">Rank up</p>
        <p className="font-[Cinzel] text-5xl font-bold" style={{ color: tier.color }}>{tier.name}</p>
      </div>
    </div>
  );
}
