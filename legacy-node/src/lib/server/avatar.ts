import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  DEFAULT_LOADOUT,
  STARTER_IDS,
  gearPrice,
  isKnownGear,
  parseLoadout,
  type AvatarLoadout,
  type PieceStyle,
} from "@/lib/avatar/catalog";

async function ensureAvatar(sql: Sql) {
  await sql.query("alter table profiles add column if not exists avatar_json text not null default ''");
  await sql.query("alter table profiles add column if not exists piece_style text not null default '3d'");
  await sql.query("alter table profiles add column if not exists owned_gear text not null default ''");
  await sql.query("alter table profiles add column if not exists coins integer not null default 0");
}

function ownedSet(raw: unknown) {
  const set = new Set(
    String(raw ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  for (const id of STARTER_IDS) set.add(id);
  return set;
}

function clampLoadout(loadout: AvatarLoadout, owned: Set<string>): AvatarLoadout {
  const keep = (id: string, fallback: string) => (owned.has(id) || gearPrice(id) === 0 ? id : fallback);
  return {
    ...loadout,
    anId: keep(loadout.anId, "knight"),
    kingId: keep(loadout.kingId, "piece"),
    swordId: keep(loadout.swordId, "none"),
    crownId: keep(loadout.crownId, "poly-band"),
    mountId: keep(loadout.mountId, "none"),
    frameId: keep(loadout.frameId, "plain"),
    attackId: keep(loadout.attackId, "march"),
  };
}

async function readRow(sql: Sql, userId: string) {
  await ensureAvatar(sql);
  const rows = await sql<{
    avatar_json: string | null;
    piece_style: string | null;
    owned_gear: string | null;
    coins: number | string;
    username: string;
  }>`
    select avatar_json, piece_style, owned_gear, coins, username from profiles where user_id = ${userId} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const owned = ownedSet(row.owned_gear);
  let parsed = DEFAULT_LOADOUT;
  try {
    parsed = parseLoadout(row.avatar_json ? JSON.parse(row.avatar_json) : {});
  } catch {
    parsed = DEFAULT_LOADOUT;
  }
  const style: PieceStyle = row.piece_style === "2d" || row.piece_style === "an" || row.piece_style === "ra" || row.piece_style === "3d" ? row.piece_style : "3d";
  return {
    coins: Number(row.coins) || 0,
    username: row.username,
    owned: [...owned],
    loadout: { ...clampLoadout(parsed, owned), style },
  };
}

export const getAvatar = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return readRow(sql, context.userId);
  });

export const saveAvatar = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { loadout: AvatarLoadout }) => ({ loadout: parseLoadout(input?.loadout) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const current = await readRow(sql, context.userId);
    if (!current) throw new Error("Claim a username before dressing the king.");
    const owned = new Set(current.owned);
    const next = clampLoadout(data.loadout, owned);
    next.style = data.loadout.style;
    await sql`
      update profiles
      set avatar_json = ${JSON.stringify(next)}, piece_style = ${next.style}
      where user_id = ${context.userId}
    `;
    return { ...current, loadout: next };
  });

export const setPieceStyle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { style: string }) => ({
    style: input?.style === "2d" || input?.style === "an" || input?.style === "ra" ? input.style : "3d",
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureAvatar(sql);
    await sql`update profiles set piece_style = ${data.style} where user_id = ${context.userId}`;
    return { style: data.style as PieceStyle };
  });

export const buyGear = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ context, data }) => {
    if (!isKnownGear(data.id)) throw new Error("That piece is not in the cabinet.");
    const sql = await getSql();
    const current = await readRow(sql, context.userId);
    if (!current) throw new Error("Claim a username first.");
    const owned = new Set(current.owned);
    if (owned.has(data.id) || gearPrice(data.id) === 0) return current;
    const price = gearPrice(data.id);
    if (current.coins < price) throw new Error(`That costs ${price} Morse coins.`);
    owned.add(data.id);
    const coins = current.coins - price;
    const list = [...owned].join(",");
    await sql`update profiles set coins = ${coins}, owned_gear = ${list} where user_id = ${context.userId}`;
    return { ...current, coins, owned: [...owned] };
  });
