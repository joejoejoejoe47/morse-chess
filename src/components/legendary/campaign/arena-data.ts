/** Arena builder (phase D): player-made boss arenas, saved on the server and shared by a 6-letter code. */
import { rpc } from "@/lib/rpc";
import { newGame, type Kind, type Rules, type State } from "./engine";
import { CHAPTERS, type Chapter } from "./data";

export type ArenaLayout = {
  theme: number;
  walls: number[];
  gears: number[];
  gearEvery: number;
  fog: number;
  glass: number;
  extra: { sq: number; k: Kind }[];
  level: number;
};
export type Arena = { code: string; name: string; layout: ArenaLayout; owner: string; mine: boolean; plays: number; wins: number; createdAt: number };

export const saveArena = rpc<Arena>("saveArena");
export const getArena = rpc<Arena>("getArena");
export const myArenas = rpc<{ arenas: Arena[] }>("myArenas");
export const arenaResult = rpc<Arena>("arenaResult");

export const EMPTY_LAYOUT: ArenaLayout = { theme: 1, walls: [], gears: [], gearEvery: 8, fog: 0, glass: 0, extra: [], level: 2 };
export const LIMITS = { walls: 8, gears: 4, extra: 4 };
/** Hazards: ranks 3-6. Boss reinforcements: ranks 5-6. */
export const hazardOk = (i: number) => i >= 16 && i <= 47;
export const reinforceOk = (i: number) => i >= 32 && i <= 47;

export const LEVELS: { id: number; name: string; level: Chapter["level"] }[] = [
  { id: 1, name: "Squire", level: { depth: 1, noise: 45, ms: 600 } },
  { id: 2, name: "Knight", level: { depth: 2, noise: 18, ms: 1000 } },
  { id: 3, name: "Champion", level: { depth: 3, noise: 6, ms: 1500 } },
];

export function arenaRules(l: ArenaLayout): Rules {
  const r: Rules = {};
  if (l.walls.length) r.walls = Object.fromEntries(l.walls.map((w) => [w, 2]));
  if (l.gears.length >= 2) { r.gears = [...l.gears]; r.gearEvery = l.gearEvery; }
  if (l.fog) r.fog = l.fog;
  if (l.glass) r.glassEvery = l.glass;
  return r;
}

export function arenaTwist(l: ArenaLayout): string {
  const bits: string[] = [];
  if (l.walls.length) bits.push(`${l.walls.length} stone ${l.walls.length === 1 ? "wall" : "walls"} (only rooks and queens can break them)`);
  if (l.gears.length >= 2) bits.push(`${l.gears.length} gears that turn every ${l.gearEvery / 2} turns`);
  if (l.fog) bits.push(l.fog === 2 ? "dense fog" : "light fog");
  if (l.glass) bits.push(`a Glass Pawn summoned every ${l.glass} boss moves`);
  if (l.extra.length) bits.push(`${l.extra.length} boss ${l.extra.length === 1 ? "reinforcement" : "reinforcements"}`);
  return bits.length ? `This arena has ${bits.join(", ")}.` : "A plain battlefield. Pure chess against the boss.";
}

/** Turn a saved arena into a Chapter the battle screen understands (n = 7: custom). */
export function arenaChapter(a: { name: string; owner?: string; code?: string; layout: ArenaLayout }): Chapter {
  const look = CHAPTERS.find((c) => c.n === a.layout.theme) ?? CHAPTERS[0];
  const lv = LEVELS.find((x) => x.id === a.layout.level) ?? LEVELS[1];
  return {
    ...look,
    n: 7,
    look: look.n,
    boss: a.name || "Untitled Arena",
    arena: a.owner ? `${a.owner}'s arena` : "Your arena",
    epithet: `Custom Arena${a.code ? ` · Code ${a.code}` : ""} · ${lv.name} boss`,
    twist: arenaTwist(a.layout),
    quote: "Built by a player. Beaten by you?",
    rewards: [],
    rules: arenaRules(a.layout),
    level: lv.level,
  };
}

export const arenaStart = (l: ArenaLayout): State => newGame(arenaRules(l), {}, l.extra);
