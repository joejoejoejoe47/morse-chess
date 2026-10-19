import { useEffect, useRef, useState } from "react";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { getHomeState, startBotGame } from "@/lib/server/mores";

/**
 * /play-now: drop a signed-in player straight onto the chess board in a real game.
 * Resumes their active game if they have one, otherwise starts a timed game
 * against MorseBot (always seated at once, unlike the matchmaking queue).
 * Used by the goblin sandbox "End". Signed out: the sign-in screen.
 */
export const Route = createFileRoute("/play-now")({ component: PlayNow });

function PlayNow() {
  const door = useClubDoor();
  const navigate = useNavigate();
  const started = useRef(false);
  const [home, setHome] = useState(false);

  useEffect(() => {
    if (door.status !== "in" || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const state = await getHomeState();
        if (!state?.profile) {
          setHome(true); // no club name yet: the club home asks for one
          return;
        }
        const gameId = state.activeGameId ?? (await startBotGame({ data: { mode: "timed", bot: "v1" } })).gameId;
        await navigate({ to: "/play/$gameId", params: { gameId }, replace: true });
      } catch {
        setHome(true);
      }
    })();
  }, [door.status, navigate]);

  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  if (home) return <Navigate to="/" />;
  return <SplashSkeleton />;
}
