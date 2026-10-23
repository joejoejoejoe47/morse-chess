/**
 * Model loading that rides out a flaky host. Every GLB, FBX and image the 3D scenes load goes
 * through the loaders patched here, whoever calls them (drei's useGLTF/useFBX/useTexture,
 * preloads, or a hand-made GLTFLoader):
 *  - a failed fetch, a cut-off download (it fails to parse) or a stalled one (no bytes for a
 *    while) is retried with a growing backoff, and the retries carry a cache-busting query so a
 *    bad cached reply is never reused;
 *  - only after every try fails does the error reach React, where a per-piece `LoadGuard`
 *    shows a stand-in and keeps trying again in the background (see load-guard.tsx).
 */
import { useGLTF, useFBX, useTexture } from "@react-three/drei";
import { ImageLoader, type Loader } from "three";
import { GLTFLoader as StdGLTFLoader, FBXLoader as StdFBXLoader } from "three-stdlib";
import { GLTFLoader as ExGLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const GLB_TRIES = 6;
const BACKOFF_MS = [0, 600, 1500, 3000, 6000, 10000];
/** A download that sends no bytes for this long is abandoned and tried again. */
const STALL_MS = 25000;

type LoadFn = (
  url: string,
  onLoad: (data: unknown) => void,
  onProgress?: (e: ProgressEvent) => void,
  onError?: (e: unknown) => void,
) => unknown;
type Proto = { load: LoadFn; __resilient?: true };

function bust(url: string, attempt: number) {
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}-${Date.now().toString(36)}`;
}

function errText(err: unknown) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "type" in err) return `${(err as Event).type} event`;
  return String(err);
}

/** Make `load` on this prototype retry, cache-bust and watch for stalls. */
function patch(proto: Proto | undefined, stall: boolean) {
  if (!proto || proto.__resilient || typeof proto.load !== "function") return;
  proto.__resilient = true;
  const load = proto.load;
  proto.load = function (this: unknown, url, onLoad, onProgress, onError) {
    let attempt = 0;
    let settled = false;
    let first: unknown;
    const go = () => {
      const mine = attempt;
      let watchdog = 0;
      let done = false;
      const finish = () => {
        done = true;
        if (watchdog) window.clearTimeout(watchdog);
      };
      const fail = (err: unknown) => {
        if (done || settled || mine !== attempt) return;
        finish();
        attempt += 1;
        if (attempt < GLB_TRIES) {
          console.warn(`[models] ${url} failed (${errText(err)}), retry ${attempt}/${GLB_TRIES - 1}`);
          window.setTimeout(go, BACKOFF_MS[attempt] ?? 10000);
        } else {
          settled = true;
          console.warn(`[models] ${url} failed after ${GLB_TRIES} tries`, err);
          onError?.(err);
        }
      };
      const arm = () => {
        if (!stall) return;
        if (watchdog) window.clearTimeout(watchdog);
        watchdog = window.setTimeout(() => fail(new Error("download stalled")), STALL_MS);
      };
      arm();
      const out = load.call(
        this,
        mine === 0 ? url : bust(url, mine),
        (data) => {
          if (done || settled || mine !== attempt) return;
          finish();
          settled = true;
          onLoad(data);
        },
        (e) => {
          if (done || settled || mine !== attempt) return;
          arm();
          onProgress?.(e);
        },
        fail,
      );
      if (mine === 0) first = out;
    };
    go();
    return first;
  };
}

let installed = false;
/** Patch every model/image loader class the app uses (idempotent; runs on import). */
export function installResilientLoaders() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  patch(StdGLTFLoader.prototype as unknown as Proto, true);
  patch(ExGLTFLoader.prototype as unknown as Proto, true);
  patch(StdFBXLoader.prototype as unknown as Proto, true);
  patch(ImageLoader.prototype as unknown as Proto, false);
}
installResilientLoaders();

/** Kept for callers that pass it to useGLTF; the loaders are already patched globally. */
export function retryGltfLoads(_loader: Loader) {
  installResilientLoaders();
}

/** `useGLTF` (meshopt and draco as usual); retries come from the patched loader. */
export function useResilientGLTF(url: string) {
  return useGLTF(url, true, true);
}
useResilientGLTF.preload = (url: string) => useGLTF.preload(url, true, true);
useResilientGLTF.clear = (url: string) => useGLTF.clear(url);

/** The URL in a "Could not load <url>: …" error from useLoader, if there is one. */
export function failedUrl(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const m = /Could not load (.+?): /.exec(msg);
  return m ? m[1] : null;
}

/** True for errors that come from fetching or parsing a model/texture (not a code bug). */
export function isModelLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /Could not load|Failed to fetch|NetworkError|Load failed|download stalled|fetch for .* responded|Unexpected end|Invalid typed array|glTF|GLB|JSON\.parse|Unexpected token/i.test(
    msg,
  );
}

/** Drop a failed load from the cache so the next mount fetches it again. */
export function forgetFailedLoad(error: unknown) {
  const url = failedUrl(error);
  if (!url) return;
  for (const clear of [useGLTF.clear, useFBX.clear, useTexture.clear]) {
    try {
      clear(url);
    } catch {
      /* not in that cache */
    }
  }
}
