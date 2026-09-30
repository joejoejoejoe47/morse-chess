let ringTimer: ReturnType<typeof setInterval> | null = null;
let ringStop: ReturnType<typeof setTimeout> | null = null;
let audioCtx: AudioContext | null = null;

function ctx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function ding(freq = 880, dur = 0.55) {
  const ac = ctx();
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, now + dur);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
  const over = ac.createOscillator();
  const og = ac.createGain();
  over.type = "triangle";
  over.frequency.setValueAtTime(freq * 2.02, now);
  og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.05, now + 0.015);
  og.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.7);
  over.connect(og);
  og.connect(ac.destination);
  over.start(now);
  over.stop(now + dur);
}

export function stopCallBell() {
  if (ringTimer) clearInterval(ringTimer);
  if (ringStop) clearTimeout(ringStop);
  ringTimer = null;
  ringStop = null;
}

/** A little bell that keeps ringing until `ms` is up. Calls cannot mute it. */
export function startCallBell(ms = 60_000) {
  stopCallBell();
  const strike = () => {
    ding(784, 0.7);
    window.setTimeout(() => ding(1046, 0.85), 280);
  };
  void ctx()
    .resume()
    .then(strike)
    .catch(() => undefined);
  ringTimer = setInterval(strike, 2200);
  ringStop = setTimeout(stopCallBell, ms);
}

export function tapPermissionBell() {
  void ctx()
    .resume()
    .then(() => ding(659, 0.45))
    .catch(() => undefined);
}
