import { createServerFn } from "@tanstack/react-start";
import { Chess } from "chess.js";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { boardById, boardUnlocked } from "@/lib/chess/board-skins";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _'-]{2,22}$/;

type MemberRow = {
  user_id: string;
  username: string;
  score: number | string;
  ready: boolean | string | number;
  last_seen: string | Date;
  avatar_json: string | null;
  host_user_id?: string;
};

export type ClubSeat = {
  userId: string;
  username: string;
  score: number;
  ready: boolean;
  online: boolean;
  look: string;
  host: boolean;
};

export type ClubMessage = {
  id: string;
  fromId: string;
  fromName: string;
  toId: string | null;
  body: string;
  at: string;
};

export type ClubEvent = {
  id: string;
  kind: "internal" | "enemy";
  phase: "live" | "crowned" | "series";
  boardId: string;
  gameIds: string[];
  deadline: number;
  champId: string | null;
  queue: { userId: string; username: string; score: number }[];
  cursor: number;
  home: { clubId: string; name: string; roster: { userId: string; username: string }[]; lost: string[] };
  foe: { clubId: string; name: string; roster: { userId: string; username: string }[]; lost: string[] } | null;
  series: { homeId: string; foeId: string; homeWins: number; foeWins: number; played: number } | null;
  winnerId: string | null;
  winnerName: string | null;
  winnerClubId: string | null;
  pairKey: string | null;
  settled: string[];
};

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function asBool(v: unknown) {
  return v === true || v === "t" || v === "true" || v === 1 || v === "1";
}

function online(seen: string | Date) {
  const t = seen instanceof Date ? seen.getTime() : Date.parse(String(seen));
  return Number.isFinite(t) && Date.now() - t < 25_000;
}

async function ensure(sql: Sql) {
  await sql.query("alter table profiles add column if not exists avatar_json text not null default ''");
  await sql.query("alter table profiles add column if not exists club_locked boolean not null default false");
  await sql.query("alter table profiles add column if not exists owned_boards text not null default ''");
  await sql.query("alter table profiles add column if not exists coins integer not null default 0");
  await sql.query(`create table if not exists chess_clubs (
    id text primary key,
    name text not null,
    name_lc text not null unique,
    password_hash text not null,
    host_user_id text not null,
    board_id text not null default 'lodge',
    created_at timestamptz not null default now()
  )`);
  await sql.query(`create table if not exists chess_club_members (
    club_id text not null,
    user_id text not null,
    ready boolean not null default false,
    joined_at timestamptz not null default now(),
    primary key (club_id, user_id)
  )`);
  await sql.query(`create table if not exists chess_club_requests (
    id text primary key,
    club_id text not null,
    user_id text not null,
    status text not null default 'pending',
    created_at timestamptz not null default now()
  )`);
  await sql.query(`create table if not exists chess_club_messages (
    id text primary key,
    club_id text not null,
    from_user_id text not null,
    to_user_id text,
    body text not null,
    created_at timestamptz not null default now()
  )`);
  await sql.query(`create table if not exists chess_club_events (
    id text primary key,
    club_id text not null,
    kind text not null,
    state text not null,
    updated_at timestamptz not null default now()
  )`);
  await sql.query(`create table if not exists chess_club_calls (
    id text primary key,
    club_id text not null,
    from_user_id text not null,
    to_user_id text not null,
    created_at timestamptz not null default now()
  )`);
  await sql.query(`create table if not exists club_bracket (
    id text primary key,
    payload text not null,
    updated_at timestamptz not null default now()
  )`);
}

async function touch(sql: Sql, userId: string) {
  await sql`update profiles set last_seen = now() where user_id = ${userId}`;
}

async function clubByName(sql: Sql, name: string) {
  const rows = await sql<{
    id: string;
    name: string;
    password_hash: string;
    host_user_id: string;
    board_id: string;
  }>`select id, name, password_hash, host_user_id, board_id from chess_clubs where name_lc = ${name.trim().toLowerCase()} limit 1`;
  return rows[0] ?? null;
}

async function membership(sql: Sql, clubId: string, userId: string) {
  const rows = await sql<{ ready: boolean }>`
    select ready from chess_club_members where club_id = ${clubId} and user_id = ${userId} limit 1
  `;
  return rows[0] ?? null;
}

function cleanName(raw: string) {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!NAME_RE.test(name)) throw new Error("Club names are 3–23 letters, numbers, or spaces.");
  return name;
}

