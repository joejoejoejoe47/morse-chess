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

/** Prefix a root-relative path ("/avatars/x.glb", "/api/rtc") with the mount point. */
export function asset(path: string): string {
  return path.startsWith("/") ? BASE + path : path;
}

export const apiUrl = asset;
