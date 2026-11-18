/**
 * Legendary sound effects (synthesized in-house, see public/legendary/CREDITS.md): a soft whoosh
 * on menu buttons, a deep boom on checkmate, a coin jingle in the store, a chime on rank up.
 * One mute switch (Settings, and the speaker in the game bar), saved in this browser.
 */
import { asset } from "@/lib/base";

export type Sfx = "whoosh" | "boom" | "coin" | "rankup" | "tap" | "menu";
const KEY = "mcl-sfx-muted";
export const SFX_EVENT = "mcl-sfx-changed";
const VOLUME: Record<Sfx, number> = { whoosh: 0.28, boom: 0.75, coin: 0.5, rankup: 0.5, tap: 0.25, menu: 0.6 };
/** File per sound; "menu" is the user's own menu-open sound, whoosh if it is missing. */
const FILE: Partial<Record<Sfx, string>> = { menu: "menu-open" };
const broken = new Set<Sfx>();
const cache = new Map<Sfx, HTMLAudioElement>();
let lastAt = 0;

export function sfxMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setSfxMuted(muted: boolean) {
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(SFX_EVENT));
}

export function playSfx(name: Sfx) {
  if (typeof window === "undefined" || sfxMuted()) return;
  if (broken.has(name)) name = "whoosh";
  const now = performance.now();
  if ((name === "whoosh" || name === "tap") && now - lastAt < 90) return;
  lastAt = now;
  try {
    let base = cache.get(name);
    if (!base) {
      base = new Audio(asset(`/legendary/sfx/${FILE[name] ?? name}.mp3`));
      base.preload = "auto";
      const which = name;
      base.addEventListener("error", () => { if (which !== "whoosh") { broken.add(which); cache.delete(which); } });
      cache.set(name, base);
    }
    const a = base.cloneNode(true) as HTMLAudioElement;
    a.volume = VOLUME[name];
    void a.play().catch(() => {
      if (name === "menu" && !broken.has("menu") && base?.error) { broken.add("menu"); playSfx("whoosh"); }
    });
  } catch {
    /* audio is optional */
  }
}
