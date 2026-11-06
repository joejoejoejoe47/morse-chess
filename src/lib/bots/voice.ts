/**
 * Bot mouth + ears.
 * Speak order: optional server TTS (if host set a key) → Kokoro browser TTS (free, opt-in ~92 MB)
 * → readable error (never silently use harsh speechSynthesis for the bot).
 * Mic still uses browser SpeechRecognition when available.
 */
import type { BotVoice } from "./store";
import { apiUrl } from "@/lib/base";
import { chunkForSpeech, consentKokoro, ensureKokoro, getKokoroStatus, kokoroConsented, kokoroSynth, onKokoroStatus, type KokoroStatus } from "./kokoro";

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

/** Listen once; resolves with what was heard ("" if nothing). */
export function listenOnce(onInterim?: (t: string) => void): { done: Promise<string>; stop: () => void } {
  const Ctor = recCtor();
  if (!Ctor) return { done: Promise.reject(new Error("This browser cannot listen. Try Chrome, or type instead.")), stop: () => {} };
  const rec = new Ctor();
  rec.lang = navigator.language || "en-US";
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
  if (s.kind === "need-consent") setUi({ kind: "need-consent", message: "Enable natural voice once (~92 MB free download, stays on your device). No signup." });
  else if (s.kind === "downloading") setUi({ kind: "downloading", pct: s.pct, note: s.note });
  else if (s.kind === "ready") setUi({ kind: "ok", via: s.backend === "webgpu" ? "kokoro-webgpu" : "kokoro-wasm" });
  else if (s.kind === "error") setUi({ kind: "error", message: s.message });
  else if (s.kind === "idle" && !kokoroConsented()) setUi({ kind: "need-consent", message: "Enable natural voice once (~92 MB free download, stays on your device). No signup." });
});

export function enableNaturalVoice(): Promise<void> {
  return consentKokoro(false).then(() => {
    const st = getKokoroStatus();
    if (st.kind === "ready") setUi({ kind: "ok", via: st.backend === "webgpu" ? "kokoro-webgpu" : "kokoro-wasm" });
  });
}

function playBlob(blob: Blob, id: number): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    audio = new Audio(url);
    const done = () => {
      URL.revokeObjectURL(url);
      if (audio) audio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    if (id !== speakSeq) {
      done();
      return;
    }
    void audio.play().catch(done);
  });
}

async function speakKokoro(clean: string, kind: BotVoice, id: number): Promise<boolean> {
  try {
    if (!kokoroConsented()) {
      setUi({ kind: "need-consent", message: "Enable natural voice once (~92 MB free download, stays on your device). No signup." });
      return false;
    }
    await ensureKokoro(false);
    const chunks = chunkForSpeech(clean);
    for (const c of chunks) {
      if (id !== speakSeq) return true;
      const blob = await kokoroSynth(c, kind);
      if (id !== speakSeq) return true;
      const st = getKokoroStatus();
      if (st.kind === "ready") setUi({ kind: "ok", via: st.backend === "webgpu" ? "kokoro-webgpu" : "kokoro-wasm" });
      await playBlob(blob, id);
    }
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Natural voice failed.";
    setUi({ kind: "error", message: msg });
    return false;
  }
}

/**
 * Speak a line aloud.
 * Prefers configured server TTS; else Kokoro. Never falls back to harsh browser speechSynthesis —
 * the on-screen text stays readable, and VoiceUiStatus explains what went wrong.
 */
export function speak(text: string, kind: BotVoice, onEnd?: () => void) {
  const clean = forSpeech(text.replace(/[*_#`]/g, "").replace(/\s*[—–]\s*/g, ", ")).slice(0, 500);
  if (!clean.trim()) return onEnd?.();
  hush(); // bumps speakSeq and stops prior audio
  const id = speakSeq;
  void (async () => {
    if (id !== speakSeq) return;
    const serverOn = await serverEnabled();
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
        await playBlob(blob, id);
        if (id === speakSeq) onEnd?.();
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
  if (audio) {
    try {
      audio.pause();
    } catch {
      /* ignore */
    }
    audio = null;
  }
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
