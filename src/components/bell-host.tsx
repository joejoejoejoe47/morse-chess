import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getChallengeInbox } from "@/lib/server/mores";
import { loadSeenIds, playChallengeSound, saveSeenIds, shouldRingFor, loadBellSettings } from "@/lib/bell";

export function BellHost() {
  const { user, isPending } = useCurrentUserState();
  const primed = useRef(false);

  useEffect(() => {
    if (isPending || !user) return;
    let live = true;
    primed.current = false;

    const tick = async () => {
      try {
        const inbox = await getChallengeInbox();
        if (!live) return;
        const seen = loadSeenIds();
        if (!primed.current) {
          inbox.forEach((c) => seen.add(c.id));
          saveSeenIds(seen);
          primed.current = true;
          return;
        }
        const settings = loadBellSettings();
        for (const card of inbox) {
          if (seen.has(card.id)) continue;
          seen.add(card.id);
          if (shouldRingFor(settings, card.fromUsername)) {
            void playChallengeSound(card.fromUsername);
            toast(`${card.fromUsername} wants to sit down and play chess.`, {
              description: card.kind === "pull" ? "Random pull-up" : "Intended pull-up",
            });
          }
        }
        saveSeenIds(seen);
      } catch {
        /* signed out or network */
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 1400);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [user, isPending]);

  return null;
}