function cleanPassword(raw: string) {
  const password = String(raw ?? "");
  if (password.length < 4 || password.length > 64) throw new Error("Password must be 4 to 64 characters.");
  return password;
}

async function seats(sql: Sql, clubId: string, hostId: string): Promise<ClubSeat[]> {
  const rows = await sql<MemberRow>`
    select m.user_id, p.username, p.score, m.ready, p.last_seen, p.avatar_json
    from chess_club_members m
    join profiles p on p.user_id = m.user_id
    where m.club_id = ${clubId}
    order by p.username asc
  `;
  return rows.map((row) => ({
    userId: row.user_id,
    username: row.username,
    score: Number(row.score) || 0,
    ready: asBool(row.ready),
    online: online(row.last_seen),
    look: row.avatar_json || "",
    host: row.user_id === hostId,
  }));
}

function emptyEvent(): ClubEvent {
  return {
    id: "",
    kind: "internal",
    phase: "live",
    boardId: "lodge",
    gameIds: [],
    deadline: 0,
    champId: null,
    queue: [],
    cursor: 0,
    home: { clubId: "", name: "", roster: [], lost: [] },
    foe: null,
    series: null,
    winnerId: null,
    winnerName: null,
    winnerClubId: null,
    pairKey: null,
    settled: [],
  };
}

function parseEvent(raw: string, id: string): ClubEvent {
  try {
    const parsed = JSON.parse(raw) as ClubEvent;
    return { ...emptyEvent(), ...parsed, id, settled: Array.isArray(parsed.settled) ? parsed.settled : [] };
  } catch {
    return { ...emptyEvent(), id };
  }
}

async function activeEvent(sql: Sql, clubId: string) {
  const rows = await sql<{ id: string; state: string }>`
    select id, state from chess_club_events
    where club_id = ${clubId} or position(${clubId} in state) > 0
    order by updated_at desc
    limit 8
  `;
  for (const row of rows) {
    const event = parseEvent(row.state, row.id);
    if (event.home.clubId === clubId || event.foe?.clubId === clubId) return event;
  }
  return null;
}

async function saveEvent(sql: Sql, event: ClubEvent) {
  const state = JSON.stringify(event);
  await sql`
    insert into chess_club_events (id, club_id, kind, state, updated_at)
    values (${event.id}, ${event.home.clubId}, ${event.kind}, ${state}, now())
    on conflict (id) do update set state = ${state}, updated_at = now()
  `;
}

async function profileBits(sql: Sql, userId: string) {
  const rows = await sql<{ username: string; score: number | string; owned_boards: string | null; club_locked: boolean | string }>`
    select username, score, owned_boards, club_locked from profiles where user_id = ${userId} limit 1
  `;
  return rows[0] ?? null;
}

function material(fen: string, color: "w" | "b") {
  const chess = new Chess(fen);
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let score = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.color === color) score += values[piece.type] ?? 0;
    }
  }
  return score;
}

async function gameRow(sql: Sql, id: string) {
  const rows = await sql<{
    id: string;
    fen: string;
    status: string;
    winner_user_id: string | null;
    white_user_id: string;
    black_user_id: string;
    turn: string;
    last_move_from: string | null;
    last_move_to: string | null;
    last_move_san: string | null;
  }>`
    select id, fen, status, winner_user_id, white_user_id, black_user_id, turn, last_move_from, last_move_to, last_move_san
    from games where id = ${id} limit 1
  `;
  return rows[0] ?? null;
}

async function maybeExpire(sql: Sql, event: ClubEvent) {
  if (event.phase === "crowned" || !event.deadline || Date.now() < event.deadline) return event;
  for (const id of event.gameIds) {
    const game = await gameRow(sql, id);
    if (!game || game.status !== "active") continue;
    const white = material(game.fen, "w");
    const black = material(game.fen, "b");
    const winner =
      white === black ? null : white > black ? game.white_user_id : game.black_user_id;
    await seal(id, winner);
  }
  event.deadline = 0;
  return event;
}

function undefeated(roster: { userId: string }[], lost: string[]) {
  const gone = new Set(lost);
  return roster.filter((seat) => !gone.has(seat.userId));
}

