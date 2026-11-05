/**
 * The bot's ears and mouth: browser speech recognition (mic button) and speechSynthesis.
 * Both are built into the browser; nothing is sent to us. Speech recognition only exists in
 * Chrome/Edge/Safari; other browsers get the chat box only.
 */
import type { BotVoice } from "./store";

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

const FEMALE_HINT = /female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|susan|serena|allison|ava|joanna|salli|kendra|kimberly|aria|jenny|libby|sonia|emma|google us english$|google uk english female/i;
const MALE_HINT = /male|man\b|daniel|alex|fred|david|mark|george|james|guy|ryan|tom|aaron|arthur|oliver|rishi|google uk english male/i;

function pickVoice(kind: BotVoice): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis.getVoices();
  const lang = (navigator.language || "en").slice(0, 2);
  const local = all.filter((v) => v.lang.toLowerCase().startsWith(lang));
  const pool = local.length ? local : all;
  const female = pool.filter((v) => FEMALE_HINT.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, "")));
  const male = pool.filter((v) => MALE_HINT.test(v.name) && !/female/i.test(v.name));
  return (kind === "female" ? female[0] : male[0]) ?? pool[0] ?? null;
}

/** Speak a line. Pitch is nudged too, so even a one-voice device sounds different per bot. */
export function speak(text: string, kind: BotVoice, onEnd?: () => void) {
  if (!canSpeak()) return onEnd?.();
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, ""));
  const v = pickVoice(kind);
  if (v) u.voice = v;
  u.pitch = kind === "female" ? 1.25 : 0.85;
  u.rate = 1.03;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}

export function hush() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
