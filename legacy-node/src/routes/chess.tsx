import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { ClubHome } from "@/components/club-home";
import { useClubDoor } from "@/lib/auth/use-club-door";

export const Route = createFileRoute("/chess")({ ssr: false, component: ChessDoor });

function ChessDoor() {
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return <ClubHome />;
}
