import { createServerFn } from "@tanstack/react-start";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  BOT_USER_ID,
  BOT_USERNAME,
  BOT_V2_USER_ID,
  BOT_V2_USERNAME,
  START_SCORE,
  ELO_K,
  ELO_FLOOR,
  TURN_MS,
  USERNAME_RE,
  isBotUserId,
  type BotKind,
  type GameMode,
  type GameStatus,
  type Side,
} from "@/lib/mores-constants";
import { MASTER_SCORE, isMasterUsername, boardById, boardUnlocked, DEFAULT_BOARD_ID } from "@/lib/chess/board-skins";

type ProfileRow = {
  user_id: string;
  username: string;
  username_lc: string;
  score: number;
  equipped_board?: string | null;
  coins?: number | string | null;
  bot_streak?: number | string | null;
};

type GameRow = {
  id: string;
  white_user_id: string;
  black_user_id: string;
  mode: GameMode;
  fen: string;
  status: GameStatus;
  turn: Side;
  last_move_from: string | null;
  last_move_to: string | null;
  last_move_san: string | null;
  turn_started_at: string | number | Date;
  white_clock_ms: number | string | null;
  black_clock_ms: number | string | null;
  winner_user_id: string | null;
  scored: boolean | string | number;
  chat_open?: boolean | string | number | null;
  live_open?: boolean | string | number | null;
  camera_open?: boolean | string | number | null;
  last_prize?: number | string | null;
  coin_award?: number | string | null;
  pull?: boolean | string | number | null;
};

export type PlayerInfo = { userId: string; username: string; score: number };

export type GameSnapshot = {
  id: string;
  fen: string;
  mode: GameMode;
  status: GameStatus;
  turn: Side;
  you: Side;
  white: PlayerInfo;
  black: PlayerInfo;
  lastMove: { from: string; to: string; san: string } | null;
  remainingMs: number;
  whiteClockMs: number;
  blackClockMs: number;
  serverNow: number;
  moves: { san: string; from: string; to: string }[];
  winnerUserId: string | null;
  myScore: number;
  opponentName: string;
  myBoard: string;
  chatOpen: boolean;
  liveOpen: boolean;
  cameraOpen: boolean;
  chat: { id: number; from: string; text: string }[];
  scorePrize: number | null;
  pull: boolean;
  coins: number;
  coinAward: number;
};

export type ChallengeCard = {
  id: string;
  fromUsername: string;
  toUsername: string;
  mode: GameMode;
  status: string;
  createdAt: string;
  kind: "named" | "pull";
};

export type HomeState = {
  profile: { username: string; score: number; equippedBoard: string; coins: number } | null;
  inbox: ChallengeCard[];
  outgoing: ChallengeCard[];
  activeGameId: string | null;
  queued: boolean;
  queueMode: GameMode | null;
  queueMiss: boolean;
  online: { username: string; score: number }[];
  leaders: { username: string; score: number }[];
};

const PIECE_VAL: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

function asTime(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v < 1e12 ? v * 1000 : v;
  }
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : Date.now();
  }
  return Date.now();
}

