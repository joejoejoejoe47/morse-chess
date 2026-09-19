import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getChallengeInbox } from "@/lib/server/mores";
import {
  loadSeenIds,
  playChallengeSound,
  saveSeenIds,
  shouldRingFor,
  loadBellSettings,
  stopBellSound,
} from "@/lib/bell";

export function BellHost() {
  const { user, isPending } = useCurrentUserState();
  const primed = useRef(false);

  useEffect(() => {
    stopBellSound();
    if (isPending || !user) return;
    let live = true;
    primed.current = false;
    const accountId = user.id;

    const tick = async () => {
      try {
        const inbox = await getChallengeInbox();
        if (!live) return;
        const seen = loadSeenIds(accountId);
        if (!primed.current) {
          inbox.forEach((c) => seen.add(c.id));
          saveSeenIds(accountId, seen);
          primed.current = true;
          return;
        }
        const settings = loadBellSettings(accountId);
        for (const card of inbox) {
          if (seen.has(card.id)) continue;
          seen.add(card.id);
          if (shouldRingFor(settings, card.fromUsername)) {
            void playChallengeSound(accountId, card.fromUsername);
            toast(`${card.fromUsername} wants to sit down and play chess.`, {
              description: card.kind === "pull" ? "Random pull-up" : "Intended pull-up",
            });
          }
        }
        saveSeenIds(accountId, seen);
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
    };
  }, [user, isPending]);

  return null;
}
