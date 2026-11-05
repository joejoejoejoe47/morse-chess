/**
 * Local rule-based Morse Chess helper (fallback). When the host sets XAI_API_KEY or
 * OPENAI_API_KEY, askBrain() in llm.ts prefers the PHP /api/bot-brain proxy instead.
 * This file still knows the app's buttons, chess rules, and clean jokes, and never invents
 * features. Used whenever the cloud brain is off or unreachable.
 */

export type GuideTarget = { sel?: string; text?: RegExp };
export type GuideTopic = { id: string; words: RegExp; path: string; pathName: string; target: GuideTarget; say: string };

/** Feature -> where it lives. `text` matches a visible button/link label when there is no hook. */
export const GUIDE: GuideTopic[] = [
  { id: "create-bot", words: /(create|make|build|new).{0,12}(bot|coach|teacher|robot)/, path: "/", pathName: "the lounge", target: { sel: "[data-create-bot-link]" }, say: "Right here! Tap Create Bot / Coach / Teacher to make another buddy like me." },
  { id: "play-bot", words: /(play|game).{0,20}(bot|you|morsebot|computer)|vs (the )?bot/, path: "/", pathName: "the lounge", target: { sel: "[data-my-bot-play]", text: /^Timed or breeze vs/ }, say: "Tap this one to play me! Pick Timed or Breeze, then your color." },
  { id: "random", words: /random|stranger|anyone|match ?making|find (a )?(game|opponent)/, path: "/", pathName: "the lounge", target: { text: /^Random pull-up/ }, say: "Random pull-up asks everyone online. First yes sits down with you." },
  { id: "friend", words: /friend|challenge|invite|intended|username/, path: "/", pathName: "the lounge", target: { text: /^Intended pull-up/ }, say: "Intended pull-up lets you type a friend's username and challenge them." },
  { id: "club", words: /club|tournament|bracket|leaderboard|ranking/, path: "/", pathName: "the lounge", target: { text: /^CHESS CLUB$/ }, say: "The Chess Club is here: the bracket and the big 3D board live inside." },
  { id: "history", words: /history|past games|old games|replay|review/, path: "/", pathName: "the lounge", target: { sel: "[data-history-button]" }, say: "History keeps your old games. Open one to replay it move by move." },
  { id: "boards", words: /board (skin|look|style)|boards|change (the )?board|new board/, path: "/", pathName: "the lounge", target: { text: /^Board$/ }, say: "Board opens the board shelf, where you pick how your board looks." },
  { id: "avatar", words: /avatar|character|outfit|my look|av\b/, path: "/", pathName: "the lounge", target: { text: /^AV$/ }, say: "AV is your avatar. Dress up your character there." },
  { id: "sandbox", words: /sandbox|other games|shelf|mini ?games/, path: "/", pathName: "the lounge", target: { text: /^Sandbox game/ }, say: "Sandbox game opens the game shelf." },
  { id: "resign", words: /resign|give up|quit (the )?game|surrender/, path: "/play", pathName: "a game", target: { text: /^Resign$/ }, say: "Resign is up here. But hey, never give up too early. Comebacks are fun!" },
  { id: "view", words: /2d|3d|switch view|camera|view/, path: "/play", pathName: "a game", target: { text: /^(2D|3D|LG|AN)$/ }, say: "These switch the board view: 2D, 3D and friends." },
  { id: "lounge", words: /home|lounge|go back|main (menu|page)/, path: "/", pathName: "the lounge", target: { text: /^(Lounge|Back)$/ }, say: "That takes you back to the lounge." },
];

export type BrainReply =
  | { kind: "say"; text: string }
  | { kind: "guide"; text: string; topic: GuideTopic }
  | { kind: "coach"; text: string };

