import { asset } from "@/lib/base";

/* The football crowd. One cheering clip (owner supplied, trimmed to its steady 11 s middle and
   re-encoded at 112 kbps) loops for ever: each copy starts 1.6 s before the last one ends and the
   two are cross-faded with equal-power curves, so the loop has no seam. Levels:
     countdown / between plays: a steady roar; a play starting: silent within ~0.15 s;
     touchdown / fireworks: a big swell that settles back. Muting is remembered per browser. */

const FILE = "/football/crowd-6c291247c7.mp3";
const XF = 1.6;
export const CROWD_MUTE_KEY = "morse-football-crowd-mute";

export function crowdMuted() {
  try {
    return localStorage.getItem(CROWD_MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

type Level = "calm" | "count" | "hush" | "swell";
const GAIN: Record<Level, number> = { calm: 0.32, count: 0.42, hush: 0, swell: 0.95 };

export class CrowdAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buf: AudioBuffer | null = null;
  private timer = 0;
  private nextAt = 0;
  private level: Level = "hush";
  private muted = crowdMuted();
  private dead = false;
  private settle = 0;
  private unlock = () => {
    void this.ctx?.resume();
  };

  start() {
    if (this.ctx || typeof window === "undefined" || !window.AudioContext) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    // browsers may hold sound until the player taps or presses a key
    window.addEventListener("pointerdown", this.unlock, true);
    window.addEventListener("keydown", this.unlock, true);
    void fetch(asset(FILE))
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        if (this.dead) return;
        this.buf = buf;
        this.nextAt = ctx.currentTime + 0.05;
        this.pump();
        this.timer = window.setInterval(() => this.pump(), 400);
        this.apply(0.8);
      })
      .catch(() => undefined);
  }

  /** Queue the next overlapping copies of the clip a little ahead of time. */
  private pump() {
    const ctx = this.ctx;
    const buf = this.buf;
    if (!ctx || !buf || !this.master) return;
    if (ctx.state !== "running") {
      // nothing plays yet; keep the schedule anchored to "now"
      this.nextAt = Math.max(this.nextAt, ctx.currentTime + 0.05);
      return;
    }
    const D = buf.duration;
    while (this.nextAt < ctx.currentTime + 2.5) {
      const at = Math.max(this.nextAt, ctx.currentTime + 0.02);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const steps = 32;
      const up = new Float32Array(steps);
      const down = new Float32Array(steps);
      for (let i = 0; i < steps; i++) {
        const u = i / (steps - 1);
        up[i] = Math.sin((u * Math.PI) / 2);
        down[i] = Math.cos((u * Math.PI) / 2);
      }
      g.gain.setValueCurveAtTime(up, at, XF);
      g.gain.setValueCurveAtTime(down, at + D - XF, XF);
      src.connect(g);
      g.connect(this.master);
      src.start(at);
      src.stop(at + D + 0.05);
      src.onended = () => g.disconnect();
      this.nextAt = at + D - XF;
    }
  }

  private apply(fade: number) {
    const ctx = this.ctx;
    const m = this.master;
    if (!ctx || !m) return;
    const now = ctx.currentTime;
    const target = this.muted ? 0 : GAIN[this.level];
    m.gain.cancelScheduledValues(now);
    m.gain.setValueAtTime(m.gain.value, now);
    m.gain.linearRampToValueAtTime(target, now + Math.max(0.02, fade));
  }

  set(level: Level) {
    window.clearTimeout(this.settle);
    if (level === this.level && level !== "swell") return;
    this.level = level;
    this.apply(level === "hush" ? 0.14 : level === "swell" ? 0.45 : 1.1);
    if (level === "swell") {
      this.settle = window.setTimeout(() => {
        if (this.level === "swell") {
          this.level = "calm";
          this.apply(2.2);
        }
      }, 5200);
    }
  }

  setMuted(on: boolean) {
    this.muted = on;
    try {
      localStorage.setItem(CROWD_MUTE_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
    void this.ctx?.resume();
    this.apply(0.3);
  }

  stop() {
    this.dead = true;
    window.clearInterval(this.timer);
    window.clearTimeout(this.settle);
    window.removeEventListener("pointerdown", this.unlock, true);
    window.removeEventListener("keydown", this.unlock, true);
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && this.master) {
      this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      window.setTimeout(() => void ctx.close().catch(() => undefined), 400);
    }
  }
}
