/**
 * Browser Kokoro TTS controller (main thread).
 * Same-origin pack under /bots/kokoro/ — no Hugging Face network.
 */
import type { BotVoice } from "./store";
import { asset } from "@/lib/base";

export const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
/** Honest size of the shipped same-origin pack (model + 2 voices + WASM). */
export const KOKORO_SIZE_HINT = "~120 MB first enable (then browser-cached)";
export const KOKORO_LICENSE = "Apache-2.0 (hexgrad/Kokoro-82M)";
const CONSENT_KEY = "morse-kokoro-consent-v2";

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
let forceWasmOnly = false;
let restarting = false;
const FORCE_WASM_KEY = "morse-kokoro-force-wasm";
export type SynthResult = { blob: Blob; genMs: number; audioSec: number };
const pending = new Map<number, { resolve: (b: SynthResult) => void; reject: (e: Error) => void }>();

function hasConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

function readForceWasm() {
  try {
    return sessionStorage.getItem(FORCE_WASM_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberForceWasm() {
  forceWasmOnly = true;
  try {
    sessionStorage.setItem(FORCE_WASM_KEY, "1");
  } catch {
    /* private mode */
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
  return () => {
    listeners.delete(fn);
  };
}

function setStatus(s: KokoroStatus) {
  status = s;
  for (const fn of listeners) fn(s);
}

export function voiceForBot(kind: BotVoice): string {
  return kind === "female" ? "af_heart" : "am_michael";
}

/** Absolute base URL for /bots/kokoro/ (honors MORSE_BASE). */
export function kokoroAssetBase(): string {
  // asset() returns e.g. "/bots/kokoro" or "/chess/bots/kokoro"
  const rel = asset("/bots/kokoro/");
  return new URL(rel.endsWith("/") ? rel : `${rel}/`, window.location.href).href;
}

function dropWorker() {
  if (!worker) return;
  restarting = true;
  try {
    worker.terminate();
  } catch {
    /* already gone */
  }
  worker = null;
  restarting = false;
}

/** Fresh worker so transformers.js is not stuck on a rejected WebGPU InferenceSession.create. */
function restartWorkerForWasm(reason: string, replay?: { id: number; text: string; voice: string }) {
  rememberForceWasm();
  dropWorker();
  setStatus({ kind: "downloading", pct: 20, note: "WebGPU unavailable; switching to WASM..." });
  const w = ensureWorker();
  w.postMessage({ type: "load", assetBase: kokoroAssetBase(), forceWasm: true });
  if (replay && pending.has(replay.id)) {
    const unsub = onKokoroStatus((s) => {
      if (s.kind === "ready") {
        unsub();
        w.postMessage({ type: "speak", id: replay.id, text: replay.text, voice: replay.voice });
      } else if (s.kind === "error") {
        unsub();
      }
    });
  }
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
        p.resolve({ blob: new Blob([m.wav], { type: "audio/wav" }), genMs: m.genMs ?? 0, audioSec: m.audioSec ?? 0 });
      }
    } else if (m.type === "skipped") {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        p.reject(new Error("cancelled"));
      }
    } else if (m.type === "reload-wasm") {
      void restartWorkerForWasm(m.reason, m.replay);
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
    if (restarting) return;
    setStatus({ kind: "error", message: e.message || "Natural voice worker crashed." });
    loadPromise = null;
  };
  return worker;
}

export function consentKokoro(_preferWebGPU = false): Promise<void> {
  try {
    localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    /* private mode */
  }
  return ensureKokoro();
}

export function ensureKokoro(_preferWebGPU = false): Promise<void> {
  if (!hasConsent() && status.kind === "need-consent") {
    return Promise.reject(new Error(`Natural voice needs one consent to load the on-site pack (${KOKORO_SIZE_HINT}). Tap Enable natural voice.`));
  }
  if (status.kind === "ready") return Promise.resolve();
  if (loadPromise) return loadPromise;
  if (readForceWasm()) forceWasmOnly = true;
  // A prior WebGPU failure poisons this worker's ONNX init promise - start clean.
  if (status.kind === "error") dropWorker();
  setStatus({ kind: "downloading", pct: 0, note: "Starting on-site natural voice…" });
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
    w.postMessage({ type: "load", assetBase: kokoroAssetBase(), forceWasm: forceWasmOnly });
  });
  return loadPromise;
}

export function cancelKokoro() {
  if (!worker) return;
  for (const id of pending.keys()) worker.postMessage({ type: "cancel", id });
  worker.postMessage({ type: "cancel" });
}

export async function kokoroSynth(text: string, kind: BotVoice): Promise<SynthResult> {
  await ensureKokoro();
  const w = ensureWorker();
  const id = ++speakId;
  return new Promise<SynthResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type: "speak", id, text, voice: voiceForBot(kind) });
  });
}

function splitToMax(piece: string, max: number): string[] {
  if (piece.length <= max) return [piece];
  const clauses = piece.split(/(?<=[,;:—–-])\s+/);
  const out: string[] = [];
  let buf = "";
  const flushWords = (s: string) => {
    if (s.length <= max) {
      out.push(s);
      return;
    }
    let wbuf = "";
    for (const w of s.split(" ")) {
      if ((wbuf + " " + w).trim().length > max && wbuf) {
        out.push(wbuf.trim());
        wbuf = w;
      } else wbuf = wbuf ? `${wbuf} ${w}` : w;
    }
    if (wbuf.trim()) out.push(wbuf.trim());
  };
  for (const c of clauses) {
    if ((buf + " " + c).trim().length > max && buf) {
      flushWords(buf.trim());
      buf = c;
    } else buf = buf ? `${buf} ${c}` : c;
  }
  if (buf.trim()) flushWords(buf.trim());
  return out;
}

/**
 * Short first chunk so WASM (often ~1–2× realtime) can start audio quickly.
 * A 160-char first chunk is ~10s of speech → ~20–30s to first sound on single-thread WASM.
 */
export function chunkForSpeech(text: string, firstMax = 56, laterMax = 110): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    const max = out.length === 0 ? firstMax : laterMax;
    out.push(...splitToMax(s, max));
  }
  return out.length ? out : [clean.slice(0, firstMax)];
}