function toInt(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function liveClocks(game: GameRow) {
  const storedW = toInt(game.white_clock_ms, TURN_MS);
  const storedB = toInt(game.black_clock_ms, TURN_MS);
  if (game.status !== "active" || game.mode !== "timed") {
    return { w: storedW, b: storedB };
  }
  const elapsed = Math.max(0, Date.now() - asTime(game.turn_started_at));
  if (game.turn === "w") return { w: Math.max(0, storedW - elapsed), b: storedB };
  return { w: storedW, b: Math.max(0, storedB - elapsed) };
}

function asBool(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1 || v === "1";
}

function parseMode(v: unknown): GameMode {
  return v === "breeze" ? "breeze" : "timed";
}

function newId() {
  return crypto.randomUUID();
}

function cleanUsername(raw: string) {
  const username = raw.trim();
  if (!USERNAME_RE.test(username)) {
    throw new Error("Club names are 8–20 letters, numbers, or underscores.");
  }
  return username;
}

async function ensureBoardColumn(sql: Sql) {
  await sql.query(
    "alter table profiles add column if not exists equipped_board text not null default 'lodge'",
  );
}

async function ensurePurse(sql: Sql) {
  await sql.query("alter table profiles add column if not exists coins integer not null default 0");
  await sql.query("alter table profiles add column if not exists bot_streak integer not null default 0");
  await sql.query("alter table games add column if not exists coin_award integer not null default 0");
}

async function profileById(sql: Sql, userId: string) {
  await ensureBoardColumn(sql);
  await ensurePurse(sql);
  const rows = await sql<ProfileRow>`
    select user_id, username, username_lc, score, equipped_board, coins, bot_streak from profiles where user_id = ${userId} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    score: Number(row.score),
    equipped_board: row.equipped_board || DEFAULT_BOARD_ID,
    coins: toInt(row.coins, 0),
    bot_streak: toInt(row.bot_streak, 0),
  };
}

async function touchProfile(sql: Sql, userId: string) {
  await sql`update profiles set last_seen = now() where user_id = ${userId}`;
}

async function ensureClockColumns(sql: Sql) {
  await sql.query(
    "alter table games add column if not exists white_clock_ms integer not null default 60000",
  );
  await sql.query(
    "alter table games add column if not exists black_clock_ms integer not null default 60000",
  );
}

async function insertGame(sql: Sql, a: string, b: string, mode: GameMode, pull = false) {
  const id = newId();
  const aWhite = Math.random() < 0.5;
  const white = aWhite ? a : b;
  const black = aWhite ? b : a;
  const chess = new Chess();
  const write = () => sql`
    insert into games (
      id, white_user_id, black_user_id, mode, fen, status, turn, turn_started_at,
      white_clock_ms, black_clock_ms, pull
    ) values (
      ${id}, ${white}, ${black}, ${mode}, ${chess.fen()}, 'active', 'w', ${new Date().toISOString()},
      ${TURN_MS}, ${TURN_MS}, ${pull}
    )
  `;
  try {
    await write();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("white_clock_ms") || msg.includes("black_clock_ms")) {
      await ensureClockColumns(sql);
      await write();
      return id;
    }
    if (!msg.includes("pull")) throw err;
    await sql.query("alter table games add column if not exists pull boolean not null default false");
    await write();
  }
  return id;
}

async function loadGame(sql: Sql, gameId: string) {
  const rows = await sql<GameRow>`select * from games where id = ${gameId} limit 1`;
  return rows[0] ?? null;
}

async function ensureChat(sql: Sql) {
  await sql.query("alter table games add column if not exists chat_open boolean not null default false");
  await sql.query("alter table games add column if not exists live_open boolean not null default false");
  await sql.query("alter table games add column if not exists camera_open boolean not null default false");
  await sql.query("alter table games add column if not exists last_prize integer");
  await sql.query("create unique index if not exists game_moves_ply_uidx on game_moves (game_id, ply)");
  await sql.query(`
    create table if not exists game_chat (
      id serial primary key,
      game_id text not null,
      user_id text not null,
      body text not null,
      created_at timestamptz not null default now()
    )
  `);
}

async function ensureBots(sql: Sql) {
  await sql`
    insert into profiles (user_id, username, username_lc, score)
    values (${BOT_USER_ID}, ${BOT_USERNAME}, ${BOT_USERNAME.toLowerCase()}, ${START_SCORE})
    on conflict (user_id) do update set username = excluded.username, username_lc = excluded.username_lc
  `;
  await sql`
    insert into profiles (user_id, username, username_lc, score)
    values (${BOT_V2_USER_ID}, ${BOT_V2_USERNAME}, ${BOT_V2_USERNAME.toLowerCase()}, ${START_SCORE})
    on conflict (user_id) do update set username = excluded.username, username_lc = excluded.username_lc
  `;
}

async function ensureEloScale(sql: Sql) {
  await sql.query("alter table profiles add column if not exists elo_scaled boolean not null default false");
  await sql`
    update profiles
    set score = ${START_SCORE} + (score * 4),
        elo_scaled = true
    where elo_scaled = false
      and score < 400
      and user_id <> ${BOT_USER_ID}
      and user_id <> ${BOT_V2_USER_ID}
  `;
  await sql`
    update profiles
    set elo_scaled = true
    where elo_scaled = false
  `;
}

async function applyElo(sql: Sql, whiteId: string, blackId: string, whiteScore: 0 | 0.5 | 1) {
  const [white, black] = await Promise.all([profileById(sql, whiteId), profileById(sql, blackId)]);
  const ra = white?.score ?? START_SCORE;
  const rb = black?.score ?? START_SCORE;
  const expected = 1 / (1 + 10 ** ((rb - ra) / 400));
  const dWhite = Math.round(ELO_K * (whiteScore - expected));
  const dBlack = -dWhite;
  const nextW = Math.max(ELO_FLOOR, ra + dWhite);
  const nextB = Math.max(ELO_FLOOR, rb + dBlack);
  await sql`update profiles set score = ${nextW} where user_id = ${whiteId}`;
  await sql`update profiles set score = ${nextB} where user_id = ${blackId}`;
  return dWhite;
}

async function settleElo(sql: Sql, game: GameRow, status: GameStatus, winnerUserId: string | null) {
  const whiteScore: 0 | 0.5 | 1 =
    status === "draw" ? 0.5 : winnerUserId === game.white_user_id ? 1 : 0;
  const whiteDelta = await applyElo(sql, game.white_user_id, game.black_user_id, whiteScore);
  await sql`update games set last_prize = ${whiteDelta} where id = ${game.id}`;
  game.last_prize = whiteDelta;
  game.scored = true;
}

async function finishGame(
  sql: Sql,
  game: GameRow,
  status: GameStatus,
  winnerUserId: string | null,
) {
  if (game.status !== "active") return;
  await sql`
    update games
    set status = ${status},
        winner_user_id = ${winnerUserId},
        scored = true
    where id = ${game.id} and status = 'active'
  `;
  await settleElo(sql, game, status, winnerUserId);
  game.status = status;
  game.winner_user_id = winnerUserId;
  await noteBotStreak(sql, game, status, winnerUserId);
}

async function noteBotStreak(sql: Sql, game: GameRow, status: GameStatus, winnerUserId: string | null) {
  await ensurePurse(sql);
  const whiteBot = isBotUserId(game.white_user_id);
  const blackBot = isBotUserId(game.black_user_id);
  if (whiteBot === blackBot) {
    if (!whiteBot) {
      await sql`update profiles set bot_streak = 0 where user_id = ${game.white_user_id}`;
      await sql`update profiles set bot_streak = 0 where user_id = ${game.black_user_id}`;
    }
    return;
  }
  const humanId = whiteBot ? game.black_user_id : game.white_user_id;
  const won = status !== "draw" && winnerUserId === humanId;
  if (!won) {
    await sql`update profiles set bot_streak = 0 where user_id = ${humanId}`;
    return;
  }
  const rows = await sql<{ bot_streak: number | string; coins: number | string }>`
    select bot_streak, coins from profiles where user_id = ${humanId} limit 1
  `;
  const streak = toInt(rows[0]?.bot_streak, 0) + 1;
  let coins = toInt(rows[0]?.coins, 0);
  let award = 0;
  let next = streak;
  if (streak >= 6) {
    coins += 5;
    award = 5;
    next = 0;
  }
  await sql`update profiles set bot_streak = ${next}, coins = ${coins} where user_id = ${humanId}`;
  if (award) {
    await sql`update games set coin_award = ${award} where id = ${game.id}`;
    game.coin_award = award;
  }
}

const PST: Record<string, number[]> = {
  p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
};

function pstAt(type: string, color: string, rankFromTop: number, file: number) {
  const table = PST[type];
  if (!table) return 0;
  const idx = color === "w" ? rankFromTop * 8 + file : (7 - rankFromTop) * 8 + file;
  return table[idx] ?? 0;
}

function evaluate(chess: Chess, bot: Side): number {
  if (chess.isCheckmate()) return chess.turn() === bot ? -100000 : 100000;
  if (chess.isDraw() || chess.isStalemate()) return 0;
  let s = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const val = (PIECE_VAL[p.type] ?? 0) + pstAt(p.type, p.color, r, f);
      s += p.color === bot ? val : -val;
    }
  }
  if (chess.isCheck()) s += chess.turn() === bot ? -40 : 40;
  return s;
}

function orderMoves(chess: Chess) {
  const moves = chess.moves({ verbose: true });
  return moves.sort((a, b) => {
    const ac = (a.captured ? 20 + (PIECE_VAL[a.captured] ?? 0) : 0) + (a.promotion ? 90 : 0);
    const bc = (b.captured ? 20 + (PIECE_VAL[b.captured] ?? 0) : 0) + (b.promotion ? 90 : 0);
    return bc - ac;
  });
}

const BOOK: Record<string, string[]> = {
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq": ["e2e4", "d2d4", "g1f3", "c2c4"],
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq": ["e7e5", "c7c5", "e7e6", "c7c6", "g8f6"],
  "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq": ["d7d5", "g8f6", "e7e6", "c7c5"],
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq": ["g1f3", "b1c3", "f1c4", "f1b5"],
  "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq": ["g1f3", "b1c3", "c2c3", "d2d4"],
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq": ["b8c6", "g8f6"],
  "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq": ["f1b5", "d2d4", "b1c3"],
  "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq": ["d2d4", "b1c3", "f1c4"],
  "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq": ["d2d4"],
  "rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq": ["e7e5", "g8f6", "c7c5"],
};

function fenKey(chess: Chess) {
  return chess.fen().split(" ").slice(0, 4).join(" ");
}

function quiesce(chess: Chess, bot: Side, deadline: number): number {
  const stand = evaluate(chess, bot);
  if (Date.now() > deadline) return stand;
  const botTurn = chess.turn() === bot;
  let best = stand;
  const caps = chess.moves({ verbose: true }).filter((m) => m.captured || m.promotion);
  for (const m of caps.slice(0, 16)) {
    chess.move(m);
    const sc = evaluate(chess, bot);
    chess.undo();
    best = botTurn ? Math.max(best, sc) : Math.min(best, sc);
  }
  return best;
}

function minimax(chess: Chess, bot: Side, depth: number, alpha: number, beta: number, deadline: number): number {
  if (Date.now() > deadline) return evaluate(chess, bot);
  if (chess.isCheckmate()) return chess.turn() === bot ? -120000 - depth : 120000 + depth;
  if (chess.isDraw() || chess.isStalemate()) return 0;
  if (depth <= 0) return quiesce(chess, bot, deadline);
  const moves = orderMoves(chess);
  if (!moves.length) return evaluate(chess, bot);
  const botTurn = chess.turn() === bot;
  let best = botTurn ? -Infinity : Infinity;
  for (const m of moves) {
    chess.move(m);
    const sc = minimax(chess, bot, depth - 1, alpha, beta, deadline);
    chess.undo();
    if (botTurn) {
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
    } else {
      if (sc < best) best = sc;
      if (sc < beta) beta = sc;
    }
    if (beta <= alpha) break;
    if (Date.now() > deadline) break;
  }
  return best;
}

function pickBotMove(fen: string, botSide: Side, kind: BotKind) {
  const chess = new Chess(fen);
  if (chess.turn() !== botSide) return null;
  const book = BOOK[fenKey(chess)];
  const moves = orderMoves(chess);
  if (!moves.length) return null;
  if (book?.length) {
    const legal = new Set(moves.map((m) => m.from + m.to + (m.promotion ?? "")));
    const opts = book
      .map((u) => ({ from: u.slice(0, 2), to: u.slice(2, 4) }))
      .filter((u) => legal.has(u.from + u.to) || legal.has(u.from + u.to + "q"));
    if (opts.length) {
      if (kind === "v1") {
        const u = opts[Math.min(opts.length - 1, 0)];
        return { from: u.from, to: u.to, promotion: undefined as string | undefined };
      }
      let best = opts[0];
      let bestSc = -Infinity;
      for (const u of opts) {
        const played = chess.move({ from: u.from as Square, to: u.to as Square, promotion: "q" });
        if (!played) continue;
        const sc = evaluate(chess, botSide);
        chess.undo();
        if (sc > bestSc) {
          bestSc = sc;
          best = u;
        }
      }
      return { from: best.from, to: best.to, promotion: undefined as string | undefined };
    }
  }
  const deadline = Date.now() + (kind === "v2" ? 850 : 480);
  const maxDepth = kind === "v2" ? 4 : 3;
  let pick = moves[0];
  let bestScore = -Infinity;
  for (let depth = 1; depth <= maxDepth; depth++) {
    if (Date.now() > deadline) break;
    let depthBest = -Infinity;
    let depthPick = pick;
    for (const m of moves) {
      if (Date.now() > deadline) break;
      chess.move(m);
      const sc = minimax(chess, botSide, depth - 1, -Infinity, Infinity, deadline);
      chess.undo();
      if (sc > depthBest) {
        depthBest = sc;
        depthPick = m;
      }
    }
    if (depthBest > -Infinity) {
      bestScore = depthBest;
      pick = depthPick;
    }
  }
  void bestScore;
  return { from: pick.from, to: pick.to, promotion: pick.promotion as string | undefined };
}

async function recordAndApplyMove(
  sql: Sql,
  game: GameRow,
  from: string,
  to: string,
  promotion?: string,
) {
  const expectedFen = game.fen;
  const chess = new Chess(expectedFen);
  const needsPromo =
    chess.get(from as Square)?.type === "p" && (to.endsWith("8") || to.endsWith("1"));
  const promo =
    promotion === "q" || promotion === "r" || promotion === "b" || promotion === "n" ? promotion : undefined;
  if (needsPromo && !promo) return { ok: false as const, error: "Choose a piece." };
  const moved = chess.move({
    from: from as Square,
    to: to as Square,
    promotion: promo,
  });
  if (!moved) return { ok: false as const, error: "That move is not legal." };

  let status: GameStatus = "active";
  let winner: string | null = null;
  if (chess.isCheckmate()) {
    status = moved.color === "w" ? "white_win" : "black_win";
    winner = moved.color === "w" ? game.white_user_id : game.black_user_id;
  } else if (chess.isDraw() || chess.isStalemate()) {
    status = "draw";
  }

  const now = new Date().toISOString();
  const clocks = liveClocks(game);
  const updated = await sql<{ id: string }>`
    update games set
      fen = ${chess.fen()},
      turn = ${chess.turn()},
      last_move_from = ${moved.from},
      last_move_to = ${moved.to},
      last_move_san = ${moved.san},
      turn_started_at = ${now},
      white_clock_ms = ${clocks.w},
      black_clock_ms = ${clocks.b},
      status = ${status},
      winner_user_id = ${winner},
      scored = ${status !== "active"}
    where id = ${game.id} and fen = ${expectedFen} and status = 'active'
    returning id
  `;
  if (!updated.length) return { ok: false as const, error: "That move already happened." };

  const plyRows = await sql<{ c: number }>`select count(*)::int as c from game_moves where game_id = ${game.id}`;
  const ply = (plyRows[0]?.c ?? 0) + 1;
  try {
    await sql`
      insert into game_moves (game_id, ply, san, from_sq, to_sq)
      values (${game.id}, ${ply}, ${moved.san}, ${moved.from}, ${moved.to})
    `;
  } catch {
    return { ok: false as const, error: "That move already happened." };
  }

  game.fen = chess.fen();
  game.turn = chess.turn();
  game.last_move_from = moved.from;
  game.last_move_to = moved.to;
  game.last_move_san = moved.san;
  game.turn_started_at = now;
  game.white_clock_ms = clocks.w;
  game.black_clock_ms = clocks.b;
  game.status = status;
  game.winner_user_id = winner;

  if (status === "white_win" || status === "black_win" || status === "draw") {
    await settleElo(sql, game, status, winner);
  }
  return { ok: true as const };
}

async function maybeTimeout(sql: Sql, game: GameRow) {
  if (game.status !== "active" || game.mode !== "timed") return;
  const clocks = liveClocks(game);
  const remaining = game.turn === "w" ? clocks.w : clocks.b;
  if (remaining > 0) return;
  const winner = game.turn === "w" ? game.black_user_id : game.white_user_id;
  await finishGame(sql, game, game.turn === "w" ? "black_win" : "white_win", winner);
}

async function maybeBotMove(sql: Sql, game: GameRow) {
  const latest = await loadGame(sql, game.id);
  if (!latest) return;
  Object.assign(game, latest);
  if (game.status !== "active") return;
  const botSide: Side | null =
    game.white_user_id === BOT_USER_ID || game.white_user_id === BOT_V2_USER_ID
      ? "w"
      : game.black_user_id === BOT_USER_ID || game.black_user_id === BOT_V2_USER_ID
        ? "b"
        : null;
  if (!botSide || game.turn !== botSide) return;
  const position = new Chess(game.fen);
  if (position.turn() !== botSide) return;
  const kind: BotKind =
    game.white_user_id === BOT_V2_USER_ID || game.black_user_id === BOT_V2_USER_ID ? "v2" : "v1";
  const thinkMs = kind === "v2" ? 280 : 420;
  if (Date.now() - asTime(game.turn_started_at) < thinkMs) return;
  const pick = pickBotMove(game.fen, botSide, kind);
  if (!pick) {
    const again = await loadGame(sql, game.id);
    if (!again || again.fen !== game.fen) return;
    if (position.isCheckmate()) {
      const winner = botSide === "w" ? game.black_user_id : game.white_user_id;
      await finishGame(sql, game, botSide === "w" ? "black_win" : "white_win", winner);
    } else {
      await finishGame(sql, game, "draw", null);
    }
    return;
  }
  const piece = position.get(pick.from as Square);
  if (!piece || piece.color !== botSide) return;
  await recordAndApplyMove(sql, game, pick.from, pick.to, pick.promotion);
}

async function snapshotFor(sql: Sql, game: GameRow, userId: string, playBot = false): Promise<GameSnapshot | null> {
  if (game.white_user_id !== userId && game.black_user_id !== userId) return null;
  await ensureChat(sql);
  await maybeTimeout(sql, game);
  if (playBot) await maybeBotMove(sql, game);
  const fresh = (await loadGame(sql, game.id)) ?? game;
  const [white, black] = await Promise.all([
    profileById(sql, fresh.white_user_id),
    profileById(sql, fresh.black_user_id),
  ]);
  const moves = await sql<{ san: string; from_sq: string; to_sq: string }>`
    select san, from_sq, to_sq from game_moves where game_id = ${fresh.id} order by ply asc
  `;
  const chatRows = await sql<{ id: number; user_id: string; body: string }>`
    select id, user_id, body from game_chat where game_id = ${fresh.id} order by id asc limit 80
  `;
  const nameOf = (id: string) =>
    id === fresh.white_user_id ? (white?.username ?? "White") : id === fresh.black_user_id ? (black?.username ?? "Black") : "Seat";
  const you: Side = fresh.white_user_id === userId ? "w" : "b";
  const clocks = liveClocks(fresh);
  const remainingMs = fresh.turn === "w" ? clocks.w : clocks.b;
  const me = you === "w" ? white : black;
  const opp = you === "w" ? black : white;
  return {
    id: fresh.id,
    fen: fresh.fen,
    mode: parseMode(fresh.mode),
    status: fresh.status,
    turn: fresh.turn,
    you,
    white: {
      userId: fresh.white_user_id,
      username: white?.username ?? "White",
      score: white?.score ?? START_SCORE,
    },
    black: {
      userId: fresh.black_user_id,
      username: black?.username ?? "Black",
      score: black?.score ?? START_SCORE,
    },
    lastMove:
      fresh.last_move_from && fresh.last_move_to && fresh.last_move_san
        ? { from: fresh.last_move_from, to: fresh.last_move_to, san: fresh.last_move_san }
        : null,
    remainingMs,
    whiteClockMs: clocks.w,
    blackClockMs: clocks.b,
    serverNow: Date.now(),
    moves: moves.map((m) => ({ san: m.san, from: m.from_sq, to: m.to_sq })),
    winnerUserId: fresh.winner_user_id,
    myScore: me?.score ?? START_SCORE,
    opponentName: opp?.username ?? "Opponent",
    myBoard: boardById(me?.equipped_board).id,
    chatOpen: asBool(fresh.chat_open),
    liveOpen: asBool(fresh.live_open),
    cameraOpen: asBool(fresh.camera_open),
    chat: chatRows.map((row) => ({ id: Number(row.id), from: nameOf(row.user_id), text: row.body })),
    scorePrize:
      fresh.last_prize == null
        ? null
        : you === "w"
          ? toInt(fresh.last_prize, 0)
          : -toInt(fresh.last_prize, 0),
    pull: asBool(fresh.pull),
    coins: me?.coins ?? 0,
    coinAward: fresh.winner_user_id === userId ? toInt(fresh.coin_award, 0) : 0,
  };
}

async function ensurePull(sql: Sql) {
  await sql.query("alter table challenges add column if not exists kind text not null default 'named'");
  await sql.query("alter table match_queue add column if not exists pinged integer not null default 0");
}

async function lastHumanOpponent(sql: Sql, userId: string) {
  const rows = await sql<{ white_user_id: string; black_user_id: string }>`
    select white_user_id, black_user_id from games
    where white_user_id = ${userId} or black_user_id = ${userId}
    order by created_at desc
    limit 1
  `;
  const game = rows[0];
  if (!game) return null;
  const other = game.white_user_id === userId ? game.black_user_id : game.white_user_id;
  return isBotUserId(other) ? null : other;
}

async function onlyOtherOnline(sql: Sql, userId: string, otherId: string) {
  const seats = await sql<{ user_id: string }>`
    select user_id from profiles
    where last_seen > now() - interval '20 seconds'
      and user_id <> ${userId}
      and user_id <> ${BOT_USER_ID}
      and user_id <> ${BOT_V2_USER_ID}
  `;
  return seats.length === 1 && seats[0]?.user_id === otherId;
}

async function tryMatch(sql: Sql, userId: string, score: number, mode: GameMode, _joinedAt: unknown) {
  void score;
  const rows = await sql<{ user_id: string }>`
    select user_id from match_queue
    where user_id <> ${userId} and mode = ${mode}
    order by joined_at asc
  `;
  if (!rows.length) return null;
  const avoid = await lastHumanOpponent(sql, userId);
  const alone = avoid ? await onlyOtherOnline(sql, userId, avoid) : true;
  const pick = rows.find((row) => alone || row.user_id !== avoid);
  if (!pick) return null;
  const taken = await sql<{ user_id: string }>`
    delete from match_queue where user_id = ${pick.user_id} returning user_id
  `;
  if (!taken.length) return null;
  await sql`delete from match_queue where user_id = ${userId}`;
  await sql`
    update challenges set status = 'cancelled'
    where status = 'pending' and kind = 'pull'
      and (from_user_id = ${userId} or from_user_id = ${taken[0].user_id} or to_user_id = ${userId} or to_user_id = ${taken[0].user_id})
  `;
  return insertGame(sql, userId, taken[0].user_id, mode, true);
}

async function expirePull(sql: Sql, userId: string, score: number, mode: GameMode, joinedAt: unknown, pinged: number) {
  const wait = Date.now() - asTime(joinedAt);
  const paired = await tryMatch(sql, userId, score, mode, joinedAt);
  if (paired) return { gameId: paired, miss: false };
  if (wait < 5000) return { gameId: null as string | null, miss: false };
  await sql`delete from match_queue where user_id = ${userId}`;
  await sql`
    update challenges set status = 'cancelled'
    where from_user_id = ${userId} and kind = 'pull' and status = 'pending'
  `;
  if (pinged > 0) return { gameId: null as string | null, miss: true };
  const gameId = await insertGame(sql, userId, BOT_USER_ID, mode, true);
  return { gameId, miss: false };
}

export const usernameAvailable = createServerFn({ method: "POST" })
  .validator((input: { username: string }) => ({ username: cleanUsername(input.username) }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql`
      select 1 from profiles where username_lc = ${data.username.toLowerCase()} limit 1
    `;
    return rows.length === 0;
  });

export const claimUsername = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { username: string }) => ({ username: cleanUsername(input.username) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureEloScale(sql);
    const existing = await profileById(sql, context.userId);
    if (existing) {
      return { username: existing.username, score: existing.score };
    }
    const score = isMasterUsername(data.username) ? MASTER_SCORE : START_SCORE;
    try {
      await sql`
        insert into profiles (user_id, username, username_lc, score, equipped_board, elo_scaled)
        values (${context.userId}, ${data.username}, ${data.username.toLowerCase()}, ${score}, ${DEFAULT_BOARD_ID}, true)
      `;
    } catch {
      throw new Error("That club name is already taken.");
    }
    return { username: data.username, score };
  });

export const getPurse = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const profile = await profileById(sql, context.userId);
    if (!profile) return null;
    return { coins: profile.coins ?? 0 };
  });

export const getHomeState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<HomeState> => {
    const sql = await getSql();
    await ensureBots(sql);
    await ensureEloScale(sql);
    await sql.query("alter table games add column if not exists pull boolean not null default false");
    const profile = await profileById(sql, context.userId);
    if (!profile) {
      return {
        profile: null,
        inbox: [],
        outgoing: [],
        activeGameId: null,
        queued: false,
        queueMode: null,
        queueMiss: false,
        online: [],
        leaders: [],
      };
    }
    await touchProfile(sql, context.userId);
    await ensurePull(sql);

    const active = await sql<{ id: string }>`
      select id from games
      where status = 'active' and (white_user_id = ${context.userId} or black_user_id = ${context.userId})
      order by created_at desc
      limit 1
    `;

    const q = await sql<{ mode: GameMode; joined_at: string | Date; pinged: number | string | null }>`
      select mode, joined_at, pinged from match_queue where user_id = ${context.userId} limit 1
    `;
    let queued = q.length > 0;
    let queueMode: GameMode | null = q[0] ? parseMode(q[0].mode) : null;
    let matched: string | null = null;
    let queueMiss = false;
    if (q[0]) {
      const ended = await expirePull(
        sql,
        context.userId,
        Number(profile.score),
        parseMode(q[0].mode),
        q[0].joined_at,
        toInt(q[0].pinged, 0),
      );
      if (ended.gameId) {
        matched = ended.gameId;
        queued = false;
        queueMode = null;
      } else if (ended.miss) {
        queued = false;
        queueMode = null;
        queueMiss = true;
      }
    }

    const inboxRows = await sql<{
      id: string;
      mode: string;
      status: string;
      created_at: string | Date;
      username: string;
      kind: string | null;
    }>`
      select c.id, c.mode, c.status, c.created_at, p.username, c.kind
      from challenges c
      join profiles p on p.user_id = c.from_user_id
      where c.to_user_id = ${context.userId} and c.status = 'pending'
      order by c.created_at desc
    `;
    const outRows = await sql<{
      id: string;
      mode: string;
      status: string;
      created_at: string | Date;
      username: string;
    }>`
      select c.id, c.mode, c.status, c.created_at, p.username
      from challenges c
      join profiles p on p.user_id = c.to_user_id
      where c.from_user_id = ${context.userId} and c.status in ('pending', 'declined')
      order by c.created_at desc
      limit 8
    `;
    const online = await sql<{ username: string; score: number }>`
      select p.username, p.score
      from profiles p
      where p.user_id <> ${context.userId}
        and p.user_id <> ${BOT_USER_ID}
        and p.user_id <> ${BOT_V2_USER_ID}
        and p.last_seen > now() - interval '20 seconds'
        and exists (
          select 1 from games g
          where g.pull = false
            and (
              (g.white_user_id = ${context.userId} and g.black_user_id = p.user_id)
              or (g.black_user_id = ${context.userId} and g.white_user_id = p.user_id)
            )
        )
      order by p.score desc
      limit 12
    `;
    const leaders = await sql<{ username: string; score: number }>`
      select username, score from profiles
      order by score desc, created_at asc
      limit 8
    `;

    return {
      profile: {
        username: profile.username,
        score: Number(profile.score),
        equippedBoard: boardById(profile.equipped_board).id,
        coins: profile.coins ?? 0,
      },
      inbox: inboxRows.map((r) => ({
        id: r.id,
        fromUsername: r.username,
        toUsername: profile.username,
        mode: parseMode(r.mode),
        status: r.status,
        createdAt: String(r.created_at),
        kind: r.kind === "pull" ? "pull" : "named",
      })),
      outgoing: outRows.map((r) => ({
        id: r.id,
        fromUsername: profile.username,
        toUsername: r.username,
        mode: parseMode(r.mode),
        status: r.status,
        createdAt: String(r.created_at),
        kind: "named" as const,
      })),
      activeGameId: matched ?? active[0]?.id ?? null,
      queued,
      queueMode,
      queueMiss,
      online: online.map((r) => ({ username: r.username, score: Number(r.score) })),
      leaders: leaders.map((r) => ({ username: r.username, score: Number(r.score) })),
    };
  });

export const joinQueue = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { mode: GameMode }) => ({ mode: parseMode(input.mode) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureClockColumns(sql);
    const profile = await profileById(sql, context.userId);
    if (!profile) throw new Error("Choose a club name first.");
    const active = await sql<{ id: string }>`
      select id from games
      where status = 'active' and (white_user_id = ${context.userId} or black_user_id = ${context.userId})
      limit 1
    `;
    if (active[0]) return { gameId: active[0].id };
    await ensurePull(sql);
    const immediate = await tryMatch(
      sql,
      context.userId,
      Number(profile.score),
      data.mode,
      new Date().toISOString(),
    );
    if (immediate) return { gameId: immediate };

    const busyIds = await sql<{ id: string }>`
      select white_user_id as id from games where status = 'active'
      union
      select black_user_id as id from games where status = 'active'
      union
      select user_id as id from match_queue
    `;
    const skip = new Set(busyIds.map((r) => r.id));
    skip.add(context.userId);
    skip.add(BOT_USER_ID);
    skip.add(BOT_V2_USER_ID);
    const seats = await sql<{ user_id: string }>`
      select user_id from profiles
      where last_seen > now() - interval '20 seconds'
        and user_id <> ${context.userId}
        and user_id <> ${BOT_USER_ID}
        and user_id <> ${BOT_V2_USER_ID}
    `;
    const avoid = await lastHumanOpponent(sql, context.userId);
    const alone = avoid ? await onlyOtherOnline(sql, context.userId, avoid) : true;
    const targets = seats
      .map((s) => s.user_id)
      .filter((id) => !skip.has(id) && (alone || id !== avoid));
    for (const toId of targets) {
      const id = newId();
      await sql`
        insert into challenges (id, from_user_id, to_user_id, mode, status, kind)
        values (${id}, ${context.userId}, ${toId}, ${data.mode}, 'pending', 'pull')
      `;
    }
    await sql`
      insert into match_queue (user_id, score, mode, joined_at, pinged)
      values (${context.userId}, ${profile.score}, ${data.mode}, ${new Date().toISOString()}, ${targets.length})
      on conflict (user_id) do update set score = excluded.score, mode = excluded.mode, joined_at = excluded.joined_at, pinged = excluded.pinged
    `;
    return { gameId: null as string | null };
  });

export const leaveQueue = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`delete from match_queue where user_id = ${context.userId}`;
    await sql`
      update challenges set status = 'cancelled'
      where from_user_id = ${context.userId} and kind = 'pull' and status = 'pending'
    `;
    return { ok: true };
  });

export const sendChallenge = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { username: string; mode: GameMode }) => ({
    username: cleanUsername(input.username),
    mode: parseMode(input.mode),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureBots(sql);
    const me = await profileById(sql, context.userId);
    if (!me) throw new Error("Choose a club name first.");
    const active = await sql<{ id: string }>`
      select id from games
      where status = 'active' and (white_user_id = ${context.userId} or black_user_id = ${context.userId})
      limit 1
    `;
    if (active[0]) return { ok: true as const, gameId: active[0].id };

    const target = await sql<ProfileRow>`
      select user_id, username, username_lc, score from profiles
      where username_lc = ${data.username.toLowerCase()}
      limit 1
    `;
    const to = target[0];
    if (!to) return { ok: false as const, error: "No player with that club name." };
    if (to.user_id === context.userId) {
      return { ok: false as const, error: "You cannot challenge yourself." };
    }
    if (isBotUserId(to.user_id)) {
      await ensureBots(sql);
      const gameId = await insertGame(sql, context.userId, to.user_id, data.mode);
      return { ok: true as const, gameId };
    }
    const pending = await sql`
      select 1 from challenges
      where from_user_id = ${context.userId} and to_user_id = ${to.user_id} and status = 'pending'
      limit 1
    `;
    if (pending.length) return { ok: false as const, error: "You already sent the user a challenge." };
    const id = newId();
    await sql`
      insert into challenges (id, from_user_id, to_user_id, mode, status)
      values (${id}, ${context.userId}, ${to.user_id}, ${data.mode}, 'pending')
    `;
    return { ok: true as const, challengeId: id };
  });

export const respondChallenge = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; accept: boolean }) => ({
    id: String(input.id),
    accept: Boolean(input.accept),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      from_user_id: string;
      to_user_id: string;
      mode: string;
      status: string;
      kind: string | null;
    }>`
      select id, from_user_id, to_user_id, mode, status, kind from challenges where id = ${data.id} limit 1
    `;
    const ch = rows[0];
    if (!ch || ch.to_user_id !== context.userId) {
      return { ok: false as const, error: "Challenge not found." };
    }
    if (ch.status !== "pending") return { ok: false as const, error: "That challenge is no longer open." };
    if (!data.accept) {
      await sql`update challenges set status = 'declined' where id = ${ch.id}`;
      return { ok: true as const };
    }
    if (ch.kind === "pull") {
      const avoid = await lastHumanOpponent(sql, ch.from_user_id);
      if (avoid && avoid === ch.to_user_id && !(await onlyOtherOnline(sql, ch.from_user_id, avoid))) {
        await sql`update challenges set status = 'cancelled' where id = ${ch.id}`;
        return { ok: false as const, error: "That seat just played. Someone else can sit." };
      }
    }
    const claimed = await sql<{ id: string }>`
      update challenges set status = 'accepted' where id = ${ch.id} and status = 'pending' returning id
    `;
    if (!claimed.length) return { ok: false as const, error: "Someone else already sat down." };
    await sql`
      update challenges set status = 'cancelled'
      where kind = 'pull' and status = 'pending' and from_user_id = ${ch.from_user_id} and id <> ${ch.id}
    `;
    await sql`delete from match_queue where user_id in (${ch.from_user_id}, ${ch.to_user_id})`;
    const gameId = await insertGame(sql, ch.from_user_id, ch.to_user_id, parseMode(ch.mode), ch.kind === "pull");
    await sql`update challenges set game_id = ${gameId} where id = ${ch.id}`;
    return { ok: true as const, gameId };
  });

export const cancelChallenge = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update challenges set status = 'cancelled'
      where id = ${data.id} and from_user_id = ${context.userId} and status = 'pending'
    `;
    return { ok: true };
  });

