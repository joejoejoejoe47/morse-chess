import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { Square } from "chess.js";
import { Clock, LogOut, Send } from "lucide-react";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { NamePlate } from "@/components/avatar/name-plate";
import { RaBuy } from "@/components/avatar/ra-buy";
import { SeatCircle } from "@/components/club/seat-circle";
import { ChessBoard2D } from "@/components/chess/board-2d";
import { ChessBoard3D } from "@/components/chess/board-3d";
import { MorseCrest } from "@/components/club-brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { attackById, characterById, letterOf, parseLoadout } from "@/lib/avatar/catalog";
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
  respondJoin,
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

const CLUB_KEY = "morse-open-club";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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
  const navigate = useNavigate();
  const [clubId, setClubId] = useState<string>(() => {
    try {
      return localStorage.getItem(CLUB_KEY) || "";
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
        if (next.club) {
          localStorage.setItem(CLUB_KEY, next.club.id);
          if (next.club.id !== clubId) setClubId(next.club.id);
        }
        if (next.locked && clubId) {
          setClubId("");
          localStorage.removeItem(CLUB_KEY);
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
          localStorage.setItem(CLUB_KEY, id);
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
        void navigate({ to: "/" });
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
  const [chart, setChart] = useState(true);
  const [view, setView] = useState<"2d" | "3d" | "an">(() => {
    try {
      const saved = localStorage.getItem("morse-board-view");
      return saved === "3d" || saved === "an" ? saved : "2d";
    } catch {
      return "2d";
    }
  });
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
  const showTable = Boolean(event && (event.phase === "live" || event.phase === "series" || event.phase === "crowned"));
  const host = pack.members.find((seat) => seat.host);
  const focus = peer === "EVERY" ? null : (letters.find((seat) => seat.userId === peer) ?? null);
  const cardLook = readLook(focus?.look || pack.look);
  const cardScore = focus?.score ?? pack.score;
  const level = Math.max(1, Math.round((cardScore || 1) / 49));
  const portrait = characterById(cardLook.anId).portrait;
  const atk = attackById(cardLook.attackId).name;
  const standings = [...pack.members].sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
  const skin = boardById(showTable && event ? event.boardId : club.boardId);
  const owned = BOARD_CATALOG.filter((board) => boardUnlocked(pack.score, board, pack.username, pack.ownedBoards));

  function chooseView(next: "2d" | "3d" | "an") {
    setView(next);
    try {
      localStorage.setItem("morse-board-view", next);
    } catch {
      /* keep the choice for this visit */
    }
    void setPieceStyle({ data: { style: next } }).catch(() => undefined);
  }

  function guardAll(run: () => void) {
    if (!allIn) {
      setError("Both buttons apply only when every member is online and checked.");
      return;
    }
    setError(null);
    run();
  }

  return (
    <main className="club-room min-h-dvh text-[#f4efe6]">
      <style>{`
        .club-room { background: #0c0b09; }
        .club-shell { display: flex; flex-direction: column; gap: 12px; min-height: 100dvh; padding: 12px 14px 16px; }
        .club-card { border: 1px solid #332e26; background: #14110e; border-radius: 16px; }
        @media (min-width: 1100px) {
          .club-shell {
            display: grid;
            height: 100dvh;
            min-height: 0;
            overflow: hidden;
            grid-template-columns: 292px minmax(0, 1fr) 286px;
            grid-template-rows: auto auto minmax(0, 1fr);
            grid-template-areas:
              "head head head"
              "chart chart rail"
              "card stage rail";
          }
          .club-shell.chart-off {
            grid-template-rows: auto minmax(0, 1fr);
            grid-template-areas:
              "head head head"
              "card stage rail";
          }
          .club-head { grid-area: head; }
          .club-chart { grid-area: chart; min-height: 0; }
          .club-rail, .club-card-player, .club-stage { min-height: 0; overflow: hidden; }
          .club-rail { grid-area: rail; }
          .club-card-player { grid-area: card; }
          .club-stage { grid-area: stage; }
        }
      `}</style>
      <div className={cn("club-shell", !chart && "chart-off")}>
        <header className="club-head flex flex-wrap items-center justify-between gap-3 px-1 py-1">
          <div className="flex items-center gap-3">
            <MorseCrest className="size-10 text-[1.05rem]" />
            <span className="font-display text-[1.85rem] leading-none tracking-tight text-[#f7f1e6]">Morse Chess</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm",
                chart ? "border-[#8a7048] bg-[#241c14] text-[#f6efe2]" : "border-[#3d3428] bg-[#17140f] text-[#e7dece]",
              )}
              onClick={() => setChart((open) => !open)}
            >
              <Clock className="size-4" />
              Tournament countdown
            </button>
            <button type="button" className="inline-flex items-center gap-2 px-2 py-2 text-sm text-[#ddd4c4]" onClick={onLeave}>
              <LogOut className="size-4" />
              Leave the room
            </button>
            <Link to="/" className="inline-flex items-center gap-2 px-2 py-2 text-sm text-[#ddd4c4]">
              Lounge
            </Link>
          </div>
          {error ? <p className="basis-full text-sm text-danger">{error}</p> : null}
        </header>

        {chart ? (
          <section className="club-chart club-card min-w-0 overflow-hidden px-4 py-3">
            <h2 className="font-display text-[1.45rem] leading-none text-[#f4ecdf]">Tournament Countdown</h2>
            <div className="mt-3 overflow-x-auto pb-1">
              <Bracket clubId={club.id} bracket={bracket} setBracket={setBracket} canCrown={Boolean(event && event.phase === "crowned")} />
            </div>
          </section>
        ) : null}

        <aside className="club-rail club-card flex h-full min-h-0 flex-col overflow-y-auto p-3">
          <h2 className="font-display text-[1.65rem] leading-none">Online</h2>
          {host ? (
            <div className="mt-3 flex items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", host.online ? "bg-[#3ddc84]" : "bg-[#5c564c]")} />
              <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => setPeer(host.userId)}>
                {host.username}-host
              </button>
              <ReadyMark
                on={host.ready}
                disabled={host.userId !== userId}
                onClick={() => void setClubReady({ data: { clubId: club.id, ready: !me?.ready } })}
              />
            </div>
          ) : null}
          <button
            type="button"
            className="mt-3 w-full rounded-lg bg-[#6d4c32] px-3 py-2 text-sm text-[#f8f1e6] hover:bg-[#7d5940]"
            onClick={() =>
              guardAll(() => {
                void startOwnTournament({ data: { clubId: club.id } }).catch((err) =>
                  setError(err instanceof Error ? err.message : "The tournament did not start."),
                );
              })
            }
          >
            Challenge this host
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-lg bg-[#6a4a32] px-3 py-2 text-sm text-[#f8f1e6] hover:bg-[#7a563c]"
            onClick={() => guardAll(() => setShowFoe((open) => !open))}
          >
            Battle an enemy chess club
          </button>
          {showFoe && allIn ? (
            <form
              className="mt-2 grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                void startEnemyBattle({ data: { clubId: club.id, foeName: foe } }).catch((err) =>
                  setError(err instanceof Error ? err.message : "The enemy did not answer."),
                );
              }}
            >
              <Input value={foe} onChange={(e) => setFoe(e.target.value)} placeholder="Enemy club name" />
              <button type="submit" className="rounded-lg bg-[#3c3228] px-3 py-2 text-sm text-[#f4ecdf]">
                Send the challenge
              </button>
            </form>
          ) : null}
          <p className="mt-2 text-center text-[11px] leading-snug text-[#9a9082]">
            Both buttons apply only when every member is online and checked.
          </p>
          <button
            type="button"
            className="mt-2 w-full py-1 text-center text-sm text-[#d9d0c2]"
            onClick={() => setPeer((current) => (host && current === host.userId ? "EVERY" : host?.userId || "EVERY"))}
          >
            View Details
          </button>
          <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto border-t border-[#2c2822] pt-2">
            {pack.members.map((seat) => (
              <li key={seat.userId} className={cn("flex items-center gap-2 rounded-lg px-1 py-1", peer === seat.userId && "bg-[#221c16]")}>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm" onClick={() => setPeer(seat.userId)}>
                  <Face look={seat.look} letter={letterOf(seat.username)} />
                  <span className="truncate">
                    {seat.username}
                    {seat.host ? "-host" : ""}
                  </span>
                </button>
                {seat.userId === userId ? (
                  <ReadyMark on={seat.ready} onClick={() => void setClubReady({ data: { clubId: club.id, ready: !me?.ready } })} />
                ) : (
                  <span className={cn("size-2 shrink-0 rounded-full", seat.online ? "bg-[#3ddc84]" : "bg-[#5c564c]")} />
                )}
              </li>
            ))}
          </ul>
          {pack.requests.length ? (
            <div className="mt-2 space-y-1 border-t border-[#2c2822] pt-2">
              {pack.requests.map((req) => (
                <div key={req.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{req.username}</span>
                  <span className="flex gap-1">
                    <button type="button" className="rounded-full bg-[#6d4c32] px-2 py-1" onClick={() => void respondJoin({ data: { id: req.id, welcome: true } })}>
                      Welcome
                    </button>
                    <button type="button" className="rounded-full border border-[#3d3428] px-2 py-1" onClick={() => void respondJoin({ data: { id: req.id, welcome: false } })}>
                      Decline
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-3 border-t border-[#332e26] pt-3">
            <p className="font-display text-xs tracking-[0.22em] text-[#cfc4b2]">STANDINGS</p>
            <ol className="mt-2 list-none space-y-1 p-0 text-sm">
              {standings.map((seat, index) => (
                <li key={seat.userId} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-2">
                  <span className="tabular-nums text-[#8d8478]">{index + 1}</span>
                  <span className="truncate">{seat.username}</span>
                  <span className="tabular-nums text-[#e6c56a]">{seat.score}</span>
                </li>
              ))}
            </ol>
          </div>
          {calls[0] ? (
            <div className="mt-3 rounded-xl border border-[#6d5a32] p-2">
              <p className="text-xs text-[#e6d3a4]">{calls[0].fromName} is ringing.</p>
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

        <aside className="club-card-player club-card flex h-full min-h-0 flex-col overflow-hidden p-4">
          <div className="flex items-center gap-2">
            <MorseCrest className="size-8 text-sm" />
            <p className="truncate text-sm tracking-wide">{focus ? focus.username : "EVERYONE"}</p>
          </div>
          <div className="mx-auto mt-3 grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_40%_30%,#4a3828,#1a140f)]">
            {focus && portrait ? <img src={portrait} alt="" className="size-full object-cover" /> : <PersonMark />}
          </div>
          <p className="mt-3 text-center text-xs text-[#b7ad9e]">Level {level}</p>
          <p className="mt-2 text-center">
            <span className="rounded-full bg-[#3a2e1a] px-3 py-1 text-sm text-[#e6c56a]">ELO {cardScore}</span>
          </p>
          <dl className="mt-3 shrink-0 space-y-1.5 text-sm">
            {!focus ? <Stat label="Gold" value={pack.coins.toLocaleString()} mark="coin" /> : null}
            <Stat label="ATK" value={atk} mark="atk" />
            <Stat label="ELO" value={String(cardScore)} mark="elo" />
          </dl>
          <h3 className="mt-3 shrink-0 font-display text-[1.35rem]">{focus ? "Private" : "Global Chat"}</h3>
          <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
            {thread.map((msg) => (
              <Mail key={msg.id} msg={msg} mine={msg.fromId === userId} />
            ))}
          </div>
          <form className="mt-3 flex shrink-0 items-center gap-2" onSubmit={mail}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={focus ? "Private note…" : "Tell the whole club…"}
              className="min-w-0 flex-1 rounded-full border border-[#3a3228] bg-[#0e0c0a] px-3 py-2 text-sm outline-none"
            />
            <button type="submit" className="inline-flex items-center gap-1 rounded-full bg-[#6d4c32] px-3 py-2 text-sm text-[#f8f1e6]">
              <Send className="size-3.5" />
              Send
            </button>
          </form>
          {focus ? (
            <button type="button" className="mt-2 text-left text-xs text-[#cbb892]" onClick={() => void placeClubCall({ data: { clubId: club.id, toId: focus.userId } })}>
              Call {focus.username}
            </button>
          ) : null}
        </aside>

        <section
          className="club-stage relative h-full min-h-[420px] overflow-hidden rounded-2xl border border-[#332e26]"
          style={{ backgroundImage: "url(/club/marquetry.png)", backgroundSize: "cover", backgroundPosition: "center" }}
        >
          <div className="pointer-events-none absolute inset-0 bg-transparent" />
          <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 rounded-full border border-[#4a4034] bg-black/50 p-1 backdrop-blur-sm">
            {(["2d", "3d", "an"] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "min-h-8 rounded-full px-3 text-[11px] uppercase tracking-[0.14em]",
                  view === id ? "bg-[#f4efe6] text-[#1a140f]" : "text-[#cfc4b2]",
                )}
                onClick={() => chooseView(id)}
              >
                {id}
              </button>
            ))}
            <RaBuy
              active={view === "an"}
              onView={() => chooseView("an")}
              className="min-h-8 rounded-full px-3 text-[11px] uppercase tracking-[0.14em] text-[#cfc4b2]"
            />
          </div>
          {showTable && event ? (
            <ClubTable userId={userId} event={event} members={pack.members} view={view} />
          ) : (
            <div className="absolute inset-x-6 bottom-8 top-14 [container-type:size]">
              <div className="mx-auto aspect-square h-[min(100cqh,100cqw)] w-[min(100cqh,100cqw)]">
                <StageBoard
                  view={view}
                  fen={START_FEN}
                  you="w"
                  lastMove={null}
                  myTurn={false}
                  disabled
                  skin={skin}
                  kings={{ w: pack.look, b: "" }}
                  onMove={() => undefined}
                />
              </div>
            </div>
          )}
          <label className="absolute bottom-3 left-3 z-30 inline-flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-xs text-[#f4efe6] backdrop-blur-sm">
            <span className="size-2 rounded-full bg-[#8d4b28]" />
            {skin.name}
            {skin.name === "COLUSSEUM" ? "" : " Board"}
            {club.youHost && !showTable ? (
              <select
                aria-label="Host board"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={club.boardId}
                onChange={(e) => void setClubBoard({ data: { clubId: club.id, boardId: e.target.value } })}
              >
                {owned.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            ) : null}
          </label>
        </section>
      </div>
    </main>
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

function ClubTable({
  userId,
  event,
  members,
  view,
}: {
  userId: string;
  event: ClubEvent;
  members: ClubSeat[];
  view: "2d" | "3d" | "an";
}) {
  const [games, setGames] = useState<Watch[]>([]);
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
    <div className="relative h-full min-h-[420px]">
      <div className="absolute right-3 top-3 z-20">
        <span className="rounded-full border border-[#4a4034] bg-black/55 px-3 py-1 font-display text-lg tabular-nums text-[#f4efe6]">
          {clock}
        </span>
      </div>
      <div className={cn("absolute inset-0 grid place-items-center gap-2 px-4 pb-12 pt-14", games.length > 1 && "md:grid-cols-2")}>
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

function readLook(raw?: string | null) {
  if (!raw) return parseLoadout({});
  try {
    return parseLoadout(JSON.parse(raw));
  } catch {
    return parseLoadout({});
  }
}

function Face({ look, letter }: { look: string; letter: string }) {
  const portrait = characterById(readLook(look).anId).portrait;
  return portrait ? (
    <img src={portrait} alt="" className="size-8 rounded-full object-cover" />
  ) : (
    <span className="grid size-8 place-items-center rounded-full bg-[#2a221a] text-[11px] text-[#e7dece]">{letter}</span>
  );
}

function PersonMark() {
  return (
    <svg viewBox="0 0 64 64" className="size-16 text-[#cbb79a]" aria-hidden>
      <circle cx="32" cy="24" r="10" fill="currentColor" />
      <path d="M12 54c2-12 10-18 20-18s18 6 20 18" fill="currentColor" />
    </svg>
  );
}

function Stat({ label, value, mark }: { label: string; value: string; mark: "coin" | "atk" | "elo" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-[#cfc4b2]">
        <span className="grid size-5 place-items-center rounded-full bg-[#2a241c] text-[10px] text-[#e6c56a]">
          {mark === "coin" ? "●" : mark === "atk" ? "†" : "♔"}
        </span>
        {label}
      </span>
      <span className="tabular-nums text-[#f4efe6]">{value}</span>
    </div>
  );
}

function ReadyMark({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md border text-xs",
        on ? "border-[#c6a15a] bg-[#3a2e1a] text-[#e6c56a]" : "border-[#4a4034] text-transparent",
        disabled && "opacity-70",
      )}
    >
      ✓
    </button>
  );
}

function StageBoard({
  view,
  fen,
  you,
  lastMove,
  myTurn,
  disabled,
  skin,
  onMove,
  kings,
}: {
  view: "2d" | "3d" | "an";
  fen: string;
  you: Side;
  lastMove: { from: string; to: string } | null;
  myTurn: boolean;
  disabled?: boolean;
  skin: ReturnType<typeof boardById>;
  onMove: (from: Square, to: Square) => void;
  kings?: { w?: string; b?: string };
}) {
  const props = { fen, you, lastMove, myTurn, disabled, skin, onMove };
  if (view === "2d") {
    return (
      <div className="h-full w-full drop-shadow-[0_0_46px_rgba(255,176,70,0.35)]">
        <ChessBoard2D {...props} />
      </div>
    );
  }
  return (
    <div className="h-[min(58vh,520px)] w-[min(100%,520px)] overflow-hidden rounded-xl shadow-[0_0_70px_rgba(255,176,70,0.28)]">
      <Suspense fallback={<div className="grid h-full place-items-center text-sm text-[#b7ad9e]">Setting the board…</div>}>
        <ChessBoard3D {...props} people={view === "an"} kings={kings} showTip={false} />
    </Suspense>
    </div>
  );
}

type BracketPack = Awaited<ReturnType<typeof getBracket>>;

function Bracket({
  clubId,
  bracket,
  setBracket,
  canCrown,
}: {
  clubId: string;
  bracket: BracketPack | null;
  setBracket: (value: BracketPack) => void;
  canCrown: boolean;
}) {
  useEffect(() => {
    void getBracket().then(setBracket);
  }, [setBracket]);

  const blank = (count: number) => Array.from({ length: count }, () => ({ clubId: null as string | null, name: null as string | null }));
  const rounds = bracket?.rounds?.length ? bracket.rounds : [blank(8), blank(4), blank(2), blank(1)];
  const slotAt = (round: number, index: number) => rounds[round]?.[index] ?? { clubId: null, name: null };

  function onSeat(round: number, index: number) {
    const slot = slotAt(round, index);
    if (slot.clubId) {
      if (canCrown && round < rounds.length - 1) {
        void crownBracket({ data: { clubId, round, slot: index } }).then(setBracket);
      }
      return;
    }
    void seatBracket({ data: { clubId, round, slot: index } }).then(setBracket);
  }

  const outerRows = [1, 2, 5, 6];

  return (
    <div>
      <div className="mb-1 grid grid-cols-[1.15fr_16px_1fr_16px_1fr_18px_1.15fr_18px_1fr_16px_1fr_16px_1.15fr] text-center text-[11px] text-[#b7ad9e]">
        <span>Round 1</span><span /><span>Round 2</span><span /><span>Round 3</span><span /><span>Championship</span><span /><span>Round 3</span><span /><span>Round 2</span><span /><span>Round 1</span>
      </div>
      <div className="grid h-[220px] grid-cols-[1.15fr_16px_1fr_16px_1fr_18px_1.15fr_18px_1fr_16px_1fr_16px_1.15fr] grid-rows-8">
        {outerRows.map((row, index) => (
          <BracketSeat key={`l1-${index}`} col={1} row={row} round={0} index={index} name={slotAt(0, index).name} onSeat={onSeat} />
        ))}
        <BracketElbow col={2} row="1 / 3" side="left" />
        <BracketElbow col={2} row="5 / 7" side="left" />
        <BracketSeat col={3} row="1 / 3" round={1} index={0} name={slotAt(1, 0).name} onSeat={onSeat} />
        <BracketSeat col={3} row="5 / 7" round={1} index={1} name={slotAt(1, 1).name} onSeat={onSeat} />
        <BracketElbow col={4} row="1 / 7" side="left" />
        <BracketSeat col={5} row="1 / 7" round={2} index={0} name={slotAt(2, 0).name} onSeat={onSeat} />
        <BracketStem col={6} row="1 / 9" />
        <BracketSeat col={7} row="4 / 6" round={3} index={0} name={slotAt(3, 0).name} onSeat={onSeat} final />
        <BracketStem col={8} row="1 / 9" />
        <BracketSeat col={9} row="1 / 7" round={2} index={1} name={slotAt(2, 1).name} onSeat={onSeat} />
        <BracketElbow col={10} row="1 / 7" side="right" />
        <BracketSeat col={11} row="1 / 3" round={1} index={2} name={slotAt(1, 2).name} onSeat={onSeat} />
        <BracketSeat col={11} row="5 / 7" round={1} index={3} name={slotAt(1, 3).name} onSeat={onSeat} />
        <BracketElbow col={12} row="1 / 3" side="right" />
        <BracketElbow col={12} row="5 / 7" side="right" />
        {outerRows.map((row, index) => (
          <BracketSeat key={`r1-${index}`} col={13} row={row} round={0} index={index + 4} name={slotAt(0, index + 4).name} onSeat={onSeat} />
        ))}
      </div>
    </div>
  );
}

function BracketSeat({
  col,
  row,
  round,
  index,
  name,
  onSeat,
  final,
}: {
  col: number;
  row: number | string;
  round: number;
  index: number;
  name: string | null;
  onSeat: (round: number, index: number) => void;
  final?: boolean;
}) {
  return (
    <button
      type="button"
      style={{ gridColumn: col, gridRow: row }}
      className="mx-0.5 h-7 self-center overflow-hidden rounded-md border border-[#3c352c] bg-[#16140f]/95 px-2 text-left"
      onClick={() => onSeat(round, index)}
    >
      <span className="block truncate text-[12px] leading-7 text-[#efe6d6]">{name || (final ? "Championship" : "Empty")}</span>
    </button>
  );
}

function BracketElbow({ col, row, side }: { col: number; row: string; side: "left" | "right" }) {
  const edge = side === "left" ? "right-0" : "left-0";
  return (
    <div className="relative" style={{ gridColumn: col, gridRow: row }}>
      <span className={cn("absolute top-[25%] bottom-[25%] w-px bg-[#6b6256]", edge)} />
      <span className="absolute top-[25%] h-px w-full bg-[#6b6256]" />
      <span className="absolute bottom-[25%] h-px w-full bg-[#6b6256]" />
      <span className={cn("absolute top-1/2 h-px w-1/2 bg-[#6b6256]", edge)} />
    </div>
  );
}

function BracketStem({ col, row }: { col: number; row: string }) {
  return (
    <div className="relative" style={{ gridColumn: col, gridRow: row }}>
      <span className="absolute top-1/2 h-px w-full bg-[#6b6256]" />
    </div>
  );
}
