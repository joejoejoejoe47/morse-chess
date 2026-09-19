const SETTINGS_KEY = "morse-bell-v1";
const SEEN_KEY = "morse-bell-seen";
const DB_NAME = "morse-bell";
const STORE = "songs";
export const BELL_CHANGED = "morse-bell-changed";

export type WatchRow = {
  id: string;
  username: string;
  songId: string | null;
};

export type BellSettings = {
  unmuted: boolean;
  defaultSongId: string | null;
  defaultSongName: string | null;
  watches: WatchRow[];
};

export type SongMeta = { id: string; name: string };

const emptyWatch = (id?: string): WatchRow => ({
  id: id ?? "row-1",
  username: "",
  songId: null,
});

export function defaultBellSettings(): BellSettings {
  return {
    unmuted: false,
    defaultSongId: null,
    defaultSongName: null,
    watches: [emptyWatch("row-1")],
  };
}

function canStore() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadBellSettings(): BellSettings {
  const base = defaultBellSettings();
  if (!canStore()) return base;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<BellSettings>;
    const watches = Array.isArray(parsed.watches)
      ? parsed.watches
          .map((w) => ({
            id: String(w?.id || crypto.randomUUID()),
            username: String(w?.username ?? ""),
            songId: w?.songId ? String(w.songId) : null,
          }))
          .filter((w) => w.id)
      : [];
    return {
      unmuted: parsed.unmuted === true,
      defaultSongId: parsed.defaultSongId ? String(parsed.defaultSongId) : null,
      defaultSongName: parsed.defaultSongName ? String(parsed.defaultSongName) : null,
      watches: watches.length ? watches : [emptyWatch("row-1")],
    };
  } catch {
    return base;
  }
}

export function saveBellSettings(next: BellSettings) {
  if (!canStore()) return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(BELL_CHANGED));
}

export function subscribeBellSettings(cb: () => void) {
  window.addEventListener(BELL_CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(BELL_CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
}

export function namedWatches(settings: BellSettings) {
  return settings.watches.map((w) => ({ ...w, username: w.username.trim() })).filter((w) => w.username);
}

export function shouldRingFor(settings: BellSettings, fromUsername: string) {
  if (!settings.unmuted) return false;
  const named = namedWatches(settings);
  if (!named.length) return true;
  const needle = fromUsername.trim().toLowerCase();
  return named.some((w) => w.username.toLowerCase() === needle);
}

export function songIdFor(settings: BellSettings, fromUsername: string) {
  const needle = fromUsername.trim().toLowerCase();
  const match = namedWatches(settings).find((w) => w.username.toLowerCase() === needle);
  return match?.songId || settings.defaultSongId;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSongBlob(file: File): Promise<SongMeta> {
  const id = crypto.randomUUID();
  const rec = { id, name: file.name.slice(0, 80), blob: file };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return { id, name: rec.name };
}

export async function getSongBlob(id: string): Promise<{ name: string; blob: Blob } | null> {
  const db = await openDb();
  const rec = await new Promise<{ id: string; name: string; blob: Blob } | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rec ? { name: rec.name, blob: rec.blob } : null;
}

export async function deleteSongBlob(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

let currentAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;

function ctx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function stopBellSound() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

function playHouseBell() {
  const ac = ctx();
  void ac.resume();
  const now = ac.currentTime;
  const notes = [784, 1046.5, 1318.5];
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const t0 = now + i * 0.12;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.35);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + 1.4);
  });
}

export async function playBellPreview(fromUsername?: string) {
  const settings = loadBellSettings();
  const who = fromUsername?.trim() || "__preview__";
  const songId = fromUsername ? songIdFor(settings, who) : settings.defaultSongId;
  stopBellSound();
  if (songId) {
    const rec = await getSongBlob(songId);
    if (rec) {
      const url = URL.createObjectURL(rec.blob);
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
      };
      try {
        await audio.play();
        return;
      } catch {
        URL.revokeObjectURL(url);
      }
    }
  }
  playHouseBell();
}

export async function playChallengeSound(fromUsername: string) {
  const settings = loadBellSettings();
  if (!shouldRingFor(settings, fromUsername)) return;
  await playBellPreview(fromUsername);
}

export function loadSeenIds(): Set<string> {
  if (!canStore()) return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveSeenIds(ids: Set<string>) {
  if (!canStore()) return;
  sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-80)));
}

export function addWatchRow(settings: BellSettings): BellSettings {
  return { ...settings, watches: [...settings.watches, emptyWatch(`row-${crypto.randomUUID()}`)] };
}
