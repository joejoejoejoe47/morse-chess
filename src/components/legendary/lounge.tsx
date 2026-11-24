/**
 * Morse Chess Legendary home (home-ref.png): the still season picture, the player's own AV king in
 * the middle, top bar, leaderboard, daily challenge and "playing now". The menu (Play Online,
 * Play MorseBot, Create Bot, Boards, Store, AV, Settings) sits behind a small gear at the bottom
 * centre and slides up on hover (tap on touch screens).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Eye, Settings, X } from "lucide-react";
import { getAvatar } from "@/lib/server/avatar";
import { parseLoadout, type AvatarLoadout } from "@/lib/avatar/catalog";
import { claimLegendaryDaily, legendaryDaily, legendaryLobby, legendaryPhotos, myRank as myRankRpc, type Daily, type Lobby, type MyRank, type PhotoInfo } from "@/lib/server/legendary";
import { activeSeason, rankFor, RANK_NEEDS, RANKS, tierById, type Season } from "@/lib/legendary/theme";
import { playSfx } from "@/lib/legendary/sfx";
import { openGc } from "@/components/gc-mail";
import { AvatarKing } from "@/components/legendary/avatar-king";
import { Coin, hms, PlayerAvatar, RankBadge, SeasonBackdrop, SquarePortrait, ui, useCountdown, useMyPhoto } from "@/components/legendary/bits";
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
  duel,
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
  /** Live challenges (in and out): shown over the Daily Challenge box until they run out. */
  duel?: ReactNode;
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
  const [mine, setMine] = useState<MyRank | null>(null);
  useEffect(() => {
    let live = true;
    void myRankRpc().then((r) => { if (live) setMine(r); }).catch(() => {});
    return () => { live = false; };
  }, [score]);
  const myTier = mine ? (mine.ranked ? tierById(mine.tier) : null) : rank.tier;
  const leaderTier = (p: { tier?: string | null; score: number }) => (p.tier !== undefined ? tierById(p.tier) : rankFor(p.score).tier);

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
    if (!mine?.ranked || !mine.tier) return; // earned ranks only (Ranks.php)
    try {
      const idx = RANKS.findIndex((r) => r.id === mine.tier);
      const seen = localStorage.getItem(`${RANK_SEEN}:v2:${username}`);
      const seenIdx = RANKS.findIndex((r) => r.id === seen);
      if (seen && seenIdx >= 0 && idx > seenIdx) {
        setRankUp(mine.tier);
        playSfx("rankup");
      }
      localStorage.setItem(`${RANK_SEEN}:v2:${username}`, mine.tier);
    } catch {
      /* ignore */
    }
  }, [mine?.ranked, mine?.tier, username]);

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
    if (!menu) playSfx("menu");
    setMenu(true);
  }
  function closeMenuSoon() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMenu(false), 260);
  }

  const mi = (n: string) => <img src={ui(n.includes(".") ? `mi-${n}` : `mi-${n}.webp`)} alt="" className="mcl-mi" draggable={false} />;
  const items: { label: string; icon: ReactNode; act: () => void; key: string; purple?: boolean }[] = [
    { key: "online", label: "Play Online", icon: mi("globe"), act: onPlayOnline },
    { key: "bot", label: "Play MorseBot", icon: mi("robot"), act: onPlayBot, purple: true },
    { key: "campaign", label: "Campaign", icon: mi("swords"), act: () => void navigate({ to: "/campaign" }) },
    { key: "create", label: "Create Bot", icon: mi("gear"), act: () => void navigate({ to: "/bot-maker" }), purple: true },
    { key: "history", label: "History", icon: mi("history.svg"), act: () => void navigate({ to: "/history" }), purple: true },
    { key: "boards", label: "Boards", icon: mi("boards"), act: () => void navigate({ to: "/boards" }) },
    { key: "store", label: "Store", icon: mi("cart"), act: () => void navigate({ to: "/store" }) },
    { key: "av", label: "AV King", icon: mi("swords"), act: () => void navigate({ to: "/avatar" }) },
    { key: "settings", label: "Settings", icon: mi("gear"), act: () => setSettings("main") },
  ];

  const leaders = lobby?.leaders ?? [];
  const firstLogin = loaded && photo && !photo.set;

  return (
    <main className="mcl-home relative h-dvh w-full overflow-hidden text-[#f4e9cf]" data-legendary-home>
      <SeasonBackdrop season={season} />

      {/* the king */}
      <div className="mcl-h-king pointer-events-none absolute z-[1]">
        {loadout ? <AvatarKing loadout={loadout} username={username} /> : null}
      </div>

      <GoldDefs />

      {/* top bar */}
      <header className="mcl-h-top absolute inset-x-0 top-0 z-20 flex items-start justify-between">
        <button type="button" className="mcl-h-me flex min-w-0 items-center text-left" onClick={() => setSettings("photo")} data-me-card>
          <PlayerAvatar userId={userId} photo={photo} letter={photo?.letter || userLetter} size={58} frame={loadout?.frameId ?? "gold"} className="mcl-h-meav" />
          <span className="min-w-0">
            <span className="mcl-h-name block truncate">{username}</span>
            <span className="mcl-h-level block whitespace-nowrap">
              {myTier ? myTier.name : "Unranked"} · {score.toLocaleString()} Elo
            </span>
            <span className="mcl-h-bar block" title={rank.next ? `${rank.next.min - score} Elo to ${rank.next.name}` : "Top rank"}>
              <span className="block h-full" style={{ width: `${Math.round(rank.progress * 100)}%` }} />
            </span>
          </span>
        </button>

        <div className="mcl-h-chips flex items-center">
          <Link to="/store" className="mcl-h-chip" data-coins onClick={() => playSfx("tap")} title="Coins">
            <Coin className="mcl-h-chipicon" />
            <span className="mcl-h-chipnum tabular-nums">{purse.toLocaleString()}</span>
            <span className="mcl-h-plus">+</span>
          </Link>
          <span className="mcl-h-chip max-md:!hidden" title="Your Elo rating" data-elo-chip>
            <img src={ui("gem.webp")} alt="" className="mcl-h-chipicon" draggable={false} />
            <span className="mcl-h-chipnum tabular-nums">{score.toLocaleString()}</span>
            <span className="mcl-h-chiptag">Elo</span>
          </span>
          <span className="mcl-h-rank max-md:!hidden" data-rank-chip>
            {myTier ? <RankBadge score={score} tierId={myTier.id} size={30} className="mcl-h-rankbadge" /> : <RankBadge score={0} size={30} className="mcl-h-rankbadge opacity-50 grayscale" />}
            <span className="leading-none">
              <span className="mcl-h-rankname block" style={{ color: myTier?.color ?? "#cdb98c" }}>{myTier ? myTier.name : "Unranked"}</span>
              <span className="mcl-h-ranksub block">{mine?.ranked && mine.place ? `Rank ${mine.place}` : mine && !mine.ranked ? `${mine.placementLeft} games to place` : lobby?.myRank ? `Rank ${lobby.myRank}` : "Ranked"}</span>
            </span>
          </span>
          <div className="mcl-h-icons flex items-center">
            <Link to="/history" className="mcl-h-icon max-sm:!hidden" aria-label="History" title="History" onClick={() => playSfx("tap")} data-history-link>
              <SolidHourglass />
            </Link>
            <Link to="/club" className="mcl-h-icon" aria-label="Friends and clubs" title="Chess Club" onClick={() => playSfx("tap")}>
              <SolidUsers />
            </Link>
            <button type="button" className="mcl-h-icon relative" aria-label="Mail and challenges" title="Mail & challenges" onClick={() => { playSfx("tap"); if (inboxCount > 0) setInboxOpen(true); else openGc(); }} data-mail>
              <SolidMail />
              {inboxCount > 0 ? <span className="mcl-h-dot">{inboxCount}</span> : null}
            </button>
            <button type="button" className="mcl-h-icon" aria-label="Settings" onClick={() => { playSfx("tap"); setSettings("main"); }} data-settings>
              <SolidGear />
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-sm text-[#ff9a9a]">{error}</p> : null}

      {/* leaderboard */}
      <section className="mcl-h-lb mcl-f-gold absolute z-10 hidden md:block" data-leaderboard>
        <img src={ui("crown.webp")} alt="" className="mcl-h-lbcrown" draggable={false} />
        <h3 className="mcl-h-lbtitle">Leaderboard</h3>
        <ol className="mcl-h-lbrows">
          {leaders.length === 0 ? <li className="mcl-h-lbempty">Loading…</li> : null}
          {leaders.slice(0, 3).map((p) => (
            <li key={p.username} className={cn("mcl-h-lbrow mcl-f-row", p.you && "is-you")} data-leader={p.place}>
              <span className="mcl-h-lbbadge" title={`${leaderTier(p)?.name ?? "Unranked"} rank`}>
                <img src={ui(`tier-${leaderTier(p)?.id ?? "bronze"}.webp`)} alt={`${leaderTier(p)?.name ?? "Unranked"} rank`} className={cn("mcl-h-lbemblem", !leaderTier(p) && "opacity-50 grayscale")} data-rank={leaderTier(p)?.id ?? "unranked"} draggable={false} />
              </span>
              <SquarePortrait userId={p.userId} photo={leaderPhotos[p.userId]} look={p.look} letter={p.username[0]} className="mcl-h-lbpic" />
              <span className="mcl-h-lbtext min-w-0 flex-1">
                <span className="mcl-h-lbname block truncate">{p.username}</span>
                <span className="mcl-h-lbscore block tabular-nums">{p.score.toLocaleString()}</span>
                <span className="mcl-h-lbtier block truncate" style={{ color: leaderTier(p)?.color ?? "#cdb98c" }}>{leaderTier(p)?.name ?? "Unranked"}</span>
              </span>
              <img src={ui(p.place === 1 ? "trophy.webp" : p.place === 2 ? "gem.webp" : "bronze.webp")} alt="" className="mcl-h-lbicon" draggable={false} />
            </li>
          ))}
        </ol>
        <button type="button" className="mcl-h-lbbtn mcl-f-btn" onClick={() => setRankings(true)}>
          View full rankings <span aria-hidden>›</span>
        </button>
      </section>

      {/* watch live */}
      {lobby?.watch ? (
        <button type="button" className="mcl-watch absolute left-1/2 top-[84px] z-20 -translate-x-1/2" onClick={() => void navigate({ to: "/watch/$gameId", params: { gameId: lobby.watch!.gameId } })} data-watch-live>
          <span className="mcl-live-dot" /> <Eye className="size-4" /> Watch live<span className="hidden sm:inline">: {lobby.watch.white} vs {lobby.watch.black}</span>
        </button>
      ) : null}

      {/* live challenges sit on top of the daily challenge until their timer is up */}
      {duel ? (
        <section className={cn("mcl-h-daily mcl-h-duel mcl-f-gold absolute z-10 transition-opacity", menu && "max-md:pointer-events-none max-md:opacity-0")} data-duel-slot>
          {duel}
        </section>
      ) : null}
      {/* daily challenge */}
      {daily && !duel ? (
        <section className={cn("mcl-h-daily mcl-f-gold absolute z-10 transition-opacity", menu && "max-md:pointer-events-none max-md:opacity-0")} data-daily>
          <div className="mcl-h-dhead flex items-center">
            <CalendarDays className="mcl-h-dcal" />
            <h3 className="mcl-h-dtitle">Daily Challenge</h3>
            <span className="mcl-h-dtime ml-auto tabular-nums" title="Resets at midnight (Chicago time)">
              {hh}:{mm}:{ss}
            </span>
          </div>
          <div className="mcl-h-dbody flex items-center">
            <img src={ui("daily-star.webp")} alt="" className="mcl-h-dstar" draggable={false} />
            <div className="min-w-0 flex-1">
              <p className="mcl-h-dtask truncate">{daily.title}</p>
              <div className="flex items-center">
                <span className="mcl-h-dbar">
                  <span className="block h-full transition-[width] duration-700" style={{ width: `${(daily.progress / daily.goal) * 100}%` }} />
                </span>
                <span className="mcl-h-dcount tabular-nums">{daily.progress}/{daily.goal}</span>
              </div>
            </div>
            <div className="mcl-h-dreward text-center">
              <p className="mcl-h-dlabel">Reward</p>
              {daily.claimed ? (
                <p className="mcl-h-dclaimed">Claimed</p>
              ) : daily.progress >= daily.goal ? (
                <button type="button" className="mcl-h-dclaim" disabled={claiming} onClick={() => void claim()} data-daily-claim>
                  <Coin className="mcl-h-dcoin" /> Claim {daily.reward}
                </button>
              ) : (
                <p className="mcl-h-damount inline-flex items-center"><Coin className="mcl-h-dcoin" />{daily.reward.toLocaleString()}</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* playing now (real counts) */}
      {lobby ? (
        <div className="mcl-h-online mcl-f-violet absolute z-10 hidden items-center md:flex" data-playing-now>
          <svg viewBox="0 0 64 32" className="mcl-h-wave" aria-hidden>
            <path d="M0 16h9l3-5 3 9 4-17 5 26 4-20 4 14 3-7 3 4 3-3h23" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <span className="mcl-h-onum tabular-nums">{lobby.online.toLocaleString()}</span>
          <span className="mcl-h-olabel">
            Online now
            <small>{lobby.liveGames} live {lobby.liveGames === 1 ? "game" : "games"}</small>
          </span>
          <span className="mcl-h-odot" />
        </div>
      ) : null}
      {/* the gear menu */}
      <div
        className="absolute bottom-0 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        // hover opens it for a real mouse only: a phone tap also fires a fake mouseenter, which played the sound twice
        onPointerEnter={(e) => e.pointerType === "mouse" && openMenu()}
        onPointerLeave={(e) => e.pointerType === "mouse" && closeMenuSoon()}
        data-gear-menu={menu ? "open" : "closed"}
      >
        <nav className={cn("mcl-menu flex w-[min(78vw,236px)] flex-col gap-1.5", menu ? "is-open" : "")} aria-hidden={!menu}>
          {items.map((it, i) => (
            <button
              key={it.key}
              type="button"
              tabIndex={menu ? 0 : -1}
              className={cn("mcl-menu-btn", it.purple ? "mcl-f-mpurple" : "mcl-f-mgold")}
              style={{ transitionDelay: menu ? `${(items.length - 1 - i) * 32}ms` : "0ms" }}
              onClick={() => {
                playSfx("whoosh");
                setMenu(false);
                it.act();
              }}
              data-menu={it.key}
            >
              <span className="mcl-mi-wrap">{it.icon}</span>
              <span className="mcl-mlabel" data-text={it.label}>{it.label}</span>
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

      <p className="mcl-h-copy pointer-events-none z-[5] hidden lg:block">© 2026 Morse Chess Legendary. Same club, same coins.</p>

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
      ) : inboxCount > 0 && !duel ? (
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
              <SquarePortrait userId={p.userId} photo={photos[p.userId]} look={p.look} letter={p.username[0]} className="!size-10" />
              <PlayerAvatar userId={p.userId} photo={photos[p.userId]} letter={p.username[0]} size={36} />
              <span className="flex-1 truncate text-sm font-semibold">{p.username}</span>
              <RankBadge score={p.score} tierId={p.tier} size={24} showName />
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
              <span className="text-[#8f80ad]">{RANK_NEEDS[r.id]?.elo ?? r.min}+{RANK_NEEDS[r.id]?.wins ? ` · ${RANK_NEEDS[r.id].wins}W` : ""}</span>
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

/** Shared gold gradient for the solid icons (top bar), like the mockup's cast-gold glyphs. */
function GoldDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <linearGradient id="mcl-gold-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="0.45" stopColor="#e7b450" />
          <stop offset="1" stopColor="#a8711f" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function SolidUsers() {
  return (
    <svg viewBox="0 0 32 28" className="mcl-solid" aria-hidden>
      <circle cx="11" cy="8" r="6" />
      <path d="M0 26c0-7 5-11 11-11s11 4 11 11Z" />
      <circle cx="23" cy="9" r="5" />
      <path d="M21 15.5c1-.3 1.8-.5 2.6-.5 5 0 8.4 3.6 8.4 10H24c0-3.8-1.1-7-3-9.5Z" />
    </svg>
  );
}

function SolidHourglass() {
  return (
    <svg viewBox="0 0 28 32" className="mcl-solid" aria-hidden>
      <path d="M3 1h22v4h-2c0 5-3 8-6.5 11C20 19 23 22 23 27h2v4H3v-4h2c0-5 3-8 6.5-11C8 13 5 10 5 5H3Z" />
      <path d="M9 6h10c-.4 3-2.3 5-5 7-2.7-2-4.6-4-5-7Zm5 13c2.8 2 4.6 4.3 5 7H9c.4-2.7 2.2-5 5-7Z" fill="#1a1208" opacity=".55" />
    </svg>
  );
}

function SolidMail() {
  return (
    <svg viewBox="0 0 34 26" className="mcl-solid" aria-hidden>
      <path d="M2 3h30v20H2Z" />
      <path d="M2.5 4 17 15 31.5 4" fill="none" stroke="#1a1208" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function SolidGear({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("mcl-solid", className)} aria-hidden>
      <path
        fillRule="evenodd"
        d="M13.4 1h5.2l.9 4.1c1 .3 2 .7 2.9 1.2l3.6-2.3 3.7 3.7-2.3 3.6c.5.9.9 1.9 1.2 2.9l4.1.9v5.2l-4.1.9c-.3 1-.7 2-1.2 2.9l2.3 3.6-3.7 3.7-3.6-2.3c-.9.5-1.9.9-2.9 1.2l-.9 4.1h-5.2l-.9-4.1c-1-.3-2-.7-2.9-1.2l-3.6 2.3L2.3 25.7l2.3-3.6c-.5-.9-.9-1.9-1.2-2.9L-.7 18.3v-5.2l4.1-.9c.3-1 .7-2 1.2-2.9L2.3 5.7 6 2l3.6 2.3c.9-.5 1.9-.9 2.9-1.2ZM16 10.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
        transform="translate(.35 0) scale(.98)"
      />
    </svg>
  );
}

