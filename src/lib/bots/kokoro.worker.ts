/**
 * Kokoro TTS in a dedicated worker so 3D / UI stay responsive.
 * Model: onnx-community/Kokoro-82M-v1.0-ONNX (Apache-2.0), q8 WASM ~92 MB.
 */
import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

type InMsg =
  | { type: "load"; preferWebGPU: boolean }
  | { type: "speak"; id: number; text: string; voice: string };

type OutMsg =
  | { type: "progress"; pct: number; note: string }
  | { type: "ready"; backend: "webgpu" | "wasm" }
  | { type: "audio"; id: number; wav: ArrayBuffer; sampleRate: number }
  | { type: "error"; id?: number; message: string };

let tts: KokoroTTS | null = null;
let backend: "webgpu" | "wasm" = "wasm";

function post(m: OutMsg) {
  self.postMessage(m);
}

async function load(preferWebGPU: boolean) {
  const progress_callback = (p: { status?: string; progress?: number; file?: string }) => {
    if (p.status === "progress" && typeof p.progress === "number") {
      post({ type: "progress", pct: Math.round(p.progress), note: p.file ? `Downloading ${p.file}` : "Downloading natural voice…" });
    } else if (p.status === "done") {
      post({ type: "progress", pct: 100, note: "Almost ready…" });
    } else if (p.status === "initiate") {
      post({ type: "progress", pct: 0, note: "Starting download (~92 MB, free, stays on this device)…" });
    }
  };

  // Prefer WASM q8 by default (smaller). Try WebGPU fp32 only when asked and available.
  if (preferWebGPU) {
    try {
      tts = await KokoroTTS.from_pretrained(MODEL, {
        dtype: "fp32",
        device: "webgpu",
        progress_callback,
      });
      backend = "webgpu";
      post({ type: "ready", backend });
      return;
    } catch (e) {
      post({
        type: "progress",
        pct: 0,
        note: `WebGPU voice failed (${e instanceof Error ? e.message : "error"}); trying smaller WASM build…`,
      });
    }
  }

  tts = await KokoroTTS.from_pretrained(MODEL, {
    dtype: "q8",
    device: "wasm",
    progress_callback,
  });
  backend = "wasm";
  post({ type: "ready", backend });
}

async function speak(id: number, text: string, voice: string) {
  if (!tts) {
    post({ type: "error", id, message: "Natural voice is not loaded yet." });
    return;
  }
  try {
    const audio = await tts.generate(text, { voice: voice as "af_heart" });
    const wav: Blob = audio.toBlob();
    const buf = await wav.arrayBuffer();
    post({ type: "audio", id, wav: buf, sampleRate: audio.sampling_rate || 24000 });
  } catch (e) {
    post({ type: "error", id, message: e instanceof Error ? e.message : "Voice synthesis failed." });
  }
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  if (msg.type === "load") {
    void load(msg.preferWebGPU).catch((e) =>
      post({ type: "error", message: e instanceof Error ? e.message : "Could not load natural voice." }),
    );
  } else if (msg.type === "speak") {
    void speak(msg.id, msg.text, msg.voice);
  }
};