async function openPair(a: string, b: string) {
  const sql = await getSql();
  const id = crypto.randomUUID();
  const white = Math.random() < 0.5 ? a : b;
  const black = white === a ? b : a;
  const chess = new Chess();
  const clock = 10 * 60 * 1000;
  await sql.query("alter table games add column if not exists white_clock_ms integer not null default 60000");
  await sql.query("alter table games add column if not exists black_clock_ms integer not null default 60000");
  await sql.query("alter table games add column if not exists pull boolean not null default false");
  await sql`
    insert into games (
      id, white_user_id, black_user_id, mode, fen, status, turn, turn_started_at,
      white_clock_ms, black_clock_ms, pull
    ) values (
      ${id}, ${white}, ${black}, 'timed', ${chess.fen()}, 'active', 'w', ${new Date().toISOString()},
      ${clock}, ${clock}, false
    )
  `;
  return id;
}

async function seal(gameId: string, winnerUserId: string | null) {
  const sql = await getSql();
  const game = await gameRow(sql, gameId);
  if (!game || game.status !== "active") return;
  const status = !winnerUserId ? "draw" : winnerUserId === game.white_user_id ? "white_win" : "black_win";
  await sql`
    update games
    set status = ${status}, winner_user_id = ${winnerUserId}, scored = true
    where id = ${gameId} and status = 'active'
  `;
  if (!winnerUserId) return;
  const loser = winnerUserId === game.white_user_id ? game.black_user_id : game.white_user_id;
  await sql`update profiles set score = score + 8 where user_id = ${winnerUserId}`;
  await sql`update profiles set score = greatest(100, score - 8) where user_id = ${loser}`;
  const purse = await sql<{ piece_style: string | null; coins: number | string }>`
    select piece_style, coins from profiles where user_id = ${winnerUserId} limit 1
  `;
  if ((purse[0]?.piece_style || "3d") === "3d") {
    const coins = Number(purse[0]?.coins) || 0;
    await sql`update profiles set coins = ${coins + 1} where user_id = ${winnerUserId}`;
  }
}

async function advance(sql: Sql, event: ClubEvent): Promise<ClubEvent> {
  event = await maybeExpire(sql, event);
  const games = await Promise.all(event.gameIds.map((id) => gameRow(sql, id)));
  const pending = games.filter((game) => game && game.status === "active");
  if (pending.length) return event;

  if (event.kind === "internal") {
    const finished = games.filter((game) => game && game.status !== "active");
    const last = finished[finished.length - 1];
    if (last && !event.settled.includes(last.id)) {
      event.settled.push(last.id);
      if (last.winner_user_id) event.champId = last.winner_user_id;
      else {
        event.phase = "crowned";
        event.winnerId = event.champId;
        event.winnerName = event.queue.find((seat) => seat.userId === event.champId)?.username ?? "The king";
        return event;
      }
    }
    if (event.cursor < event.queue.length && event.champId) {
      const next = event.queue[event.cursor];
      event.cursor += 1;
      if (next && next.userId !== event.champId) {
        const id = await openPair(event.champId, next.userId);
        event.gameIds = [id];
        event.deadline = Date.now() + 10 * 60 * 1000;
        return event;
      }
    }
    if (event.champId && event.cursor >= event.queue.length) {
      event.phase = "crowned";
      event.winnerId = event.champId;
      event.winnerName = event.queue.find((seat) => seat.userId === event.champId)?.username ?? "The king";
      event.gameIds = [];
    }
    return event;
  }

  const foe = event.foe;
  if (!foe) return event;
  for (const game of games) {
    if (!game || game.status === "active" || event.settled.includes(game.id)) continue;
    event.settled.push(game.id);
    const homeIds = new Set(event.home.roster.map((seat) => seat.userId));
    const loser =
      game.winner_user_id == null
        ? null
        : game.winner_user_id === game.white_user_id
          ? game.black_user_id
          : game.white_user_id;
    if (!loser) continue;
    if (event.series && (loser === event.series.homeId || loser === event.series.foeId || game.winner_user_id)) {
      if (game.winner_user_id === event.series.homeId) event.series.homeWins += 1;
      else if (game.winner_user_id === event.series.foeId) event.series.foeWins += 1;
      event.series.played += 1;
    }
    if (homeIds.has(loser)) {
      if (!event.home.lost.includes(loser)) event.home.lost.push(loser);
    } else if (!foe.lost.includes(loser)) foe.lost.push(loser);
  }

  if (event.series) {
    if (event.series.played >= 3 || event.series.homeWins >= 2 || event.series.foeWins >= 2) {
      const homeWon = event.series.homeWins >= event.series.foeWins;
      event.phase = "crowned";
      event.winnerClubId = homeWon ? event.home.clubId : foe.clubId;
      event.winnerName = homeWon ? event.home.name : foe.name;
      event.winnerId = homeWon ? event.series.homeId : event.series.foeId;
      event.gameIds = [];
      return event;
    }
    const id = await openPair(event.series.homeId, event.series.foeId);
    event.gameIds = [id];
    event.deadline = Date.now() + 10 * 60 * 1000;
    return event;
  }

  const homeLeft = undefeated(event.home.roster, event.home.lost);
  const foeLeft = undefeated(foe.roster, foe.lost);
  if (!homeLeft.length || !foeLeft.length) {
    if (event.home.roster.length !== foe.roster.length && homeLeft.length + foeLeft.length > 0) {
      const homeId = homeLeft[0]?.userId ?? event.champId ?? event.home.roster[0]?.userId;
      const foeId = foeLeft[0]?.userId ?? foe.roster.find((seat) => !event.home.lost.includes(seat.userId))?.userId ?? foe.roster[0]?.userId;
      if (homeId && foeId) {
        event.phase = "series";
        event.series = { homeId, foeId, homeWins: homeLeft.length ? 1 : 0, foeWins: foeLeft.length ? 1 : 0, played: 0 };
        const id = await openPair(homeId, foeId);
        event.gameIds = [id];
        event.deadline = Date.now() + 10 * 60 * 1000;
        return event;
      }
    }
    event.phase = "crowned";
    const homeWon = homeLeft.length > 0;
    event.winnerClubId = homeWon ? event.home.clubId : foe.clubId;
    event.winnerName = homeWon ? event.home.name : foe.name;
    event.winnerId = (homeWon ? homeLeft[0] : foeLeft[0])?.userId ?? null;
    event.gameIds = [];
    return event;
  }

  const take = Math.min(2, homeLeft.length, foeLeft.length);
  const ids: string[] = [];
  for (let i = 0; i < take; i++) {
    ids.push(await openPair(homeLeft[i].userId, foeLeft[i].userId));
  }
  event.gameIds = ids;
  event.deadline = Date.now() + 10 * 60 * 1000;
  return event;
}