const JOKES = [
  "Why did the pawn get a promotion? It kept moving forward and never looked back!",
  "I tried to tell the bishop a joke, but he only takes things diagonally.",
  "Why are chess players so calm? They always keep their kings in check.",
  "What do you call a knight who is afraid to fight? Sir Render!",
  "My favorite piece of music? A Morse code remix. Beep beep, boop!",
  "Why did the robot go to chess school? To improve its circuit-ry of thought!",
];
const HAPPY = ["Beep boop!", "Ooh, fun!", "Yay!", "Woohoo!", "Gears spinning!"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const RULES: [RegExp, string][] = [
  [/pawn/, "Pawns move one square forward, or two on their first move, and capture one square diagonally. Reach the far side and it becomes a queen or anything you like!"],
  [/knight|horse/, "The knight jumps in an L: two squares one way, then one to the side. It's the only piece that hops over others."],
  [/bishop/, "Bishops slide diagonally as far as they like. Each one stays on its own color all game."],
  [/rook|castle(?!ing)/, "Rooks slide in straight lines, up, down, left or right, as far as the road is clear."],
  [/queen/, "The queen moves like a rook and a bishop combined. She's your strongest piece, so keep her safe!"],
  [/castl/, "Castling: king moves two squares toward a rook and the rook hops over. Only if neither moved, the squares between are empty, and the king is not in check or passing through check."],
  [/en passant/, "En passant: if a pawn rushes two squares and lands beside your pawn, you may capture it as if it moved one. Only on the very next move!"],
  [/check ?mate|checkmate/, "Checkmate means the king is attacked and has no way out. That ends the game!"],
  [/stalemate/, "Stalemate is when the side to move has no legal move but is not in check. It's a draw."],
  [/king/, "The king moves one square any direction. Keep him safe; if he gets checkmated, the game is over."],
  [/opening|start (a )?game well|first moves?/, "Good opening tips: control the center with pawns, bring knights and bishops out, castle early, and don't move the queen out too soon."],
  [/timed|breeze|clock/, "Timed games give each player a clock. Breeze has no clock, so you can think as long as you like."],
];

export function think(raw: string, botName: string): BrainReply {
  const t = raw.toLowerCase().trim();
  if (!t) return { kind: "say", text: "I didn't catch that. Try again? I'm all ears. Well, all antennas." };

  if (/coach|teach|make me better|improve|get better|help me (win|play)|best move|what should i (play|do)|hint|tip for (this|my) (move|game)|analy[sz]e/.test(t))
    return { kind: "coach", text: "Coach mode on!" };

  if (/how (do|can|to)|where (is|do|can)|show me|find the|take me|point/.test(t) || /^(open|go to) /.test(t)) {
    const topic = GUIDE.find((g) => g.words.test(t));
    if (topic) return { kind: "guide", text: topic.say, topic };
  }
  for (const [re, text] of RULES) if (re.test(t) && /how|what|move|rule|explain|tip|\?/.test(t)) return { kind: "say", text };
  const topic = GUIDE.find((g) => g.words.test(t));
  if (topic && /where|how|show|open|find/.test(t)) return { kind: "guide", text: topic.say, topic };

  if (/joke|funny|make me laugh|laugh/.test(t)) return { kind: "say", text: pick(JOKES) };
  if (/^(hi|hey|hello|yo|sup|howdy|good (morning|evening|afternoon))\b/.test(t))
    return { kind: "say", text: `${pick(HAPPY)} Hi! I'm ${botName}. Ask me how to do anything, or say "coach me" in a game.` };
  if (/your name|who are you|what are you/.test(t))
    return { kind: "say", text: `I'm ${botName}, your Morse Chess robot buddy. I live in this browser, I know the buttons, the rules, and lots of jokes. I'm not a big AI, I'm honest about that!` };
  if (/thank|thx|ty\b/.test(t)) return { kind: "say", text: "Anytime! Helping you is my favorite thing. Beep!" };
  if (/how are you|how's it going|you ok/.test(t)) return { kind: "say", text: "Fully charged and happy! How about you?" };
  if (/morse chess|this (app|game|site)/.test(t))
    return { kind: "say", text: "Morse Chess is a chess club: play random players, challenge friends, play bots like me, join the Chess Club bracket, and replay your games in History." };
  if (/(are|r) you (smart|ai|real|alive)/.test(t))
    return { kind: "say", text: "Truth time: when the host hasn't plugged in a cloud brain I run on careful rules — but I know this app inside out, and the coach uses a real chess engine!" };
  if (/stupid|dumb|hate you|shut up|bad bot/.test(t)) return { kind: "say", text: "Aw, that's okay! Even robots have off days. Want a joke to cheer us both up?" };
  if (/bye|see you|later|goodbye/.test(t)) return { kind: "say", text: "Bye bye! Type my summon code any time and I'll zoom back." };
  if (/summon|code/.test(t)) return { kind: "say", text: "Type my summon letters anywhere on the 2D screens and I'll pop right up!" };

  return {
    kind: "say",
    text: `Hmm, I honestly don't know that one. I'm a Morse Chess helper, so try "how do I play a friend", "how does the knight move", "tell me a joke", or "coach me" in a game.`,
  };
}
