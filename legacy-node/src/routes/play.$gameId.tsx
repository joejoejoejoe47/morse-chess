import { createFileRoute, Navigate } from "@tanstack/react-router";
import { GameView } from "@/components/game-view";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";

export const Route = createFileRoute("/play/$gameId")({
  ssr: false,
  component: PlayPage,
});

function PlayPage() {
  const { gameId } = Route.useParams();
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  if (!gameId) return <Navigate to="/" />;
  return <GameView gameId={gameId} />;
}
