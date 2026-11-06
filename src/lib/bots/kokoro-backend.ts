/**
 * Device policy for in-browser Kokoro.
 *
 * transformers.js (`createInferenceSession`) keeps the first
 * `InferenceSession.create` promise in a module-local `wasmInitPromise`
 * and every later session awaits it. If the first create used WebGPU and
 * failed ("no available backend found. ERR: [webgpu] Failed to get GPU
 * adapter"), that rejected promise is stored forever in this JS realm —
 * a same-worker `from_pretrained({ device: "wasm" })` throws the original
 * WebGPU error and never starts WASM. `!!navigator.gpu` is not enough:
 * Chrome often exposes `navigator.gpu` when `requestAdapter()` returns null.
 *
 * We only ship q8 (~92 MB). Official kokoro-js says: "If using webgpu, we
 * recommend using dtype=fp32." WebGPU + q8/q4 has been reported to succeed
 * and then emit garbled speech (hexgrad/kokoro#68). fp32 is ~310 MB and is
 * not in the on-site pack, so we never select WebGPU for the shipped dtype.
 * Probe + reload-wasm remain so a future fp32 path (or a leftover GPU
 * error) can still recover in a fresh worker.
 */

export const GPU_ADAPTER_ERROR =
  "no available backend found. ERR: [webgpu] Failed to get GPU adapter";

/** Dtype of the on-site model_quantized.onnx pack. */
export const SHIPPED_DTYPE = "q8" as const;

export function isGpuBackendFailure(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    /no available backend/.test(msg) ||
    /failed to get gpu adapter/.test(msg) ||
    /\[webgpu\]/.test(msg) ||
    /gpu adapter/.test(msg) ||
    /enable-unsafe-webgpu/.test(msg)
  );
}

export type GpuLike = {
  requestAdapter?: (opts?: Record<string, unknown>) => Promise<unknown>;
} | null | undefined;

/** True only if requestAdapter() returns an adapter object. */
export async function probeWebGpuAdapter(gpu: GpuLike): Promise<boolean> {
  if (!gpu || typeof gpu.requestAdapter !== "function") return false;
  try {
    const adapter = await gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

/**
 * Pick the ONNX device for a given dtype.
 * Quantized weights stay on WASM. WebGPU is only considered for fp32/fp16
 * when a real adapter exists.
 */
export function pickInitialDevice(opts: {
  forceWasm?: boolean;
  adapterOk: boolean;
  dtype?: string;
}): "webgpu" | "wasm" {
  if (opts.forceWasm) return "wasm";
  const dtype = opts.dtype ?? SHIPPED_DTYPE;
  if (dtype === "q8" || dtype === "q4" || dtype === "q4f16") return "wasm";
  if (!opts.adapterOk) return "wasm";
  return "webgpu";
}

export type DeviceLoadResult =
  | { kind: "ready"; backend: "webgpu" | "wasm" }
  | { kind: "reload-wasm"; reason: string };

/**
 * Load WebGPU only when the dtype pairing allows it and an adapter exists.
 * After a WebGPU failure, try WASM in this realm (works if
 * createInferenceSession never ran); if that still looks like a GPU backend
 * error, request a fresh-worker WASM reload.
 */
export async function loadKokoroDevice(opts: {
  forceWasm: boolean;
  adapterOk: boolean;
  dtype?: string;
  fromPretrained: (device: "webgpu" | "wasm") => Promise<unknown>;
}): Promise<DeviceLoadResult> {
  const device = pickInitialDevice({
    forceWasm: opts.forceWasm,
    adapterOk: opts.adapterOk,
    dtype: opts.dtype ?? SHIPPED_DTYPE,
  });
  if (device === "wasm") {
    await opts.fromPretrained("wasm");
    return { kind: "ready", backend: "wasm" };
  }
  try {
    await opts.fromPretrained("webgpu");
    return { kind: "ready", backend: "webgpu" };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    try {
      await opts.fromPretrained("wasm");
      return { kind: "ready", backend: "wasm" };
    } catch (e2) {
      const reason2 = e2 instanceof Error ? e2.message : String(e2);
      if (isGpuBackendFailure(e) || isGpuBackendFailure(e2)) {
        return { kind: "reload-wasm", reason: reason2 || reason };
      }
      throw e2;
    }
  }
}

export function shouldReloadWasmAfterSynth(backend: "webgpu" | "wasm" | null, err: unknown): boolean {
  return backend === "webgpu" && isGpuBackendFailure(err);
}

/** Same-realm poison: first failed WebGPU InferenceSession.create blocks later WASM creates. */
export function makePoisonedSessionStore() {
  let init: Promise<unknown> | null = null;
  return async function fromPretrained(device: "webgpu" | "wasm") {
    const p =
      device === "webgpu"
        ? Promise.reject(new Error(GPU_ADAPTER_ERROR))
        : Promise.resolve("wasm-session");
    init ??= p;
    await init;
    return p;
  };
}

/**
 * Kokoro / transformers RawAudio is IEEE-float32, nominally in [-1, 1].
 * Node CPU q8 reference clips from this repo (2026-11-06) were speech-like
 * overall but contained NaN, Inf, and |x| >> 1 spikes. HTMLAudio often
 * survives that; AudioContext.decodeAudioData can "succeed" while sounding
 * unintelligible. Mutates `samples` in place.
 */
export function sanitizeKokoroPcm(samples: Float32Array): { replaced: number } {
  let replaced = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    if (!Number.isFinite(x)) {
      samples[i] = 0;
      replaced++;
    } else if (x > 1) {
      samples[i] = 1;
      replaced++;
    } else if (x < -1) {
      samples[i] = -1;
      replaced++;
    }
  }
  return { replaced };
}
