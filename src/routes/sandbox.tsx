import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { MorseCrest } from "@/components/club-brand";
import { CrossGame, type HillTable } from "@/components/sandbox/cross-game";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { asset } from "@/lib/base";
import type { Team } from "@/lib/sandbox/cross-rules";
import { buySandbox, getSandbox, hillLeave, hillMove, hillSync, hillTable } from "@/lib/server/mores";

export const Route = createFileRoute("/sandbox")({
  component: SandboxPage,
});

type Gate = { owned: boolean; coins: number };
type Seat = { gameId: string; myTeam: Team; seats: Record<Team, string>; coins: number };

function SandboxPage() {
  const door = useClubDoor();
  const navigate = useNavigate();
  const [gate, setGate] = useState<Gate | null>(null);
  const [phase, setPhase] = useState<"gate" | "pick" | "match" | "play">("gate");
  const [seat, setSeat] = useState<Seat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (door.status !== "in") return;
    let live = true;
    void getSandbox()
      .then((next) => {
        if (live) setGate(next);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : "Could not open the sandbox.");
      });
    return () => {
      live = false;
    };
  }, [door.status]);

  const table = useMemo<HillTable | null>(() => {
    if (!seat) return null;
    return {
      gameId: seat.gameId,
      seats: seat.seats,
      pull: async () => {
        const snap = await hillSync({ data: { gameId: seat.gameId } });
        return { revision: snap.revision ?? 0, moves: snap.moves ?? [], turn: snap.turn ?? "s" };
      },
      push: async (revision, move) => hillMove({ data: { gameId: seat.gameId, revision, ...move } }),
    };
  }, [seat]);

  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;

  if (phase === "play" && seat && table) {
    return (
      <CrossGame
        key={seat.gameId}
        myTeam={seat.myTeam}
        coins={seat.coins}
        table={table}
        onHome={() => void navigate({ to: "/" })}
        onAgain={async () => {
          const snap = await hillSync({ data: { gameId: seat.gameId } });
          if (snap.phase === "play") return false;
          setSeat(null);
          setPhase("match");
          return true;
        }}
      />
    );
  }

  if (phase === "match") {
    return (
      <MatchScreen
        onCancel={() => setPhase("pick")}
        onReady={(next) => {
          setSeat(next);
          setPhase("play");
        }}
      />
    );
  }

  if (phase === "pick") {
    return (
      <main className="relative min-h-dvh bg-[#14110e] px-4 py-8 text-ivory">
        <button type="button" onClick={() => setPhase("gate")} className="text-xs uppercase tracking-[0.2em] text-white/70">
          Back
        </button>
        <h1 className="mt-4 font-display text-4xl">Sandbox games</h1>
        <p className="mt-2 max-w-lg text-sm text-white/70">Scroll the shelf. Hill Cross is the first one.</p>
        <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-6">
          <button
            type="button"
            onClick={() => setPhase("match")}
            className="w-[min(86vw,28rem)] shrink-0 snap-center overflow-hidden rounded-2xl border border-white/15 text-left"
          >
            <img src={asset("/sandbox/hill-cross.jpg")} alt="" className="h-56 w-full object-cover" />
            <div className="p-4">
              <p className="font-display text-2xl">Hill Cross</p>
              <p className="mt-1 text-sm text-white/70">Four RA armies on a painted hill. The table waits up to three minutes.</p>
            </div>
          </button>
        </div>
      </main>
    );
  }

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await buySandbox();
      if (!res.ok) {
        setError(res.error ?? "Not enough Morse coins.");
        if (typeof res.coins === "number") setGate({ owned: false, coins: res.coins });
        return;
      }
      setGate({ owned: true, coins: res.coins });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not buy the sandbox.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden text-ivory">
      <img src={asset("/sandbox/hill-cross.jpg")} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/25" />
      <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col justify-end px-5 py-10">
        <p className="text-xs uppercase tracking-[0.28em] text-white/75">Sandbox game</p>
        <h1 className="mt-2 font-display text-5xl leading-none">Hill Cross</h1>
        <p className="mt-3 text-sm text-white/80">
          A smooth hill, four armies of RA rangers, and a colosseum you build in the center square.
        </p>
        {gate ? <p className="mt-3 text-sm text-[#f3e2a8]">{gate.coins.toLocaleString()} Morse coins</p> : null}
        {error ? <p className="mt-3 text-sm text-[#ffb4a8]">{error}</p> : null}
        {gate?.owned ? (
          <button type="button" onClick={() => setPhase("pick")} className="mt-5 rounded-xl bg-white px-4 py-3 text-base font-medium text-black">
            Play
          </button>
        ) : (
          <button type="button" disabled={!gate || busy} onClick={() => void buy()} className="mt-5 rounded-xl bg-[#e6b422] px-4 py-3 text-base font-medium text-black disabled:opacity-60">
            {busy ? "Buying…" : "Buy for 90 Morse coins"}
          </button>
        )}
        <button type="button" onClick={() => void navigate({ to: "/" })} className="mt-3 text-sm text-white/75 underline-offset-4 hover:underline">
          Return to the lounge
        </button>
      </div>
    </main>
  );
}

function MatchScreen({ onCancel, onReady }: { onCancel: () => void; onReady: (seat: Seat) => void }) {
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const [waiting, setWaiting] = useState(1);
  const [waitMs, setWaitMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let started = false;
    const tick = async () => {
      try {
        const snap = await hillTable();
        if (!live || started) return;
        if (snap.phase === "play" && snap.gameId && snap.myTeam && snap.seats) {
          started = true;
          readyRef.current({
            gameId: snap.gameId,
            myTeam: snap.myTeam,
            seats: snap.seats,
            coins: snap.coins,
          });
          return;
        }
        setWaiting(snap.waiting || 1);
        setWaitMs(snap.waitMs || 0);
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : "Could not find a table.");
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1000);
    return () => {
      live = false;
      window.clearInterval(id);
      void hillLeave();
    };
  }, []);

  const left = Math.max(0, 180000 - waitMs);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const line =
    waiting >= 4 ? "The cross is full." : waiting === 3 ? "One army is still out in the hills." : waiting === 2 ? "Two armies are on the hill." : "You are the first army on the hill.";

  return (
    <main className="auth-wood relative flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <div className="relative grid size-[11.5rem] place-items-center">
        <svg className="absolute inset-0" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-gold-line/25" />
          <circle className="morse-enter-spin text-gold-line" cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="52 224" />
        </svg>
        <MorseCrest className="size-[4.5rem] text-[1.75rem]" />
      </div>
      <p className="mt-8 text-[13px] font-medium uppercase tracking-[0.42em] text-gold-line">The Morse table</p>
      <h1 className="mt-2 font-display text-4xl text-ivory">Morse Chess</h1>
      <p className="mt-3 text-base text-mist">Finding armies… {Math.min(4, waiting)} of 4</p>
      <p className="mt-1 font-display text-3xl text-ivory">
        {m}:{s.toString().padStart(2, "0")}
      </p>
      <p className="mt-2 max-w-xs text-sm text-mist">{line}</p>
      {error ? <p className="mt-3 text-sm text-[#ffb4a8]">{error}</p> : null}
      <button type="button" onClick={onCancel} className="mt-8 text-sm text-white/75 underline-offset-4 hover:underline">
        Back to the shelf
      </button>
    </main>
  );
}
