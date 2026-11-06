/**
 * Browser Kokoro TTS controller (main thread).
 * Free, no signup, Apache-2.0 model — downloads once (~92 MB q8 WASM) with consent.
 */
import type { BotVoice } from "./store";

export const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const KOKORO_SIZE_HINT = "~92 MB (q8 WASM)";
export const KOKORO_LICENSE = "Apache-2.0 (hexgrad/Kokoro-82M)";
const CONSENT_KEY = "morse-kokoro-consent";

export type KokoroStatus =
  | { kind: "need-consent" }
  | { kind: "idle" }
  | { kind: "downloading"; pct: number; note: string }
  | { kind: "ready"; backend: "webgpu" | "wasm" }
  | { kind: "error"; message: string }
  | { kind: "speaking" };

type Listener = (s: KokoroStatus) => void;

let worker: Worker | null = null;
let status: KokoroStatus = hasConsent() ? { kind: "idle" } : { kind: "need-consent" };
const listeners = new Set<Listener>();
let loadPromise: Promise<void> | null = null;
let speakId = 0;
const pending = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();

function hasConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function kokoroConsented() {
  return hasConsent();
}

export function getKokoroStatus() {
  return status;
}

export function onKokoroStatus(fn: Listener) {
  listeners.add(fn);
  fn(status);
  return () => { listeners.delete(fn); };
}

function setStatus(s: KokoroStatus) {
  status = s;
  for (const fn of listeners) fn(s);
}

export function voiceForBot(kind: BotVoice): string {
  // Warm, higher-graded voices from Kokoro's table.
  return kind === "female" ? "af_heart" : "am_michael";
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (ev: MessageEvent) => {
    const m = ev.data;
    if (m.type === "progress") setStatus({ kind: "downloading", pct: m.pct, note: m.note });
    else if (m.type === "ready") setStatus({ kind: "ready", backend: m.backend });
    else if (m.type === "audio") {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        p.resolve(new Blob([m.wav], { type: "audio/wav" }));
      }
    } else if (m.type === "error") {
      if (m.id != null && pending.has(m.id)) {
        const p = pending.get(m.id)!;
        pending.delete(m.id);
        p.reject(new Error(m.message));
      } else {
        setStatus({ kind: "error", message: m.message });
        loadPromise = null;
      }
    }
  };
  worker.onerror = (e) => {
    setStatus({ kind: "error", message: e.message || "Natural voice worker crashed." });
    loadPromise = null;
  };
  return worker;
}

/** User tapped Enable — persist consent and start the download. */
export function consentKokoro(preferWebGPU = false): Promise<void> {
  try {
    localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    /* private mode — still try in-memory */
  }
  return ensureKokoro(preferWebGPU);
}

export function ensureKokoro(preferWebGPU = false): Promise<void> {
  if (!hasConsent() && status.kind === "need-consent") {
    return Promise.reject(new Error("Natural voice needs a one-time download (~92 MB). Tap Enable natural voice."));
  }
  if (status.kind === "ready") return Promise.resolve();
  if (loadPromise) return loadPromise;
  setStatus({ kind: "downloading", pct: 0, note: "Starting natural voice…" });
  const w = ensureWorker();
  loadPromise = new Promise<void>((resolve, reject) => {
    const unsub = onKokoroStatus((s) => {
      if (s.kind === "ready") {
        unsub();
        resolve();
      } else if (s.kind === "error") {
        unsub();
        loadPromise = null;
        reject(new Error(s.message));
      }
    });
    w.postMessage({ type: "load", preferWebGPU });
  });
  return loadPromise;
}

/** Synthesize one short chunk → WAV blob. */
export async function kokoroSynth(text: string, kind: BotVoice): Promise<Blob> {
  await ensureKokoro(false);
  const w = ensureWorker();
  const id = ++speakId;
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type: "speak", id, text, voice: voiceForBot(kind) });
  });
}

/** Split into short spoken chunks so first audio starts sooner. */
export function chunkForSpeech(text: string, max = 160): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean.split(/(?<=[.!?…])\s+/);
  const out: string[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + " " + p).trim().length > max && buf) {
      out.push(buf.trim());
      buf = p;
    } else buf = buf ? `${buf} ${p}` : p;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.length ? out : [clean.slice(0, max)];
}
