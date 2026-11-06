/**
 * Bot mouth + ears.
 * Speak order: optional server TTS (if host set a key) → Kokoro browser TTS (free, opt-in ~120 MB)
 * → readable error or tap-to-play (never silently use harsh speechSynthesis).
 * Mic (input) is separate from speaker (output). A denied mic must not disable TTS.
 */
import type { BotVoice } from "./store";
import { apiUrl } from "@/lib/base";
import { cancelKokoro, chunkForSpeech, consentKokoro, ensureKokoro, getKokoroStatus, kokoroConsented, kokoroSynth, onKokoroStatus, type KokoroStatus } from "./kokoro";
import { playQueuedFromGesture, playWavBlob, stopPlayback, unlockSpeaker, type PlayOutcome } from "./playback";
export { unlockSpeaker, playQueuedFromGesture };

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

function recCtor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => recCtor() !== null;

/** Spoken input defaults to English. Browser UI language is not an explicit Morse Chess language choice. */
export const SPEECH_RECOGNITION_LANG = "en-US";

/** Listen once; resolves with what was heard ("" if nothing). */
export function listenOnce(onInterim?: (t: string) => void): { done: Promise<string>; stop: () => void } {
  const Ctor = recCtor();
  if (!Ctor) return { done: Promise.reject(new Error("This browser cannot listen. Try Chrome, or type instead.")), stop: () => {} };
  const rec = new Ctor();
  rec.lang = SPEECH_RECOGNITION_LANG;
  rec.interimResults = true;
  rec.continuous = false;
  let text = "";
  const done = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      text = t;
      onInterim?.(t);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") resolve(text);
      else reject(new Error(e.error === "not-allowed" ? "The mic is blocked. Allow it in the browser bar." : `Mic error: ${e.error}`));
    };
    rec.onend = () => resolve(text);
  });
  try {
    rec.start();
  } catch (err) {
    return { done: Promise.reject(err), stop: () => {} };
  }
  return { done, stop: () => rec.stop() };
}

/* ---- optional server TTS (PHP /api/tts) when OPENAI_API_KEY or ELEVENLABS_API_KEY is set ---- */
let serverTts: { at: number; p: Promise<boolean> } | null = null;
let audio: HTMLAudioElement | null = null;
let speakSeq = 0;

function serverEnabled(): Promise<boolean> {
  const now = Date.now();
  if (!serverTts || now - serverTts.at > 120_000) {
    serverTts = {
      at: now,
      p: fetch(apiUrl("/api/tts"), { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { enabled: false }))
        .then((j) => !!j?.enabled)
        .catch(() => false),
    };
  }
  return serverTts.p;
}

/** Expand short chess notation so voices do not say "N f 3". */
function forSpeech(text: string): string {
  return text
    .replace(/\bO-O-O\b/g, "castle long")
    .replace(/\bO-O\b/g, "castle")
    .replace(/\b([KQRBN])x([a-h][1-8])\b/g, (_, p, sq) => `${({ K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" } as Record<string, string>)[p]} takes ${sq}`)
    .replace(/\b([KQRBN])([a-h][1-8])\b/g, (_, p, sq) => `${({ K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" } as Record<string, string>)[p]} to ${sq}`)
    .replace(/\b([a-h][1-8])x([a-h][1-8])\b/g, "$1 takes $2");
}

export type VoiceUiStatus =
  | { kind: "ok"; via: "server" | "kokoro-wasm" | "kokoro-webgpu" }
  | { kind: "need-consent"; message: string }
  | { kind: "downloading"; pct: number; note: string }
  | { kind: "generating"; note: string; genMs?: number; audioSec?: number }
  | { kind: "playing"; via: "server" | "kokoro-wasm" | "kokoro-webgpu"; genMs?: number; audioSec?: number }
  | { kind: "needs-gesture"; message: string }
  | { kind: "error"; message: string }
  | { kind: "idle" };

type UiListener = (s: VoiceUiStatus) => void;
const uiListeners = new Set<UiListener>();
let lastUi: VoiceUiStatus = { kind: "idle" };

export function onVoiceUi(fn: UiListener) {
  uiListeners.add(fn);
  fn(lastUi);
  return () => { uiListeners.delete(fn); };
}

function setUi(s: VoiceUiStatus) {
  lastUi = s;
  for (const fn of uiListeners) fn(s);
}

export function getVoiceUi() {
  return lastUi;
}

onKokoroStatus((s: KokoroStatus) => {
  if (s.kind === "need-consent") setUi({ kind: "need-consent", message: "Enable natural voice once (~120 MB on-site pack, then cached). Free, no signup, served from this site." });
  else if (s.kind === "downloading") setUi({ kind: "downloading", pct: s.pct, note: s.note });
  else if (s.kind === "ready") setUi({ kind: "ok", via: s.backend === "webgpu" ? "kokoro-webgpu" : "kokoro-wasm" });
  else if (s.kind === "error") setUi({ kind: "error", message: s.message });
  else if (s.kind === "idle" && !kokoroConsented()) setUi({ kind: "need-consent", message: "Enable natural voice once (~120 MB on-site pack, then cached). Free, no signup, served from this site." });
});

