import { deleteSongBlob, getSongBlob, saveSongBlob } from "@/lib/bell";
import { asset } from "@/lib/base";
import { loadMasterAudio } from "@/lib/master-audio";

const KEY = "morse-soundtrack-v1";
export const SOUNDTRACK_CHANGED = "morse-soundtrack-changed";

export type SoundtrackSong = { id: string; name: string };
export type Soundtrack = { id: string; name: string; songIds: string[] };
export type SoundtrackSettings = {
  unmuted: boolean;
  activeId: string | null;
  songs: SoundtrackSong[];
  lists: Soundtrack[];
  likes: string[];
  downs: string[];
  covers: Record<string, string>;
  plays: Record<string, number>;
  history: string[];
};

export const BUILTIN_SONGS: { id: string; name: string; src: string }[] = [
  { id: "builtin-walking", name: "Walking Down the Street In a Car", src: "/soundtrack/walking-down-the-street.m4a" },
];

/** The club playlist: "Walking Down the Street In a Car" first, then every other song, then round again. */
export const FIRST_SONG_ID = "builtin-walking";

export function clubOrder(settings: SoundtrackSettings) {
  const builtins = BUILTIN_SONGS.map((song) => song.id);
  const uploads = settings.songs.map((song) => song.id).filter((id) => !builtins.includes(id));
  const ids = [...builtins, ...uploads];
  return ids.includes(FIRST_SONG_ID) ? [FIRST_SONG_ID, ...ids.filter((id) => id !== FIRST_SONG_ID)] : ids;
}

export function builtinSrc(id: string) {
  return BUILTIN_SONGS.find((song) => song.id === id)?.src ?? null;
}

