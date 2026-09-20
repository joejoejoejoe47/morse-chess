import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen, EnterSplash, SplashSkeleton } from "@/components/auth-screen";
import { ClubHome } from "@/components/club-home";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { consumeEnterSplash } from "@/lib/auth/club-session";

export const Route = createFileRoute("/")({ ssr: false, component: Home });

function Home() {
  const door = useClubDoor();
  const [splash, setSplash] = useState(false);

  useEffect(() => {
    if (door.status === "in" && consumeEnterSplash()) setSplash(true);
  }, [door.status]);

  if (door.status === "pending") return <EnterSplash />;
  if (door.status === "auth") return <AuthScreen />;
  if (splash) return <EnterSplash onDone={() => setSplash(false)} />;
  return <ClubHome />;
}
