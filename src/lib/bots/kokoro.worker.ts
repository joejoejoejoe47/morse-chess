/**
 * Kokoro TTS worker — SAME-ORIGIN only.
 * Model/voices/WASM are served from /bots/kokoro/ (copied into public/ at build time).
 * Remote Hugging Face / CDN fetches are blocked.
 */
import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

type InMsg =
  | { type: "load"; assetBase: string }
  | { type: "speak"; id: number; text: string; voice: string };

type OutMsg =
  | { type: "progress"; pct: number; note: string }
  | { type: "ready"; backend: "wasm" }
  | { type: "audio"; id: number; wav: ArrayBuffer; sampleRate: number }
  | { type: "error"; id?: number; message: string };

let tts: KokoroTTS | null = null;
let assetBase = ""; // absolute, trailing slash, e.g. http://127.0.0.1:8796/bots/kokoro/

function post(m: OutMsg) {
  self.postMessage(m);
}

/** Redirect HF voice URLs to same-origin pack; block other remote model hosts. */
function installFetchGuard(base: string) {
  const realFetch = self.fetch.bind(self);
  const voiceRe = /huggingface\.co\/onnx-community\/Kokoro-82M-v1\.0-ONNX\/resolve\/[^/]+\/voices\/([^/?#]+)\.bin/i;
  const remoteRe = /huggingface\.co|hf\.co|cdn\.jsdelivr\.net\/npm\/@?huggingface|cdn\.jsdelivr\.net\/npm\/onnxruntime/i;

  self.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    const vm = url.match(voiceRe);
    if (vm) {
      return realFetch(`${base}voices/${vm[1]}.bin`, init);
    }

    // Same-origin or blob/data always OK
    try {
      const u = new URL(url, self.location.href);
      if (u.origin === self.location.origin || u.protocol === "blob:" || u.protocol === "data:") {
        return realFetch(input, init);
      }
    } catch {
      /* fall through */
    }

    if (remoteRe.test(url)) {
      return Promise.reject(
        new Error(`Blocked external voice/model fetch (${url.slice(0, 80)}…). Use the same-origin /bots/kokoro/ pack.`),
      );
    }
    return realFetch(input, init);
  };
}

async function load(base: string) {
  assetBase = base.endsWith("/") ? base : `${base}/`;
  installFetchGuard(assetBase);

  // transformers.js: load ONLY from our packaged files
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useBrowserCache = true;
  // localModelPath + model id → `${localModelPath}${modelId}/...`
  env.localModelPath = `${assetBase}models/`;
  // onnxruntime WASM from same pack (stable names, not Vite-hashed)
  env.backends.onnx.wasm.wasmPaths = `${assetBase}wasm/`;

  post({ type: "progress", pct: 5, note: "Loading natural voice from this site (~120 MB first time, then cached)…" });

  const progress_callback = (p: { status?: string; progress?: number; file?: string }) => {
    if (p.status === "progress" && typeof p.progress === "number") {
      post({ type: "progress", pct: Math.min(99, Math.round(p.progress)), note: p.file ? `Loading ${p.file}` : "Loading natural voice…" });
    } else if (p.status === "initiate") {
      post({ type: "progress", pct: 10, note: "Reading on-site Kokoro model…" });
    } else if (p.status === "done") {
      post({ type: "progress", pct: 95, note: "Almost ready…" });
    }
  };

  tts = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: "q8",
    device: "wasm",
    progress_callback,
  });

  post({ type: "ready", backend: "wasm" });
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
    void load(msg.assetBase).catch((e) =>
      post({ type: "error", message: e instanceof Error ? e.message : "Could not load natural voice." }),
    );
  } else if (msg.type === "speak") {
    void speak(msg.id, msg.text, msg.voice);
  }
};
