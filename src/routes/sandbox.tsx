import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
type Phase = "shelf" | "match" | "solo" | "table";

class HillBoundary extends Component<{ children: ReactNode; onHome: () => void }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : "The hill could not open." };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="grid min-h-dvh place-items-center bg-[#14110e] px-6 text-center text-ivory">
        <div>
          <p className="font-display text-4xl">The hill stumbled</p>
          <p className="mt-3 max-w-md text-sm text-white/70">{this.state.error}</p>
          <button type="button" className="mt-5 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black" onClick={this.props.onHome}>
            Back to the shelf
          </button>
        </div>
      </main>
    );
  }
}

function SandboxPage() {
  const door = useClubDoor();
  const navigate = useNavigate();
  const [gate, setGate] = useState<Gate | null>(null);
  const [phase, setPhase] = useState<Phase>("shelf");
  const [seat, setSeat] = useState<Seat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);

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

  function home() {
    setSeat(null);
    setPhase("shelf");
  }

  if (phase === "solo" || (phase === "table" && seat && table)) {
    return (
      <HillBoundary onHome={home}>
        <CrossGame
          key={phase === "solo" ? `solo-${round}` : seat?.gameId}
          myTeam={seat?.myTeam}
          coins={seat?.coins ?? gate?.coins ?? 0}
          table={phase === "table" ? table : null}
          onHome={() => void navigate({ to: "/" })}
          onAgain={async () => {
            if (phase === "table" && seat) {
              const snap = await hillSync({ data: { gameId: seat.gameId } });
              if (snap.phase === "play") return false;
              setSeat(null);
              setPhase("match");
              return true;
            }
            setRound((n) => n + 1);
            return true;
          }}
        />
      </HillBoundary>
    );
  }

  if (phase === "match") {
    return (
      <MatchScreen
        onCancel={() => setPhase("shelf")}
        onSolo={() => {
          setSeat(null);
          setPhase("solo");
        }}
        onReady={(next) => {
          setSeat(next);
          setPhase("table");
        }}
      />
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
      setSeat(null);
      setPhase("solo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not buy Hill Cross.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-dvh bg-[#14110e] px-4 py-8 text-ivory">
      <button type="button" onClick={() => void navigate({ to: "/" })} className="text-xs uppercase tracking-[0.2em] text-white/70">
        Lounge
      </button>
      <p className="mt-4 text-xs uppercase tracking-[0.28em] text-[#f3e2a8]">Sandbox</p>
      <h1 className="mt-2 font-display text-4xl">Sandbox games</h1>
      <p className="mt-2 max-w-lg text-sm text-white/70">The shelf is free. Buy a game if you do not own it. Otherwise, play it.</p>
      {gate ? <p className="mt-3 text-sm text-[#f3e2a8]">{gate.coins.toLocaleString()} Morse coins</p> : null}
      {error ? <p className="mt-3 text-sm text-[#ffb4a8]">{error}</p> : null}
      <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-6">
        <article className="felt-inset w-[min(86vw,28rem)] shrink-0 snap-center overflow-hidden rounded-xl border border-line text-left">
          <img src={asset("/sandbox/hill-cross.jpg")} alt="" className="h-56 w-full object-cover" />
          <div className="p-4">
            <p className="font-display text-2xl">Hill Cross</p>
            <p className="mt-1 text-sm text-white/70">Four RA armies on a painted hill. Play the AI now, or wait three minutes for other players.</p>
            {gate?.owned ? (
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black" onClick={() => { setSeat(null); setPhase("solo"); }}>
                  Play
                </button>
                <button type="button" className="rounded-xl border border-white/30 px-4 py-3 text-sm text-white" onClick={() => setPhase("match")}>
                  Find players
                </button>
              </div>
            ) : (
              <button type="button" disabled={!gate || busy} onClick={() => void buy()} className="mt-4 w-full rounded-xl bg-[#e6b422] px-4 py-3 text-sm font-medium text-black disabled:opacity-60">
                {busy ? "Buying…" : "Buy for 90 Morse coins"}
              </button>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}

function MatchScreen({
  onCancel,
  onReady,
  onSolo,
}: {
  onCancel: () => void;
  onReady: (seat: Seat) => void;
  onSolo: () => void;
}) {
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
        if (snap.phase === "wait" && (snap.waitMs || 0) >= 175000) {
          const filled = await hillTable({ data: { ai: true } });
          if (!live || started) return;
          if (filled.phase === "play" && filled.gameId && filled.myTeam && filled.seats) {
            started = true;
            readyRef.current({
              gameId: filled.gameId,
              myTeam: filled.myTeam,
              seats: filled.seats,
              coins: filled.coins,
            });
            return;
          }
        }
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
    left === 0
      ? "Nobody sat down. The AI is taking the field…"
      : waiting >= 4
        ? "The cross is full."
        : waiting === 3
          ? "One army is still out in the hills."
          : waiting === 2
            ? "Two armies are on the hill. Empty seats become the AI."
            : "If nobody sits down, you play the AI.";

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
      {error ? <p className="mt-3 max-w-xs text-sm text-[#ffb4a8]">{error}</p> : null}
      <button type="button" onClick={onSolo} className="mt-6 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black">
        Play the AI now
      </button>
      <button type="button" onClick={onCancel} className="mt-4 text-sm text-white/75 underline-offset-4 hover:underline">
        Back to the shelf
      </button>
    </main>
  );
}
