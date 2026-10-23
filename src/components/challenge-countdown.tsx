import { useEffect, useState } from "react";
import { NAMED_CHALLENGE_MS } from "@/lib/server/mores";

/** Re-renders every second; returns the current time. */
export function useNow(stepMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), stepMs);
    return () => window.clearInterval(id);
  }, [stepMs]);
  return now;
}

export function fmtLeft(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Small "m:ss left" readout with a shrinking bar for a named challenge. */
export function ChallengeCountdown({ deadline, now }: { deadline: number; now: number }) {
  const left = Math.max(0, deadline - now);
  const pct = Math.min(100, (left / NAMED_CHALLENGE_MS) * 100);
  return (
    <span className="inline-flex min-w-[5.5rem] flex-col gap-1" title="Invitations expire after 4 minutes">
      <span className={`text-xs tabular-nums ${left < 30_000 ? "text-danger" : "text-mist"}`}>{fmtLeft(left)} left</span>
      <span className="h-0.5 overflow-hidden rounded-full bg-ink-soft">
        <span className="block h-full bg-forest transition-[width] duration-1000" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
