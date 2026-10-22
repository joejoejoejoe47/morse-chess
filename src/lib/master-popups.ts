/**
 * MasterGus's pop-up messages. He writes them in his goblin Sandbox project
 * (Pop-ups panel), which stores them as `popups` / `popupSettings` on
 * proj_mastergus_sandbox_setup. Morse Chess reads that same public project JSON.
 */
export const MASTER_POPUPS_URL = "/goblin/get.php?id=proj_mastergus_sandbox_setup";

export type MasterPopupSettings = {
  enabled: boolean;
  name: string;
  minSec: number;
  maxSec: number;
  showSec: number;
};

export type MasterPopups = { settings: MasterPopupSettings; messages: string[] };

const DEFAULTS: MasterPopupSettings = { enabled: true, name: "MasterGus", minSec: 60, maxSec: 180, showSec: 8 };

function num(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Pure parser for the goblin project JSON; anything unexpected becomes "no messages". */
export function parseMasterPopups(raw: unknown): MasterPopups {
  const proj = (raw && typeof raw === "object" ? raw : {}) as { popups?: unknown; popupSettings?: unknown };
  const s = (proj.popupSettings && typeof proj.popupSettings === "object" ? proj.popupSettings : {}) as Record<string, unknown>;
  const minSec = Math.max(15, num(s.minSec, DEFAULTS.minSec));
  const settings: MasterPopupSettings = {
    enabled: s.enabled !== false,
    name: typeof s.name === "string" && s.name.trim() ? s.name.trim().slice(0, 40) : DEFAULTS.name,
    minSec,
    maxSec: Math.max(minSec, num(s.maxSec, DEFAULTS.maxSec)),
    showSec: Math.min(30, Math.max(3, num(s.showSec, DEFAULTS.showSec))),
  };
  const messages = (Array.isArray(proj.popups) ? proj.popups : [])
    .filter((m): m is { text: string; enabled?: unknown } => !!m && typeof m === "object" && typeof (m as { text?: unknown }).text === "string")
    .filter((m) => m.enabled !== false && m.text.trim())
    .map((m) => m.text.trim().slice(0, 200));
  return { settings, messages };
}

/** Fetch the current list. Never throws: any failure means "nothing to show". */
export async function fetchMasterPopups(): Promise<MasterPopups | null> {
  try {
    const res = await fetch(MASTER_POPUPS_URL, { cache: "no-store", credentials: "omit" });
    if (!res.ok) return null;
    return parseMasterPopups(await res.json());
  } catch {
    return null;
  }
}

export function randomDelayMs(s: MasterPopupSettings) {
  return (s.minSec + Math.random() * (s.maxSec - s.minSec)) * 1000;
}