export function emptySoundtrack(): SoundtrackSettings {
  return { unmuted: false, activeId: null, songs: [], lists: [], likes: [], downs: [], covers: {}, plays: {}, history: [] };
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
      likes: Array.isArray(parsed.likes) ? parsed.likes.map(String) : [],
      downs: Array.isArray(parsed.downs) ? parsed.downs.map(String) : [],
      covers: parsed.covers && typeof parsed.covers === "object" ? Object.fromEntries(Object.entries(parsed.covers).map(([id, url]) => [id, String(url)])) : {},
      plays: parsed.plays && typeof parsed.plays === "object" ? Object.fromEntries(Object.entries(parsed.plays).map(([id, n]) => [id, Number(n) || 0])) : {},
      history: Array.isArray(parsed.history) ? parsed.history.map(String).slice(0, 40) : [],
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
let libraryHold = false;
let librarySong = "";
let libraryQueue: string[] = [];
let libraryAt = 0;
let libraryRepeat = false;
let userPaused = false;
let fromLibrary = false;
const playerListeners = new Set<() => void>();

function emitPlayer() {
  playerListeners.forEach((fn) => fn());
}

export function subscribePlayer(cb: () => void) {
  playerListeners.add(cb);
  const audio = track();
  const kick = () => emitPlayer();
  audio?.addEventListener("timeupdate", kick);
  audio?.addEventListener("play", kick);
  audio?.addEventListener("pause", kick);
  audio?.addEventListener("ended", kick);
  return () => {
    playerListeners.delete(cb);
    audio?.removeEventListener("timeupdate", kick);
    audio?.removeEventListener("play", kick);
    audio?.removeEventListener("pause", kick);
    audio?.removeEventListener("ended", kick);
  };
}

export function libraryNow() {
  const audio = track();
  const duration = audio && Number.isFinite(audio.duration) ? audio.duration : 0;
  return {
    songId: librarySong,
    playing: Boolean(audio && !audio.paused && !audio.ended && librarySong),
    current: audio?.currentTime ?? 0,
    duration,
    repeat: libraryRepeat,
  };
}

/** While the songs page is open the playlist keeps going (shown in its player) until a song there is picked. */
export function setLibraryHold(on: boolean) {
  libraryHold = on;
  if (!on) window.dispatchEvent(new Event(SOUNDTRACK_CHANGED));
}

/** The speaker button was pressed on: a song paused earlier may play again. */
export function resumeSoundtrack() {
  userPaused = false;
}

export function setLibraryRepeat(on: boolean) {
  libraryRepeat = on;
  emitPlayer();
}

export function seekLibrary(ratio: number) {
  const audio = track();
  if (!audio || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.min(audio.duration, Math.max(0, ratio * audio.duration));
  emitPlayer();
}

export function toggleLibrary() {
  const audio = track();
  if (!audio || !librarySong) return;
  if (audio.paused) {
    userPaused = false;
    void startSong(audio).catch(() => undefined);
  } else {
    userPaused = true;
    fade(audio, 0, FADE_OUT_MS, () => {
      audio.pause();
      audio.volume = 1;
    });
  }
  emitPlayer();
}

export async function playLibrarySong(accountId: string, songId: string, queue?: string[]) {
  const audio = track();
  if (!audio) return;
  userPaused = false;
  libraryHold = true;
  fromLibrary = true;
  token += 1;
  const generation = token;
  libraryQueue = queue?.length ? queue : [songId];
  libraryAt = Math.max(0, libraryQueue.indexOf(songId));
  librarySong = songId;
  const built = builtinSrc(songId);
  if (!built) {
    const rec = await getSongBlob(accountId, songId);
    if (generation !== token || !rec) return;
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    musicUrl = URL.createObjectURL(rec.blob);
    audio.src = musicUrl;
  } else {
    if (musicUrl) {
      URL.revokeObjectURL(musicUrl);
      musicUrl = "";
    }
    audio.src = asset(built);
  }
  const settings = loadSoundtrack(accountId);
  const plays = { ...settings.plays, [songId]: (settings.plays[songId] ?? 0) + 1 };
  const history = [songId, ...settings.history.filter((id) => id !== songId)].slice(0, 40);
  saveSoundtrack(accountId, { ...settings, plays, history });
  audio.onended = () => {
    if (generation !== token) return;
    if (libraryRepeat) {
      audio.currentTime = 0;
      void startSong(audio).catch(() => undefined);
      return;
    }
    const next = libraryQueue[libraryAt + 1];
    if (next) void playLibrarySong(accountId, next, libraryQueue);
    else emitPlayer();
  };
  try {
    await startSong(audio);
  } catch {
    /* the click already unlocked it */
  }
  emitPlayer();
}

function track() {
  if (typeof Audio === "undefined") return null;
  if (!music) {
    music = new Audio();
    music.preload = "auto";
    music.setAttribute("playsinline", "true");
  }
  return music;
}

/** Short volume fades so muting, pausing and starting a song never clicks or pops. */
const FADE_IN_MS = 90;
const FADE_OUT_MS = 140;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let fadeDir: -1 | 0 | 1 = 0;
let unlocked = false;

function cancelFade() {
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = null;
  fadeDir = 0;
}

function fade(audio: HTMLAudioElement, to: 0 | 1, ms: number, done?: () => void) {
  cancelFade();
  const from = audio.volume;
  const start = performance.now();
  fadeDir = to === 1 ? 1 : -1;
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - start) / ms);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k >= 1) {
      cancelFade();
      done?.();
    }
  }, 15);
}

/** Every real song start goes through here: unmuted, fading in from silence. */
function startSong(audio: HTMLAudioElement) {
  cancelFade();
  audio.muted = false;
  audio.volume = 0;
  const pending = audio.play();
  return Promise.resolve(pending).then(() => {
    unlocked = true;
    if (fadeDir === 0 && !audio.paused) fade(audio, 1, FADE_IN_MS);
    else if (audio.paused) audio.volume = 1;
  }, (err) => {
    audio.volume = 1;
    throw err;
  });
}

const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

/** Call from a click so the song is allowed to keep playing in a game. */
export function unlockSoundtrack() {
  const audio = track();
  // Only once per page, only with the silent clip, and muted: it must never play (or blip) a real song.
  // A paused song stays paused; the song itself starts only from syncNow/playAt when songs are on.
  if (!audio || unlocked || !audio.paused || userPaused) return;
  if (audio.src && audio.src !== SILENT) return;
  audio.src = SILENT;
  audio.muted = true;
  const pending = audio.play();
  void Promise.resolve(pending)
    .then(() => {
      unlocked = true;
      if (audio.src === SILENT) audio.pause();
    })
    .catch(() => undefined)
    .finally(() => {
      if (audio.src === SILENT) audio.muted = false;
    });
}