async function pack(sql: Sql, userId: string, clubId: string | null) {
  await touch(sql, userId);
  const me = await profileBits(sql, userId);
  if (!clubId) {
    return {
      club: null,
      members: [] as ClubSeat[],
      messages: [] as ClubMessage[],
      requests: [] as { id: string; userId: string; username: string }[],
      event: null as ClubEvent | null,
      locked: asBool(me?.club_locked),
      ownedBoards: String(me?.owned_boards ?? "").split(",").filter(Boolean),
      score: Number(me?.score) || 0,
      username: me?.username ?? "",
    };
  }
  const clubs = await sql<{ id: string; name: string; host_user_id: string; board_id: string }>`
    select id, name, host_user_id, board_id from chess_clubs where id = ${clubId} limit 1
  `;
  const club = clubs[0];
  if (!club) throw new Error("That chess club is gone.");
  const member = await membership(sql, club.id, userId);
  if (!member) throw new Error("You are not in that chess club.");
  let event = await activeEvent(sql, club.id);
  if (event && event.phase !== "crowned") {
    const next = await advance(sql, event);
    if (JSON.stringify(next) !== JSON.stringify(event)) await saveEvent(sql, next);
    event = next;
  }
  const members = await seats(sql, club.id, club.host_user_id);
  const messages = await sql<{ id: string; from_user_id: string; to_user_id: string | null; body: string; created_at: string; username: string }>`
    select m.id, m.from_user_id, m.to_user_id, m.body, m.created_at, p.username
    from chess_club_messages m
    join profiles p on p.user_id = m.from_user_id
    where m.club_id = ${club.id}
      and (m.to_user_id is null or m.to_user_id = ${userId} or m.from_user_id = ${userId})
    order by m.created_at asc
    limit 200
  `;
  const requests =
    club.host_user_id === userId
      ? await sql<{ id: string; user_id: string; username: string }>`
          select r.id, r.user_id, p.username
          from chess_club_requests r
          join profiles p on p.user_id = r.user_id
          where r.club_id = ${club.id} and r.status = 'pending'
          order by r.created_at asc
        `
      : [];
  return {
    club: {
      id: club.id,
      name: club.name,
      hostId: club.host_user_id,
      boardId: club.board_id || "lodge",
      youHost: club.host_user_id === userId,
    },
    members,
    messages: messages.map((row) => ({
      id: row.id,
      fromId: row.from_user_id,
      fromName: row.username,
      toId: row.to_user_id,
      body: row.body,
      at: String(row.created_at),
    })),
    requests: requests.map((row) => ({ id: row.id, userId: row.user_id, username: row.username })),
    event,
    locked: asBool(me?.club_locked),
    ownedBoards: String(me?.owned_boards ?? "").split(",").filter(Boolean),
    score: Number(me?.score) || 0,
    username: me?.username ?? "",
  };
}

