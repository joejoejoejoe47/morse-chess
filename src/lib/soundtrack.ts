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

let ctx: AudioContext | null = null;
let node: AudioBufferSourceNode | null = null;
let playingKey = "";
let token = 0;

function audioCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function unlockSoundtrack() {
  const ac = audioCtx();
  if (ac.state === "suspended") void ac.resume();
}

export function stopSoundtrack() {
  token += 1;
  playingKey = "";
  if (!node) return;
  node.onended = null;
  try {
    node.stop();
  } catch {
    /* already stopped */
  }
  node.disconnect();
  node = null;
}

async function playAt(accountId: string, list: Soundtrack, index: number, hops: number, generation: number) {
  const ids = list.songIds;
  if (generation !== token || !ids.length || hops >= ids.length) {
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
  const ac = audioCtx();
  if (ac.state === "suspended") {
    try {
      await ac.resume();
    } catch {
      /* still locked until a click */
    }
  }
  if (generation !== token) return;
  if (ac.state === "suspended") return;
  let buffer: AudioBuffer;
  try {
    buffer = await ac.decodeAudioData((await rec.blob.arrayBuffer()).slice(0));
  } catch {
    if (generation !== token) return;
    await playAt(accountId, list, index + 1, hops + 1, generation);
    return;
  }
  if (generation !== token) return;
  if (node) {
    node.onended = null;
    try {
      node.stop();
    } catch {
      /* already stopped */
    }
    node.disconnect();
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.connect(ac.destination);
  const at = ((index % ids.length) + ids.length) % ids.length;
  src.onended = () => {
    if (generation !== token || node !== src) return;
    const latest = loadSoundtrack(accountId);
    const next = latest.lists.find((item) => item.id === list.id);
    if (!latest.unmuted || !next) {
      stopSoundtrack();
      return;
    }
    void playAt(accountId, next, at + 1, 0, generation);
  };
  node = src;
  src.start();
}

export async function syncSoundtrack(accountId: string) {
  const settings = loadSoundtrack(accountId);
  const list = settings.lists.find((item) => item.id === settings.activeId) ?? null;
  if (!settings.unmuted || !list || !list.songIds.length) {
    stopSoundtrack();
    return;
  }
  const key = `${list.id}:${list.songIds.join(",")}`;
  if (node && playingKey === key) return;
  playingKey = key;
  const generation = ++token;
  if (node) {
    node.onended = null;
    try {
      node.stop();
    } catch {
      /* already stopped */
    }
    node.disconnect();
    node = null;
  }
  await playAt(accountId, list, 0, 0, generation);
}
