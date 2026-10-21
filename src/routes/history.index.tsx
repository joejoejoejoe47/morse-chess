import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { ClubBrand } from "@/components/club-brand";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { boardById } from "@/lib/chess/board-skins";
import { cachedJudgment, pickMoment, replayLine } from "@/lib/history/judge";
import { drawThumb } from "@/lib/history/thumb";
import { isSandboxGame } from "@/lib/sandbox-board";
import {
  listHistory,
  startBotGame,
  type HistoryFilter,
  type HistoryGame,
  type HistoryPage,
} from "@/lib/server/mores";
import { BOT_USERNAME } from "@/lib/mores-constants";

export const Route = createFileRoute("/history/")({
  component: HistoryPageRoute,
});

const TABS: { id: HistoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: 1, label: "1 min" },
  { id: 5, label: "5 min" },
  { id: 10, label: "10 min" },
];

function HistoryPageRoute() {
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return <HistoryGrid />;
}

function HistoryGrid() {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [games, setGames] = useState<HistoryGame[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [counts, setCounts] = useState<HistoryPage["counts"]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (before: string | null) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const page = await listHistory({ data: { minutes: filter, before, limit: 24 } });
        if (id !== reqId.current) return;
        const fresh = page.games.filter((g) => !isSandboxGame(g.id));
        setGames((old) => (before ? [...old, ...fresh] : fresh));
        setNext(page.next);
        if (page.counts) setCounts(page.counts);
      } catch (err) {
        if (id === reqId.current)
          setError(err instanceof Error ? err.message : "Could not load your games.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    setGames([]);
    setNext(null);
    void load(null);
  }, [load]);

  // Endless scroll: fetch the next page when the sentinel nears the viewport.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void load(next);
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [next, loading, load]);

  return (
    <main className="min-h-dvh bg-ink pb-16 pt-[env(safe-area-inset-top)] text-ivory">
      <header
        data-coin-bar
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8"
      >
        <ClubBrand to="/" />
        <Link
          to="/"
          className="min-h-10 rounded-none border border-line px-4 py-2 text-sm text-mist hover:border-gold-line hover:text-ivory"
        >
          Lounge
        </Link>
      </header>
      <section className="mx-auto max-w-6xl px-4 sm:px-8">
        <h1 className="mt-2 font-display text-4xl tracking-[0.2em] text-ivory sm:text-5xl">
          HISTORY
        </h1>
        <p className="mt-2 max-w-xl text-sm text-mist">
          Every game you finished, newest first. Open one to watch it replayed on its board, with
          each move judged.
        </p>
        <div
          className="mt-6 flex flex-wrap gap-0 border border-line"
          role="tablist"
          aria-label="Clock"
        >
          {TABS.map((t) => {
            const on = filter === t.id;
            const n = counts?.[String(t.id) as "all" | "1" | "5" | "10"];
            return (
              <button
                key={String(t.id)}
                type="button"
                role="tab"
                aria-selected={on}
                data-tab={String(t.id)}
                className={
                  "min-h-11 flex-1 rounded-none border-r border-line px-4 text-sm last:border-r-0 sm:flex-none sm:px-6 " +
                  (on ? "bg-walnut text-ivory" : "bg-panel/40 text-mist hover:text-ivory")
                }
                onClick={() => setFilter(t.id)}
              >
                {t.label}
                {n !== undefined ? <span className="ml-2 text-xs text-mist">{n}</span> : null}
              </button>
            );
          })}
        </div>

        {error ? <p className="mt-6 text-sm text-danger">{error}</p> : null}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {games.map((g) => (
            <GameTile key={g.id} game={g} />
          ))}
          {loading
            ? Array.from({ length: games.length ? 4 : 8 }, (_, i) => (
                <div
                  key={`s${i}`}
                  className="aspect-square animate-pulse rounded-none border border-line bg-panel/50"
                />
              ))
            : null}
        </div>
        <div ref={sentinel} />
        {!loading && games.length === 0 && !error ? <EmptyTab filter={filter} /> : null}
        {next && !loading ? (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              className="min-h-11 rounded-none border border-gold-line/60 px-6 text-sm text-ivory hover:border-gold-line"
              onClick={() => void load(next)}
            >
              Load more
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function EmptyTab({ filter }: { filter: HistoryFilter }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-8 border border-line bg-panel/40 p-6">
      <p className="text-ivory">
        {filter === "all" ? "No finished games yet." : `No ${filter}-minute games yet.`}
      </p>
      <p className="mt-1 text-sm text-mist">
        {filter === "all"
          ? "Play a game and it will show up here when it ends."
          : `Games played before History existed were all one-minute games. Start a ${filter}-minute game to fill this tab.`}
      </p>
      {filter !== "all" ? (
        <button
          type="button"
          disabled={busy}
          className="mt-4 min-h-11 rounded-none border border-gold-line/60 bg-walnut px-5 text-sm text-ivory hover:border-gold-line disabled:opacity-60"
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              const { gameId } = await startBotGame({
                data: { mode: "timed", bot: "v1", minutes: filter },
              });
              await navigate({ to: "/play/$gameId", params: { gameId } });
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Could not start a game.");
              setBusy(false);
            }
          }}
        >
          Play a {filter}-min game vs {BOT_USERNAME}
        </button>
      ) : null}
      {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
    </div>
  );
}

