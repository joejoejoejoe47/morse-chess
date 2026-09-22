import { useSyncExternalStore } from "react";

export type LookPrefs = {
  version: 1;
  outline: boolean;
  roomColor: string | null;
  roomImage: string | null;
};

const KEY = "morse-look-prefs";
const EVENT = "morse-look-prefs";
const MAX_IMAGE = 1_600_000;

export const DEFAULT_LOOK: LookPrefs = {
  version: 1,
  outline: true,
  roomColor: null,
  roomImage: null,
};

export const ROOM_SWATCHES = [
  { id: "theme", label: "Theme", value: null },
  { id: "ink", label: "Ink", value: "#0c0d0b" },
  { id: "cream", label: "Cream", value: "#f6f1e4" },
  { id: "forest", label: "Forest", value: "#24332c" },
  { id: "walnut", label: "Walnut", value: "#3c261c" },
  { id: "slate", label: "Slate", value: "#1a2230" },
  { id: "stone", label: "Stone", value: "#d8d2c4" },
] as const;

let snapshot: LookPrefs = DEFAULT_LOOK;
let snapshotRaw: string | null = "__unset__";

function canStore() {
  return typeof window !== "undefined";
}

function isHex(v: string) {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

function isRoomImage(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("data:image/") && v.length > 32 && v.length < MAX_IMAGE;
}

function parsePrefs(raw: string | null): LookPrefs {
  if (!raw) return DEFAULT_LOOK;
  try {
    const parsed = JSON.parse(raw) as Partial<LookPrefs>;
    return {
      version: 1,
      outline: parsed.outline !== false,
      roomColor: typeof parsed.roomColor === "string" && isHex(parsed.roomColor) ? parsed.roomColor : null,
      roomImage: isRoomImage(parsed.roomImage) ? parsed.roomImage : null,
    };
  } catch {
    return DEFAULT_LOOK;
  }
}

export function loadLookPrefs(): LookPrefs {
  if (!canStore()) return DEFAULT_LOOK;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw === snapshotRaw) return snapshot;
  snapshotRaw = raw;
  snapshot = parsePrefs(raw);
  return snapshot;
}

export function saveLookPrefs(patch: Partial<LookPrefs>) {
  const current = loadLookPrefs();
  const next: LookPrefs = {
    ...current,
    ...patch,
    version: 1,
  };
  if (next.roomColor && !isHex(next.roomColor)) next.roomColor = null;
  if (!isRoomImage(next.roomImage)) next.roomImage = null;
  const raw = JSON.stringify(next);
  try {
    if (canStore()) localStorage.setItem(KEY, raw);
  } catch {
    return current;
  }
  snapshot = next;
  snapshotRaw = raw;
  if (canStore()) window.dispatchEvent(new Event(EVENT));
  return next;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useLookPrefs(): LookPrefs {
  return useSyncExternalStore(subscribe, loadLookPrefs, () => DEFAULT_LOOK);
}

export function roomColorFor(theme: "light" | "dark", prefs: LookPrefs) {
  return prefs.roomColor ?? (theme === "light" ? "#f6f1e4" : "#0c0d0b");
}

export function roomBackdrop(color: string, image: string | null) {
  if (!image) return { backgroundColor: color };
  return {
    backgroundColor: color,
    backgroundImage: `url("${image}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };
}