export const openGameLive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { gameId: string }) => ({ gameId: String(input.gameId) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureChat(sql);
    const game = await loadGame(sql, data.gameId);
    if (!game) return null;
    if (game.white_user_id !== context.userId && game.black_user_id !== context.userId) return null;
    await sql`update games set chat_open = true, live_open = true where id = ${game.id}`;
    game.chat_open = true;
    game.live_open = true;
    return snapshotFor(sql, game, context.userId);
  });

export const openGameChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { gameId: string }) => ({ gameId: String(input.gameId) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureChat(sql);
    const game = await loadGame(sql, data.gameId);
    if (!game) return null;
    if (game.white_user_id !== context.userId && game.black_user_id !== context.userId) return null;
    await sql`update games set chat_open = true where id = ${game.id}`;
    game.chat_open = true;
    return snapshotFor(sql, game, context.userId);
  });

export const closeGameChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { gameId: string }) => ({ gameId: String(input.gameId) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureChat(sql);
    const game = await loadGame(sql, data.gameId);
    if (!game) return null;
    if (game.white_user_id !== context.userId && game.black_user_id !== context.userId) return null;
    await sql`update games set chat_open = false where id = ${game.id}`;
    game.chat_open = false;
    return snapshotFor(sql, game, context.userId);
  });

