/**
 * GLB loading that rides out a flaky host: each model is fetched up to 3 times with a short
 * backoff (a dropped connection or a file being swapped during a deploy usually clears in a
 * second), and the retries carry a cache-busting query so a bad cached reply is not reused.
 */
import { useGLTF } from "@react-three/drei";
import type { Loader } from "three";

export const GLB_TRIES = 3;
const BACKOFF_MS = [0, 700, 2000];

type LoadFn = (url: string, onLoad: (data: unknown) => void, onProgress?: (e: ProgressEvent) => void, onError?: (e: unknown) => void) => void;
type Patched = Loader & { load: LoadFn; __retrying?: true };

function bust(url: string, attempt: number) {
  return `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}-${Date.now().toString(36)}`;
}

/** Wrap a loader's `load` so a failed fetch or parse is retried (installed once per loader). */
export function retryGltfLoads(loader: Loader) {
  const l = loader as Patched;
  if (l.__retrying) return;
  l.__retrying = true;
  const load = l.load.bind(l) as LoadFn;
  l.load = (url, onLoad, onProgress, onError) => {
    let attempt = 0;
    const go = () =>
      load(attempt === 0 ? url : bust(url, attempt), onLoad, onProgress, (err) => {
        attempt += 1;
        if (attempt < GLB_TRIES) {
          console.warn(`[models] ${url} failed, retry ${attempt}/${GLB_TRIES - 1}`, err);
          window.setTimeout(go, BACKOFF_MS[attempt] ?? 2000);
        } else onError?.(err);
      });
    go();
  };
}

/** `useGLTF` with retries (meshopt and draco as usual). */
export function useResilientGLTF(url: string) {
  return useGLTF(url, true, true, retryGltfLoads);
}

useResilientGLTF.preload = (url: string) => useGLTF.preload(url, true, true, retryGltfLoads);
useResilientGLTF.clear = (url: string) => useGLTF.clear(url);
