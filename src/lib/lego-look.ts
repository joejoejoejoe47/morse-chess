import { useSyncExternalStore } from "react";

/** What Brick Verse shows around the board, and who stands on the good side. */
export type LegoScene = "latest" | "avengers";
export type LegoGood = "heroes" | "ant";

let scene: LegoScene = "latest";
let good: LegoGood = "heroes";
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

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function snapshot() {
  return scene + "|" + good;
}

export function useLegoLook() {
  const key = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [s, g] = key.split("|") as [LegoScene, LegoGood];
  return { scene: s, good: g };
}
