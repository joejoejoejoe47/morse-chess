import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { stopSoundtrack, subscribeSoundtrack, syncSoundtrack, unlockSoundtrack } from "@/lib/soundtrack";

export function SoundtrackHost() {
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    if (isPending || !user) {
      stopSoundtrack();
      return;
    }
    const accountId = user.id;
    const play = () => {
      void syncSoundtrack(accountId);
    };
    const kick = () => {
      unlockSoundtrack();
      play();
    };
    window.addEventListener("pointerdown", kick);
    play();
    const off = subscribeSoundtrack(play);
    return () => {
      window.removeEventListener("pointerdown", kick);
      off();
    };
  }, [user, isPending]);

  return null;
}
