import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BoardGallery } from "@/components/board-gallery";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { getHomeState } from "@/lib/server/mores";

export const Route = createFileRoute("/boards")({
  ssr: false,
  component: BoardsPage,
});

function BoardsPage() {
  const door = useClubDoor();
  const user = door.status === "in" ? door.user : null;
  const [home, setHome] = useState<Awaited<ReturnType<typeof getHomeState>> | null>(null);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void getHomeState()
      .then((next) => {
        if (live) setHome(next);
      })
      .catch(() => {
        if (live) setHome(null);
      });
    return () => {
      live = false;
    };
  }, [user]);

  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  if (!home?.profile) return <SplashSkeleton />;
  return (
    <BoardGallery
      score={home.profile.score}
      username={home.profile.username}
      equippedBoard={home.profile.equippedBoard}
    />
  );
}
