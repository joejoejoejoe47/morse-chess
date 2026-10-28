import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { KnightsTour } from "@/components/games/knights-tour";
import { HordeChess } from "@/components/games/horde";
import { Breakthrough } from "@/components/games/breakthrough";
import { Apocalypse } from "@/components/games/apocalypse";

export const Route = createFileRoute("/games/$game")({
  component: GameDoor,
});

function GameDoor() {
  const { game } = Route.useParams();
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
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
