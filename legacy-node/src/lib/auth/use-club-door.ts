import { useEffect, useSyncExternalStore } from "react";
import { useCurrentUserState } from "./use-current-user";
import { hasClubSession, markClubSession, subscribeClubSession } from "./club-session";

export function useClubDoor() {
  const { user, isPending } = useCurrentUserState();
  const club = useSyncExternalStore(subscribeClubSession, hasClubSession, () => false);

  useEffect(() => {
    if (user && !club) markClubSession();
  }, [user, club]);

  if (isPending) return { status: "pending" as const, user };
  if (!user) return { status: "auth" as const, user: null };
  return { status: "in" as const, user };
}
