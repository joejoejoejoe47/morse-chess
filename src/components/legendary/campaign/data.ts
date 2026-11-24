/**
 * Legendary Campaign data (owner t381u): army tiers and perks, the five chapters, and the RPCs.
 * The XP numbers mirror php/src/Campaign.php (the server is the one that pays).
 */
import { rpc } from "@/lib/rpc";
import { sq, type Kind, type PerkId, type Rules } from "./engine";

// ── army ─────────────────────────────────────────────────────────────────

export const LEVELS = [0, 40, 100, 180, 290, 430, 600, 800, 1050, 1350];
export const PERK_LEVEL = 3;
export const levelFor = (xp: number) => LEVELS.reduce((lv, need, i) => (xp >= need ? i + 1 : lv), 1);
export function levelProgress(xp: number): { level: number; into: number; span: number; pct: number } {
  const level = levelFor(xp);
  if (level >= 10) return { level, into: 0, span: 0, pct: 1 };
  const lo = LEVELS[level - 1];
  const hi = LEVELS[level];
  return { level, into: xp - lo, span: hi - lo, pct: (xp - lo) / (hi - lo) };
}

export type TierId = "wood" | "bronze" | "silver" | "obsidian" | "gold";
export type Tier = { id: TierId; name: string; from: number; color: string; metal: number; rough: number; emissive: string; glow: number; ring: string };
export const TIERS: Tier[] = [
  { id: "wood", name: "Wood", from: 1, color: "#b07a45", metal: 0.02, rough: 0.72, emissive: "#000000", glow: 0, ring: "#9a6a3a" },
  { id: "bronze", name: "Bronze", from: 3, color: "#c07a3a", metal: 0.85, rough: 0.34, emissive: "#3a1a00", glow: 0.06, ring: "#d08a48" },
  { id: "silver", name: "Silver", from: 5, color: "#dfe4ec", metal: 0.95, rough: 0.2, emissive: "#202838", glow: 0.06, ring: "#e8eef8" },
  { id: "obsidian", name: "Obsidian", from: 7, color: "#221a30", metal: 0.45, rough: 0.06, emissive: "#4a1a8a", glow: 0.35, ring: "#9b5cff" },
  { id: "gold", name: "Glowing Gold", from: 9, color: "#ffcf4a", metal: 1, rough: 0.16, emissive: "#b07800", glow: 0.55, ring: "#ffd86b" },
];
export const tierFor = (level: number): Tier => [...TIERS].reverse().find((t) => level >= t.from) ?? TIERS[0];

/** What a level shows on the board: scars from 4, a banner from 6, an aura from 8. */
export const looksFor = (level: number) => ({ scars: level >= 4, banner: level >= 6, aura: level >= 8 });

export type ArmySlot = {
  slot: string;
  xp: number;
  level: number;
  games: number;
  survived: number;
  captures: number;
  bigCaptures: number;
  checks: number;
  mates: number;
  promos: number;
  perkOn: boolean;
};

export const SLOT_ORDER = ["ra", "nb", "bc", "q", "k", "bf", "ng", "rh", "pa", "pb", "pc", "pd", "pe", "pf", "pg", "ph"];
export const kindOfSlot = (slot: string): Kind => (slot === "q" || slot === "k" ? (slot as Kind) : (slot[0] as Kind));
const KIND_NAME: Record<Kind, string> = { k: "King", q: "Queen", r: "Rook", b: "Bishop", n: "Knight", p: "Pawn" };
export function slotName(slot: string): string {
  const k = kindOfSlot(slot);
  if (k === "k" || k === "q") return `The ${KIND_NAME[k]}`;
  const f = slot[1].toUpperCase();
  if (k === "p") return `${f}-Pawn`;
  return `${f === "A" || f === "B" || f === "C" ? "Queenside" : "Kingside"} ${KIND_NAME[k]}`;
}
export const slotSquare = (slot: string) => {
  const k = kindOfSlot(slot);
  if (k === "k") return "e1";
  if (k === "q") return "d1";
  return slot[1] + (k === "p" ? "2" : "1");
};

