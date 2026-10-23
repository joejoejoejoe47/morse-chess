import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getChallengeInbox, NAMED_CHALLENGE_MS } from "@/lib/server/mores";
import {
  loadSeenIds,
  playChallengeSound,
  saveSeenIds,
  shouldRingFor,
  loadBellSettings,
  stopBellSound,
} from "@/lib/bell";
import { listJoinRequests } from "@/lib/server/clubs";
import { tapPermissionBell } from "@/lib/avatar/bell-tone";

export function BellHost() {
  const { user, isPending } = useCurrentUserState();
  const primed = useRef(false);
  const shown = useRef(new Set<string>());

  useEffect(() => {
    stopBellSound();
    if (isPending || !user) return;
    let live = true;
    primed.current = false;
    const accountId = user.id;

    const tick = async () => {
      try {
        const inbox = (await getChallengeInbox()) as { id: string; fromUsername: string; kind: string; expiresInMs?: number | null }[];
        if (!live) return;
        const seen = loadSeenIds(accountId);
        if (!primed.current) {
          inbox.forEach((c) => seen.add(c.id));
          saveSeenIds(accountId, seen);
          primed.current = true;
          return;
        }
        // Invitation lapsed (or was answered elsewhere): take its pop-up down for the receiver.
        const liveIds = new Set(inbox.map((c) => c.id));
        for (const id of [...shown.current]) {
          if (!liveIds.has(id)) {
            toast.dismiss(id);
            shown.current.delete(id);
          }
        }
        const settings = loadBellSettings(accountId);
        for (const card of inbox) {
          if (seen.has(card.id)) continue;
          seen.add(card.id);
          if (shouldRingFor(settings, card.fromUsername)) {
            void playChallengeSound(accountId, card.fromUsername);
            const left = card.expiresInMs;
            toast(`${card.fromUsername} wants to sit down and play chess.`, {
              id: card.id,
              description:
                card.kind === "pull"
                  ? "Random pull-up"
                  : `Intended pull-up · expires at ${new Date(Date.now() + (left ?? NAMED_CHALLENGE_MS)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`,
              duration: left != null ? Math.max(1000, left) : undefined,
            });
            shown.current.add(card.id);
          }
        }
        saveSeenIds(accountId, seen);
        if (settings.clubUnmuted) {
          const asks = await listJoinRequests();
          if (!live) return;
          for (const ask of asks) {
            const key = `club-${ask.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            tapPermissionBell();
            toast(`${ask.username} wants to join ${ask.clubName}.`, { description: "Chess club permission" });
          }
          saveSeenIds(accountId, seen);
        }
      } catch {
        /* signed out or network */
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 1400);
    return () => {
      live = false;
      window.clearInterval(id);
      stopBellSound();
      shown.current.forEach((t) => toast.dismiss(t));
      shown.current.clear();
    };
  }, [user, isPending]);

  return null;
}