export const openGameCamera = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { gameId: string }) => ({ gameId: String(input.gameId) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureChat(sql);
    const game = await loadGame(sql, data.gameId);
    if (!game) return null;
    if (game.white_user_id !== context.userId && game.black_user_id !== context.userId) return null;
    await sql`update games set camera_open = true where id = ${game.id}`;
    game.camera_open = true;
    return snapshotFor(sql, game, context.userId);
  });

export const closeGameCamera = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { gameId: string }) => ({ gameId: String(input.gameId) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureChat(sql);
    const game = await loadGame(sql, data.gameId);
    if (!game) return null;
    if (game.white_user_id !== context.userId && game.black_user_id !== context.userId) return null;
    await sql`update games set camera_open = false where id = ${game.id}`;
    game.camera_open = false;
    return snapshotFor(sql, game, context.userId);
  });

export const sendGameChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { gameId: string; text: string }) => ({
    gameId: String(input.gameId),
    text: String(input.text ?? "").trim().slice(0, 280),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureChat(sql);
    const game = await loadGame(sql, data.gameId);
    if (!game) return null;
    if (game.white_user_id !== context.userId && game.black_user_id !== context.userId) return null;
    if (!data.text) {
      await sql`update games set chat_open = true where id = ${game.id}`;
      game.chat_open = true;
      return snapshotFor(sql, game, context.userId);
    }
    await sql`update games set chat_open = true where id = ${game.id}`;
    await sql`
      insert into game_chat (game_id, user_id, body)
      values (${game.id}, ${context.userId}, ${data.text})
    `;
    game.chat_open = true;
    return snapshotFor(sql, game, context.userId);
  });

