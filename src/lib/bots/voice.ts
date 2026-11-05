/**
 * The bot's ears and mouth: browser speech recognition (mic button) and speechSynthesis.
 * Both are built into the browser; nothing is sent to us. Speech recognition only exists in
 * Chrome/Edge/Safari; other browsers get the chat box only.
 */
import type { BotVoice } from "./store";
import { apiUrl } from "@/lib/base";

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
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

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

const FEMALE_HINT = /female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|susan|serena|allison|ava\b|joanna|salli|kendra|kimberly|aria|jenny|libby|sonia|emma|michelle|ana\b|natasha|clara|sara|google us english$|google uk english female/i;
const MALE_HINT = /\bmale|man\b|daniel|alex\b|fred|david|mark|george|james|guy|ryan|tom\b|aaron|arthur|oliver|rishi|andrew|brian|christopher|eric|roger|steffan|thomas|william|google uk english male/i;

/** Higher = more human. Cloud/neural voices beat the old robotic local ones. */
function naturalScore(v: SpeechSynthesisVoice) {
  const n = v.name;
  let s = 0;
  if (/natural|neural/i.test(n)) s += 60;
  if (/online/i.test(n)) s += 25;
  if (/premium|enhanced|siri/i.test(n)) s += 40;
  if (/^google/i.test(n)) s += 30;
  if (/microsoft/i.test(n)) s += 8;
  if (!v.localService) s += 10;
  if (/espeak|compact|fred|albert|bahh|bells|boing|bubbles|cellos|zarvox|trinoids|whisper|wobble|jester|organ|superstar|ralph|junior|kathy|bad news|good news/i.test(n)) s -= 80;
  return s;
}

let cachedVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  const load = () => (cachedVoices = window.speechSynthesis.getVoices());
  load();
  window.speechSynthesis.addEventListener?.("voiceschanged", load);
}

export function pickVoice(kind: BotVoice): SpeechSynthesisVoice | null {
  const all = cachedVoices.length ? cachedVoices : window.speechSynthesis.getVoices();
  const lang = (navigator.language || "en").slice(0, 2).toLowerCase();
  const local = all.filter((v) => v.lang.toLowerCase().startsWith(lang));
  const pool = local.length ? local : all;
  const isF = (v: SpeechSynthesisVoice) => FEMALE_HINT.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, ""));
  const isM = (v: SpeechSynthesisVoice) => MALE_HINT.test(v.name) && !/female/i.test(v.name);
  const gender = pool.filter(kind === "female" ? isF : isM);
  const exactLocale = (v: SpeechSynthesisVoice) => (v.lang === (navigator.language || "en-US") ? 5 : 0);
  const best = (list: SpeechSynthesisVoice[]) =>
    [...list].sort((a, b) => naturalScore(b) + exactLocale(b) - (naturalScore(a) + exactLocale(a)))[0] ?? null;
  return best(gender) ?? best(pool.filter((v) => !(kind === "female" ? isM : isF)(v))) ?? best(pool);
}

/* ---- preferred server voice (PHP /api/tts). ON when OPENAI_API_KEY or ELEVENLABS_API_KEY is set. ---- */
let serverTts: { at: number; p: Promise<boolean> } | null = null;
let audio: HTMLAudioElement | null = null;
function serverEnabled(): Promise<boolean> {
  const now = Date.now();
  // Re-check every few minutes so adding a key on the host picks up without a hard reload.
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

function browserSpeak(text: string, kind: BotVoice, onEnd?: () => void) {
  if (!canSpeak()) return onEnd?.();
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(kind);
  if (v) u.voice = v;
  const natural = v ? naturalScore(v) >= 30 : false;
  // Natural voices sound best near default; nudge robotic ones a bit for character.
  u.pitch = natural ? (kind === "female" ? 1.05 : 0.95) : kind === "female" ? 1.15 : 0.9;
  u.rate = natural ? 1.0 : 0.97;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}

/** Expand short chess notation so browser voices do not say "N f 3" or invent words. */
function forSpeech(text: string): string {
  return text
    .replace(/\bO-O-O\b/g, "castle long")
    .replace(/\bO-O\b/g, "castle")
    .replace(/\b([KQRBN])x([a-h][1-8])\b/g, (_, p, sq) => `${({ K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" } as Record<string, string>)[p]} takes ${sq}`)
    .replace(/\b([KQRBN])([a-h][1-8])\b/g, (_, p, sq) => `${({ K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" } as Record<string, string>)[p]} to ${sq}`)
    .replace(/\b([a-h][1-8])x([a-h][1-8])\b/g, "$1 takes $2");
}

let speakSeq = 0;
/** Speak a line. Prefers the server natural voice whenever a TTS key is set; browser is fallback only. */
export function speak(text: string, kind: BotVoice, onEnd?: () => void) {
  const clean = forSpeech(text.replace(/[*_#`]/g, "").replace(/\s*[—–]\s*/g, ", ")).slice(0, 400);
  if (!clean.trim()) return onEnd?.();
  const id = ++speakSeq;
  hush();
  void serverEnabled().then(async (on) => {
    if (id !== speakSeq) return;
    if (!on) return browserSpeak(clean, kind, onEnd);
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
      const url = URL.createObjectURL(blob);
      if (id !== speakSeq) return URL.revokeObjectURL(url);
      audio = new Audio(url);
      const done = () => {
        URL.revokeObjectURL(url);
        if (audio) audio = null;
        onEnd?.();
      };
      audio.onended = done;
      audio.onerror = () => {
        // Prefer retrying once via browser only if the audio element fails mid-play.
        done();
      };
      await audio.play();
    } catch {
      // Server key is set but the call failed (network/quota). Fall back so the bot still talks.
      if (id === speakSeq) browserSpeak(clean, kind, onEnd);
    }
  });
}

export function hush() {
  if (canSpeak()) window.speechSynthesis.cancel();
  if (audio) {
    audio.pause();
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
