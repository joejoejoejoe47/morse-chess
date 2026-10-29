import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { VariantPlay } from "@/components/variants/play";
import { getHomeState } from "@/lib/server/mores";
import { canPlayGame } from "@/lib/games/release";

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
  // Typed /variant/<id> URLs are COMING SOON too unless the game is released (owner t220u);
  // MasterGus still gets his owner preview.
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
  if (mode !== "checkmate" && mode !== "football" && mode !== "strategy") {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink text-ivory">
        <Link to="/">Back to the lounge</Link>
      </main>
    );
  }
  if (name === undefined) return <SplashSkeleton />;
  if (!canPlayGame(mode, name)) {
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
  return <VariantPlay mode={mode} versus={versus} />;
}
