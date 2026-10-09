#!/usr/bin/env node
/**
 * Exports the catalog data the PHP backend needs (board unlock rules, avatar
 * gear prices) straight from the TypeScript sources so the two never drift.
 *
 *   node --experimental-strip-types scripts/export-php-data.mjs
 *
 * Writes php/data/catalog.json. Re-run it whenever board-skins.ts or the avatar
 * catalog changes.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const boards = await import(join(root, "src/lib/chess/board-skins.ts"));
const avatar = await import(join(root, "src/lib/avatar/catalog.ts"));

const groups = {
  characters: avatar.CHARACTERS,
  swords: avatar.SWORDS,
  crowns: avatar.CROWNS,
  mounts: avatar.MOUNTS,
  frames: avatar.FRAMES,
  attacks: avatar.ATTACKS,
};

const out = {
  boards: {
    defaultId: boards.DEFAULT_BOARD_ID,
    masterUsername: boards.MASTER_USERNAME,
    masterScore: boards.MASTER_SCORE,
    items: boards.BOARD_CATALOG.map((b) => ({
      id: b.id,
      name: b.name,
      cost: b.cost,
      coinCost: b.coinCost ?? 0,
      sealed: Boolean(b.sealed),
    })),
  },
  avatar: {
    starterIds: avatar.STARTER_IDS,
    defaultLoadout: avatar.DEFAULT_LOADOUT,
    groups: Object.fromEntries(
      Object.entries(groups).map(([key, rows]) => [key, rows.map((r) => ({ id: r.id, price: r.price }))]),
    ),
    // Legacy ids that parseLoadout() remaps to current ones.
    legacy: {
      sword: { from: ["sword", "dual", "shield", "staff", "long", "cutlass", "axe", "rapier"], to: "devil" },
      crown: { from: ["circlet", "sun", "poly-arch", "arched", "laurel"], to: "poly-band" },
      attack: { from: ["flip", "slam", "sweep", "charge", "flash", "bow"], to: "chop" },
    },
  },
};

const target = join(root, "php/data/catalog.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${target}: ${out.boards.items.length} boards, ${Object.values(out.avatar.groups).flat().length} gear items`);
