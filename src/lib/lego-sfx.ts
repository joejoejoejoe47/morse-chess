/**
 * Lego Universe fight sounds, synthesized with WebAudio, plus the user's own explosion clip
 * (public/lego/sfx/explode.mp3). Uses the same mute switch as the replay sounds.
 */
import { asset } from "@/lib/base";
import { isMuted } from "@/lib/history/sfx";

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || isMuted()) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

function noiseBuffer(a: AudioContext) {
  if (!noise) {
    noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

function tone(freq: number, to: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function hiss(dur: number, f0: number, f1: number, gain: number, delay = 0, q = 1.2) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const s = a.createBufferSource();
  s.buffer = noiseBuffer(a);
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(a.destination);
  s.start(t);
  s.stop(t + dur + 0.03);
}

/** A swing or jump through the air. */
export function playLegoWhoosh(long = false) {
  hiss(long ? 0.7 : 0.28, 500, long ? 2400 : 1800, 0.12);
}

/** The hit itself: a thud and a plastic smack. */
export function playLegoHit(big = false) {
  tone(big ? 120 : 170, 45, big ? 0.35 : 0.2, "sine", big ? 0.32 : 0.22);
  hiss(0.08, 3000, 1500, 0.16, 0, 0.8);
}

/** Energy beams: repulsor, Doom blast, zaps. */
export function playLegoBeam(deep = false) {
  tone(deep ? 260 : 900, deep ? 60 : 300, 0.45, "sawtooth", 0.06);
  hiss(0.4, deep ? 300 : 1200, deep ? 120 : 600, 0.08);
}

/** Dr. Strange's spell: a bright shimmer. */
export function playLegoMagic() {
  [660, 880, 1175, 1568].forEach((f, i) => tone(f, f * 1.02, 0.35, "triangle", 0.05, i * 0.07));
}

/** The user's explosion clip; the ?v= is its content hash so no browser plays an old cached sound. */
export const LEGO_EXPLODE_URL = asset("/lego/sfx/explode.mp3?v=0b893287");
let explodeBuf: Promise<AudioBuffer | null> | null = null;

function explodeClip(a: AudioContext): Promise<AudioBuffer | null> {
  if (!explodeBuf) {
    explodeBuf = fetch(LEGO_EXPLODE_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => a.decodeAudioData(b))
      .catch(() => {
        explodeBuf = null; // try again next time
        return null;
      });
  }
  return explodeBuf;
}

/** Fetch and decode the explosion clip ahead of the first capture. */
export function primeLegoExplode() {
  const a = audio();
  if (a) void explodeClip(a);
}

/** A figure blowing apart into bricks (either team, every board view): the user's explosion clip, nothing else. */
export function playLegoExplode() {
  const a = audio();
  if (!a) return;
  void explodeClip(a).then((buf) => {
    if (isMuted()) return;
    if (!buf) return;
    const src = a.createBufferSource();
    src.buffer = buf;
    const g = a.createGain();
    g.gain.value = 1;
    src.connect(g).connect(a.destination);
    src.start();
  });
}