export const getGame = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { gameId: string }) => ({ gameId: String(input.gameId) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const game = await loadGame(sql, data.gameId);
    if (!game) return null;
    return snapshotFor(sql, game, context.userId, true);
  });

export const makeMove = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { gameId: string; from: string; to: string; promotion?: string }) => ({
    gameId: String(input.gameId),
    from: String(input.from),
    to: String(input.to),
    promotion: input.promotion,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const game = await loadGame(sql, data.gameId);
    if (!game) return { ok: false as const, error: "Game not found." };
    if (game.status !== "active") return { ok: false as const, error: "This game is over." };
    await maybeTimeout(sql, game);
    if (game.status !== "active") {
      const snap = await snapshotFor(sql, game, context.userId);
      return { ok: false as const, error: "Time expired.", game: snap };
    }
    const side: Side = game.white_user_id === context.userId ? "w" : game.black_user_id === context.userId ? "b" : "w";
    if (game.white_user_id !== context.userId && game.black_user_id !== context.userId) {
      return { ok: false as const, error: "You are not seated at this board." };
    }
    if (game.turn !== side) return { ok: false as const, error: "Wait for your turn." };
    const piece = new Chess(game.fen).get(data.from as Square);
    if (!piece || piece.color !== side) {
      return { ok: false as const, error: "That is not your piece." };
    }
    const applied = await recordAndApplyMove(sql, game, data.from, data.to, data.promotion);
    if (!applied.ok) return applied;
    const snap = await snapshotFor(sql, game, context.userId, true);
    return { ok: true as const, game: snap };
  });

