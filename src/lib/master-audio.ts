/**
 * The round speaker button: one switch for all the club sound (the bell and the songs).
 * Everybody starts muted. The key is new, so anyone who had sound on before starts muted once too.
 * When it is on, the bell and the songs each follow their own mute (bell page / songs page).
 */
const KEY = "morse-master-audio-v1";
export const MASTER_AUDIO_CHANGED = "morse-master-audio-changed";

function storageKey(accountId: string) {
  return `${KEY}:${accountId}`;
}

export function loadMasterAudio(accountId: string | null | undefined): boolean {
  if (!accountId || typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return false;
    return (JSON.parse(raw) as { on?: unknown })?.on === true;
  } catch {
    return false;
  }
}

export function saveMasterAudio(accountId: string, on: boolean) {
  if (!accountId || typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey(accountId), JSON.stringify({ on, at: Date.now() }));
  window.dispatchEvent(new Event(MASTER_AUDIO_CHANGED));
}

export function subscribeMasterAudio(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith(KEY)) cb();
  };
  window.addEventListener(MASTER_AUDIO_CHANGED, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MASTER_AUDIO_CHANGED, cb);
    window.removeEventListener("storage", onStorage);
  };
}
