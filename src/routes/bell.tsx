import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { BellDesk } from "@/components/bell-desk";
import { useClubDoor } from "@/lib/auth/use-club-door";

export const Route = createFileRoute("/bell")({ ssr: false, component: BellDoor });

function BellDoor() {
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return <BellDesk />;
}
