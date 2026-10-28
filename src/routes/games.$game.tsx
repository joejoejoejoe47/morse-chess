import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { KnightsTour } from "@/components/games/knights-tour";
import { HordeChess } from "@/components/games/horde";
import { Breakthrough } from "@/components/games/breakthrough";
import { Apocalypse } from "@/components/games/apocalypse";
import { getHomeState } from "@/lib/server/mores";
import { canPlayGame } from "@/lib/games/release";

export const Route = createFileRoute("/games/$game")({
  component: GameDoor,
});

function GameDoor() {
  const { game } = Route.useParams();
  const door = useClubDoor();
  // Unapproved games are COMING SOON for everyone but the owner (owner t209u).
  const [name, setName] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (door.status !== "in") return;
    let live = true;
    getHomeState()
      .then((h: { profile?: { username?: string } | null }) => { if (live) setName(h.profile?.username ?? null); })
      .catch(() => { if (live) setName(null); });
    return () => { live = false; };
  }, [door.status]);
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  if (name === undefined) return <SplashSkeleton />;
  if (!canPlayGame(game, name)) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink p-6 text-center text-ivory" data-coming-soon-page>
        <div>
          <p className="font-display text-4xl">Coming soon</p>
          <p className="mt-2 text-sm text-mist">This game is not open yet.</p>
          <Link to="/" className="mt-4 inline-block text-[#e7c56a] underline">Back to the lounge</Link>
        </div>
      </main>
    );
  }
  if (game === "knights-tour") return <KnightsTour />;
  if (game === "horde") return <HordeChess />;
  if (game === "breakthrough") return <Breakthrough />;
  if (game === "apocalypse") return <Apocalypse />;
  return (
    <main className="grid min-h-dvh place-items-center bg-ink text-ivory">
      <Link to="/">Back to the lounge</Link>
    </main>
  );
}