function readyAll(members: ClubSeat[]) {
  return members.length >= 2 && members.every((seat) => seat.online && seat.ready);
}

export const createChessClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; password: string }) => ({
    name: cleanName(String(input?.name ?? "")),
    password: cleanPassword(String(input?.password ?? "")),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    const me = await profileBits(sql, context.userId);
    if (!me) throw new Error("Claim a username before you found a chess club.");
    const existing = await clubByName(sql, data.name);
    if (existing) throw new Error("A chess club already wears that name.");
    const id = crypto.randomUUID();
    await sql`
      insert into chess_clubs (id, name, name_lc, password_hash, host_user_id)
      values (${id}, ${data.name}, ${data.name.toLowerCase()}, ${hashPassword(data.password)}, ${context.userId})
    `;
    await sql`
      insert into chess_club_members (club_id, user_id, ready) values (${id}, ${context.userId}, false)
    `;
    await sql`update profiles set club_locked = false where user_id = ${context.userId}`;
    return pack(sql, context.userId, id);
  });

export const joinChessClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; password: string }) => ({
    name: cleanName(String(input?.name ?? "")),
    password: cleanPassword(String(input?.password ?? "")),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    const club = await clubByName(sql, data.name);
    if (!club || !checkPassword(data.password, club.password_hash)) {
      throw new Error("That club name and password do not match.");
    }
    if (await membership(sql, club.id, context.userId)) {
      return { ok: true as const, already: true, clubName: club.name };
    }
    const pending = await sql<{ id: string }>`
      select id from chess_club_requests
      where club_id = ${club.id} and user_id = ${context.userId} and status = 'pending' limit 1
    `;
    if (!pending.length) {
      await sql`
        insert into chess_club_requests (id, club_id, user_id, status)
        values (${crypto.randomUUID()}, ${club.id}, ${context.userId}, 'pending')
      `;
    }
    return { ok: true as const, already: false, clubName: club.name };
  });

export const enterChessClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; password: string }) => ({
    name: String(input?.name ?? "").trim(),
    password: String(input?.password ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    const club = data.name ? await clubByName(sql, data.name) : null;
    if (!club) {
      await sql`update profiles set club_locked = true where user_id = ${context.userId}`;
      return {
        ok: false as const,
        sorry: true,
        error: "So sorry. That chess club does not exist. You cannot enter a chess club until the name and password belong to a real one.",
      };
    }
    const member = await membership(sql, club.id, context.userId);
    const passwordOk = checkPassword(data.password, club.password_hash);
    if (!passwordOk) {
      return {
        ok: false as const,
        sorry: false,
        error: "That password does not open this chess club.",
      };
    }
    await sql`update profiles set club_locked = false where user_id = ${context.userId}`;
    if (!member) {
      return {
        ok: false as const,
        sorry: false,
        error: "You have not been welcomed into that chess club.",
      };
    }
    return { ok: true as const, state: await pack(sql, context.userId, club.id) };
  });

export const loadChessClub = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clubId?: string | null }) => ({ clubId: input?.clubId ? String(input.clubId) : "" }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    const me = await profileBits(sql, context.userId);
    if (asBool(me?.club_locked)) return pack(sql, context.userId, null);
    if (!data.clubId) return pack(sql, context.userId, null);
    try {
      return await pack(sql, context.userId, data.clubId);
    } catch {
      return pack(sql, context.userId, null);
    }
  });

