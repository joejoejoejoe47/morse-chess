import { loadMasterAudio } from "@/lib/master-audio";

/**
 * Sounds for the chess variants (owner t205u). Synthesised with Web Audio, and only when the
 * club's speaker button (master audio) is on for this account, so a muted player hears nothing.
 */
let ctx: AudioContext | null = null;

function audio(accountId: string | null | undefined): AudioContext | null {
  if (!loadMasterAudio(accountId)) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, at: number, dur: number, gain: number, type: OscillatorType = "triangle") {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, c.currentTime + at);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + at);
  o.stop(c.currentTime + at + dur + 0.05);
}

/** Atomic capture: a low boom with a noisy crackle. */
export function playBoom(accountId: string | null | undefined) {
  const c = audio(accountId);
  if (!c) return;
  const n = Math.floor(c.sampleRate * 1.2);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / c.sampleRate;
    d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 4.5) * 0.7 + Math.sin(2 * Math.PI * (55 - t * 25) * t) * Math.exp(-t * 3) * 0.6;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(2400, c.currentTime);
  lp.frequency.exponentialRampToValueAtTime(120, c.currentTime + 1.1);
  const g = c.createGain();
  g.gain.value = 0.55;
  src.connect(lp).connect(g).connect(c.destination);
  src.start();
}

/** A soft two-note chime when it becomes your move. */
export function playYourTurn(accountId: string | null | undefined) {
  const c = audio(accountId);
  if (!c) return;
  tone(c, 660, 0, 0.18, 0.08, "sine");
  tone(c, 990, 0.09, 0.26, 0.07, "sine");
}

/** Win: a bright rising fanfare. Loss: a short falling sigh. Draw: two even notes. */
export function playResult(accountId: string | null | undefined, result: "win" | "loss" | "draw") {
  const c = audio(accountId);
  if (!c) return;
  if (result === "win") {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.12, 0.35, 0.12));
    tone(c, 1319, 0.5, 0.8, 0.1);
    tone(c, 784, 0.5, 0.8, 0.07);
  } else if (result === "loss") {
    [392, 330, 262].forEach((f, i) => tone(c, f, i * 0.18, 0.4, 0.09, "sine"));
  } else {
    tone(c, 523, 0, 0.3, 0.08, "sine");
    tone(c, 523, 0.25, 0.3, 0.08, "sine");
  }
}
