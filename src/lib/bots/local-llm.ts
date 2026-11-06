/**
 * Opt-in in-browser LLM via WebLLM (Apache-2.0 runtime).
 * Model: SmolLM2-360M-Instruct q4f16 (~200 MB download, ~376 MB VRAM) — Apache-2.0 weights.
 * Needs WebGPU. No signup, no API keys. Never auto-downloads without consent.
 * Small models hallucinate — system prompt grounds Morse Chess facts; unknown → admit it.
 */
import { GUIDE, RULES_TEXT, type BrainReply } from "./brain";

export const LOCAL_LLM_ID = "SmolLM2-360M-Instruct-q4f16_1-MLC";
export const LOCAL_LLM_SIZE_HINT = "~200 MB download · needs WebGPU · ~0.4 GB GPU memory";
export const LOCAL_LLM_LICENSE = "Apache-2.0 (HuggingFaceTB/SmolLM2-360M-Instruct) via WebLLM";
const CONSENT_KEY = "morse-local-llm-consent";

export type LocalLlmStatus =
  | { kind: "unsupported"; reason: string }
  | { kind: "need-consent" }
  | { kind: "downloading"; pct: number; note: string }
  | { kind: "ready" }
  | { kind: "error"; message: string }
  | { kind: "idle" };

type Listener = (s: LocalLlmStatus) => void;
const listeners = new Set<Listener>();
let status: LocalLlmStatus = { kind: "idle" };
let engine: { chat: { completions: { create: (o: unknown) => Promise<{ choices: { message: { content?: string } }[] }> } } } | null = null;
let loadPromise: Promise<void> | null = null;

function setStatus(s: LocalLlmStatus) {
  status = s;
  for (const fn of listeners) fn(s);
}

export function getLocalLlmStatus() {
  return status;
}

export function onLocalLlmStatus(fn: Listener) {
  listeners.add(fn);
  fn(status);
  return () => { listeners.delete(fn); };
}

export function localLlmConsented() {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export async function detectWebGPU(): Promise<{ ok: boolean; reason: string }> {
  if (typeof navigator === "undefined" || !(navigator as Navigator & { gpu?: unknown }).gpu) {
    return { ok: false, reason: "This browser has no WebGPU (needed for on-device AI). Try a recent Chrome/Edge on a computer with a GPU." };
  }
  try {
    const gpu = (navigator as Navigator & { gpu: { requestAdapter: () => Promise<unknown> } }).gpu;
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: "WebGPU adapter not available on this device." };
    return { ok: true, reason: "ok" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "WebGPU probe failed." };
  }
}

function systemPrompt(botName: string, coachOk: boolean, inGame: boolean): string {
  const guides = GUIDE.map((g) => `- ${g.id}: ${g.say}`).join("\n");
  return `You are ${botName}, a friendly Morse Chess robot buddy. Warm, short answers (1–3 sentences). Be truthful: if unsure, say you do not know. Never invent buttons, menus, or features.
You know Morse Chess from this grounding (use it; do not claim you know everything):
APP GUIDE:
${guides}
CHESS RULES (brief):
${RULES_TEXT}
${coachOk ? "Coaching is allowed if they ask for a hint/best move in a game — reply with exactly: COACH" : "FAIR PLAY: rated game vs a human. REFUSE move hints/coaching warmly."}
${inGame ? "They are in a game now." : "They are not in a game."}
Personality: happy, kind, a little playful. No toxic or adult content. Do not pretend to be a huge cloud AI if you are the small on-device model.
Reply in English unless the player explicitly asks you to use another language. Do not translate their message into another language on your own.`;
}

/** Consent + start download. */
export async function enableLocalLlm(): Promise<void> {
  const gpu = await detectWebGPU();
  if (!gpu.ok) {
    setStatus({ kind: "unsupported", reason: gpu.reason });
    throw new Error(gpu.reason);
  }
  try {
    localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    /* ignore */
  }
  return ensureLocalLlm();
}

export async function ensureLocalLlm(): Promise<void> {
  if (engine) {
    setStatus({ kind: "ready" });
    return;
  }
  if (loadPromise) return loadPromise;
  const gpu = await detectWebGPU();
  if (!gpu.ok) {
    setStatus({ kind: "unsupported", reason: gpu.reason });
    throw new Error(gpu.reason);
  }
  if (!localLlmConsented()) {
    setStatus({ kind: "need-consent" });
    throw new Error(`On-device AI needs a one-time download (${LOCAL_LLM_SIZE_HINT}). Tap Enable local AI.`);
  }
  setStatus({ kind: "downloading", pct: 0, note: `Downloading ${LOCAL_LLM_ID}…` });
  loadPromise = (async () => {
    try {
      const webllm = await import("@mlc-ai/web-llm");
      const eng = await webllm.CreateMLCEngine(LOCAL_LLM_ID, {
        initProgressCallback: (p) => {
          const pct = Math.round((p.progress ?? 0) * 100);
          setStatus({ kind: "downloading", pct, note: p.text || "Loading on-device AI…" });
        },
      });
      engine = eng as unknown as typeof engine;
      setStatus({ kind: "ready" });
    } catch (e) {
      loadPromise = null;
      engine = null;
      const message = e instanceof Error ? e.message : "On-device AI failed to load.";
      setStatus({ kind: "error", message });
      throw new Error(message);
    }
  })();
  return loadPromise;
}

export function localLlmReady() {
  return !!engine;
}

export async function askLocalLlm(
  text: string,
  botName: string,
  opts: { coachOk?: boolean; inGame?: boolean } = {},
): Promise<BrainReply | null> {
  if (!engine) return null;
  const coachOk = opts.coachOk !== false;
  const sys = systemPrompt(botName, coachOk, !!opts.inGame);
  try {
    const out = await engine.chat.completions.create({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: text.slice(0, 500) },
      ],
      temperature: 0.7,
      max_tokens: 120,
    });
    let reply = (out.choices?.[0]?.message?.content || "").trim();
    if (!reply) return null;
    if (/^COACH\b/i.test(reply) || (coachOk && /\bCOACH\b/.test(reply) && reply.length < 40)) {
      return { kind: "coach", text: "Coach mode on!" };
    }
    if (!coachOk && /\b(play|move|try)\s+[a-h][1-8]/i.test(reply)) {
      reply = "I can't give move hints in a rated game against a person — that would be cheating! Chat about anything else, or play me / an unranked game and I'll coach.";
    }
    // Soft guide detect
    const lower = text.toLowerCase();
    const topic = GUIDE.find((g) => g.words.test(lower));
    if (topic && /how|where|show|open|find|take me/.test(lower)) {
      return { kind: "guide", text: reply || topic.say, topic };
    }
    return { kind: "say", text: reply.slice(0, 400) };
  } catch {
    return null;
  }
}

/** Probe at startup for honest UI (does not download). */
export async function probeLocalLlmSupport() {
  if (localLlmConsented() && engine) {
    setStatus({ kind: "ready" });
    return;
  }
  const gpu = await detectWebGPU();
  if (!gpu.ok) setStatus({ kind: "unsupported", reason: gpu.reason });
  else if (!localLlmConsented()) setStatus({ kind: "need-consent" });
  else setStatus({ kind: "idle" });
}
