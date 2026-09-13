import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BoardLook } from "@/components/board-look";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { getHomeState } from "@/lib/server/mores";
import { boardById, DEFAULT_BOARD_ID } from "@/lib/chess/board-skins";

export const Route = createFileRoute("/boards/$boardId")({
  ssr: false,
  component: BoardLookPage,
});

function BoardLookPage() {
  const { boardId } = Route.useParams();
  const door = useClubDoor();
  const user = door.status === "in" ? door.user : null;
  const board = boardById(boardId);
  const [score, setScore] = useState(0);
  const [equipped, setEquipped] = useState(DEFAULT_BOARD_ID);
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (!user) return;
    let live = true;
    void getHomeState()
      .then((next) => {
        if (!live || !next.profile) return;
        setScore(next.profile.score);
        setEquipped(next.profile.equippedBoard);
        setUsername(next.profile.username);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user]);

  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return (
    <BoardLook
      boardId={board.id}
      score={score}
      username={username}
      equippedBoard={equipped}
      onEquipped={setEquipped}
    />
  );
}
