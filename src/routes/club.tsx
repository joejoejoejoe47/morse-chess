import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { Square } from "chess.js";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { NamePlate } from "@/components/avatar/name-plate";
import { SeatCircle } from "@/components/club/seat-circle";
import { ChessBoard2D } from "@/components/chess/board-2d";
import { MorseCrest } from "@/components/club-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { letterOf } from "@/lib/avatar/catalog";
import { startCallBell } from "@/lib/avatar/bell-tone";
import { BOARD_CATALOG, boardById, boardUnlocked } from "@/lib/chess/board-skins";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { makeMove } from "@/lib/server/mores";
import { setPieceStyle } from "@/lib/server/avatar";
import type { Side } from "@/lib/mores-constants";
import {
  createChessClub,
  crownBracket,
  enterChessClub,
  getBracket,
  joinChessClub,
  loadChessClub,
  placeClubCall,
  pollClubCalls,
  seatBracket,
  sendClubMail,
  setClubBoard,
  setClubReady,
  startEnemyBattle,
  startOwnTournament,
  watchClubGame,
  type ClubEvent,
  type ClubMessage,
  type ClubSeat,
} from "@/lib/server/clubs";
import { cn } from "@/lib/utils";

const ChessBoard3D = lazy(() => import("@/components/chess/board-3d").then((mod) => ({ default: mod.ChessBoard3D })));

const CLUB_KEY = "morse-open-club";

export const Route = createFileRoute("/club")({ ssr: false, component: ClubDoor });

type ClubPack = Awaited<ReturnType<typeof loadChessClub>>;
type Watch = Awaited<ReturnType<typeof watchClubGame>>;

function ClubDoor() {
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return <ClubApp userId={door.user.id} />;
}

function ClubApp({ userId }: { userId: string }) {
  const [clubId, setClubId] = useState<string>(() => {
    try {
      return sessionStorage.getItem(CLUB_KEY) || "";
    } catch {
      return "";
    }
  });
  const [pack, setPack] = useState<ClubPack | null>(null);
  const [mode, setMode] = useState<"create" | "join" | "enter">("enter");

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const next = await loadChessClub({ data: { clubId } });
        if (!live) return;
        setPack(next);
        if (next.locked && clubId) {
          setClubId("");
          sessionStorage.removeItem(CLUB_KEY);
        }
      } catch {
        /* still loading */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1600);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [clubId]);

  if (!pack) return <SplashSkeleton />;
  if (!pack.club) {
    return (
      <ClubGate
        mode={mode}
        setMode={setMode}
        onOpen={(id) => {
          sessionStorage.setItem(CLUB_KEY, id);
          setClubId(id);
        }}
      />
    );
  }
  return (
    <ClubHall
      userId={userId}
      pack={pack}
      onLeave={() => {
        sessionStorage.removeItem(CLUB_KEY);
        setClubId("");
        setPack({ ...pack, club: null });
      }}
    />
  );
}

