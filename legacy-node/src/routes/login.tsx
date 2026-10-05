import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";

export const Route = createFileRoute("/login")({ ssr: false, component: Login });

function Login() {
  const door = useClubDoor();
  if (door.status === "pending") return <SplashSkeleton />;
  return <AuthScreen />;
}
