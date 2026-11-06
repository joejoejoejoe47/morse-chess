/**
 * The summoned robot buddy (Create Bot). Lives on every screen:
 *  - typing a bot's summon letters (outside text boxes) pops it up;
 *  - in a game against that bot it sits beside the board on its own;
 *  - talk with the mic (speech recognition) or type; it answers out loud;
 *  - "how do I…" walks (or flies, when far) to the right button and points at it;
 *  - "coach me" draws arrows over the 2D board (or a mini board) and explains the move.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Chess } from "chess.js";
import { AudioLines, Bot, Keyboard, Mic, MicOff, Send, Volume2, VolumeX, X } from "lucide-react";
import { BOT_ASK_EVENT, BOT_EVENT, BOT_REPLY_EVENT, SUMMON_EVENT, botById, botForGame, listBots, loadActiveBot, saveActiveBot, type MyBot } from "@/lib/bots/store";
import { type GuideTopic } from "@/lib/bots/brain";
import { askBrain } from "@/lib/bots/llm";
import { canListen, enableNaturalVoice, hush, listenOnce, onVoiceUi, requestMic, speak, type VoiceUiStatus } from "@/lib/bots/voice";
import { LOCAL_LLM_SIZE_HINT, enableLocalLlm, onLocalLlmStatus, probeLocalLlmSupport, type LocalLlmStatus } from "@/lib/bots/local-llm";
import type { CoachArrow } from "@/lib/bots/coach";
import type { RobotMood } from "./robot-model";

const RobotStage = lazy(() => import("./robot-model"));

type Pos = { x: number; y: number };
const vw = () => window.innerWidth;
const vh = () => window.innerHeight;
const botSize = () => (vw() < 640 ? 120 : 165);
const clampPos = (p: Pos): Pos => ({
  x: Math.max(4, Math.min(vw() - botSize() - 4, p.x)),
  y: Math.max(60, Math.min(vh() - botSize() * 1.15 - 70, p.y)),
});
const homePos = (): Pos => clampPos({ x: vw() - botSize() - 16, y: vh() - botSize() * 1.15 - 90 });

function isVisible(el: Element) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function findTarget(topic: GuideTopic): HTMLElement | null {
  if (topic.target.sel) {
    const el = [...document.querySelectorAll<HTMLElement>(topic.target.sel)].find(isVisible);
    if (el) return el;
  }
  if (topic.target.text) {
    const re = topic.target.text;
    const els = [...document.querySelectorAll<HTMLElement>("button, a, [role=button]")].filter(
      (el) => !el.closest("[data-bot-buddy]") && isVisible(el),
    );
    const hit = els.find((el) => re.test((el.innerText || el.textContent || "").trim()));
    if (hit) return hit;
  }
  return null;
}

export function BotBuddyHost() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [bot, setBot] = useState<MyBot | null>(null);
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 });
  const [moveMs, setMoveMs] = useState(0);
  const [mood, setMood] = useState<RobotMood>("idle");
  const [line, setLine] = useState("");
  const [offer, setOffer] = useState<GuideTopic | null>(null);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ring, setRing] = useState<DOMRect | null>(null);
  const [arrows, setArrows] = useState<{ arrows: CoachArrow[]; fen: string; you: "w" | "b" } | null>(null);
  const [boardRect, setBoardRect] = useState<DOMRect | null>(null);
  const stopRec = useRef<() => void>(() => {});
  const seatedFor = useRef<string | null>(null);
  const pendingGuide = useRef<GuideTopic | null>(null);
  const busyWalk = useRef(0);
  // Text thread closed by default; opens when the mic is denied/unsupported, or on demand.
  const [panel, setPanel] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [bubble, setBubble] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [voiceUi, setVoiceUi] = useState<VoiceUiStatus>({ kind: "idle" });
  const [llmUi, setLlmUi] = useState<LocalLlmStatus>({ kind: "idle" });
  const [myBots, setMyBots] = useState<MyBot[]>([]);
  const botRef = useRef<MyBot | null>(null);
  const mutedRef = useRef(false);
  const voiceRef = useRef(false);
  const listenRef = useRef(false);
  const emptyHeard = useRef(0);
  const bubbleTimer = useRef(0);
  botRef.current = bot;
  // Latest versions of render-scoped helpers, for callbacks created once.
  const fnRef = useRef<{ ask: (q: string) => void; listenTurn: () => Promise<void>; seatPos: () => Pos }>(null!);
  mutedRef.current = muted;
  voiceRef.current = voiceMode;

  useEffect(() => {
    if (bot) saveActiveBot({ id: bot.id, panel });
  }, [bot, panel]);

  const showBubble = () => {
    setBubble(true);
    window.clearTimeout(bubbleTimer.current);
  };
  const hideBubbleSoon = () => {
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(false), 4500);
  };

  const say = useCallback((t: string, b: MyBot | null = botRef.current) => {
    setLine(t);
    window.dispatchEvent(new CustomEvent(BOT_REPLY_EVENT, { detail: { text: t, botId: b?.id } }));
    showBubble();
    const after = () => {
      setMood((m) => (m === "talk" ? "idle" : m));
      hideBubbleSoon();
      if (voiceRef.current && !listenRef.current) window.setTimeout(() => void fnRef.current.listenTurn(), 250);
    };
    if (b && !mutedRef.current) {
      setMood((m) => (m === "idle" ? "talk" : m));
      speak(t, b.voice, after);
    } else after();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Voice mode: listen one turn, answer, and (via say → after) listen again. */
  async function listenTurn() {
    if (!voiceRef.current || listenRef.current || !botRef.current) return;
    listenRef.current = true;
    setListening(true);
    const rec = listenOnce((t) => setText(t));
    stopRec.current = rec.stop;
    try {
      const heard = (await rec.done).trim();
      listenRef.current = false;
      setListening(false);
      setText("");
      if (heard) {
        emptyHeard.current = 0;
        fnRef.current.ask(heard);
      } else if (++emptyHeard.current < 2) {
        window.setTimeout(() => void fnRef.current.listenTurn(), 300);
      } else {
        // Quiet for a while: pause; tap the mic on the robot to talk again.
        emptyHeard.current = 0;
        setVoiceMode(false);
        voiceRef.current = false;
      }
    } catch {
      listenRef.current = false;
      setListening(false);
      setVoiceMode(false);
      voiceRef.current = false;
      setPanel(true);
      setLine("I can't hear you right now, so let's type! Ask me anything.");
    }
  }

  const summon = useCallback((b: MyBot, at?: Pos, hello = true, askMic = true) => {
    setBot(b);
    botRef.current = b;
    setMoveMs(0);
    setPos(at ?? homePos());
    setMood("idle");
    setRing(null);
    setOffer(null);
    setChooser(false);
    setPanel(false);
    const t = `Beep boop! ${b.name} here! Ask me anything about Morse Chess, or say "coach me" in a game.`;
    if (!askMic) {
      if (hello) say(t, b);
      return;
    }
    setLine("May I use your microphone so we can talk?");
    showBubble();
    void requestMic().then((ok) => {
      if (botRef.current?.id !== b.id) return;
      setVoiceMode(ok);
      voiceRef.current = ok;
      if (!ok) {
        setPanel(true);
        if (hello) say(`${t} My ears are off, so type to me here.`, b);
        else hideBubbleSoon();
        return;
      }
      if (hello) say(t, b);
      else void fnRef.current.listenTurn();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = useCallback(() => {
    hush();
    stopRec.current();
    voiceRef.current = false;
    setVoiceMode(false);
    setBot(null);
    botRef.current = null;
    setArrows(null);
    setRing(null);
    setPanel(false);
    saveActiveBot(null);
  }, []);

  // Restore the bot after a remount / view switch / reload in this tab (no re-greeting).
  useEffect(() => {
    const a = loadActiveBot();
    const b = a ? botById(a.id) : null;
    if (b && !botRef.current) {
      summon(b, undefined, false, false);
      setPanel(a!.panel);
      setLine(`${b.name} is still here!`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saved bots, for the Summon button.
  useEffect(() => {
    const sync = () => setMyBots(listBots());
    sync();
    window.addEventListener(BOT_EVENT, sync);
    return () => window.removeEventListener(BOT_EVENT, sync);
  }, []);

  useEffect(() => onVoiceUi(setVoiceUi), []);
  useEffect(() => {
    const off = onLocalLlmStatus(setLlmUi);
    void probeLocalLlmSupport();
    return off;
  }, []);

  // Table chat in a game against your bot talks to the bot.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; gameId?: string }>).detail;
      if (!d?.text) return;
      if (!botRef.current) {
        const b = botForGame(d.gameId) ?? listBots()[0];
        if (!b) return;
        summon(b, fnRef.current.seatPos(), false, false);
      }
      fnRef.current.ask(d.text);
    };
    window.addEventListener(BOT_ASK_EVENT, onAsk);
    return () => window.removeEventListener(BOT_ASK_EVENT, onAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summon]);

  // Summon code typed anywhere (not inside a text box).
  useEffect(() => {
    let buf = "";
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "Escape") {
        dismiss();
        return;
      }
      if (!/^[a-z]$/i.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
      buf = (buf + e.key.toUpperCase()).slice(-8);
      const hit = listBots().find((b) => buf.endsWith(b.code));
      if (hit) {
        buf = "";
        summon(hit);
      }
    };
    const onSummon = (e: Event) => {
      const b = botById((e as CustomEvent<{ botId: string }>).detail?.botId);
      if (b) summon(b);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(SUMMON_EVENT, onSummon);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SUMMON_EVENT, onSummon);
    };
  }, [summon, dismiss]);

  // Keep the bot record fresh (renamed/deleted elsewhere).
  useEffect(() => {
    const sync = () => setBot((b) => (b ? botById(b.id) : b));
    window.addEventListener(BOT_EVENT, sync);
    return () => window.removeEventListener(BOT_EVENT, sync);
  }, []);

  // Playing your own bot: it takes a seat beside the board.
  useEffect(() => {
    const m = /^\/play\/([^/]+)/.exec(path);
    if (!m) {
      seatedFor.current = null;
      setArrows(null);
      return;
    }
    const gid = decodeURIComponent(m[1]);
    const t = window.setTimeout(() => {
      const mine = botForGame(gid);
      if (mine && seatedFor.current !== gid) {
        seatedFor.current = gid;
        if (botRef.current?.id === mine.id) {
          setMoveMs(0);
          setPos(seatPos());
          return;
        }
        summon(mine, seatPos(), false, false);
        setLine(`Hi! I'm ${mine.name}, let's play! Chat with me at the table, or say "coach me" and I'll draw you some arrows.`);
        showBubble();
        hideBubbleSoon();
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [path, summon]);

  function seatPos(): Pos {
    const board = [...document.querySelectorAll("[data-board-size]")].find(isVisible);
    const s = botSize();
    if (board) {
      const r = board.getBoundingClientRect();
      if (r.right + s + 8 < vw()) return clampPos({ x: r.right + 8, y: r.top + r.height / 2 - s / 2 });
      if (r.left - s - 8 > 0) return clampPos({ x: r.left - s - 8, y: r.top + r.height / 2 - s / 2 });
    }
    return homePos();
  }

  // Arrows follow the 2D board as it resizes / scrolls.
  useEffect(() => {
    if (!arrows) return;
    let raf = 0;
    const tick = () => {
      const el = [...document.querySelectorAll("[data-board-size]")].find(isVisible);
      const r = el?.getBoundingClientRect() ?? null;
      setBoardRect((old) => (old && r && old.x === r.x && old.y === r.y && old.width === r.width ? old : r));
      raf = window.setTimeout(tick, 250) as unknown as number;
    };
    tick();
    return () => window.clearTimeout(raf);
  }, [arrows]);

  // After "Take me there", point once the page has drawn.
  useEffect(() => {
    const g = pendingGuide.current;
    if (!g || !bot) return;
    const t = window.setTimeout(() => {
      pendingGuide.current = null;
      void walkTo(g);
    }, 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  async function walkTo(topic: GuideTopic) {
    const el = findTarget(topic);
    if (!el) {
      const onPage = topic.path === "/" ? path === "/" || path === "/chess" : path.startsWith(topic.path);
      if (onPage || topic.path === "/play") {
        say(topic.path === "/play" ? `That button lives inside a game. Start a game and ask me again, I'll point right at it!` : `${topic.say} I can't see it on screen right now, try scrolling a bit.`);
      } else {
        setOffer(topic);
        say(`That's in ${topic.pathName}. Want me to take you there?`);
      }
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    await new Promise((r) => setTimeout(r, 450));
    const r = el.getBoundingClientRect();
    const s = botSize();
    const right = r.left + r.width / 2 > vw() / 2;
    const dest = clampPos({ x: right ? r.left - s - 6 : r.right + 6, y: r.top + r.height / 2 - s * 0.55 });
    const dist = Math.hypot(dest.x - pos.x, dest.y - pos.y);
    const far = dist > Math.min(520, vw() * 0.6);
    const ms = Math.max(500, Math.min(2200, dist * (far ? 1.6 : 3.2)));
    const id = ++busyWalk.current;
    setRing(null);
    setMood(far ? "fly" : "walk");
    setMoveMs(ms);
    setPos(dest);
    await new Promise((res) => setTimeout(res, ms + 60));
    if (id !== busyWalk.current) return;
    setMood(right ? "point-right" : "point-left");
    el.setAttribute("data-bot-pointing", topic.id);
    setRing(el.getBoundingClientRect());
    say(topic.say);
    window.setTimeout(() => {
      if (id === busyWalk.current) {
        el.removeAttribute("data-bot-pointing");
        setRing(null);
        setMood("idle");
      }
    }, 9000);
  }

  async function coach() {
    const live = window.__morseLiveGame;
    if (!live || !path.startsWith("/play/")) {
      say(`I coach best during a game! Start one, maybe against me, then say "coach me". Meanwhile: control the center, develop your knights and bishops, and castle early!`);
      return;
    }
    // Fair play: no coach / hints / engine help in rated human games.
    if (live.coachOk === false) {
      say(`I can't coach or draw arrows in a rated game against a person — that would be cheating! Play me or an unranked game and I'll help all you want.`);
      return;
    }
    say("Ooh, let me think… beep boop…");
    try {
      const { coachPosition } = await import("@/lib/bots/coach");
      const tip = await coachPosition(live.fen, live.you);
      setArrows({ arrows: tip.arrows, fen: live.fen, you: live.you });
      say(tip.text + (live.view !== "2d" && tip.arrows.length ? " (Switch to 2D to see my arrows on the big board.)" : ""));
    } catch {
      say("My chess engine hiccuped. Try asking again in a sec!");
    }
  }

  // Clear coach arrows once the position changes, or fair play turns coach off.
  useEffect(() => {
    if (!arrows) return;
    const id = window.setInterval(() => {
      const live = window.__morseLiveGame;
      if (!live || live.fen !== arrows.fen || live.coachOk === false) setArrows(null);
    }, 500);
    return () => window.clearInterval(id);
  }, [arrows]);

  function ask(q: string) {
    const bot = botRef.current;
    if (!bot || !q.trim()) return;
    setOffer(null);
    // Prefer the cloud brain when the host configured a key; fall back to rules.
    const live = window.__morseLiveGame;
    const inGame = path.startsWith("/play/");
    void askBrain(q, bot.name, {
      coachOk: live ? live.coachOk !== false : true,
      inGame,
    }).then((r) => {
      if (botRef.current?.id !== bot.id) return;
      if (r.kind === "coach") void coach();
      else if (r.kind === "guide") void walkTo(r.topic);
      else say(r.text);
    });
  }

  async function mic() {
    if (listening) {
      stopRec.current();
      return;
    }
    if (!voiceMode && canListen()) {
      // Turn voice mode back on (asks for the mic if needed).
      const ok = await requestMic();
      if (ok) {
        hush();
        setVoiceMode(true);
        voiceRef.current = true;
        void listenTurn();
        return;
      }
      setPanel(true);
      setLine("The mic is blocked. Allow it in the browser bar, or type to me.");
      return;
    }
    hush();
    setListening(true);
    setLine("I'm listening…");
    const rec = listenOnce((t) => setText(t));
    stopRec.current = rec.stop;
    try {
      const heard = await rec.done;
      setListening(false);
      if (heard.trim()) {
        setText("");
        ask(heard);
      } else setLine("I didn't hear anything. Tap the mic and try again!");
    } catch (e) {
      setListening(false);
      setLine(e instanceof Error ? e.message : "The mic didn't work.");
    }
  }

  fnRef.current = { ask, listenTurn, seatPos };

  if (!bot) {
    if (!myBots.length || /bot-maker/.test(path)) return null;
    return (
      <div className="fixed bottom-3 left-3 z-[85] flex flex-col items-start gap-1.5" data-bot-summon-dock>
        {chooser ? (
          <div className="rounded-2xl border border-gold-line/60 bg-panel/95 p-1.5 shadow-2xl backdrop-blur" data-bot-chooser>
            {myBots.map((b) => (
              <button
                key={b.id}
                type="button"
                data-bot-choose={b.id}
                className="block w-full rounded-xl px-3 py-1.5 text-left text-sm text-ivory hover:bg-ink/60"
                onClick={() => summon(b)}
              >
                {b.name} <span className="text-xs text-mist">· {b.code}</span>
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          data-bot-summon-button
          className="inline-flex items-center gap-1.5 rounded-full border border-gold-line/70 bg-ink/85 px-3.5 py-2 text-sm font-semibold text-[#f6e7b2] shadow-lg backdrop-blur hover:bg-ink"
          onClick={() => (myBots.length === 1 ? summon(myBots[0]) : setChooser((c) => !c))}
        >
          <Bot className="size-4" /> {myBots.length === 1 ? `Summon ${myBots[0].name}` : "Summon bot"}
        </button>
      </div>
    );
  }
  const s = botSize();
  const right = pos.x + s / 2 > vw() / 2;
  const panelW = Math.min(300, vw() - 16);
  const panelLeft = Math.max(8, Math.min(vw() - panelW - 8, right ? pos.x + s - panelW : pos.x));
  const panelAbove = pos.y > 260;

  return (
    <>
      {ring ? (
        <div
          data-bot-point-ring
          className="pointer-events-none fixed z-[89] rounded-xl border-4 border-[#f6e7b2] shadow-[0_0_24px_#f6e7b2] animate-pulse"
          style={{ left: ring.left - 6, top: ring.top - 6, width: ring.width + 12, height: ring.height + 12 }}
        />
      ) : null}
      {arrows && boardRect ? <ArrowLayer rect={boardRect} arrows={arrows.arrows} you={arrows.you} /> : null}
      <div data-bot-buddy={bot.id} data-bot-mood={mood} className="pointer-events-none fixed inset-0 z-[90]">
        <div
          className="pointer-events-auto absolute"
          style={{
            left: pos.x,
            top: pos.y,
            width: s,
            height: s * 1.15,
            transition: moveMs ? `left ${moveMs}ms ease-in-out, top ${moveMs}ms ${mood === "fly" ? "cubic-bezier(.3,-0.6,.7,1.6)" : "ease-in-out"}` : undefined,
          }}
        >
          {mood === "point-left" || mood === "point-right" ? (
            <span
              className="absolute top-[38%] text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,.6)] animate-bounce"
              style={mood === "point-right" ? { right: -26 } : { left: -26, transform: "scaleX(-1)" }}
              aria-hidden
            >
              👉
            </span>
          ) : null}
          <button type="button" aria-label={`Chat with ${bot.name}`} data-bot-robot className="h-full w-full cursor-pointer" onClick={() => setPanel((p) => !p)}>
            <Suspense fallback={null}>
              <RobotStage model={bot.model} mood={mood} trickEvery={7} className="pointer-events-none h-full w-full" />
            </Suspense>
          </button>
          <span className="pointer-events-none absolute inset-x-0 -bottom-1 text-center text-[11px] font-semibold text-[#f6e7b2] drop-shadow">{bot.name}</span>
          {!panel ? (
            <div className="absolute -top-1 right-0 flex gap-1">
              <button
                type="button"
                data-bot-wave
                aria-label={listening ? "Listening — speak now" : "Voice conversation"}
                title="Click once, speak, I answer aloud"
                onClick={mic}
                disabled={!canListen()}
                className={"grid size-8 place-items-center rounded-full border text-ivory shadow " + (listening ? "animate-pulse border-[#f6e7b2] bg-[#f6e7b2]/30" : "border-gold-line/70 bg-ink/90") + " disabled:opacity-40"}
              >
                {canListen() ? <AudioLines className={"size-4 " + (listening ? "text-[#f6e7b2]" : "text-[#f6e7b2]")} /> : <MicOff className="size-3.5" />}
              </button>
              <button type="button" data-bot-open-text aria-label="Type instead" onClick={() => setPanel(true)} className="grid size-7 place-items-center rounded-full border border-line bg-ink/80 text-ivory">
                <Keyboard className="size-3.5" />
              </button>
              <button type="button" aria-label="Send bot away" data-bot-close className="grid size-7 place-items-center rounded-full border border-line bg-ink/80 text-ivory" onClick={dismiss}>
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
        </div>
        {!panel && (bubble || listening || offer) ? (
          <div
            data-bot-bubble
            className="pointer-events-auto absolute rounded-2xl border border-gold-line/50 bg-panel/90 px-3 py-2 text-[13px] leading-snug text-ivory shadow-xl backdrop-blur"
            style={{ left: panelLeft, width: panelW, ...(panelAbove ? { bottom: vh() - pos.y + 6 } : { top: pos.y + s * 1.15 + 6 }) }}
          >
            <p className="line-clamp-4" data-bot-line>{listening ? (text ? `“${text}”` : "🎙 I'm listening…") : line}</p>
            <VoiceBrainBanners voiceUi={voiceUi} llmUi={llmUi} />
            {offer ? (
              <button
                type="button"
                data-bot-take-me
                className="mt-1.5 rounded-full bg-[#f6e7b2] px-3 py-1 text-sm font-semibold text-ink"
                onClick={() => {
                  pendingGuide.current = offer;
                  setOffer(null);
                  void navigate({ to: offer.path });
                }}
              >
                Take me there
              </button>
            ) : null}
            {arrows && !boardRect ? <MiniBoard fen={arrows.fen} you={arrows.you} arrows={arrows.arrows} /> : null}
          </div>
        ) : null}
        {panel ? (
        <div
          className="pointer-events-auto absolute rounded-2xl border border-gold-line/60 bg-panel/95 p-3 text-ivory shadow-2xl backdrop-blur"
          style={{ left: panelLeft, width: panelW, ...(panelAbove ? { bottom: vh() - pos.y + 6 } : { top: pos.y + s * 1.15 + 6 }), transition: moveMs ? `all ${moveMs}ms ease-in-out` : undefined }}
          data-bot-chat
        >
          <div className="flex items-start gap-2">
            <div className="max-h-48 flex-1 overflow-y-auto">
              <p className="text-[14px] leading-snug" data-bot-line>{line}</p>
              <VoiceBrainBanners voiceUi={voiceUi} llmUi={llmUi} />
            </div>
            <button type="button" aria-label={muted ? "Unmute" : "Mute"} className="text-mist hover:text-ivory" onClick={() => { setMuted(!muted); hush(); }}>
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <button type="button" aria-label="Hide chat" data-bot-hide-text className="text-mist hover:text-ivory" onClick={() => setPanel(false)}>
              <X className="size-4" />
            </button>
          </div>
          {arrows && !boardRect ? <MiniBoard fen={arrows.fen} you={arrows.you} arrows={arrows.arrows} /> : null}
          {offer ? (
            <button
              type="button"
              data-bot-take-me
              className="mt-2 rounded-full bg-[#f6e7b2] px-3 py-1 text-sm font-semibold text-ink"
              onClick={() => {
                pendingGuide.current = offer;
                setOffer(null);
                void navigate({ to: offer.path });
              }}
            >
              Take me there
            </button>
          ) : null}
          <form
            className="mt-2 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const q = text;
              setText("");
              ask(q);
            }}
          >
            <button
              type="button"
              data-bot-mic
              aria-label={listening ? "Stop listening" : "Talk"}
              disabled={!canListen()}
              title={canListen() ? "Talk" : "This browser can't listen; type instead"}
              onClick={mic}
              className={"grid size-9 shrink-0 place-items-center rounded-full border " + (listening ? "animate-pulse border-danger bg-danger/30" : "border-line hover:border-gold-line") + " disabled:opacity-40"}
            >
              {canListen() ? <Mic className="size-4" /> : <MicOff className="size-4" />}
            </button>
            <input
              data-bot-input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Ask ${bot.name}…`}
              className="min-w-0 flex-1 rounded-full border border-line bg-ink/70 px-3 py-1.5 text-sm outline-none focus:border-gold-line"
            />
            <button type="submit" aria-label="Send" className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f6e7b2] text-ink">
              <Send className="size-4" />
            </button>
          </form>
        </div>
        ) : null}
      </div>
    </>
  );
}

const ARROW_COLOR = { good: "#3ddc84", threat: "#ff5a5a" } as const;

function sqXY(sq: string, you: "w" | "b") {
  const f = sq.charCodeAt(0) - 97;
  const r = Number(sq[1]) - 1;
  const col = you === "w" ? f : 7 - f;
  const row = you === "w" ? 7 - r : r;
  return { x: col + 0.5, y: row + 0.5 };
}

function Arrows({ arrows, you }: { arrows: CoachArrow[]; you: "w" | "b" }) {
  return (
    <>
      <defs>
        {Object.entries(ARROW_COLOR).map(([k, c]) => (
          <marker key={k} id={`bot-head-${k}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c} />
          </marker>
        ))}
      </defs>
      {arrows.map((a, i) => {
        const p = sqXY(a.from, you);
        const q = sqXY(a.to, you);
        const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const k = (len - 0.35) / len;
        return (
          <g key={i} data-coach-arrow={`${a.from}${a.to}`} data-arrow-kind={a.color}>
            <circle cx={p.x} cy={p.y} r={0.42} fill="none" stroke={ARROW_COLOR[a.color]} strokeWidth={0.07} opacity={0.9} />
            <line
              x1={p.x}
              y1={p.y}
              x2={p.x + (q.x - p.x) * k}
              y2={p.y + (q.y - p.y) * k}
              stroke={ARROW_COLOR[a.color]}
              strokeWidth={0.2}
              strokeLinecap="round"
              opacity={0.88}
              markerEnd={`url(#bot-head-${a.color})`}
            />
          </g>
        );
      })}
    </>
  );
}


function VoiceBrainBanners({ voiceUi, llmUi }: { voiceUi: VoiceUiStatus; llmUi: LocalLlmStatus }) {
  return (
    <div className="mt-1.5 space-y-1 text-[11px] leading-snug text-mist" data-bot-status>
      {voiceUi.kind === "need-consent" ? (
        <div className="rounded-lg border border-gold-line/40 bg-ink/70 p-1.5">
          <p>{voiceUi.message}</p>
          <button type="button" data-enable-kokoro className="mt-1 rounded-full bg-[#f6e7b2] px-2 py-0.5 font-semibold text-ink" onClick={() => void enableNaturalVoice().catch(() => {})}>
            Enable natural voice
          </button>
        </div>
      ) : null}
      {voiceUi.kind === "downloading" ? (
        <p data-kokoro-progress>Natural voice: {voiceUi.pct}% — {voiceUi.note}</p>
      ) : null}
      {voiceUi.kind === "error" ? (
        <p className="text-danger" data-kokoro-error>Voice: {voiceUi.message} (reply stays on screen)</p>
      ) : null}
      {voiceUi.kind === "ok" ? (
        <p className="opacity-70" data-voice-via>Voice: {voiceUi.via}</p>
      ) : null}
      {llmUi.kind === "need-consent" ? (
        <div className="rounded-lg border border-line bg-ink/70 p-1.5">
          <p>Optional on-device AI ({LOCAL_LLM_SIZE_HINT}). Free, no signup. Rules stay if you skip.</p>
          <button type="button" data-enable-local-llm className="mt-1 rounded-full border border-gold-line/60 px-2 py-0.5 font-semibold text-[#f6e7b2]" onClick={() => void enableLocalLlm().catch(() => {})}>
            Enable local AI
          </button>
        </div>
      ) : null}
      {llmUi.kind === "downloading" ? <p data-llm-progress>Local AI: {llmUi.pct}% — {llmUi.note}</p> : null}
      {llmUi.kind === "unsupported" ? <p data-llm-unsupported>Local AI unavailable: {llmUi.reason}</p> : null}
      {llmUi.kind === "error" ? <p className="text-danger" data-llm-error>Local AI: {llmUi.message}</p> : null}
      {llmUi.kind === "ready" ? <p className="opacity-70" data-llm-ready>Brain: on-device model ready</p> : null}
    </div>
  );
}

function ArrowLayer({ rect, arrows, you }: { rect: DOMRect; arrows: CoachArrow[]; you: "w" | "b" }) {
  return (
    <svg
      data-coach-arrows
      className="pointer-events-none fixed z-[60]"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      viewBox="0 0 8 8"
    >
      <Arrows arrows={arrows} you={you} />
    </svg>
  );
}

const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
function MiniBoard({ fen, you, arrows }: { fen: string; you: "w" | "b"; arrows: CoachArrow[] }) {
  const c = new Chess(fen);
  const cells = [];
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const f = you === "w" ? col : 7 - col;
      const r = you === "w" ? 7 - row : row;
      const sq = `${String.fromCharCode(97 + f)}${r + 1}`;
      const p = c.get(sq as never);
      cells.push(
        <g key={sq}>
          <rect x={col} y={row} width={1} height={1} fill={(row + col) % 2 ? "#8a6d4b" : "#ecdcb8"} />
          {p ? (
            <text x={col + 0.5} y={row + 0.8} fontSize={0.85} textAnchor="middle" fill={p.color === "w" ? "#fff" : "#111"} stroke={p.color === "w" ? "#111" : "#fff"} strokeWidth={0.03}>
              {GLYPH[p.type]}
            </text>
          ) : null}
        </g>,
      );
    }
  return (
    <svg data-coach-mini className="mt-2 aspect-square w-full rounded-lg" viewBox="0 0 8 8">
      {cells}
      <Arrows arrows={arrows} you={you} />
    </svg>
  );
}
