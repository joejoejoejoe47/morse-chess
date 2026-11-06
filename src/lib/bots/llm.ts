/**
 * Brain router for the buddy.
 * Order: PHP /api/bot-brain (if host set XAI/OPENAI key) → opt-in WebLLM local model → rule think().
 * Rules are never marketed as "AI". Local LLM is honest about being a small on-device model.
 */
import { apiUrl } from "@/lib/base";
import { GUIDE, think, type BrainReply } from "./brain";
import { askLocalLlm, localLlmReady, localLlmConsented, ensureLocalLlm } from "./local-llm";

let cachedCloud: Promise<boolean> | null = null;

export function brainEnabled(): Promise<boolean> {
  // Back-compat name: cloud brain only.
  cachedCloud ??= fetch(apiUrl("/api/bot-brain"), { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .then((j) => !!j?.enabled)
    .catch(() => false);
  return cachedCloud;
}

/** Ask: cloud → local LLM (if consented/ready) → rules. */
export async function askBrain(
  text: string,
  botName: string,
  opts: { coachOk?: boolean; inGame?: boolean } = {},
): Promise<BrainReply> {
  const localRules = () => think(text, botName);

  if (await brainEnabled()) {
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
      if (r.ok) {
        const j = (await r.json()) as { kind?: string; text?: string; guideId?: string };
        const say = (j.text || "").trim();
        if (say || j.kind === "coach") {
          if (j.kind === "coach") return { kind: "coach", text: say || "Coach mode on!" };
          if (j.kind === "guide" && j.guideId) {
            const topic = GUIDE.find((g) => g.id === j.guideId);
            if (topic) return { kind: "guide", text: say || topic.say, topic };
          }
          if (say) return { kind: "say", text: say };
        }
      }
    } catch {
      /* fall through */
    }
  }

  // Opt-in local WebLLM — only if user consented; never surprise-download.
  if (localLlmConsented()) {
    try {
      if (!localLlmReady()) await ensureLocalLlm();
      const hit = await askLocalLlm(text, botName, opts);
      if (hit) return hit;
    } catch {
      /* fall through to rules; UI shows local-llm status separately */
    }
  }

  return localRules();
}
