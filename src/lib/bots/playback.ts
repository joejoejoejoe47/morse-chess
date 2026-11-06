/**
 * Speaker output: unlock + play policy.
 * Download/model-ready is NOT the same as audible playback.
 * Safari / iOS block Audio.play() unless a user gesture unlocked output, and
 * creating a fresh Audio() after async synthesis usually loses that gesture.
 */
export type PlayOutcome =
  | { kind: "played" }
  | { kind: "needs-gesture"; message: string }
  | { kind: "error"; message: string };

const NEEDS_GESTURE = "The browser blocked autoplay. Tap Play reply to hear it.";

/** Tiny valid WAV (data URI) used only to unlock an Audio element on a tap. */
export const SILENT_WAV_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

export function classifyPlayFailure(err: unknown): "needs-gesture" | "error" {
  const e = err as { name?: string; message?: string } | null;
  const name = e?.name ?? "";
  const msg = (e?.message ?? String(err ?? "")).toLowerCase();
  if (name === "NotAllowedError") return "needs-gesture";
  if (/notallowederror|notallowed|autoplay|user (didn't|did not|hasn't|has not) interact|user gesture|the request is not allowed|play\(\) (can only|failed because)/i.test(name + " " + msg)) {
    return "needs-gesture";
  }
  return "error";
}

type Ctx = AudioContext & { resume(): Promise<void> };

let ctx: Ctx | null = null;
let shared: HTMLAudioElement | null = null;
let unlocked = false;
let queued: Blob | null = null;
let currentUrl: string | null = null;
let currentSrc: AudioBufferSourceNode | null = null;

function AC(): (new () => Ctx) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: new () => Ctx; webkitAudioContext?: new () => Ctx };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Call synchronously inside a click (Enable / Send / Play). Returns whether unlock was attempted. */
export function unlockSpeaker(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const Ctor = AC();
    if (Ctor) {
      ctx = ctx ?? new Ctor();
      void ctx.resume();
      if (ctx.state !== "closed") {
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      }
      if (ctx.state === "running") unlocked = true;
    }
    if (!shared) {
      shared = new Audio();
      shared.preload = "auto";
    }
    // Reuse one element for later src swaps (iOS: new Audio() after async is blocked).
    shared.src = SILENT_WAV_URI;
    const p = shared.play();
    if (p && typeof p.then === "function") {
      void p
        .then(() => {
          unlocked = true;
          try {
            shared?.pause();
          } catch {
            /* ignore */
          }
        })
        .catch(() => {
          /* gesture may still have resumed AudioContext */
        });
    }
    return true;
  } catch {
    return false;
  }
}

export function isSpeakerUnlocked() {
  return unlocked || ctx?.state === "running";
}

export function peekQueuedAudio() {
  return queued;
}

function revoke() {
  if (currentUrl) {
    try {
      URL.revokeObjectURL(currentUrl);
    } catch {
      /* ignore */
    }
    currentUrl = null;
  }
}

async function playViaContext(blob: Blob): Promise<void> {
  if (!ctx) throw new Error("No audio context");
  if (ctx.state === "suspended") await ctx.resume();
  if (ctx.state !== "running") throw Object.assign(new Error("AudioContext is not running"), { name: "NotAllowedError" });
  const raw = await blob.arrayBuffer();
  // Safari detaches the buffer on decode; copy first.
  const copy = raw.slice(0);
  const decoded = await ctx.decodeAudioData(copy);
  await new Promise<void>((resolve, reject) => {
    const src = ctx!.createBufferSource();
    src.buffer = decoded;
    src.connect(ctx!.destination);
    currentSrc = src;
    src.onended = () => {
      if (currentSrc === src) currentSrc = null;
      resolve();
    };
    try {
      src.start(0);
    } catch (e) {
      if (currentSrc === src) currentSrc = null;
      reject(e);
    }
  });
}

async function playViaElement(blob: Blob): Promise<void> {
  if (!shared) shared = new Audio();
  revoke();
  const url = URL.createObjectURL(blob);
  currentUrl = url;
  shared.src = url;
  await shared.play();
  await new Promise<void>((resolve, reject) => {
    if (!shared) return reject(new Error("Audio element missing"));
    shared.onended = () => resolve();
    shared.onerror = () => reject(new Error("Audio element failed to play the reply."));
  });
  revoke();
}

/**
 * Play a WAV/MP3 blob. Prefer the HTMLAudio element (PR63 and the official
 * kokoro-js demo: `new Audio(URL.createObjectURL(audio.toBlob())).play()`).
 * After Enable we always have an AudioContext, and decodeAudioData-first was
 * playing IEEE-float Kokoro WAVs that can contain rare NaN/Inf spikes.
 * On autoplay block, keep the blob queued for an explicit Play tap.
 * Never reports success if silent.
 */
export async function playWavBlob(blob: Blob): Promise<PlayOutcome> {
  if (!blob || !blob.size) return { kind: "error", message: "Empty audio — nothing to play." };
  queued = blob;
  try {
    try {
      await playViaElement(blob);
      queued = null;
      unlocked = true;
      return { kind: "played" };
    } catch (e) {
      if (classifyPlayFailure(e) === "needs-gesture") {
        if (ctx && ctx.state === "running") {
          try {
            await playViaContext(blob);
            queued = null;
            unlocked = true;
            return { kind: "played" };
          } catch {
            // Element was gesture-blocked; if context also fails, still ask for a tap.
            return { kind: "needs-gesture", message: NEEDS_GESTURE };
          }
        }
        return { kind: "needs-gesture", message: NEEDS_GESTURE };
      }
      if (ctx) {
        await playViaContext(blob);
        queued = null;
        unlocked = true;
        return { kind: "played" };
      }
      throw e;
    }
  } catch (e) {
    const kind = classifyPlayFailure(e);
    if (kind === "needs-gesture") return { kind: "needs-gesture", message: NEEDS_GESTURE };
    return { kind: "error", message: e instanceof Error ? e.message : "Playback failed." };
  }
}

/** User tapped Play reply — unlock again, then play the last queued blob. */
export async function playQueuedFromGesture(): Promise<PlayOutcome> {
  unlockSpeaker();
  if (!queued) return { kind: "error", message: "Nothing queued to play yet." };
  return playWavBlob(queued);
}

export function stopPlayback() {
  try {
    currentSrc?.stop();
  } catch {
    /* already stopped */
  }
  currentSrc = null;
  try {
    shared?.pause();
  } catch {
    /* ignore */
  }
  revoke();
}