export const claimTimeout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { gameId: string }) => ({ gameId: String(input.gameId) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const game = await loadGame(sql, data.gameId);
    if (!game) return null;
    await maybeTimeout(sql, game);
    return snapshotFor(sql, game, context.userId);
  });

export const resignGame = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { gameId: string }) => ({ gameId: String(input.gameId) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const game = await loadGame(sql, data.gameId);
    if (!game) return null;
    if (game.white_user_id !== context.userId && game.black_user_id !== context.userId) return null;
    if (game.status === "active") {
      const winner = game.white_user_id === context.userId ? game.black_user_id : game.white_user_id;
      await finishGame(
        sql,
        game,
        winner === game.white_user_id ? "white_win" : "black_win",
        winner,
      );
    }
    return snapshotFor(sql, game, context.userId);
  });

export const startBotGame = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { mode: GameMode; bot?: BotKind }) => ({
    mode: parseMode(input.mode),
    bot: input.bot === "v2" ? "v2" : "v1",
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureClockColumns(sql);
    await ensureBots(sql);
    const me = await profileById(sql, context.userId);
    if (!me) throw new Error("Choose a club name first.");
    const active = await sql<{ id: string }>`
      select id from games
      where status = 'active' and (white_user_id = ${context.userId} or black_user_id = ${context.userId})
      limit 1
    `;
    if (active[0]) return { gameId: active[0].id };
    const botId = data.bot === "v2" ? BOT_V2_USER_ID : BOT_USER_ID;
    const gameId = await insertGame(sql, context.userId, botId, data.mode);
    return { gameId };
  });

