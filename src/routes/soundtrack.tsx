import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { SoundtrackLibrary } from "@/components/soundtrack-library";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/soundtrack")({ component: SoundtrackDoor });

function SoundtrackDoor() {
  const door = useClubDoor();
  const { user } = useCurrentUserState();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  if (!user) return null;
  return <SoundtrackLibrary accountId={user.id} />;
}