export type Perk = { id: PerkId; name: string; title: string; text: string; how: string };
export const PERKS: Partial<Record<Kind, Perk>> = {
  p: {
    id: "shield-wall",
    name: "Shield Wall",
    title: "Veteran Pawn",
    text: "Once per game, can step 1 square sideways if a friendly pawn is directly beside it.",
    how: "Shown as a purple target next to the pawn. Moving there uses it up for the game.",
  },
  n: {
    id: "phase-leap",
    name: "Phase Leap",
    title: "Shadow Knight",
    text: "Once per game, leaps 2 squares straight over anything in the way, even Stone Walls and gears.",
    how: "Boss arenas block normal moves with walls, gears and glass; the leap ignores all of them once.",
  },
  r: {
    id: "batter",
    name: "Batter",
    title: "Siege Rook",
    text: "Every capture pays +15 bonus coins (up to 3 per battle), and it smashes a Stone Wall in one hit.",
    how: "The \"aura push\" is the double wall damage. Coins are paid when the battle ends.",
  },
  b: {
    id: "ricochet",
    name: "Ricochet",
    title: "Arcane Bishop",
    text: "Once per game, one diagonal slide can bounce off the board edge at 90 degrees.",
    how: "The bounce targets glow purple. It still stops at the first piece after the bounce.",
  },
  q: {
    id: "inspire",
    name: "Inspire",
    title: "Royal Queen",
    text: "Friendly pawns within 1 square of the Queen cannot be captured by enemy pawns.",
    how: "Always on while the perk is equipped. Other enemy pieces can still take those pawns.",
  },
};

export const VETERAN_PROMOS = 3;
export const VETERAN_TITLE = "Veteran of the King's File";

// ── chapters ─────────────────────────────────────────────────────────────

export type Chapter = {
  n: number;
  boss: string;
  arena: string;
  epithet: string;
  twist: string;
  quote: string;
  rewards: { id: string; name: string; kind: "board" | "frame" | "skin" | "aura" | "vfx" | "companion" }[];
  rules: Rules;
  level: { depth: number; noise: number; ms: number };
  /** colours for the arena */
  sky: string;
  glow: string;
  accent: string;
  board: string;
  bossInk: string;
  /** where its landmark stands on the world map (x, z) */
  at: [number, number];
};

const S = (n: string) => sq(n);

