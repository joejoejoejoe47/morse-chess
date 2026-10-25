import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { VariantPlay } from "@/components/variants/play";

export const Route = createFileRoute("/variant/$mode")({
  component: VariantDoor,
});

function VariantDoor() {
  const { mode } = Route.useParams();
  const door = useClubDoor();
  const versus = useMemo(() => {
    try {
      return sessionStorage.getItem("morse-variant-vs") || "MorseBot";
    } catch {
      return "MorseBot";
    }
  }, []);
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  if (mode !== "checkmate" && mode !== "football" && mode !== "strategy") {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink text-ivory">
        <Link to="/">Back to the lounge</Link>
      </main>
    );
  }
  return <VariantPlay mode={mode} versus={versus} />;
}
