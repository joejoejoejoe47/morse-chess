/**
 * Morse Chess Legendary (alltherex.com/chessledgendary/). The same build as Morse Chess: the
 * /chessledgendary/ front controller sets window.MORSE_THEME = "legendary" and
 * window.MORSE_ROUTER_BASE = "/chessledgendary", while MORSE_BASE stays "/chess" so every API
 * call, model and sound still comes from the one shared Morse Chess backend and database.
 */
import { asset } from "@/lib/base";

declare global {
  interface Window {
    MORSE_THEME?: string;
    MORSE_ROUTER_BASE?: string;
  }
}

export const LEGENDARY = typeof window !== "undefined" && window.MORSE_THEME === "legendary";

/** Fonts are loaded from JS so their URLs follow the mount point like every other asset. */
export function installLegendaryChrome() {
  if (!LEGENDARY || typeof document === "undefined") return;
  document.documentElement.classList.add("legendary");
  document.documentElement.classList.remove("light");
  if (document.getElementById("mcl-fonts")) return;
  const style = document.createElement("style");
  style.id = "mcl-fonts";
  style.textContent = [600, 700, 800]
    .map(
      (w) =>
        `@font-face{font-family:"Cinzel";font-style:normal;font-weight:${w};font-display:swap;src:url("${asset(`/legendary/fonts/cinzel-${w}.woff2`)}") format("woff2");}`,
    )
    .join("\n");
  style.textContent += [500, 600, 700]
    .map(
      (w) =>
        `\n@font-face{font-family:"Barlow Semi Condensed";font-style:normal;font-weight:${w};font-display:swap;src:url("${asset(`/legendary/fonts/barlow-sc-${w}.woff2`)}") format("woff2");}`,
    )
    .join("");
  // 9-slice frame art for the panels (drawn by scripts, see public/legendary/CREDITS.md).
  style.textContent += `\nhtml.legendary{${["gold", "purple", "row", "violet", "chip", "btn"].map((n) => `--mcl-frame-${n}:url("${asset(`/legendary/ui/frame-${n}.png`)}");`).join("")}}`;
  document.head.appendChild(style);
  document.title = "Morse Chess Legendary";
}

// ── ranks (Bronze → Legendary, from the real Elo) ─────────────────────────

export type RankTier = { id: string; name: string; min: number; color: string; glow: string };

export const RANKS: RankTier[] = [
  { id: "bronze", name: "Bronze", min: 0, color: "#c98b55", glow: "rgba(201,139,85,0.55)" },
  { id: "silver", name: "Silver", min: 1100, color: "#cfd6e0", glow: "rgba(207,214,224,0.5)" },
  { id: "gold", name: "Gold", min: 1300, color: "#f2c94c", glow: "rgba(242,201,76,0.55)" },
  { id: "platinum", name: "Platinum", min: 1500, color: "#7fe0d4", glow: "rgba(127,224,212,0.5)" },
  { id: "diamond", name: "Diamond", min: 1700, color: "#9b7bff", glow: "rgba(155,123,255,0.6)" },
  { id: "master", name: "Master", min: 1900, color: "#ff6fae", glow: "rgba(255,111,174,0.55)" },
  { id: "legendary", name: "Legendary", min: 2100, color: "#ffd86b", glow: "rgba(255,216,107,0.75)" },
];

export function rankFor(score: number): { tier: RankTier; index: number; next: RankTier | null; progress: number } {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i].min) index = i;
  const tier = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  const progress = next ? Math.max(0, Math.min(1, (score - tier.min) / (next.min - tier.min))) : 1;
  return { tier, index, next, progress };
}

// ── rarity (store + boards) ───────────────────────────────────────────────

export type Rarity = "common" | "rare" | "epic" | "legendary";

export const RARITY: Record<Rarity, { name: string; color: string; glow: string; bg: string }> = {
  common: { name: "Common", color: "#9aa0a8", glow: "rgba(154,160,168,0.35)", bg: "linear-gradient(180deg,#5d636b,#3b4047)" },
  rare: { name: "Rare", color: "#3d8bff", glow: "rgba(61,139,255,0.45)", bg: "linear-gradient(180deg,#2f7bff,#1546a8)" },
  epic: { name: "Epic", color: "#a34dff", glow: "rgba(163,77,255,0.5)", bg: "linear-gradient(180deg,#9b3dff,#5a1aa8)" },
  legendary: { name: "Legendary", color: "#f2b632", glow: "rgba(242,182,50,0.6)", bg: "linear-gradient(180deg,#f6cf5a,#b9811d)" },
};

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary"];

/** Coin price → rarity. Prices in Morse Chess are small (2–200 coins). */
export function rarityForCoins(coins: number): Rarity {
  if (coins >= 60) return "legendary";
  if (coins >= 12) return "epic";
  if (coins >= 5) return "rare";
  return "common";
}

/** Boards unlocked by Elo instead of coins. */
export function rarityForElo(elo: number): Rarity {
  if (elo >= 1560) return "legendary";
  if (elo >= 1450) return "epic";
  if (elo >= 1300) return "rare";
  return "common";
}

// ── seasons (America/Chicago; holidays first): pure date logic lives in ./season.ts

export * from "./season";
import { SEASONS, seasonFor, type Season } from "./season";

const SEASON_KEY = "mcl-season";

/** "auto" or a pinned season (Settings → Background). `?season=` previews one without saving. */
export function activeSeason(): Season {
  try {
    const q = new URLSearchParams(window.location.search).get("season");
    if (q && SEASONS.some((s) => s.id === q)) return q as Season;
    const saved = localStorage.getItem(SEASON_KEY);
    if (saved && SEASONS.some((s) => s.id === saved)) return saved as Season;
  } catch {
    /* ignore */
  }
  return seasonFor();
}

export function pinnedSeason(): Season | "auto" {
  try {
    const saved = localStorage.getItem(SEASON_KEY);
    if (saved && SEASONS.some((s) => s.id === saved)) return saved as Season;
  } catch {
    /* ignore */
  }
  return "auto";
}

export function pinSeason(s: Season | "auto") {
  try {
    if (s === "auto") localStorage.removeItem(SEASON_KEY);
    else localStorage.setItem(SEASON_KEY, s);
    window.dispatchEvent(new Event("mcl-season"));
  } catch {
    /* ignore */
  }
}

export function seasonImage(s: Season, small = false) {
  return asset(`/legendary/bg/${s}${small ? "-sm" : ""}.webp`);
}

/** Particles drawn over each background: very few, slow, low opacity. */
export const SEASON_PARTICLE: Record<Season, "leaf" | "snow" | "petal" | "firefly" | "spark"> = {
  fall: "leaf",
  halloween: "leaf",
  thanksgiving: "leaf",
  winter: "snow",
  christmas: "snow",
  newyear: "spark",
  spring: "petal",
  easter: "petal",
  summer: "firefly",
};