export function stopSoundtrack() {
  token += 1;
  playingKey = "";
  if (!music) return;
  const audio = music;
  audio.onended = null;
  if (audio.paused) {
    cancelFade();
    audio.volume = 1;
    return;
  }
  // Fade out instead of cutting the sound off mid-wave (that is the "pop").
  fade(audio, 0, FADE_OUT_MS, () => {
    audio.pause();
    audio.volume = 1;
  });
}

async function playAt(accountId: string, list: Soundtrack, index: number, hops: number, generation: number) {
  const audio = track();
  const ids = list.songIds;
  if (!audio || generation !== token || !ids.length || hops >= ids.length) {
    if (generation === token && hops >= ids.length) stopSoundtrack();
    return;
  }
  const songId = ids[((index % ids.length) + ids.length) % ids.length];
  librarySong = songId;
  fromLibrary = false;
  const built = builtinSrc(songId);
  if (generation !== token) return;
  if (!built) {
    const rec = await getSongBlob(accountId, songId);
    if (generation !== token) return;
    if (!rec) {
      await playAt(accountId, list, index + 1, hops + 1, generation);
      return;
    }
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    musicUrl = URL.createObjectURL(rec.blob);
    audio.src = musicUrl;
  } else {
    if (musicUrl) {
      URL.revokeObjectURL(musicUrl);
      musicUrl = "";
    }
    audio.src = asset(built);
  }
  const at = ((index % ids.length) + ids.length) % ids.length;
  audio.onended = () => {
    if (generation !== token || music !== audio) return;
    const latest = loadSoundtrack(accountId);
    if (!latest.unmuted || !loadMasterAudio(accountId)) {
      stopSoundtrack();
      return;
    }
    const next = latest.lists.find((item) => item.id === list.id);
    const club = list.id === "club" ? { ...list, songIds: clubOrder(latest) } : null;
    const follow = next && next.songIds.length ? next : club && club.songIds.length ? club : null;
    if (!follow) {
      stopSoundtrack();
      return;
    }
    void playAt(accountId, follow, at + 1, 0, generation);
  };
  try {
    await startSong(audio);
  } catch {
    playingKey = "";
  }
  emitPlayer();
}

export async function syncSoundtrack(accountId: string) {
  await syncNow(accountId, false);
}

/** Start the playlist from its first song now (songs page "Unmute"), even while that page is open. */
export async function startPlaylist(accountId: string) {
  userPaused = false;
  if (fromLibrary) playingKey = "";
  fromLibrary = false;
  await syncNow(accountId, true);
}

async function syncNow(accountId: string, force: boolean) {
  const settings = loadSoundtrack(accountId);
  if (!settings.unmuted || !loadMasterAudio(accountId)) {
    // A song started by hand on the songs page is a preview; the mute buttons stop it themselves.
    if (!(libraryHold && fromLibrary)) stopSoundtrack();
    return;
  }
  if (!force && (libraryHold || userPaused)) return;
  const chosen = settings.lists.find((item) => item.id === settings.activeId) ?? null;
  // "club-walk" is the songs page's Unmute list: always the live order, so new uploads join it.
  const list = chosen && chosen.id !== "club-walk" && chosen.songIds.length
    ? chosen
    : { id: "club", name: "Club", songIds: clubOrder(settings) };
  if (!list.songIds.length) {
    stopSoundtrack();
    return;
  }
  const key = `${list.id}:${list.songIds.join(",")}`;
  const audio = track();
  if (audio && !audio.paused && !audio.ended && playingKey === key && fadeDir !== -1) return;
  playingKey = key;
  const generation = ++token;
  if (audio) {
    audio.onended = null;
    cancelFade();
    audio.pause();
  }
  await playAt(accountId, list, 0, 0, generation);
}
