const COINS = "morse-battle-coins";
const SETTINGS = "morse-battle-settings";

export type BattleSettings = {
  anim: number;
  speed: number;
  characters: number;
};

export const DEFAULT_SETTINGS: BattleSettings = {
  anim: 0.92,
  speed: 0.58,
  characters: 1,
};

export function loadCoins() {
  try {
    const raw = localStorage.getItem(COINS);
    if (raw == null) return 80;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  } catch {
    /* private mode */
  }
  return 80;
}

export function saveCoins(n: number) {
  try {
    localStorage.setItem(COINS, String(Math.max(0, Math.floor(n))));
  } catch {
    /* ignore */
  }
}

export function loadSettings(): BattleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<BattleSettings>;
    return {
      anim: clamp(parsed.anim, DEFAULT_SETTINGS.anim),
      speed: clamp(parsed.speed, DEFAULT_SETTINGS.speed),
      characters: clamp(parsed.characters, DEFAULT_SETTINGS.characters),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: BattleSettings) {
  try {
    localStorage.setItem(SETTINGS, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

function clamp(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}
