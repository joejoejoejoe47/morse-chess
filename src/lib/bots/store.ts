/**
 * "Create Bot / Coach / Teacher" (owner t252u): the player's own robot buddies.
 * Kept on this device (localStorage). Each bot has a name, a model, a voice and a
 * summon code: type those letters anywhere on the 2D screens and the bot pops up.
 */
import { BOT_USERNAME, BOT_V2_USERNAME } from "@/lib/mores-constants";

export type BotModelId = "cute" | "poddy";
export type BotVoice = "male" | "female";
export type MyBot = { id: string; name: string; model: BotModelId; voice: BotVoice; code: string; created: number };

export const BOT_MODELS: { id: BotModelId; title: string; url: string; author: string; authorUrl: string; source: string }[] = [
  {
    id: "cute",
    title: "cute robot",
    url: "/bots/cute-robot.glb",
    author: "victory_mirosya",
    authorUrl: "https://sketchfab.com/victory_mirosya",
    source: "https://sketchfab.com/3d-models/cute-robot-6aadb75f596742ada2814ad4593f0032",
  },
  {
    id: "poddy",
    title: "Poddy M1 - Stylized Floating Robot - Posed",
    url: "/bots/poddy.glb",
    author: "Exmoor beast",
    authorUrl: "https://sketchfab.com/Exmoorbeast",
    source: "https://sketchfab.com/3d-models/poddy-m1-stylized-floating-robot-posed-6b5b90dc52ae4933a103d0a71777ecbd",
  },
];

const KEY = "morse-my-bots";
const GAME_KEY = "morse-bot-games";
const LAST_KEY = "morse-bot-last";
export const BOT_EVENT = "morse-bots-changed";
export const SUMMON_EVENT = "morse-bot-summon";

export function listBots(): MyBot[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((b) => b && typeof b.name === "string" && typeof b.code === "string") : [];
  } catch {
    return [];
  }
}

function saveBots(bots: MyBot[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(bots));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(BOT_EVENT));
}

/** Letters only, no I/O/L so nobody mixes them up with 1 and 0. Never a real word we type often. */
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
export function newSummonCode(taken: string[] = listBots().map((b) => b.code)): string {
  for (let tries = 0; tries < 200; tries++) {
    let c = "";
    const buf = new Uint32Array(4);
    crypto.getRandomValues(buf);
    for (const n of buf) c += LETTERS[n % LETTERS.length];
    if (!taken.includes(c)) return c;
  }
  return "BOTZ";
}

export function addBot(input: { name: string; model: BotModelId; voice: BotVoice }): MyBot {
  const bots = listBots();
  const bot: MyBot = {
    id: Math.random().toString(36).slice(2, 10),
    name: cleanBotName(input.name),
    model: input.model,
    voice: input.voice,
    code: newSummonCode(bots.map((b) => b.code)),
    created: Date.now(),
  };
  saveBots([bot, ...bots].slice(0, 12));
  touchBot(bot.id);
  return bot;
}

export function removeBot(id: string) {
  saveBots(listBots().filter((b) => b.id !== id));
  try {
    if (localStorage.getItem(LAST_KEY) === id) localStorage.removeItem(LAST_KEY);
  } catch {
    /* ignore */
  }
}

export function botById(id: string | null | undefined) {
  return listBots().find((b) => b.id === id) ?? null;
}

