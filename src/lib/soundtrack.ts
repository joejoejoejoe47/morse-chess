import { deleteSongBlob, getSongBlob, saveSongBlob } from "@/lib/bell";

const KEY = "morse-soundtrack-v1";
export const SOUNDTRACK_CHANGED = "morse-soundtrack-changed";

export type SoundtrackSong = { id: string; name: string };
export type Soundtrack = { id: string; name: string; songIds: string[] };
export type SoundtrackSettings = {
  unmuted: boolean;
  activeId: string | null;
  songs: SoundtrackSong[];
  lists: Soundtrack[];
};

export function emptySoundtrack(): SoundtrackSettings {
  return { unmuted: false, activeId: null, songs: [], lists: [] };
}

function storageKey(accountId: string) {
  return `${KEY}:${accountId}`;
}

export function loadSoundtrack(accountId: string | null | undefined): SoundtrackSettings {
  const base = emptySoundtrack();
  if (!accountId || typeof localStorage === "undefined") return base;
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SoundtrackSettings>;
    const songs = Array.isArray(parsed.songs)
      ? parsed.songs
          .map((song) => ({ id: String(song?.id || ""), name: String(song?.name || "Song") }))
          .filter((song) => song.id)
      : [];
    const lists = Array.isArray(parsed.lists)
      ? parsed.lists
          .map((list) => ({
            id: String(list?.id || ""),
            name: String(list?.name || "Soundtrack").slice(0, 40),
            songIds: Array.isArray(list?.songIds) ? list.songIds.map(String).filter(Boolean) : [],
          }))
          .filter((list) => list.id)
      : [];
    return {
      unmuted: parsed.unmuted === true,
      activeId: parsed.activeId ? String(parsed.activeId) : null,
      songs,
      lists,
    };
  } catch {
    return base;
  }
}

export function saveSoundtrack(accountId: string, next: SoundtrackSettings) {
  if (!accountId || typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey(accountId), JSON.stringify(next));
  window.dispatchEvent(new Event(SOUNDTRACK_CHANGED));
}

export function subscribeSoundtrack(cb: () => void) {
  window.addEventListener(SOUNDTRACK_CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SOUNDTRACK_CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
}

export async function uploadSoundtrackSong(accountId: string, file: File) {
  const meta = await saveSongBlob(accountId, file);
  const current = loadSoundtrack(accountId);
  saveSoundtrack(accountId, { ...current, songs: [...current.songs, { id: meta.id, name: meta.name }] });
  return meta;
}

export async function removeSoundtrackSong(accountId: string, songId: string) {
  await deleteSongBlob(accountId, songId).catch(() => undefined);
  const current = loadSoundtrack(accountId);
  saveSoundtrack(accountId, {
    ...current,
    songs: current.songs.filter((song) => song.id !== songId),
    lists: current.lists.map((list) => ({ ...list, songIds: list.songIds.filter((id) => id !== songId) })),
  });
}

let music: HTMLAudioElement | null = null;
let musicUrl = "";
let playingKey = "";
let token = 0;

function track() {
  if (typeof Audio === "undefined") return null;
  if (!music) {
    music = new Audio();
    music.preload = "auto";
    music.setAttribute("playsinline", "true");
  }
  music.volume = 1;
  return music;
}

const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

/** Call from a click so the song is allowed to keep playing in a game. */
export function unlockSoundtrack() {
  const audio = track();
  if (!audio || !audio.paused) return;
  audio.volume = 1;
  if (!audio.src) audio.src = SILENT;
  const pending = audio.play();
  if (pending) void pending.catch(() => undefined);
}

export function stopSoundtrack() {
  token += 1;
  playingKey = "";
  if (!music) return;
  music.onended = null;
  music.pause();
}

async function playAt(accountId: string, list: Soundtrack, index: number, hops: number, generation: number) {
  const audio = track();
  const ids = list.songIds;
  if (!audio || generation !== token || !ids.length || hops >= ids.length) {
    if (generation === token && hops >= ids.length) stopSoundtrack();
    return;
  }
  const songId = ids[((index % ids.length) + ids.length) % ids.length];
  const rec = await getSongBlob(accountId, songId);
  if (generation !== token) return;
  if (!rec) {
    await playAt(accountId, list, index + 1, hops + 1, generation);
    return;
  }
  if (musicUrl) URL.revokeObjectURL(musicUrl);
  musicUrl = URL.createObjectURL(rec.blob);
  audio.src = musicUrl;
  audio.volume = 1;
  const at = ((index % ids.length) + ids.length) % ids.length;
  audio.onended = () => {
    if (generation !== token || music !== audio) return;
    const latest = loadSoundtrack(accountId);
    const next = latest.lists.find((item) => item.id === list.id);
    if (!latest.unmuted || !next) {
      stopSoundtrack();
      return;
    }
    void playAt(accountId, next, at + 1, 0, generation);
  };
  try {
    await audio.play();
  } catch {
    playingKey = "";
  }
}

export async function syncSoundtrack(accountId: string) {
  const settings = loadSoundtrack(accountId);
  const list = settings.lists.find((item) => item.id === settings.activeId) ?? null;
  if (!settings.unmuted || !list || !list.songIds.length) {
    stopSoundtrack();
    return;
  }
  const key = `${list.id}:${list.songIds.join(",")}`;
  const audio = track();
  if (audio && !audio.paused && !audio.ended && playingKey === key && audio.volume === 1) return;
  playingKey = key;
  const generation = ++token;
  if (audio) {
    audio.onended = null;
    audio.pause();
  }
  await playAt(accountId, list, 0, 0, generation);
}
