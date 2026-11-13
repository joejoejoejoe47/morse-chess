import { useSyncExternalStore } from "react";

/** What Brick Verse shows around the board, and who stands on the good side. */
export type LegoScene = "latest" | "avengers";
export type LegoGood = "heroes" | "ant";
/** Avengers pawns: Iron Legion suits, or a person who splits into copies. */
export type LegoPawn = "legion" | "dup";
/** Avengers bishop: Ant-Man's shrink attack, or Captain Marvel. */
export type LegoBishop = "ant" | "marvel";

let scene: LegoScene = "avengers";
let good: LegoGood = "heroes";
let pawn: LegoPawn = "legion";
let bishop: LegoBishop = "ant";
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

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function snapshot() {
  return scene + "|" + good + "|" + pawn + "|" + bishop;
}

export function useLegoLook() {
  const key = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [s, g, p, b] = key.split("|") as [LegoScene, LegoGood, LegoPawn, LegoBishop];
  return { scene: s, good: g, pawn: p, bishop: b };
}
