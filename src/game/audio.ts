let ctx: AudioContext | null = null;

function context() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext;
  if (!AC) return null;
  ctx = ctx ?? new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio() {
  context();
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
  const audio = context();
  if (!audio) return;
  const t = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function playStep() {
  tone(180, 0.08, "triangle", 0.05);
  tone(90, 0.1, "sine", 0.04, 0.02);
}

export function playStrike() {
  tone(520, 0.09, "sawtooth", 0.04);
  tone(140, 0.22, "square", 0.06, 0.02);
  tone(70, 0.3, "sine", 0.08, 0.04);
}

export function playFanfare() {
  tone(392, 0.18, "triangle", 0.06, 0);
  tone(523, 0.2, "triangle", 0.06, 0.16);
  tone(659, 0.32, "triangle", 0.07, 0.32);
}

export function playDeny() {
  tone(220, 0.12, "square", 0.04);
  tone(160, 0.16, "square", 0.04, 0.08);
}
