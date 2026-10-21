/**
 * Replay sounds. Original clips synthesized for Morse Chess (scripts/history-sfx.py),
 * several variants per kind so replays do not repeat the same sound every move.
 */
import { asset } from "@/lib/base";
import type { Judgment } from "@/lib/history/judge";

export type SfxKind = Judgment | "capture" | "check" | "mate";

const VARIANTS: Record<SfxKind, number> = {
  brilliant: 3,
  great: 3,
  good: 4,
  inaccuracy: 3,
  mistake: 3,
  blunder: 3,
  capture: 3,
  check: 2,
  mate: 2,
};
/** Evens out the clips' loudness. */
const GAIN: Partial<Record<SfxKind, number>> = {
  mistake: 0.55,
  good: 0.9,
  great: 0.95,
  capture: 0.7,
  check: 0.6,
};

const MUTE_KEY = "morse-history-mute";

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const lastPick = new Map<SfxKind, number>();

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function load(url: string): Promise<AudioBuffer | null> {
  const a = audio();
  if (!a) return Promise.resolve(null);
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => a.decodeAudioData(b))
      .catch(() => null);
    buffers.set(url, p);
  }
  return p;
}

export function isMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(on: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Unlock audio on a user gesture (browsers keep it silent until then) and warm the cache. */
export function primeSfx() {
  const a = audio();
  void a?.resume();
  for (const kind of Object.keys(VARIANTS) as SfxKind[]) void load(urlFor(kind, 1));
}

function urlFor(kind: SfxKind, n: number) {
  return asset(`/history/sfx/${kind}-${n}.mp3`);
}

export async function playSfx(kind: SfxKind, delayMs = 0) {
  if (isMuted()) return;
  const a = audio();
  if (!a) return;
  const count = VARIANTS[kind];
  let n = 1 + Math.floor(Math.random() * count);
  if (count > 1 && n === lastPick.get(kind)) n = (n % count) + 1;
  lastPick.set(kind, n);
  const buf = await load(urlFor(kind, n));
  if (!buf) return;
  const src = a.createBufferSource();
  src.buffer = buf;
  const gain = a.createGain();
  gain.gain.value = GAIN[kind] ?? 1;
  src.connect(gain).connect(a.destination);
  src.start(a.currentTime + delayMs / 1000);
}
