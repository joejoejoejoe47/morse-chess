import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { CrossGame } from "@/components/sandbox/cross-game";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { asset } from "@/lib/base";
import { buySandbox, getSandbox } from "@/lib/server/mores";

export const Route = createFileRoute("/sandbox")({
  component: SandboxPage,
});

type Gate = { owned: boolean; coins: number };

function SandboxPage() {
  const door = useClubDoor();
  const navigate = useNavigate();
  const [gate, setGate] = useState<Gate | null>(null);
  const [phase, setPhase] = useState<"gate" | "pick" | "play">("gate");
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

  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;

  if (phase === "play") {
    return (
      <CrossGame
        key={round}
        onHome={() => void navigate({ to: "/" })}
        onAgain={() => setRound((n) => n + 1)}
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
            onClick={() => setPhase("play")}
            className="w-[min(86vw,28rem)] shrink-0 snap-center overflow-hidden rounded-2xl border border-white/15 text-left"
          >
            <img src={asset("/sandbox/hill-cross.jpg")} alt="" className="h-56 w-full object-cover" />
            <div className="p-4">
              <p className="font-display text-2xl">Hill Cross</p>
              <p className="mt-1 text-sm text-white/70">Four RA armies, one painted cross, and a colosseum that rises in the center.</p>
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
          A hilly board, four armies of RA rangers, and a colosseum you build in the center square.
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
