import { asset } from "@/lib/base";
import { crowdMuted } from "@/lib/crowd-audio";

/** Two-blast stadium horn when the clock hits 30 seconds. Respects the Crowd mute. */
export function playThirtyHorn() {
  if (crowdMuted() || typeof AudioContext === "undefined") return;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const now = ctx.currentTime;
  const blast = (t: number, freq: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.48);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.52);
  };
  blast(now + 0.02, 494);
  blast(now + 0.72, 659);
  window.setTimeout(() => void ctx.close().catch(() => undefined), 2200);
}

const SONGS: Record<string, string> = {
  "song-walking": "/soundtrack/walking-down-the-street.m4a",
};

let song: HTMLAudioElement | null = null;
let primed: HTMLAudioElement | null = null;
let primedId = "";

/** Load the replay song during the celebration so play() at the replay is instant. */
export function primeReplaySong(id: string) {
  const file = SONGS[id];
  if (!file || typeof Audio === "undefined") return;
  if (primed && primedId === id) return;
  stopReplaySong();
  primedId = id;
  primed = new Audio(asset(file));
  primed.preload = "auto";
  primed.volume = 0.82;
  primed.load();
}

/** A bought replay song. Crowd-only (and anything unbought) stays quiet. Starts at the first sample. */
export function playReplaySong(id: string) {
  const file = SONGS[id];
  if (!file || crowdMuted() || typeof Audio === "undefined") {
    stopReplaySong();
    return;
  }
  if (!(primed && primedId === id)) primeReplaySong(id);
  song = primed;
  primed = null;
  primedId = "";
  if (!song) return;
  song.volume = 0.82;
  const go = () => {
    if (!song) return;
    try {
      song.currentTime = 0;
    } catch {
      /* not seekable yet */
    }
    void song.play().catch(() => undefined);
  };
  if (song.readyState >= 2) go();
  else song.addEventListener("canplay", go, { once: true });
}

export function stopReplaySong() {
  if (primed && primed !== song) {
    primed.pause();
    primed.src = "";
    primed = null;
    primedId = "";
  }
  if (!song) return;
  song.pause();
  song.src = "";
  song = null;
}