export const listJoinRequests = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensure(sql);
    const rows = await sql<{ id: string; username: string; club_name: string }>`
      select r.id, p.username, c.name as club_name
      from chess_club_requests r
      join chess_clubs c on c.id = r.club_id
      join profiles p on p.user_id = r.user_id
      where c.host_user_id = ${context.userId} and r.status = 'pending'
      order by r.created_at asc
    `;
    return rows.map((row) => ({ id: row.id, username: row.username, clubName: row.club_name }));
  });

export const respondJoin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; welcome: boolean }) => ({
    id: String(input?.id ?? ""),
    welcome: input?.welcome === true,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    const rows = await sql<{ id: string; club_id: string; user_id: string; host_user_id: string }>`
      select r.id, r.club_id, r.user_id, c.host_user_id
      from chess_club_requests r
      join chess_clubs c on c.id = r.club_id
      where r.id = ${data.id} and r.status = 'pending' limit 1
    `;
    const row = rows[0];
    if (!row || row.host_user_id !== context.userId) throw new Error("That request is not yours to answer.");
    if (data.welcome) {
      await sql`
        insert into chess_club_members (club_id, user_id, ready)
        values (${row.club_id}, ${row.user_id}, false)
        on conflict (club_id, user_id) do nothing
      `;
      await sql`update chess_club_requests set status = 'welcomed' where id = ${row.id}`;
    } else {
      await sql`update chess_club_requests set status = 'declined' where id = ${row.id}`;
    }
    return { ok: true as const };
  });

export const sendClubMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clubId: string; toId: string | null; body: string }) => ({
    clubId: String(input?.clubId ?? ""),
    toId: input?.toId ? String(input.toId) : null,
    body: String(input?.body ?? "").trim().slice(0, 500),
  }))
  .handler(async ({ context, data }) => {
    if (!data.body) throw new Error("Write something first.");
    const sql = await getSql();
    await ensure(sql);
    if (!(await membership(sql, data.clubId, context.userId))) throw new Error("You are not in that chess club.");
    if (data.toId && data.toId !== "EVERY") {
      if (!(await membership(sql, data.clubId, data.toId))) throw new Error("That player is not in the club.");
    }
    const to = !data.toId || data.toId === "EVERY" ? null : data.toId;
    await sql`
      insert into chess_club_messages (id, club_id, from_user_id, to_user_id, body)
      values (${crypto.randomUUID()}, ${data.clubId}, ${context.userId}, ${to}, ${data.body})
    `;
    return { ok: true as const };
  });

