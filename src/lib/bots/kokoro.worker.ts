/**
 * Kokoro TTS worker — SAME-ORIGIN only. One loaded model for all utterances
 * (one model after ready; a WebGPU failure reloads WASM in a fresh worker). Jobs are coalesced so a newer
 * reply replaces a stale one instead of playing late.
 */
import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";
import { loadKokoroDevice, probeWebGpuAdapter, sanitizeKokoroPcm, shouldReloadWasmAfterSynth } from "./kokoro-backend";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

type InMsg =
  | { type: "load"; assetBase: string; forceWasm?: boolean }
  | { type: "speak"; id: number; text: string; voice: string }
  | { type: "cancel"; id?: number };

type OutMsg =
  | { type: "progress"; pct: number; note: string }
  | { type: "ready"; backend: "webgpu" | "wasm" }
  | { type: "audio"; id: number; wav: ArrayBuffer; sampleRate: number; genMs: number; audioSec: number }
  | { type: "skipped"; id: number }
  | { type: "error"; id?: number; message: string }
  | { type: "reload-wasm"; reason: string; replay?: { id: number; text: string; voice: string } };

let tts: KokoroTTS | null = null;
let backend: "webgpu" | "wasm" | null = null;
let assetBase = "";
let progressCb: (p: { status?: string; progress?: number; file?: string }) => void = () => {};
const stale = new Set<number>();
let latest: { id: number; text: string; voice: string } | null = null;
let current: { id: number } | null = null;
let running = false;

function post(m: OutMsg) {
  self.postMessage(m);
}

function installFetchGuard(base: string) {
  const realFetch = self.fetch.bind(self);
  const voiceRe = /huggingface\.co\/onnx-community\/Kokoro-82M-v1\.0-ONNX\/resolve\/[^/]+\/voices\/([^/?#]+)\.bin/i;
  const remoteRe = /huggingface\.co|hf\.co|cdn\.jsdelivr\.net\/npm\/@?huggingface|cdn\.jsdelivr\.net\/npm\/onnxruntime/i;

  self.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const vm = url.match(voiceRe);
    if (vm) return realFetch(`${base}voices/${vm[1]}.bin`, init);
    try {
      const u = new URL(url, self.location.href);
      if (u.origin === self.location.origin || u.protocol === "blob:" || u.protocol === "data:") {
        return realFetch(input, init);
      }
    } catch {
      /* fall through */
    }
    if (remoteRe.test(url)) {
      return Promise.reject(new Error(`Blocked external voice/model fetch (${url.slice(0, 80)}…). Use the same-origin /bots/kokoro/ pack.`));
    }
    return realFetch(input, init);
  };
}

async function loadModel(forceWasm: boolean) {
  const wasmOpts = env.backends?.onnx?.wasm;
  if (wasmOpts && typeof crossOriginIsolated !== "undefined" && crossOriginIsolated) {
    try {
      const n = Math.min(4, (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2);
      wasmOpts.numThreads = n;
    } catch {
      /* single-thread WASM is fine */
    }
  }

  const gpu = typeof navigator !== "undefined" ? (navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu : undefined;
  const adapterOk = forceWasm ? false : await probeWebGpuAdapter(gpu);
  // Shipped dtype is q8: official kokoro-js pairs WebGPU with fp32, and
  // WebGPU+q8 has been reported to emit garbled speech (hexgrad/kokoro#68).
  post({ type: "progress", pct: 18, note: "Loading WASM q8…" });

  const result = await loadKokoroDevice({
    forceWasm,
    adapterOk,
    dtype: "q8",
    fromPretrained: async (device) => {
      tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8", device, progress_callback: progressCb });
      backend = device;
    },
  });
  return result;
}

async function load(base: string, forceWasm = false) {
  assetBase = base.endsWith("/") ? base : `${base}/`;
  installFetchGuard(assetBase);
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useBrowserCache = true;
  env.localModelPath = `${assetBase}models/`;
  const wasmOpts = env.backends?.onnx?.wasm;
  if (wasmOpts) wasmOpts.wasmPaths = `${assetBase}wasm/`;

  post({ type: "progress", pct: 5, note: "Loading natural voice from this site (~120 MB first time, then cached)…" });
  progressCb = (p: { status?: string; progress?: number; file?: string }) => {
    if (p.status === "progress" && typeof p.progress === "number") {
      post({ type: "progress", pct: Math.min(99, Math.round(p.progress)), note: p.file ? `Loading ${p.file}` : "Loading natural voice…" });
    } else if (p.status === "initiate") {
      post({ type: "progress", pct: 10, note: "Reading on-site Kokoro model…" });
    } else if (p.status === "done") {
      post({ type: "progress", pct: 95, note: "Almost ready…" });
    }
  };

  const result = await loadModel(forceWasm);
  if (result.kind === "reload-wasm") {
    post({ type: "reload-wasm", reason: result.reason });
    return;
  }
  post({ type: "ready", backend: result.backend });
}

async function speak(id: number, text: string, voice: string) {
  if (!tts) {
    post({ type: "error", id, message: "Natural voice is not loaded yet." });
    return;
  }
  if (stale.has(id)) {
    post({ type: "skipped", id });
    return;
  }
  const t0 = Date.now();
  try {
    const audio = await tts.generate(text, { voice: voice as "af_heart" });
    const genMs = Date.now() - t0;
    if (stale.has(id) || (latest && latest.id !== id)) {
      post({ type: "skipped", id });
      return;
    }
    if (audio.audio) sanitizeKokoroPcm(audio.audio);
    const sr = audio.sampling_rate || 24000;
    const audioSec = audio.audio ? audio.audio.length / sr : 0;
    const wav: Blob = audio.toBlob();
    const buf = await wav.arrayBuffer();
    // Copy via structured clone (no transfer list) so decodeAudioData cannot
    // detach the worker's buffer; the main thread also copies before decode.
    post({ type: "audio", id, wav: buf, sampleRate: sr, genMs, audioSec });
  } catch (e) {
    if (stale.has(id)) {
      post({ type: "skipped", id });
      return;
    }
    if (shouldReloadWasmAfterSynth(backend, e)) {
      post({
        type: "reload-wasm",
        reason: e instanceof Error ? e.message : "WebGPU synthesis failed.",
        replay: { id, text, voice },
      });
      return;
    }
    post({ type: "error", id, message: e instanceof Error ? e.message : "Voice synthesis failed." });
  }
}

async function runLoop() {
  if (running) return;
  running = true;
  while (latest) {
    const job = latest;
    latest = null;
    current = { id: job.id };
    if (stale.has(job.id)) {
      post({ type: "skipped", id: job.id });
      current = null;
      continue;
    }
    await speak(job.id, job.text, job.voice);
    current = null;
  }
  running = false;
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  if (msg.type === "load") {
    void load(msg.assetBase, !!msg.forceWasm).catch((e) => post({ type: "error", message: e instanceof Error ? e.message : "Could not load natural voice." }));
  } else if (msg.type === "speak") {
    stale.delete(msg.id);
    latest = { id: msg.id, text: msg.text, voice: msg.voice };
    void runLoop();
  } else if (msg.type === "cancel") {
    if (msg.id != null) {
      stale.add(msg.id);
      if (latest?.id === msg.id) latest = null;
    } else {
      if (latest) stale.add(latest.id);
      if (current) stale.add(current.id);
      latest = null;
    }
  }
};
