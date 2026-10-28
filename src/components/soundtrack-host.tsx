import { useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { subscribeMasterAudio } from "@/lib/master-audio";
import { stopSoundtrack, subscribeSoundtrack, syncSoundtrack, unlockSoundtrack } from "@/lib/soundtrack";

export function SoundtrackHost() {
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    if (isPending) return;
    if (!user) {
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
    const offMaster = subscribeMasterAudio(play);
    return () => {
      window.removeEventListener("pointerdown", kick);
      off();
      offMaster();
    };
  }, [user, isPending]);

  return null;
}
