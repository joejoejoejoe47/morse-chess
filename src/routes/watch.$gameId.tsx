/**
 * Legendary "Watch live": a read-only view of a game between two of the top 3 players.
 * Polls the spectator snapshot (watchGame), which never moves the bot or touches the clocks.
 */
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Undo2 } from "lucide-react";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { watchGame, type WatchSnap } from "@/lib/server/legendary";
import { ChessBoard2D } from "@/components/chess/board-2d";
import { ChessBoard3D } from "@/components/chess/board-3d";
import { LgBarButton, LgLogo, LgMoveHistory, LgPlayerCard } from "@/components/legendary/game-chrome";
import { cn } from "@/lib/utils";
import { boardById } from "@/lib/chess/board-skins";

export const Route = createFileRoute("/watch/$gameId")({ component: WatchPage });

function WatchPage() {
  const { gameId } = Route.useParams();
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return <Spectate gameId={gameId} />;
}

function Spectate({ gameId }: { gameId: string }) {
  const [snap, setSnap] = useState<(WatchSnap & { at: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"2d" | "3d">("3d");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let live = true;
    const pull = async () => {
      try {
        const s = await watchGame({ data: { gameId } });
        if (!live) return;
        if (!s) setError("That game is gone.");
        else setSnap({ ...s, at: Date.now() });
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not open that game.");
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 1500);
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      live = false;
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, [gameId]);

  if (error && !snap) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#0b0810] px-5 text-center">
        <div>
          <p className="text-[#ff9a9a]">{error}</p>
          <Link to="/" className="mcl-btn mcl-btn-gold mt-4 inline-flex">Back to the lounge</Link>
        </div>
      </main>
    );
  }
  if (!snap) return <SplashSkeleton />;

  const active = snap.status === "active";
  const spent = active && snap.mode === "timed" ? now - snap.at : 0;
  const wClock = snap.mode === "timed" ? Math.max(0, snap.whiteClockMs - (snap.turn === "w" ? spent : 0)) : null;
  const bClock = snap.mode === "timed" ? Math.max(0, snap.blackClockMs - (snap.turn === "b" ? spent : 0)) : null;
  const props = { fen: snap.fen, you: "w" as const, lastMove: snap.lastMove, myTurn: false, onMove: () => undefined, disabled: true, skin: boardById("walnut"), appearance: "dark" as const };
  const result = snap.status === "draw" ? "Draw" : snap.winner === "w" ? `${snap.white.username} wins` : snap.winner === "b" ? `${snap.black.username} wins` : null;

  return (
    <main className="relative h-dvh overflow-hidden bg-[#0b0810]" data-watch-view>
      <div className="absolute inset-0">
        {view === "2d" ? <ChessBoard2D {...props} /> : <ChessBoard3D {...props} showTip={false} roomColor="#0b0810" kings={{ w: snap.white.look, b: snap.black.look }} />}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-2 pt-2 sm:px-4 sm:pt-3">
        <LgPlayerCard name={snap.black.username} score={snap.black.score} look={snap.black.look} clock={bClock} hot={active && snap.turn === "b"} label="Black" />
        <div className="hidden flex-col items-center sm:flex">
          <LgLogo small />
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#ff3b5c]/60 bg-black/60 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#ffb3c0]">
            {active ? <span className="mcl-live-dot" /> : null}
            <Eye className="size-3.5" /> {active ? "Watching live" : result ?? "Game over"}
          </span>
        </div>
        <LgPlayerCard name={snap.white.username} score={snap.white.score} look={snap.white.look} clock={wClock} hot={active && snap.turn === "w"} label="White" align="right" />
      </div>
      <LgMoveHistory moves={snap.moves} className="absolute bottom-16 right-3 z-10 hidden md:block" />
      <div className="absolute inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-20 flex justify-center gap-1.5">
        <Link to="/" className="mcl-bar-btn"><Undo2 className="size-3.5" /> Lounge</Link>
        <div className="mcl-bar-seg">
          {(["2d", "3d"] as const).map((m) => (
            <button key={m} type="button" className={cn(view === m && "is-on")} onClick={() => setView(m)}>{m.toUpperCase()}</button>
          ))}
        </div>
        <LgBarButton className="pointer-events-none sm:hidden">{active ? "Live" : result ?? "Over"}</LgBarButton>
      </div>
    </main>
  );
}
