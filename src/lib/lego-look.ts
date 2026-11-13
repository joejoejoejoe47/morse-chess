import { useSyncExternalStore } from "react";

/** What Brick Verse shows around the board, and who stands on the good side. */
export type LegoScene = "latest" | "avengers";
export type LegoGood = "heroes" | "ant";
/** Kept so older callers still compile. Pawns are the duplicating person. */
export type LegoPawn = "legion" | "dup";
export type LegoBishop = "ant" | "marvel";

export type CastRole = "k" | "q" | "r" | "b" | "n" | "p";
export type Cast = Record<CastRole, string>;

/** Figures you can drop onto an Avengers square. Iron Man is never a pawn. */
export const CAST_POOL: { id: string; name: string }[] = [
  { id: "cap", name: "Captain America" },
  { id: "bucky", name: "Bucky" },
  { id: "hulk", name: "Hulk" },
  { id: "dup", name: "Person" },
  { id: "antman", name: "Ant-Man" },
  { id: "vision", name: "Vision" },
  { id: "marvel", name: "Captain Marvel" },
  { id: "warmachine", name: "War Machine" },
  { id: "hawkeye", name: "Hawkeye" },
  { id: "wasp", name: "Wasp" },
  { id: "spiderman", name: "Spider-Man" },
  { id: "strange", name: "Wizard" },
  { id: "panther", name: "Black Panther" },
  { id: "ironman", name: "Iron Man" },
];

const ROLES: CastRole[] = ["k", "q", "r", "b", "n", "p"];
const ALLOWED = new Set(CAST_POOL.map((row) => row.id));

export const DEFAULT_CAST: Cast = {
  k: "cap",
  q: "bucky",
  r: "warmachine",
  b: "antman",
  n: "vision",
  p: "dup",
};

const KEY = "morse-lg-cast";

function clean(raw: Partial<Cast> | null | undefined): Cast {
  const next = { ...DEFAULT_CAST };
  if (raw) {
    for (const role of ROLES) {
      const id = raw[role];
      if (typeof id !== "string" || !ALLOWED.has(id)) continue;
      if (role === "p" && id === "ironman") continue;
      next[role] = id;
    }
  }
  const seen = new Set<string>();
  for (const role of ROLES) {
    if (seen.has(next[role]) || (role === "p" && next[role] === "ironman")) {
      const spare = CAST_POOL.find((row) => !seen.has(row.id) && !(role === "p" && row.id === "ironman"));
      if (spare) next[role] = spare.id;
    }
    seen.add(next[role]);
  }
  return next;
}

function readStored(): Cast {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CAST };
    return clean(JSON.parse(raw) as Partial<Cast>);
  } catch {
    return { ...DEFAULT_CAST };
  }
}

let scene: LegoScene = "avengers";
let good: LegoGood = "heroes";
let pawn: LegoPawn = "dup";
let bishop: LegoBishop = "ant";
let cast: Cast = { ...DEFAULT_CAST };
/** The inviter's lineup, shown to the guest only on an intended pull-up. */
let guest: Cast | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function legoScene(): LegoScene {
  return scene;
}

export function legoGood(): LegoGood {
  return good;
}

export function setLegoScene(next: LegoScene) {
  if (scene === next) return;
  scene = next;
  emit();
}

export function setLegoGood(next: LegoGood) {
  if (good === next) return;
  good = next;
  emit();
}

export function legoPawn(): LegoPawn {
  return pawn;
}

export function setLegoPawn(next: LegoPawn) {
  if (pawn === next) return;
  pawn = next;
  emit();
}

export function legoBishop(): LegoBishop {
  return bishop;
}

export function setLegoBishop(next: LegoBishop) {
  if (bishop === next) return;
  bishop = next;
  emit();
}

/** What this screen shows for the white Avengers side. */
export function boardCast(): Cast {
  return guest ?? cast;
}

export function hydrateCast() {
  const stored = readStored();
  if (encodeCast(stored) === encodeCast(cast)) return;
  cast = stored;
  emit();
}

export function legoCast(): Cast {
  return cast;
}

export function setLegoCastRole(role: CastRole, id: string) {
  if (!ALLOWED.has(id)) return;
  if (role === "p" && id === "ironman") return;
  if (cast[role] === id) return;
  const next = { ...cast };
  const prev = next[role];
  const taken = ROLES.find((other) => other !== role && next[other] === id);
  next[role] = id;
  if (taken) {
    // One of each. The square this figure left takes the one that was here,
    // unless that would put Iron Man on the pawns.
    if (taken === "p" && prev === "ironman") {
      const used = new Set(ROLES.map((r) => next[r]));
      const spare = CAST_POOL.find((row) => row.id !== "ironman" && !used.has(row.id));
      next[taken] = spare ? spare.id : "dup";
    } else {
      next[taken] = prev;
    }
  }
  cast = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(cast));
  } catch {
    /* private mode */
  }
  emit();
}

/** Guest of an intended pull-up sees the inviter's lineup. Everyone else sees their own. */
export function setGuestCast(next: Cast | null) {
  const same = (guest === null && next === null) || (guest !== null && next !== null && encodeCast(guest) === encodeCast(next));
  if (same) return;
  guest = next ? clean(next) : null;
  emit();
}

export function encodeCast(value: Cast = cast): string {
  return ROLES.map((role) => `${role}:${value[role]}`).join(",");
}

export function decodeCast(raw: unknown): Cast {
  if (typeof raw !== "string" || raw === "") return { ...DEFAULT_CAST };
  const next: Partial<Cast> = {};
  for (const bit of raw.split(",")) {
    const [role, id] = bit.split(":");
    if (role === "k" || role === "q" || role === "r" || role === "b" || role === "n" || role === "p") next[role] = id;
  }
  return clean(next);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function snapshot() {
  return scene + "|" + good + "|" + pawn + "|" + bishop + "|" + encodeCast(cast) + "|" + (guest ? encodeCast(guest) : "");
}

export function useLegoLook() {
  const key = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [s, g, p, b, c, guestCode] = key.split("|") as [LegoScene, LegoGood, LegoPawn, LegoBishop, string, string];
  return { scene: s, good: g, pawn: p, bishop: b, cast: decodeCast(c), guest: guestCode !== "" };
}