export const setEquippedBoard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { boardId: string }) => ({ boardId: String(input.boardId) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureBoardColumn(sql);
    const me = await profileById(sql, context.userId);
    if (!me) throw new Error("Choose a club name first.");
    const board = boardById(data.boardId);
    if (!boardUnlocked(Number(me.score), board, me.username)) {
      throw new Error(`Reach ${board.cost} Elo to sit at ${board.name}.`);
    }
    await sql`update profiles set equipped_board = ${board.id} where user_id = ${context.userId}`;
    return { equippedBoard: board.id, score: Number(me.score) };
  });

export type ClubUserRow = { username: string; score: number; online: boolean };

export const listClubUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ClubUserRow[]> => {
    const sql = await getSql();
    const rows = await sql<{ username: string; score: number; last_seen: string | Date | null }>`
      select username, score, last_seen from profiles
      where user_id <> ${context.userId}
        and user_id <> ${BOT_USER_ID}
        and user_id <> ${BOT_V2_USER_ID}
      order by
        case when last_seen > now() - interval '20 seconds' then 0 else 1 end,
        score desc,
        username asc
      limit 80
    `;
    return rows.map((r) => ({
      username: r.username,
      score: Number(r.score),
      online: r.last_seen ? Date.now() - asTime(r.last_seen) < 20_000 : false,
    }));
  });

export const getChallengeInbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ id: string; fromUsername: string; kind: "named" | "pull" }[]> => {
    const sql = await getSql();
    await touchProfile(sql, context.userId);
    const rows = await sql<{ id: string; username: string; kind: string | null }>`
      select c.id, p.username, c.kind
      from challenges c
      join profiles p on p.user_id = c.from_user_id
      where c.to_user_id = ${context.userId} and c.status = 'pending'
      order by c.created_at desc
      limit 24
    `;
    return rows.map((r) => ({
      id: r.id,
      fromUsername: r.username,
      kind: r.kind === "pull" ? ("pull" as const) : ("named" as const),
    }));
  });