function ClubGate({
  mode,
  setMode,
  onOpen,
}: {
  mode: "create" | "join" | "enter";
  setMode: (mode: "create" | "join" | "enter") => void;
  onOpen: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      if (mode === "create") {
        const state = await createChessClub({ data: { name, password } });
        if (state.club) onOpen(state.club.id);
        return;
      }
      if (mode === "join") {
        const res = await joinChessClub({ data: { name, password } });
        setNote(
          res.already
            ? `You already belong to ${res.clubName}. Use Enter chess club.`
            : `Asking for permission to join ${res.clubName}. The host will welcome or decline you.`,
        );
        return;
      }
      const res = await enterChessClub({ data: { name, password } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.state.club) onOpen(res.state.club.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The club door stayed shut.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wood relative flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Link to="/" className="absolute left-5 top-5 text-sm text-mist hover:text-ivory">
        ← Lounge
      </Link>
      <MorseCrest className="size-[4.5rem] text-[1.75rem]" />
      <p className="mt-5 text-[13px] uppercase tracking-[0.42em] text-gold-line">Chess club</p>
      <h1 className="mt-2 font-display text-5xl text-ivory">The club door</h1>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {(
          [
            ["create", "Create chess club"],
            ["join", "Join chess club"],
            ["enter", "Enter chess club"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "min-h-11 rounded-full px-4 text-sm",
              mode === id ? "bg-ivory text-ink" : "border border-line text-mist",
            )}
            onClick={() => {
              setMode(id);
              setError(null);
              setNote(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="mt-6 w-full max-w-[26.5rem] rounded-[18px] border border-line-strong bg-panel/90 p-6"
        onSubmit={onSubmit}
      >
        <Label htmlFor="club-name">Chess club name</Label>
        <Input id="club-name" className="mt-2" value={name} onChange={(e) => setName(e.target.value)} />
        <Label htmlFor="club-pass" className="mt-4 block">
          Password
        </Label>
        <Input
          id="club-pass"
          className="mt-2"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        {note ? <p className="mt-3 text-sm text-cream">{note}</p> : null}
        <Button type="submit" variant="solid" size="lg" className="mt-4 w-full" disabled={busy}>
          {busy ? "One moment…" : mode === "create" ? "Create" : mode === "join" ? "Ask to join" : "Enter"}
        </Button>
      </form>
    </main>
  );
}

function ClubHall({ userId, pack, onLeave }: { userId: string; pack: ClubPack; onLeave: () => void }) {
  const club = pack.club!;
  const [peer, setPeer] = useState<string>("EVERY");
  const [draft, setDraft] = useState("");
  const [foe, setFoe] = useState("");
  const [showFoe, setShowFoe] = useState(false);
  const [chart, setChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bracket, setBracket] = useState<Awaited<ReturnType<typeof getBracket>> | null>(null);
  const [calls, setCalls] = useState<{ id: string; fromName: string; at: number; toId: string }[]>([]);
  const me = pack.members.find((seat) => seat.userId === userId);
  const allIn = pack.members.length >= 2 && pack.members.every((seat) => seat.online && seat.ready);
  const letters = [...pack.members].sort((a, b) => letterOf(a.username).localeCompare(letterOf(b.username)));
  const thread = pack.messages.filter((msg) =>
    peer === "EVERY"
      ? !msg.toId
      : (msg.fromId === userId && msg.toId === peer) || (msg.fromId === peer && msg.toId === userId),
  );

  useEffect(() => {
    let live = true;
    const tick = async () => {
      const rows = await pollClubCalls({ data: { clubId: club.id } }).catch(() => []);
      if (!live) return;
      setCalls(rows);
      const incoming = rows.find((row) => row.toId === userId && Date.now() - row.at < 60_000);
      if (incoming) {
        const key = `morse-call-${incoming.id}`;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          startCallBell(Math.max(4000, 60_000 - (Date.now() - incoming.at)));
        }
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1500);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [club.id, userId]);

  async function mail(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await sendClubMail({ data: { clubId: club.id, toId: peer === "EVERY" ? null : peer, body } });
  }

  const event = pack.event;
  const showTable = event && (event.phase === "live" || event.phase === "series" || event.phase === "crowned");

  return (
    <main className="relative min-h-dvh bg-ink text-ivory">
      <div className="check-wash pointer-events-none absolute inset-0" />
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold-line">{club.youHost ? "Host" : "Member"}</p>
          <h1 className="font-display text-3xl">{club.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => setChart((v) => !v)}>
            Tournament countdown
          </Button>
          <Button variant="ghost" onClick={onLeave}>
            Leave the room
          </Button>
          <Link to="/" className="grid min-h-11 place-items-center px-3 text-sm text-mist">
            Lounge
          </Link>
        </div>
      </header>
      {error ? <p className="relative px-4 text-sm text-danger">{error}</p> : null}
      {chart ? (
        <Bracket
          clubId={club.id}
          onClose={() => setChart(false)}
          bracket={bracket}
          setBracket={setBracket}
          canCrown={Boolean(event && event.phase === "crowned")}
        />
      ) : null}
      <div className="relative grid min-h-[calc(100dvh-5.5rem)] gap-3 px-3 pb-4 lg:grid-cols-[320px_minmax(0,1fr)_280px]">
        <aside className="felt-inset flex min-h-80 overflow-hidden rounded-2xl border border-line">
          <div className="flex max-h-[78vh] flex-col gap-2 overflow-y-auto border-r border-line p-2">
            <Letter on={peer === "EVERY"} label="EVERY" onClick={() => setPeer("EVERY")} />
            {letters.map((seat) => (
              <Letter
                key={seat.userId}
                on={peer === seat.userId}
                label={letterOf(seat.username)}
                title={seat.username}
                onClick={() => setPeer(seat.userId)}
              />
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-mist">
                {peer === "EVERY" ? "Everyone" : letters.find((seat) => seat.userId === peer)?.username}
              </p>
              {thread.map((msg) => (
                <Mail key={msg.id} msg={msg} mine={msg.fromId === userId} />
              ))}
            </div>
            <form className="border-t border-line p-2" onSubmit={mail}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={peer === "EVERY" ? "Tell the whole club…" : "Private note…"}
                className="w-full rounded-lg border border-line bg-ink px-3 py-3 text-sm outline-none"
              />
            </form>
            {peer !== "EVERY" ? (
              <button
                type="button"
                className="m-2 min-h-11 rounded-full bg-forest text-sm"
                onClick={() => void placeClubCall({ data: { clubId: club.id, toId: peer } })}
              >
                Call
              </button>
            ) : null}
          </div>
        </aside>
        <section className="relative min-h-[70vh] overflow-hidden rounded-2xl border border-line bg-[#12100e]">
          {showTable && event ? (
            <ClubTable userId={userId} event={event} members={pack.members} />
          ) : (
            <>
              <div className="absolute inset-6">
                <ChessBoard2D
                  fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                  you="w"
                  lastMove={null}
                  myTurn={false}
                  disabled
                  onMove={() => undefined}
                  skin={boardById(club.boardId)}
                />
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-end justify-between gap-2">
                <p className="rounded-full bg-ink/80 px-3 py-2 text-xs text-mist">Club board · {boardById(club.boardId).name}</p>
                {club.youHost ? (
                  <label className="text-xs text-mist">
                    Host board
                    <select
                      className="ml-2 rounded-full border border-line bg-ink px-3 py-2 text-ivory"
                      value={club.boardId}
                      onChange={(e) => void setClubBoard({ data: { clubId: club.id, boardId: e.target.value } })}
                    >
                      {BOARD_CATALOG.filter((board) =>
                        boardUnlocked(pack.score, board, pack.username, pack.ownedBoards),
                      ).map((board) => (
                        <option key={board.id} value={board.id}>
                          {board.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </>
          )}
        </section>
        <aside className="felt-inset rounded-2xl border border-line p-3">
          <h2 className="font-display text-2xl">Online</h2>
          <ul className="mt-3 space-y-2">
            {pack.members.map((seat) => (
              <li key={seat.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className={seat.online ? "text-ivory" : "text-mist"}>
                  {seat.username}
                  {seat.host ? " · host" : ""}
                </span>
                <button
                  type="button"
                  disabled={seat.userId !== userId}
                  aria-pressed={seat.ready}
                  className={cn(
                    "grid size-9 place-items-center rounded-md border",
                    seat.ready ? "border-gold-line bg-forest text-ivory" : "border-line text-mist",
                  )}
                  onClick={() => void setClubReady({ data: { clubId: club.id, ready: !me?.ready } })}
                >
                  {seat.ready ? "✓" : ""}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-1">
            <Button
              variant="solid"
              disabled={!allIn}
              className="min-h-12 whitespace-normal text-center leading-tight"
              onClick={() => {
                setError(null);
                void startOwnTournament({ data: { clubId: club.id } }).catch((err) =>
                  setError(err instanceof Error ? err.message : "The tournament did not start."),
                );
              }}
            >
              Play your own team in a tournament
            </Button>
            <Button
              variant="secondary"
              disabled={!allIn}
              className="min-h-12 whitespace-normal text-center leading-tight"
              onClick={() => setShowFoe((v) => !v)}
            >
              Battle an enemy chess club
            </Button>
            {showFoe ? (
              <form
                className="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  void startEnemyBattle({ data: { clubId: club.id, foeName: foe } }).catch((err) =>
                    setError(err instanceof Error ? err.message : "The enemy did not answer."),
                  );
                }}
              >
                <Input value={foe} onChange={(e) => setFoe(e.target.value)} placeholder="Enemy club name" />
                <Button type="submit" variant="solid">
                  Send the challenge
                </Button>
              </form>
            ) : null}
            {!allIn ? (
              <p className="text-xs text-mist">Both buttons open when every member is online and checked.</p>
            ) : null}
          </div>
          {calls[0] ? (
            <div className="mt-4 rounded-xl border border-gold-line p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-gold-line">Call</p>
              <p className="mt-1 text-sm">{calls[0].fromName} is ringing. The bell cannot be turned off.</p>
              <SeatCircle
                room={`call${calls[0].id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 56)}`}
                selfId={userId}
                name={me?.username || "seat"}
                seats={pack.members
                  .filter((seat) => seat.userId === calls[0].toId || seat.userId === userId)
                  .map((seat) => ({ userId: seat.userId, username: seat.username, look: seat.look }))}
              />
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function Letter({
  label,
  on,
  onClick,
  title,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  title?: string;
}) {
  const every = label === "EVERY";
  return (
    <button
      type="button"
      title={title || label}
      onClick={onClick}
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-full border font-display leading-none",
        every ? "text-[9px] tracking-tight" : "text-sm",
        on ? "border-gold-line bg-ivory text-ink" : "border-line text-cream",
      )}
    >
      {label}
    </button>
  );
}

function Mail({ msg, mine }: { msg: ClubMessage; mine: boolean }) {
  return (
    <div className={cn("rounded-lg px-2 py-1.5", mine ? "bg-forest/40" : "bg-ink/50")}>
      <p className="text-[10px] uppercase tracking-[0.12em] text-mist">{msg.fromName}</p>
      <p className="text-sm">{msg.body}</p>
    </div>
  );
}

function ClubTable({ userId, event, members }: { userId: string; event: ClubEvent; members: ClubSeat[] }) {
  const [games, setGames] = useState<Watch[]>([]);
  const [view, setView] = useState<"2d" | "3d" | "an">(() => {
    try {
      const saved = localStorage.getItem("morse-board-view");
      return saved === "2d" || saved === "an" ? saved : "3d";
    } catch {
      return "3d";
    }
  });
  const [left, setLeft] = useState(0);
  const lookOf = (id: string) => members.find((seat) => seat.userId === id)?.look || "";
  const nameOf = (id: string | null) =>
    members.find((seat) => seat.userId === id)?.username ||
    event.queue.find((seat) => seat.userId === id)?.username ||
    event.home.roster.find((seat) => seat.userId === id)?.username ||
    event.foe?.roster.find((seat) => seat.userId === id)?.username ||
    "King";

  useEffect(() => {
    let live = true;
    const tick = async () => {
      const rows = await Promise.all(event.gameIds.map((id) => watchClubGame({ data: { gameId: id } })));
      if (live) setGames(rows.filter((row): row is NonNullable<Watch> => Boolean(row)));
    };
    void tick();
    const id = window.setInterval(() => void tick(), 900);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [event.gameIds]);

  useEffect(() => {
    const id = window.setInterval(() => setLeft(Math.max(0, event.deadline - Date.now())), 250);
    return () => window.clearInterval(id);
  }, [event.deadline]);

  const roster =
    event.kind === "enemy" && event.foe
      ? [
          ...event.home.roster.map((seat) => ({ ...seat, look: lookOf(seat.userId), home: true })),
          ...event.foe.roster.map((seat) => ({ ...seat, look: lookOf(seat.userId), home: false })),
        ]
      : event.queue.map((seat) => ({ ...seat, look: lookOf(seat.userId), home: true }));
  const mineHome = event.home.roster.some((seat) => seat.userId === userId) || event.kind === "internal";
  const quietIds = roster.filter((seat) => !seat.home && !mineHome ? false : seat.home !== mineHome).map((seat) => seat.userId);
  const loud = useMemo(() => {
    const ids = roster.map((seat) => seat.userId);
    const index = ids.indexOf(userId);
    if (index < 0) return null;
    return ids[(index + Math.floor(ids.length / 2)) % ids.length] ?? null;
  }, [roster, userId]);
  const crowned = event.phase === "crowned";
  const skin = boardById(event.boardId);
  const clock = `${String(Math.floor(left / 60000)).padStart(2, "0")}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <div className="relative h-full min-h-[70vh]">
      <div className="absolute inset-x-0 top-2 z-20 flex justify-center gap-2">
        {(["2d", "3d", "an"] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={cn("min-h-10 rounded-full px-3 text-xs uppercase", view === id ? "bg-ivory text-ink" : "bg-ink/70 text-mist")}
            onClick={() => {
              setView(id);
              localStorage.setItem("morse-board-view", id);
              void setPieceStyle({ data: { style: id } }).catch(() => undefined);
            }}
          >
            {id}
          </button>
        ))}
        <span className="rounded-full bg-ink/80 px-3 py-2 font-display text-xl tabular-nums">{clock}</span>
      </div>
      <div className={cn("absolute inset-0 grid gap-2 p-16", games.length > 1 && "md:grid-cols-2")}>
        {(games.length ? games : [null]).map((game, index) => (
          <WatchBoard
            key={game?.id || index}
            game={game}
            view={view}
            skinId={skin.id}
            userId={userId}
          />
        ))}
      </div>
      <SeatCircle
        room={`table${event.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 56)}`}
        selfId={userId}
        name={nameOf(userId)}
        loudId={loud}
        quietIds={event.kind === "enemy" ? quietIds : []}
        seats={roster.map((seat) => ({ userId: seat.userId, username: seat.username, look: seat.look }))}
      />
      {crowned ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-ink/75">
          <div className="text-center">
            <NamePlate name={event.winnerName || nameOf(event.winnerId)} look={lookOf(event.winnerId || "")} dance />
            <p className="mt-3 text-sm text-mist">
              {event.kind === "enemy" ? `${event.winnerName} takes the club battle.` : "The last king on the board."}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WatchBoard({
  game,
  view,
  skinId,
  userId,
}: {
  game: Watch;
  view: "2d" | "3d" | "an";
  skinId: string;
  userId: string;
}) {
  if (!game) return <div className="grid place-items-center text-mist">Setting the board…</div>;
  const you: Side = game.you === "b" ? "b" : "w";
  const myTurn = game.status === "active" && ((game.turn === "w" && game.whiteId === userId) || (game.turn === "b" && game.blackId === userId));
  const props = {
    fen: game.fen,
    you,
    lastMove: game.lastMove ? { from: game.lastMove.from, to: game.lastMove.to } : null,
    myTurn,
    disabled: !myTurn,
    skin: boardById(skinId),
    onMove: (from: Square, to: Square) => {
      void makeMove({ data: { gameId: game.id, from, to } });
    },
  };
  if (view === "2d") return <ChessBoard2D {...props} />;
  return (
    <Suspense fallback={<div className="grid place-items-center text-mist">Setting the board…</div>}>
      <ChessBoard3D
        {...props}
        people={view === "an"}
        kings={{ w: game.whiteLook, b: game.blackLook }}
      />
    </Suspense>
  );
}

function Bracket({
  clubId,
  onClose,
  bracket,
  setBracket,
  canCrown,
}: {
  clubId: string;
  onClose: () => void;
  bracket: Awaited<ReturnType<typeof getBracket>> | null;
  setBracket: (value: Awaited<ReturnType<typeof getBracket>>) => void;
  canCrown: boolean;
}) {
  useEffect(() => {
    void getBracket().then(setBracket);
  }, [setBracket]);
  const rounds = bracket?.rounds ?? [];
  return (
    <section className="relative z-20 mx-3 mb-3 rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Tournament countdown</h2>
        <button type="button" className="text-sm text-mist" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {rounds.map((round, roundIndex) => {
          const pairs: { slot: (typeof round)[number]; index: number }[][] = [];
          for (let i = 0; i < round.length; i += 2) {
            const pair = [{ slot: round[i], index: i }];
            if (round[i + 1]) pair.push({ slot: round[i + 1], index: i + 1 });
            pairs.push(pair);
          }
          return (
            <div key={roundIndex} className="flex min-w-40 flex-col justify-around gap-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-mist">
                {roundIndex === rounds.length - 1 ? "Champion" : `Round ${roundIndex + 1}`}
              </p>
              {pairs.map((pair) => (
                <div key={pair[0].index} className="flex items-center">
                  <div className="grid flex-1 gap-2">
                    {pair.map(({ slot, index }) => (
                      <button
                        key={`${roundIndex}-${index}`}
                        type="button"
                        className="min-h-14 rounded-xl border border-line px-3 py-2 text-left"
                        onClick={() => {
                          if (slot.clubId) {
                            if (canCrown && roundIndex < rounds.length - 1) {
                              void crownBracket({ data: { clubId, round: roundIndex, slot: index } }).then(setBracket);
                            }
                            return;
                          }
                          void seatBracket({ data: { clubId, round: roundIndex, slot: index } }).then(setBracket);
                        }}
                      >
                        <span className="block text-[10px] uppercase tracking-[0.14em] text-mist">
                          {roundIndex === rounds.length - 1 ? "Winner" : `Seat ${index + 1}`}
                        </span>
                        <span className="font-display text-lg text-ivory">{slot.name || "Empty seat"}</span>
                      </button>
                    ))}
                  </div>
                  {roundIndex < rounds.length - 1 ? <div className="ml-2 h-px w-4 bg-gold-line/80" /> : null}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-mist">
        The host seats this club. A winner moves into the slot that connects the pair. The same club can sit both sides only when that chart match still needs them.
      </p>
    </section>
  );
}
