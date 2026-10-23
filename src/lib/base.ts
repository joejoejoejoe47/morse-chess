/**
 * Where the app is mounted. PHP injects `window.MORSE_BASE` (e.g. "/chess" or "")
 * into index.html, so the same build works at the site root or in a sub-folder.
 */
declare global {
  interface Window {
    MORSE_BASE?: string;
  }
}

function readBase(): string {
  if (typeof window === "undefined") return "";
  const raw = String(window.MORSE_BASE ?? "").trim();
  return raw.replace(/\/+$/, "");
}

export const BASE = readBase();

/** Content hashes of the models and sounds in public/, filled in at build time (vite.config.ts). */
declare const __ASSET_VERSIONS__: Record<string, string> | undefined;
const VERSIONS: Record<string, string> = typeof __ASSET_VERSIONS__ === "undefined" ? {} : __ASSET_VERSIONS__;

/**
 * Prefix a root-relative path ("/avatars/x.glb", "/api/rtc") with the mount point.
 * Models and sounds also get their content hash as ?v=, so they can be cached for a year
 * and a changed file is fetched fresh.
 */
export function asset(path: string): string {
  if (!path.startsWith("/")) return path;
  const q = path.indexOf("?");
  const bare = q < 0 ? path : path.slice(0, q);
  const v = VERSIONS[bare];
  return BASE + (v ? `${bare}?v=${v}` : path);
}

export const apiUrl = asset;
