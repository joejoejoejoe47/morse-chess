/**
 * Optional cloud brain for the buddy. Hits PHP /api/bot-brain when the host set
 * XAI_API_KEY or OPENAI_API_KEY. With no key, GET returns {enabled:false} and we
 * keep the local rule-based think().
 */
import { apiUrl } from "@/lib/base";
import { GUIDE, think, type BrainReply } from "./brain";

let cached: Promise<boolean> | null = null;

export function brainEnabled(): Promise<boolean> {
  cached ??= fetch(apiUrl("/api/bot-brain"), { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .then((j) => !!j?.enabled)
    .catch(() => false);
  return cached;
}

/** Ask the cloud brain; falls back to the local rule brain on any failure. */
export async function askBrain(
  text: string,
  botName: string,
  opts: { coachOk?: boolean; inGame?: boolean } = {},
): Promise<BrainReply> {
  const local = () => think(text, botName);
  if (!(await brainEnabled())) return local();
  try {
    const r = await fetch(apiUrl("/api/bot-brain"), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        botName,
        coachOk: opts.coachOk !== false,
        inGame: !!opts.inGame,
      }),
    });
    if (!r.ok) return local();
    const j = (await r.json()) as { kind?: string; text?: string; guideId?: string };
    const say = (j.text || "").trim();
    if (!say && j.kind !== "coach") return local();
    if (j.kind === "coach") return { kind: "coach", text: say || "Coach mode on!" };
    if (j.kind === "guide" && j.guideId) {
      const topic = GUIDE.find((g) => g.id === j.guideId);
      if (topic) return { kind: "guide", text: say || topic.say, topic };
    }
    return { kind: "say", text: say };
  } catch {
    return local();
  }
}
