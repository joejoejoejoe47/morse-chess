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
 * Policy: probe a real adapter before trying WebGPU; if a WebGPU create
 * still fails, ask the main thread to terminate this worker and reload
 * WASM-only in a fresh realm.
 *
 * Shipped dtype is official fp32 (not q8). kokoro-js recommends WebGPU with
 * fp32; WASM fp32 is the tested fallback. Never silently fall back to q8.
 */

export const SHIPPED_DTYPE = "fp32" as const;

export const GPU_ADAPTER_ERROR =
  "no available backend found. ERR: [webgpu] Failed to get GPU adapter";

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

export function pickInitialDevice(opts: { forceWasm?: boolean; adapterOk: boolean }): "webgpu" | "wasm" {
  if (opts.forceWasm || !opts.adapterOk) return "wasm";
  return "webgpu";
}

export type DeviceLoadResult =
  | { kind: "ready"; backend: "webgpu" | "wasm" }
  | { kind: "reload-wasm"; reason: string };

/**
 * Load WebGPU only when an adapter exists. After a WebGPU failure, try WASM
 * in this realm (works if createInferenceSession never ran); if that still
 * looks like a GPU backend error, request a fresh-worker WASM reload.
 */
export async function loadKokoroDevice(opts: {
  forceWasm: boolean;
  adapterOk: boolean;
  fromPretrained: (device: "webgpu" | "wasm") => Promise<unknown>;
}): Promise<DeviceLoadResult> {
  const device = pickInitialDevice({ forceWasm: opts.forceWasm, adapterOk: opts.adapterOk });
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