export function cleanBotName(name: string) {
  const n = name.replace(/[^\p{L}\p{N} _'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20);
  return n || "Robo";
}

/** The robot's name must never pretend to be the house bots. */
export function nameIsTaken(name: string) {
  const n = name.replace(/\s+/g, "").toLowerCase();
  return n === BOT_USERNAME.toLowerCase() || n === BOT_V2_USERNAME.toLowerCase();
}

const FEMALE = new Set(
  "ada alice amy anna ava bella chloe clara daisy ella ellie emma eva grace hannah ivy jade jane julia kate lily lucy luna maya mia molly nora olivia penny rosie ruby sara sarah sophia sophie stella zoe zoey abby addison alexis allison amelia aria aubrey audrey autumn brooklyn camila charlotte claire elena eliana elizabeth emily evelyn gianna hailey harper hazel isabella layla leah lillian madelyn madison mila natalie nova paisley riley savannah scarlett skylar victoria violet willow xena athena bonnie roxy dolly rosa daisybot robina roberta".split(" "),
);
const MALE = new Set(
  "adam alex ben bob bobby carl charlie chris dan danny dave david ed eddie eli ethan finn frank gus harry henry jack jake james jim joe joey john josh leo liam luke max mike morse nate ned noah oliver oscar owen pete rex rob robert robo robby rocky ron ryan sam sammy ted tom tommy tony walt will zack zeke bolt sparky gizmo tank".split(" "),
);
/** Best guess from the name; the player can always flip it on the create screen. */
export function guessVoice(name: string): BotVoice {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (FEMALE.has(first)) return "female";
  if (MALE.has(first)) return "male";
  if (/(a|ie|ette|elle|ina|lyn|een|issa|ah)$/.test(first) && first.length > 2) return "female";
  return "male";
}

/** Which of my bots is sitting across in a game (the server still plays MorseBot's engine). */
export function rememberBotGame(gameId: string, botId: string) {
  try {
    const map = JSON.parse(localStorage.getItem(GAME_KEY) || "{}");
    map[gameId] = botId;
    const keys = Object.keys(map);
    if (keys.length > 60) delete map[keys[0]];
    localStorage.setItem(GAME_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  touchBot(botId);
}

export function botForGame(gameId: string | null | undefined): MyBot | null {
  if (!gameId) return null;
  try {
    const map = JSON.parse(localStorage.getItem(GAME_KEY) || "{}");
    return botById(map[gameId]);
  } catch {
    return null;
  }
}

/** The game on screen right now, so the buddy can coach on it. */
export type LiveGame = {
  gameId: string;
  fen: string;
  you: "w" | "b";
  myTurn: boolean;
  view: string;
  vsBot: boolean;
  /** Fair play: false in rated human games → no coach / hints / engine help. */
  coachOk: boolean;
};
declare global {
  interface Window {
    __morseLiveGame?: LiveGame | null;
  }
}
export function publishLiveGame(g: LiveGame | null) {
  window.__morseLiveGame = g;
}

export function summonBot(botId: string) {
  window.dispatchEvent(new CustomEvent(SUMMON_EVENT, { detail: { botId } }));
}

/** In-game table chat ↔ your bot: game-view sends ASK, the buddy answers with REPLY. */
export const BOT_ASK_EVENT = "morse-bot-ask";
export const BOT_REPLY_EVENT = "morse-bot-reply";
export function askBot(text: string, gameId?: string) {
  window.dispatchEvent(new CustomEvent(BOT_ASK_EVENT, { detail: { text, gameId } }));
}

/** Which bot is up right now (survives view switches, remounts and reloads in this tab). */
const ACTIVE_KEY = "morse-bot-active";
export function saveActiveBot(v: { id: string; panel: boolean } | null) {
  try {
    if (v) sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
  // Selecting / summoning a bot also becomes the lounge "Timed or breeze vs …" entry.
  // Dismiss does not clear last — saved bots stay, and the lounge keeps showing who you last used.
  if (v) touchBot(v.id);
}
export function loadActiveBot(): { id: string; panel: boolean } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
    return v && typeof v.id === "string" ? v : null;
  } catch {
    return null;
  }
}

/**
 * One lounge play entry for custom bots: "Timed or breeze vs <name>".
 * All saved bots stay in localStorage; this pointer swaps which name the single
 * button shows — last created, selected (summon), or played.
 */
export function touchBot(id: string) {
  if (!id) return;
  try {
    const prev = localStorage.getItem(LAST_KEY);
    localStorage.setItem(LAST_KEY, id);
    if (prev === id) return;
  } catch {
    return;
  }
  window.dispatchEvent(new Event(BOT_EVENT));
}

/** Bot for the single lounge play link; falls back to most recently created. */
export function lastBot(): MyBot | null {
  try {
    const id = localStorage.getItem(LAST_KEY);
    const hit = botById(id);
    if (hit) return hit;
  } catch {
    /* ignore */
  }
  return listBots()[0] ?? null;
}