export const setClubReady = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clubId: string; ready: boolean }) => ({
    clubId: String(input?.clubId ?? ""),
    ready: input?.ready === true,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    await sql`
      update chess_club_members set ready = ${data.ready}
      where club_id = ${data.clubId} and user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const setClubBoard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clubId: string; boardId: string }) => ({
    clubId: String(input?.clubId ?? ""),
    boardId: String(input?.boardId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    const clubs = await sql<{ host_user_id: string }>`select host_user_id from chess_clubs where id = ${data.clubId} limit 1`;
    if (clubs[0]?.host_user_id !== context.userId) throw new Error("Only the host changes the club board.");
    const me = await profileBits(sql, context.userId);
    const owned = String(me?.owned_boards ?? "").split(",").filter(Boolean);
    const board = boardById(data.boardId);
    if (!boardUnlocked(Number(me?.score) || 0, board, me?.username, owned)) {
      throw new Error("The host does not own that board.");
    }
    await sql`update chess_clubs set board_id = ${board.id} where id = ${data.clubId}`;
    return { ok: true as const, boardId: board.id };
  });

export const placeClubCall = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clubId: string; toId: string }) => ({
    clubId: String(input?.clubId ?? ""),
    toId: String(input?.toId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    if (!(await membership(sql, data.clubId, context.userId))) throw new Error("You are not in that chess club.");
    if (!(await membership(sql, data.clubId, data.toId))) throw new Error("That player is not in the club.");
    const id = crypto.randomUUID();
    await sql`
      insert into chess_club_calls (id, club_id, from_user_id, to_user_id)
      values (${id}, ${data.clubId}, ${context.userId}, ${data.toId})
    `;
    return { id };
  });

export const pollClubCalls = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clubId: string }) => ({ clubId: String(input?.clubId ?? "") }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    const rows = await sql<{ id: string; from_user_id: string; to_user_id: string; username: string; created_at: string }>`
      select c.id, c.from_user_id, c.to_user_id, p.username, c.created_at
      from chess_club_calls c
      join profiles p on p.user_id = c.from_user_id
      where c.club_id = ${data.clubId}
        and (c.to_user_id = ${context.userId} or c.from_user_id = ${context.userId})
        and c.created_at > now() - interval '70 seconds'
      order by c.created_at desc
      limit 4
    `;
    return rows.map((row) => ({
      id: row.id,
      fromId: row.from_user_id,
      toId: row.to_user_id,
      fromName: row.username,
      at: Date.parse(String(row.created_at)) || Date.now(),
    }));
  });

export const startOwnTournament = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clubId: string }) => ({ clubId: String(input?.clubId ?? "") }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    const state = await pack(sql, context.userId, data.clubId);
    if (!state.club) throw new Error("Enter the chess club first.");
    if (!readyAll(state.members)) throw new Error("Every player must be online and checked in.");
    if (state.event && state.event.phase !== "crowned") throw new Error("A match is already on the club board.");
    const queue = [...state.members].sort((a, b) => a.score - b.score || a.username.localeCompare(b.username));
    const id = crypto.randomUUID();
    const gameId = await openPair(queue[0].userId, queue[1].userId);
    const event: ClubEvent = {
      ...emptyEvent(),
      id,
      kind: "internal",
      phase: "live",
      boardId: state.club.boardId,
      gameIds: [gameId],
      deadline: Date.now() + 10 * 60 * 1000,
      queue: queue.map((seat) => ({ userId: seat.userId, username: seat.username, score: seat.score })),
      cursor: 2,
      home: {
        clubId: state.club.id,
        name: state.club.name,
        roster: queue.map((seat) => ({ userId: seat.userId, username: seat.username })),
        lost: [],
      },
    };
    await saveEvent(sql, event);
    return event;
  });

export const startEnemyBattle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clubId: string; foeName: string; pairKey?: string }) => ({
    clubId: String(input?.clubId ?? ""),
    foeName: cleanName(String(input?.foeName ?? "")),
    pairKey: input?.pairKey ? String(input.pairKey) : "",
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    const state = await pack(sql, context.userId, data.clubId);
    if (!state.club) throw new Error("Enter the chess club first.");
    if (!readyAll(state.members)) throw new Error("Your whole club must be online and checked in.");
    const foeClub = await clubByName(sql, data.foeName);
    if (!foeClub) throw new Error("That enemy chess club does not exist.");
    if (foeClub.id === state.club.id) throw new Error("A club cannot be its own enemy. Seat it twice on the bracket only when the chart needs that match.");
    const foeSeats = await seats(sql, foeClub.id, foeClub.host_user_id);
    if (!readyAll(foeSeats)) throw new Error("The enemy club is not all online and checked in.");
    const homeRoster = state.members.map((seat) => ({ userId: seat.userId, username: seat.username }));
    const foeRoster = foeSeats.map((seat) => ({ userId: seat.userId, username: seat.username }));
    const take = Math.min(2, homeRoster.length, foeRoster.length);
    const gameIds: string[] = [];
    for (let i = 0; i < take; i++) gameIds.push(await openPair(homeRoster[i].userId, foeRoster[i].userId));
    const event: ClubEvent = {
      ...emptyEvent(),
      id: crypto.randomUUID(),
      kind: "enemy",
      phase: "live",
      boardId: state.club.boardId,
      gameIds,
      deadline: Date.now() + 10 * 60 * 1000,
      home: { clubId: state.club.id, name: state.club.name, roster: homeRoster, lost: [] },
      foe: { clubId: foeClub.id, name: foeClub.name, roster: foeRoster, lost: [] },
      pairKey: data.pairKey || null,
    };
    await saveEvent(sql, event);
    return event;
  });

export const watchClubGame = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { gameId: string }) => ({ gameId: String(input?.gameId ?? "") }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    const game = await gameRow(sql, data.gameId);
    if (!game) return null;
    const moves = await sql<{ san: string; from_sq: string; to_sq: string }>`
      select san, from_sq, to_sq from game_moves where game_id = ${game.id} order by ply asc
    `;
    const looks = await sql<{ user_id: string; avatar_json: string | null }>`
      select user_id, avatar_json from profiles
      where user_id = ${game.white_user_id} or user_id = ${game.black_user_id}
    `;
    const lookOf = (id: string) => looks.find((row) => row.user_id === id)?.avatar_json || "";
    return {
      id: game.id,
      fen: game.fen,
      status: game.status,
      turn: game.turn,
      whiteId: game.white_user_id,
      blackId: game.black_user_id,
      winnerId: game.winner_user_id,
      whiteLook: lookOf(game.white_user_id),
      blackLook: lookOf(game.black_user_id),
      you:
        game.white_user_id === context.userId ? "w" : game.black_user_id === context.userId ? "b" : null,
      lastMove:
        game.last_move_from && game.last_move_to
          ? { from: game.last_move_from, to: game.last_move_to, san: game.last_move_san }
          : null,
      moves: moves.map((move) => ({ san: move.san, from: move.from_sq, to: move.to_sq })),
    };
  });

type BracketSlot = { clubId: string | null; name: string | null };
type Bracket = { rounds: BracketSlot[][] };

function freshBracket(): Bracket {
  return {
    rounds: [Array.from({ length: 8 }, () => ({ clubId: null, name: null })), Array.from({ length: 4 }, () => ({ clubId: null, name: null })), Array.from({ length: 2 }, () => ({ clubId: null, name: null })), [{ clubId: null, name: null }]],
  };
}

export const getBracket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const sql = await getSql();
    await ensure(sql);
    const rows = await sql<{ payload: string }>`select payload from club_bracket where id = 'live' limit 1`;
    if (!rows[0]) return freshBracket();
    try {
      return JSON.parse(rows[0].payload) as Bracket;
    } catch {
      return freshBracket();
    }
  });

export const seatBracket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clubId: string; round: number; slot: number }) => ({
    clubId: String(input?.clubId ?? ""),
    round: Number(input?.round) || 0,
    slot: Number(input?.slot) || 0,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    const state = await pack(sql, context.userId, data.clubId);
    if (!state.club || !state.club.youHost) throw new Error("Only the host seats the club on the chart.");
    const current = await sql<{ payload: string }>`select payload from club_bracket where id = 'live' limit 1`;
    const bracket: Bracket = current[0] ? (JSON.parse(current[0].payload) as Bracket) : freshBracket();
    const round = bracket.rounds[data.round];
    if (!round || !round[data.slot]) throw new Error("That slot is not on the chart.");
    const pair = data.slot - (data.slot % 2);
    const other = round[data.slot % 2 === 0 ? data.slot + 1 : data.slot - 1];
    const already = round.filter((slot) => slot.clubId === state.club!.id).length;
    if (other?.clubId === state.club.id) {
      /* a club may meet itself only in a chart match that still needs both names */
    } else if (already && round[data.slot]?.clubId !== state.club.id) {
      const needed = round.some((slot, index) => index % 2 === 0 && slot.clubId && round[index + 1]?.clubId === slot.clubId);
      if (!needed && already >= 1 && other?.clubId !== state.club.id) {
        throw new Error("Your club can meet the same club only in the match the chart still needs.");
      }
    }
    round[data.slot] = { clubId: state.club.id, name: state.club.name };
    void pair;
    const payload = JSON.stringify(bracket);
    await sql`
      insert into club_bracket (id, payload) values ('live', ${payload})
      on conflict (id) do update set payload = ${payload}, updated_at = now()
    `;
    return bracket;
  });

export const crownBracket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clubId: string; round: number; slot: number }) => ({
    clubId: String(input?.clubId ?? ""),
    round: Number(input?.round) || 0,
    slot: Number(input?.slot) || 0,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensure(sql);
    const state = await pack(sql, context.userId, data.clubId);
    if (!state.club) throw new Error("Enter your chess club first.");
    if (!state.event || state.event.phase !== "crowned" || !state.event.winnerName) {
      throw new Error("Finish the battle before the chart moves.");
    }
    const rows = await sql<{ payload: string }>`select payload from club_bracket where id = 'live' limit 1`;
    const bracket: Bracket = rows[0] ? (JSON.parse(rows[0].payload) as Bracket) : freshBracket();
    const pairStart = data.slot - (data.slot % 2);
    const nextRound = bracket.rounds[data.round + 1];
    if (!nextRound) return bracket;
    const nextSlot = Math.floor(pairStart / 2);
    nextRound[nextSlot] = { clubId: state.event.winnerClubId, name: state.event.winnerName };
    const payload = JSON.stringify(bracket);
    await sql`
      insert into club_bracket (id, payload) values ('live', ${payload})
      on conflict (id) do update set payload = ${payload}, updated_at = now()
    `;
    return bracket;
  });

