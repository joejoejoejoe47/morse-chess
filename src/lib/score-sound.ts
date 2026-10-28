import { asset } from "@/lib/base";
import { loadMasterAudio } from "@/lib/master-audio";
import { crowdMuted } from "@/lib/crowd-audio";

/* The owner's scoring sound (football touchdowns and field goals). It only plays when the player's
   sound is on: the round speaker button (master) AND the football Crowd switch. */

const FILE = "/football/score-0c5cfe901a.mp3";
let clip: HTMLAudioElement | null = null;

export function scoreSoundAllowed(accountId: string | null | undefined) {
  return loadMasterAudio(accountId) && !crowdMuted();
}

/** Load the clip ahead of time so the first touchdown is not late. */
export function preloadScoreSound() {
  if (clip || typeof Audio === "undefined") return;
  clip = new Audio(asset(FILE));
  clip.preload = "auto";
  clip.volume = 0.85;
}

export function playScoreSound(accountId: string | null | undefined) {
  if (!scoreSoundAllowed(accountId)) return;
  preloadScoreSound();
  if (!clip) return;
  try {
    clip.currentTime = 0;
    void clip.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}