export const CHAPTERS: Chapter[] = [
  {
    n: 1,
    boss: "The Clockwork Warden",
    arena: "Gearworks Foundry",
    epithet: "Keeper of the Brass Engine",
    twist: "Four centre tiles are rotating gears. Every 4 turns they shift any piece standing on them 1 square clockwise.",
    quote: "Tick. Tock. Every piece you place, my gears will move.",
    rewards: [
      { id: "steampunk-brass", name: "Steampunk Brass Board", kind: "board" },
      { id: "gear", name: "Gear Avatar Frame", kind: "frame" },
    ],
    rules: { gears: [S("d4"), S("d5"), S("e5"), S("e4")], gearEvery: 8 },
    level: { depth: 2, noise: 35, ms: 900 },
    sky: "#1a0f08",
    glow: "#f0a040",
    accent: "#d9a04a",
    board: "steampunk-brass",
    bossInk: "#3a2614",
    at: [-7.2, 4.2],
  },
  {
    n: 2,
    boss: "Queen Aurelia",
    arena: "Mirror Citadel",
    epithet: "Sovereign of Reflections",
    twist: "Every 5 turns she summons a fragile Glass Pawn. It shatters the moment you attack it. Spot the fakes.",
    quote: "Which of my pawns is real, little king? Look closer.",
    rewards: [
      { id: "crystal-palace", name: "Crystal Palace Board", kind: "board" },
      { id: "crowned-pawn", name: "Crowned Pawn Skin", kind: "skin" },
    ],
    rules: { glassEvery: 5 },
    level: { depth: 3, noise: 30, ms: 1100 },
    sky: "#0a1426",
    glow: "#a8d8ff",
    accent: "#cfe8ff",
    board: "crystal-palace",
    bossInk: "#2a3a66",
    at: [-3.2, -0.6],
  },
  {
    n: 3,
    boss: "General Ironclad",
    arena: "Siege Ramparts",
    epithet: "The Wall That Walks",
    twist: "Two Stone Walls block the centre files. Only a Rook or Queen can break one, and it takes 2 hits.",
    quote: "My walls have never fallen. Your rooks will break first.",
    rewards: [
      { id: "obsidian-fortress", name: "Obsidian Fortress Board", kind: "board" },
      { id: "siege-aura", name: "Siege Rook Aura", kind: "aura" },
    ],
    rules: { walls: { [S("d5")]: 2, [S("e4")]: 2 } },
    level: { depth: 3, noise: 20, ms: 1300 },
    sky: "#1a0806",
    glow: "#ff6a30",
    accent: "#e06030",
    board: "obsidian-fortress",
    bossInk: "#2a2a30",
    at: [1.6, 3.4],
  },
  {
    n: 4,
    boss: "The Phantom Grandmaster",
    arena: "Fogged Marsh",
    epithet: "Who Sees Without Being Seen",
    twist: "Squares more than 3 tiles from your pieces sink into mist. Scout forward to see what waits there.",
    quote: "You cannot fight what you cannot see.",
    rewards: [
      { id: "ghostfire", name: "Ghostfire 3D Board", kind: "board" },
      { id: "spectral-trail", name: "Spectral Trail VFX", kind: "vfx" },
    ],
    rules: { fog: 3 },
    level: { depth: 3, noise: 15, ms: 1500 },
    sky: "#06140f",
    glow: "#5affc8",
    accent: "#5affc8",
    board: "ghostfire",
    bossInk: "#0e2a22",
    at: [5.4, -1.4],
  },
  {
    n: 5,
    boss: "Overlord Morse-Zero",
    arena: "The Core Colosseum",
    epithet: "The First Engine",
    twist: "Phase 1 is a normal fight. At 50% of its material the outer rim collapses and it goes sudden-death Blitz.",
    quote: "I am the engine every engine was copied from.",
    rewards: [
      { id: "legendary-core", name: "Legendary Core Board", kind: "board" },
      { id: "golden-bot", name: "Golden Bot Companion", kind: "companion" },
    ],
    rules: { overlord: { at: 0.5 } },
    level: { depth: 3, noise: 8, ms: 1800 },
    sky: "#12061f",
    glow: "#ffd86b",
    accent: "#ffd86b",
    board: "legendary-core",
    bossInk: "#1a0a2a",
    at: [8.4, 4.6],
  },
];

export const chapterBy = (n: number) => CHAPTERS.find((c) => c.n === n) ?? null;

// ── server ───────────────────────────────────────────────────────────────

export type CampaignState = {
  army: ArmySlot[];
  levels: number[];
  perkLevel: number;
  open: number;
  cleared: number[];
  progress: { chapter: number; wins: number; tries: number; bestPlies: number }[];
  rewards: string[];
  synced: Record<string, number>;
  coins: number;
};
export type PieceStats = { alive: boolean; checks: number; cap: number; capUp: number; mate: boolean; promo: boolean };
export type FinishResult = {
  result: "win" | "loss" | "draw";
  gains: Record<string, { xp: number; before: number; after: number }>;
  xp: number;
  coins: number;
  firstClear: boolean;
  rewards: string[];
  army: ArmySlot[];
  cleared: number[];
};

export const campaignState = rpc<CampaignState>("campaignState");
export const startCampaignRun = rpc<{ runId: string; chapter: number; perks: string[] }>("startCampaignRun");
export const finishCampaignRun = rpc<FinishResult>("finishCampaignRun");
export const setArmyPerk = rpc<{ army: ArmySlot[] }>("setArmyPerk");