export function enableNaturalVoice(): Promise<void> {
  // Must run in the same turn as the click so Safari/iOS unlocks audio before the long download.
  unlockSpeaker();
  return consentKokoro(false).then(() => {
    const st = getKokoroStatus();
    if (st.kind === "ready") setUi({ kind: "ok", via: st.backend === "webgpu" ? "kokoro-webgpu" : "kokoro-wasm" });
  });
}

function applyPlayOutcome(out: PlayOutcome): boolean {
  if (out.kind === "played") return true;
  if (out.kind === "needs-gesture") {
    setUi({ kind: "needs-gesture", message: out.message });
    return false;
  }
  setUi({ kind: "error", message: out.message });
  return false;
}

async function playBlob(blob: Blob, id: number): Promise<boolean> {
  if (id !== speakSeq) return false;
  const out = await playWavBlob(blob);
  if (id !== speakSeq) return false;
  return applyPlayOutcome(out);
}

/** Explicit Play reply button — user gesture. */
export async function playLastReply(): Promise<boolean> {
  unlockSpeaker();
  const out = await playQueuedFromGesture();
  return applyPlayOutcome(out);
}

function viaNow(): "kokoro-wasm" | "kokoro-webgpu" {
  const st = getKokoroStatus();
  return st.kind === "ready" && st.backend === "webgpu" ? "kokoro-webgpu" : "kokoro-wasm";
}

async function speakKokoro(clean: string, kind: BotVoice, id: number): Promise<boolean> {
  try {
    if (!kokoroConsented()) {
      setUi({ kind: "need-consent", message: "Enable natural voice once (~120 MB on-site pack, then cached). Free, no signup, served from this site." });
      return false;
    }
    await ensureKokoro(false);
    const chunks = chunkForSpeech(clean);
    if (!chunks.length) return true;
    setUi({ kind: "generating", note: `Generating first words (${chunks[0].split(" ").length} words)…` });
    let next: ReturnType<typeof kokoroSynth> | null = kokoroSynth(chunks[0], kind);
    for (let i = 0; i < chunks.length; i++) {
      if (id !== speakSeq || !next) return false;
      let result;
      try {
        result = await next;
      } catch (e) {
        if (e instanceof Error && e.message === "cancelled") return false;
        throw e;
      }
      if (id !== speakSeq) return false;
      // Start the next chunk while this one plays (time-to-first-audio = first chunk only).
      next = chunks[i + 1] ? kokoroSynth(chunks[i + 1], kind) : null;
      setUi({
        kind: "playing",
        via: viaNow(),
        genMs: result.genMs,
        audioSec: result.audioSec,
      });
      const heard = await playBlob(result.blob, id);
      if (!heard) return false;
    }
    setUi({ kind: "ok", via: viaNow() });
    return true;
  } catch (e) {
    if (e instanceof Error && e.message === "cancelled") return false;
    const msg = e instanceof Error ? e.message : "Natural voice failed.";
    setUi({ kind: "error", message: msg });
    return false;
  }
}

/**
 * Speak a line aloud.
 * Kokoro (once consented) is the mouth; optional server TTS only if Kokoro is off.
 * Never falls back to harsh browser speechSynthesis —
 * the on-screen text stays readable, and VoiceUiStatus explains what went wrong.
 */
export function speak(text: string, kind: BotVoice, onEnd?: () => void) {
  const clean = forSpeech(text.replace(/[*_#`]/g, "").replace(/\s*[—–]\s*/g, ", ")).slice(0, 500);
  if (!clean.trim()) return onEnd?.();
  hush(); // bumps speakSeq and stops prior audio
  const id = speakSeq;
  void (async () => {
    if (id !== speakSeq) return;
    // Don't wait on /api/tts when Kokoro is already the chosen mouth (~RTT every reply).
    const serverOn = kokoroConsented() ? false : await serverEnabled();
    if (id !== speakSeq) return;
    if (serverOn) {
      try {
        const r = await fetch(apiUrl("/api/tts"), {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: clean, voice: kind }),
        });
        if (!r.ok) throw new Error(String(r.status));
        const blob = await r.blob();
        if (!blob.size) throw new Error("empty audio");
        if (id !== speakSeq) return;
        setUi({ kind: "ok", via: "server" });
        const heard = await playBlob(blob, id);
        if (id === speakSeq) onEnd?.();
        if (!heard) return;
        return;
      } catch {
        // Server key set but call failed — try Kokoro, do not use harsh browser TTS.
      }
    }
    const ok = await speakKokoro(clean, kind, id);
    if (id === speakSeq) onEnd?.();
    if (!ok && id === speakSeq) {
      // Text remains on screen; status banner already set.
    }
  })();
}

export function hush() {
  speakSeq++;
  cancelKokoro();
  if (audio) {
    try {
      audio.pause();
    } catch {
      /* ignore */
    }
    audio = null;
  }
  stopPlayback();
}

/** Ask for the microphone once (summon). true = granted and speech recognition exists. */
export async function requestMic(): Promise<boolean> {
  if (!canListen() || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}
