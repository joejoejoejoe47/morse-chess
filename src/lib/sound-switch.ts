import { loadBellSettings, saveBellSettings, stopBellSound } from "@/lib/bell";
import { loadMasterAudio, saveMasterAudio } from "@/lib/master-audio";
import {
  loadSoundtrack,
  resumeSoundtrack,
  saveSoundtrack,
  stopSoundtrack,
  startPlaylist,
  unlockSoundtrack,
} from "@/lib/soundtrack";

/**
 * The speaker button. On: the bell and the songs both come on, and the playlist starts
 * ("Walking Down the Street In a Car" first). Off: nothing plays, whatever the bell and song mutes say.
 * Must be called from the click itself so the browser lets the song start.
 */
export function setAllSound(accountId: string, on: boolean) {
  if (!accountId) return;
  if (!on) {
    saveMasterAudio(accountId, false);
    stopSoundtrack();
    stopBellSound();
    return;
  }
  const bell = loadBellSettings(accountId);
  if (!bell.unmuted) saveBellSettings(accountId, { ...bell, unmuted: true });
  const songs = loadSoundtrack(accountId);
  resumeSoundtrack();
  unlockSoundtrack();
  if (!songs.unmuted) saveSoundtrack(accountId, { ...songs, unmuted: true });
  saveMasterAudio(accountId, true);
  void startPlaylist(accountId);
}

/**
 * The bell page and the songs page have their own mute. Turning one of them on while the
 * speaker button is off turns the speaker on for just that one (the other stays quiet).
 */
export function setChannelSound(accountId: string, channel: "bell" | "music", on: boolean) {
  if (!accountId) return;
  const master = loadMasterAudio(accountId);
  const bell = loadBellSettings(accountId);
  const songs = loadSoundtrack(accountId);
  if (channel === "bell") {
    saveBellSettings(accountId, { ...bell, unmuted: on });
    if (!on) stopBellSound();
    if (on && !master) {
      if (songs.unmuted) saveSoundtrack(accountId, { ...songs, unmuted: false });
      stopSoundtrack();
      saveMasterAudio(accountId, true);
    }
    return;
  }
  if (!on) {
    saveSoundtrack(accountId, { ...songs, unmuted: false });
    stopSoundtrack();
    return;
  }
  if (!master) {
    if (bell.unmuted) saveBellSettings(accountId, { ...bell, unmuted: false });
    stopBellSound();
    saveMasterAudio(accountId, true);
  }
  resumeSoundtrack();
  unlockSoundtrack();
  saveSoundtrack(accountId, { ...songs, unmuted: true });
  void startPlaylist(accountId);
}