const RESULT_LABEL = { win: "Won", loss: "Lost", draw: "Draw" } as const;
const RESULT_TONE = { win: "bg-[#2f6b3a]", loss: "bg-[#7a2b2b]", draw: "bg-[#4b4b52]" } as const;

function GameTile({ game }: { game: HistoryGame }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        // Let the browser paint the grid first, then draw.
        const draw = () => {
          const judged = cachedJudgment(game.id);
          const ply = pickMoment(game.moves, judged);
          const { fens, played } = replayLine(game.moves.slice(0, ply));
          const last = played[played.length - 1];
          const kind = judged?.verdicts[ply - 1]?.kind;
          const mark =
            kind === "brilliant"
              ? "🔥"
              : kind === "blunder" || kind === "mistake"
                ? "❌"
                : kind === "inaccuracy"
                  ? "❓"
                  : kind
                    ? "✅"
                    : null;
          setSrc(
            drawThumb({
              key: `${game.id}:${ply}:${kind ?? ""}`,
              fen: fens[fens.length - 1],
              lastMove: last ? { from: last.from, to: last.to } : null,
              skin: boardById(game.board),
              style: game.style,
              you: game.you,
              mark,
            }),
          );
        };
        const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
          .requestIdleCallback;
        if (idle) idle(draw);
        else setTimeout(draw, 0);
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [game]);

  const date = new Date(game.createdAt);
  return (
    <Link
      ref={ref}
      to="/history/$gameId"
      params={{ gameId: game.id }}
      data-history-tile
      className="group relative block aspect-square overflow-hidden rounded-none border border-line bg-panel/60 hover:border-gold-line"
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-panel/50" />
      )}
      <span
        className={`absolute left-0 top-0 px-2 py-1 text-xs font-medium text-ivory ${RESULT_TONE[game.result]}`}
      >
        {RESULT_LABEL[game.result]}
      </span>
      <span className="absolute right-0 top-0 bg-ink/75 px-2 py-1 text-xs text-cream">
        {game.minutes ? `${game.minutes} min` : "Breeze"}
      </span>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/95 via-ink/70 to-transparent px-3 pb-2 pt-8">
        <span className="block truncate text-sm text-ivory">vs {game.opponent.username}</span>
        <span className="block text-xs text-mist">
          {date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}{" "}
          · {Math.ceil(game.moves.length / 2)} moves
        </span>
      </span>
    </Link>
  );
}
