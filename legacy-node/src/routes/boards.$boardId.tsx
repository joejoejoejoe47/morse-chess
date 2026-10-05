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

  const [coins, setCoins] = useState(0);
  const [coinsReady, setCoinsReady] = useState(false);
  const [owned, setOwned] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void getHomeState()
      .then((next) => {
        if (!live || !next.profile) return;
        setScore(next.profile.score);
        setEquipped(next.profile.equippedBoard);
        setUsername(next.profile.username);
        setCoins(next.profile.coins);
        setOwned(next.profile.ownedBoards);
        setCoinsReady(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user]);

  if (door.status === "pending" && board.id !== "grassland") return <SplashSkeleton />;
  if (door.status === "auth" && board.id !== "grassland") return <AuthScreen />;
  return (
    <BoardLook
      boardId={board.id}
      score={score}
      username={username}
      equippedBoard={equipped}
      coins={coins}
      coinsReady={coinsReady}
      ownedBoards={owned}
      onEquipped={setEquipped}
      onPurse={(next) => {
        setCoins(next.coins);
        setOwned(next.owned);
      }}
    />
  );
}
