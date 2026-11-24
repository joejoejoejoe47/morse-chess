/**
 * Battle Chess (owner t375u; Forceman's "The New Chess Is Insane").
 * A 14x8 island: ditches, mountains, bushes, frigates, archers, an assassin, an eagle,
 * a pirate, chests, and a wizard you can pull out of a chest. Tornadoes and volcanoes
 * hit after a move. White sits at the top (rank 8) and moves first; White pawns move DOWN.
 * php/src/BoardGames.php (bc* functions) is a line-by-line copy; keep them in step.
 *
 * Grid: x = -3..16 (files; a..n are x 0..13), y = -2..11 (ranks; land is 1..8).
 * Square names: one file letter + the rank number. Files left of a are x,y,z (x=-3, y=-2, z=-1);
 * files after n are o,p,q. Ranks may be 0, -1, -2, 9, 10, 11 in the ocean.
 * State string: "bc|<14 rows, y=11 first, 20 chars each, joined by '/'>|turn|ep|half|full".
 * Pieces: K Q R B N P, C archer, E eagle, A assassin, F frigate (uses 2 cells), S transport boat
 * (one rider, kept in the cargo part of the extra field: "storm:lava;sq=P,..."), I pirate (a ship at sea). Upper case = White.
 * Marked assumptions from the spec: no castling; no frigate rotation (the ship keeps its starting
 * orientation); frigates and rooks capture ships remotely (shots), the shooter stays put.
 */
export type BcColor = "w" | "b";
export type BcState = {
  cells: string[][]; // cells[yi][xi]
  turn: BcColor;
  ep: string | null;
  half: number;
  full: number;
  lava: Record<string, number>; // squares lava hit lately (3 → 1, for the eruption effect)
  storm: string; // this ply's event ("T" tornado, "V" volcano) + a pending warning ("t2", "v1": strikes in N plies)
  cargo: Record<string, string>; // ship square (boat, or the frigate cell boarded) -> the piece riding it
  made: string[]; // ocean squares that lava turned into land (v3 §8.1)
  inv: Record<string, number>; // invisible assassins: square -> own moves left (Part 4)
  invUsed: string; // colours whose assassin already went invisible once ("w", "b", "wb")
};
export type BcMove = { from: string; to: string; capture: boolean; shot?: boolean; promo?: string; ep?: boolean; double?: boolean; ship?: [string, string]; board?: boolean; charm?: boolean; chest?: boolean; embark?: boolean; disembark?: boolean };

// t387u: the sea now reaches the video's offshore islands (x -6..19, y -3..12) with a ring of open water.
export const BC_X0 = -7, BC_X1 = 20, BC_Y0 = -4, BC_Y1 = 13;
export const BC_W = BC_X1 - BC_X0 + 1; // 28
export const BC_H = BC_Y1 - BC_Y0 + 1; // 18
const FILES = "WXYZxyzabcdefghijklmnopqrstu"; // index = x + 7 (x,y,z stay -3..-1 so old square names still read)

export const bcSq = (x: number, y: number) => FILES[x + 7] + y;
export function bcPos(s: string): [number, number] | null {
  const xi = FILES.indexOf(s[0]);
  const y = Number(s.slice(1));
  if (xi < 0 || !/^-?\d+$/.test(s.slice(1)) || y < BC_Y0 || y > BC_Y1) return null;
  return [xi - 7, y];
}
const inGrid = (x: number, y: number) => x >= BC_X0 && x <= BC_X1 && y >= BC_Y0 && y <= BC_Y1;

/** Terrain: 'L' land, 'W' water, 'M' mountain, 'T' bush (bush is land). Static map; lava-made land is in BcState.made. */
export function bcTerrain(x: number, y: number): "L" | "W" | "M" | "T" {
  // video v9KUWr3NChU 0:13 (measured on the frame; the v3 notes said 2x2 but the frame shows 3x3): two 3x3
  // treasure islands (chest in the middle, grassy one-square mountain in a corner) and two 3x1 docks,
  // 180° partners: (x, y) -> (13 - x, 9 - y).
  if (bcHill(x, y)) return "M";
  if (x >= -6 && x <= -4 && y >= 8 && y <= 10) return "L";
  if (x >= 17 && x <= 19 && y >= -1 && y <= 1) return "L";
  if (y === 11 && x >= 16 && x <= 18) return "L";
  if (y === -2 && x >= -5 && x <= -3) return "L";
  if (x < 0 || x > 13 || y < 1 || y > 8) return "W";
  if (y === 3 && x <= 2) return "W";
  if (y === 6 && x >= 11) return "W";
  if ((x <= 1 && y >= 7) || (x >= 12 && y <= 2)) return "M";
  if ((x === 6 && y === 5) || (x === 7 && y === 4)) return "T";
  return "L";
}
/** The grassy one-square mountains on the treasure islands. */
export const bcHill = (x: number, y: number) => (x === -4 && y === 8) || (x === 17 && y === 1);
/** The two treasure chests' squares and whose island each is on (v3 §7.4: one Mage per side, from its own island). */
export const BC_CHESTS: { x: number; y: number; owner: BcColor }[] = [
  { x: -5, y: 9, owner: "w" },
  { x: 18, y: 0, owner: "b" },
];
/** The volcanoes: the two snowy 2x2 mountains (lower-left cells). */
export const BC_VOLCANOES: [number, number][] = [
  [0, 7],
  [12, 1],
];
/** v3 §8.1: the pink splash zone (squares lava may hit) around both snowy mountains. */
export function bcSplash(): [number, number][] {
  const out: [number, number][] = [];
  for (const [ox, oy] of BC_VOLCANOES)
    for (let ny = oy - 3; ny <= oy + 4; ny++) for (let nx = ox - 3; nx <= ox + 4; nx++) {
      if (!inGrid(nx, ny) || bcTerrain(nx, ny) === "M") continue;
      if (Math.max(Math.abs(nx * 2 - (ox * 2 + 1)), Math.abs(ny * 2 - (oy * 2 + 1))) > 6) continue;
      out.push([nx, ny]);
    }
  return out;
}
/** Lava-made land for the state being worked on (set by every entry point from s.made). */
let MADE = new Set<string>();
const use = (s: BcState) => { MADE = new Set(s.made); };
const terr = (x: number, y: number) => { const t = bcTerrain(x, y); return t === "W" && MADE.has(bcSq(x, y)) ? "L" : t; };
const isLand = (x: number, y: number) => { const t = terr(x, y); return t === "L" || t === "T"; };
const isWater = (x: number, y: number) => inGrid(x, y) && terr(x, y) === "W";
/** Is (x,y) land in state s (the map plus lava-made land)? For the boards. */
export const bcIsLand = (s: BcState, x: number, y: number) => { const t = bcTerrain(x, y); return t === "L" || t === "T" || (t === "W" && s.made.includes(bcSq(x, y))); };

const at = (s: BcState, x: number, y: number) => (inGrid(x, y) ? s.cells[BC_Y1 - y][x - BC_X0] : "#");
const put = (c: string[][], x: number, y: number, p: string) => { c[BC_Y1 - y][x - BC_X0] = p; };
export const bcColor = (p: string): BcColor | null => (p === "." || p === "#" || p === "H" ? null : p === p.toUpperCase() ? "w" : "b");
const kind = (p: string) => p.toUpperCase();

export const BATTLE_START = (() => {
  const c: string[][] = Array.from({ length: BC_H }, () => Array.from({ length: BC_W }, () => "."));
  const row = (y: number, s: string) => { for (let x = 0; x < 14; x++) if (s[x] !== ".") put(c, x, y, s[x]); };
  row(8, "...REBKQBNRABR");
  row(7, "...PPPPPPPPCNN");
  row(6, "C.............");
  row(3, ".............c");
  row(2, "nncpppppppp...");
  row(1, "rbarnbqkber..."); // v3 §3.1: royalty is 180° symmetric (Black Q g1, K h1)
  put(c, 10, 9, "F"); put(c, 11, 9, "F"); // k9-l9
  put(c, 2, 0, "f"); put(c, 3, 0, "f"); // c0-d0
  for (const ch of BC_CHESTS) put(c, ch.x, ch.y, "H"); // the treasure chests (a Mage inside)
  put(c, -4, 11, "S"); put(c, 17, -2, "s"); // transport boats beside the chest islands
  put(c, 16, 12, "I"); put(c, -3, -3, "i"); // pirate ships beside the plank strips
  return bcString({ cells: c, turn: "w", ep: null, half: 0, full: 1, lava: {}, storm: "", cargo: {}, made: [], inv: {}, invUsed: "" });
})();

export function bcParse(str: string): BcState | null {
  const p = str.split("|");
  if ((p.length !== 6 && p.length !== 7) || p[0] !== "bc") return null;
  const rows = p[1].split("/");
  if (rows.length !== BC_H && rows.length !== 14) return null;
  let cells: string[][] = [];
  for (const r of rows) {
    const out: string[] = [];
    for (const m of r.matchAll(/(\d+)|(\D)/g)) {
      if (m[1]) for (let i = Number(m[1]); i > 0; i--) out.push(".");
      else out.push(m[2]);
    }
    cells.push(out);
  }
  if (rows.length === 14 && cells.every((r) => r.length === 20)) {
    // a game saved on the old 20x14 sea (before the islands): pad it into the new grid
    const blank = () => Array.from({ length: BC_W }, () => ".");
    const dots = (n: number) => Array.from({ length: n }, () => ".");
    cells = [blank(), blank(), ...cells.map((r) => [...dots(4), ...r, ...dots(4)]), blank(), blank()];
  }
  if (cells.length !== BC_H || cells.some((r) => r.length !== BC_W)) return null;
  const extra = readExtra(p[6]);
  return { cells, turn: p[2] === "b" ? "b" : "w", ep: p[3] === "-" ? null : p[3], half: Number(p[4]) || 0, full: Number(p[5]) || 1, ...extra };
}
export function bcString(s: BcState): string {
  // Empty runs are written as numbers (like FEN) so a position fits games.fen VARCHAR(255).
  const rle = (r: string[]) => r.join("").replace(/\.+/g, (m) => String(m.length));
  return ["bc", s.cells.map(rle).join("/"), s.turn, s.ep ?? "-", String(s.half), String(s.full), writeExtra(s)].join("|");
}

/** Park-Miller step. Same formula in php/src/BoardGames.php. */
function bcNext(n: number) {
  const x = ((n % 2147483647) * 48271) % 2147483647;
  return x === 0 ? 1 : x;
}
type BcExtra = Pick<BcState, "lava" | "storm" | "cargo" | "made" | "inv" | "invUsed">;
/** Extra field: "storm:lava;cargo;made;inv" — storm "TVt2v1", lava "sq.3,...", cargo "sq=R,...", made "sq,...", inv "sq.2,...,!wb". */
function readExtra(raw: string | undefined): BcExtra {
  const lava: Record<string, number> = {};
  const cargo: Record<string, string> = {};
  const inv: Record<string, number> = {};
  const made: string[] = [];
  let invUsed = "";
  if (!raw || raw === "-") return { lava, storm: "", cargo, made, inv, invUsed };
  const parts = raw.split(";");
  for (const part of (parts[1] ?? "").split(",")) {
    const [sq, pc] = part.split("=");
    if (sq && pc && bcPos(sq) && /^[QRBNPCEAIWUqrbnpceaiwu]$/.test(pc)) cargo[sq] = pc;
  }
  for (const sq of (parts[2] ?? "").split(",")) if (sq && bcPos(sq) && !made.includes(sq)) made.push(sq);
  made.sort();
  for (const part of (parts[3] ?? "").split(",")) {
    if (part.startsWith("!")) { invUsed = (part.includes("w") ? "w" : "") + (part.includes("b") ? "b" : ""); continue; }
    const [sq, n] = part.split(".");
    if (sq && bcPos(sq) && Number(n) > 0) inv[sq] = Number(n);
  }
  let head = parts[0];
  const colon = head.indexOf(":");
  let storm = "";
  if (colon >= 0) {
    const st = head.slice(0, colon);
    storm = (st.includes("T") ? "T" : "") + (st.includes("V") ? "V" : "");
    const t = /t([1-9])/.exec(st), v = /v([1-9])/.exec(st);
    if (t) storm += "t" + t[1];
    if (v) storm += "v" + v[1];
    head = head.slice(colon + 1);
  }
  if (head && head !== "-") {
    for (const part of head.split(",")) {
      const [sq, n] = part.split(".");
      const ttl = Number(n);
      if (sq && ttl > 0) lava[sq] = ttl;
    }
  }
  return { lava, storm, cargo, made, inv, invUsed };
}
function writeExtra(s: BcState): string {
  const lava = Object.keys(s.lava).filter((k) => s.lava[k] > 0).sort().map((k) => `${k}.${s.lava[k]}`).join(",");
  const cargo = Object.keys(s.cargo ?? {}).sort().map((k) => `${k}=${s.cargo[k]}`).join(",");
  const made = [...(s.made ?? [])].sort().join(",");
  const invL = Object.keys(s.inv ?? {}).sort().map((k) => `${k}.${s.inv[k]}`);
  if (s.invUsed) invL.push("!" + s.invUsed);
  const inv = invL.join(",");
  if (!s.storm && !lava && !cargo && !made && !inv) return "-";
  const tail = [cargo, made, inv];
  while (tail.length && !tail[tail.length - 1]) tail.pop();
  return [`${s.storm}:${lava}`, ...tail].join(";");
}
/** A pending event warning: "v" volcano or "t" tornado, with plies left (4 → 1); 0 when none. Shown as ceil(plies/2) turns. */
export const bcWarn = (storm: string, k: "v" | "t") => Number(new RegExp(k + "([1-9])").exec(storm)?.[1] ?? 0);
/** The banner's "N TURNS LEFT" for a warning. */
export const bcWarnTurns = (storm: string, k: "v" | "t") => Math.ceil(bcWarn(storm, k) / 2);

// v3 §6: a lava tile is ordinary land as soon as it lands (nothing waits for it to cool)
const hot = (_s: BcState, _x: number, _y: number) => false;

/** The other cell of the frigate standing on (x,y). */
function shipMate(s: BcState, x: number, y: number): [number, number] | null {
  const p = at(s, x, y);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(s, x + dx, y + dy) === p) return [x + dx, y + dy];
  return null;
}

const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const EAG = [[3, 0], [-3, 0], [0, 3], [0, -3]];
const ARCH = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]];

/** Squares a frigate cell fires on: 3 squares inland in each direction that meets land first. */
function cannonTargets(s: BcState, x: number, y: number, by: BcColor, out: [number, number][]) {
  for (const [dx, dy] of ORTH) {
    if (!isLand(x + dx, y + dy) && terr(x + dx, y + dy) !== "M") continue;
    for (let k = 1; k <= 3; k++) {
      const tx = x + dx * k, ty = y + dy * k;
      if (!isLand(tx, ty)) break; // water or mountain stops the ball
      const p = at(s, tx, ty);
      if (p === ".") continue;
      if (kind(p) === "R") break; // rooks are immune and shield the rest
      if (bcColor(p) !== by) out.push([tx, ty]);
      break;
    }
  }
}

/** Is (x,y) attacked by side `by` (used for check)? */
export function bcAttacked(s: BcState, x: number, y: number, by: BcColor): boolean {
  use(s);
  for (let yy = BC_Y0; yy <= BC_Y1; yy++)
    for (let xx = BC_X0; xx <= BC_X1; xx++) {
      const p = at(s, xx, yy);
      if (p === "." || bcColor(p) !== by) continue;
      const k = kind(p);
      const dx = x - xx, dy = y - yy;
      if (k === "P") {
        const fwd = by === "w" ? -1 : 1;
        if (dy === fwd && Math.abs(dx) === 1) return true;
      } else if (k === "N") {
        if ((Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1)) return true;
      } else if (k === "E") {
        if ((Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1)) return true;
        if ((Math.abs(dx) === 3 && dy === 0) || (dx === 0 && Math.abs(dy) === 3)) return true;
      } else if (k === "K") {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === 1 && isLand(x, y)) return true;
      } else if (k === "C") {
        if ((Math.abs(dx) === 2 || dx === 0) && (Math.abs(dy) === 2 || dy === 0) && (dx !== 0 || dy !== 0)) {
          const mx = xx + dx / 2, my = yy + dy / 2;
          const t = terr(mx, my);
          if (t !== "M" && t !== "T") return true;
        }
      } else if (k === "A") {
        if (Math.abs(dx) === Math.abs(dy) && dx !== 0) {
          const sx = Math.sign(dx), sy = Math.sign(dy);
          let ok = true;
          let hop = false; // part 4: it may pass one piece only, a pawn of its own colour
          for (let i = 1; i < Math.abs(dx); i++) {
            const t = terr(xx + sx * i, yy + sy * i);
            if (t !== "L") { ok = false; break; } // mountain / water / bush stop it
            const q = at(s, xx + sx * i, yy + sy * i);
            if (q === ".") continue;
            if (!hop && q === (by === "w" ? "P" : "p")) { hop = true; continue; }
            ok = false;
            break;
          }
          if (ok) return true;
        }
      } else if (k === "F") {
        const out: [number, number][] = [];
        cannonTargets(s, xx, yy, by, out);
        if (out.some(([a, b]) => a === x && b === y)) return true;
      } else if (k === "Q" || k === "R" || k === "B") {
        const orth = dx === 0 || dy === 0;
        const diag = Math.abs(dx) === Math.abs(dy);
        if ((dx === 0 && dy === 0) || (!orth && !diag)) continue;
        if (k === "R" && !orth) continue;
        if (k === "B" && !diag) continue;
        if (!isLand(x, y)) continue;
        const sx = Math.sign(dx), sy = Math.sign(dy);
        let cx = xx + sx, cy = yy + sy, ok = true;
        while (cx !== x || cy !== y) {
          if (terr(cx, cy) !== "L" || at(s, cx, cy) !== ".") { ok = false; break; }
          cx += sx; cy += sy;
        }
        if (ok) return true;
      }
    }
  return false;
}

function kingOf(s: BcState, c: BcColor): [number, number] | null {
  const want = c === "w" ? "K" : "k";
  for (let y = BC_Y0; y <= BC_Y1; y++) for (let x = BC_X0; x <= BC_X1; x++) if (at(s, x, y) === want) return [x, y];
  return null;
}
export function bcInCheck(s: BcState, c: BcColor): boolean {
  const k = kingOf(s, c);
  return !k || bcAttacked(s, k[0], k[1], c === "w" ? "b" : "w");
}
export function bcKingSq(s: BcState, c: BcColor): string | null {
  const k = kingOf(s, c);
  return k ? bcSq(k[0], k[1]) : null;
}

function pseudo(s: BcState): BcMove[] {
  use(s);
  const out: BcMove[] = [];
  const me = s.turn;
  const add = (fx: number, fy: number, tx: number, ty: number, extra: Partial<BcMove> = {}) => {
    const p = at(s, tx, ty);
    const chest = p === "H";
    out.push({ from: bcSq(fx, fy), to: bcSq(tx, ty), capture: p !== "." && p !== "#" && !chest, chest, ...extra });
  };
  const landOk = (x: number, y: number) => isLand(x, y) && !hot(s, x, y) && bcColor(at(s, x, y)) !== me;
  for (let y = BC_Y0; y <= BC_Y1; y++)
    for (let x = BC_X0; x <= BC_X1; x++) {
      const p = at(s, x, y);
      if (p === "." || bcColor(p) !== me) continue;
      const k = kind(p);
      if (k === "P") {
        const fwd = me === "w" ? -1 : 1;
        const start = me === "w" ? 7 : 2;
        const last = me === "w" ? 1 : 8;
        const promo = (ty: number, base: Partial<BcMove>, tx: number) => {
          if (ty === last) for (const q of ["q", "r", "b", "n"]) add(x, y, tx, ty, { ...base, promo: q });
          else add(x, y, tx, ty, base);
        };
        const ahead = at(s, x, y + fwd);
        if (isLand(x, y + fwd) && !hot(s, x, y + fwd) && (ahead === "." || ahead === "H")) {
          promo(y + fwd, {}, x);
          if (y === start && isLand(x, y + 2 * fwd) && !hot(s, x, y + 2 * fwd) && at(s, x, y + 2 * fwd) === ".") add(x, y, x, y + 2 * fwd, { double: true });
        }
        for (const dx of [-1, 1]) {
          const tx = x + dx, ty = y + fwd;
          const q = at(s, tx, ty);
          if (isLand(tx, ty) && !hot(s, tx, ty) && q !== "." && q !== "H" && bcColor(q) !== me && kind(q) !== "F") promo(ty, {}, tx);
          else if (s.ep && s.ep === bcSq(tx, ty)) add(x, y, tx, ty, { capture: true, ep: true });
        }
      } else if (k === "N" || k === "E") {
        const jumps = k === "N" ? KN : [...KN, ...EAG];
        for (const [dx, dy] of jumps) if (landOk(x + dx, y + dy)) add(x, y, x + dx, y + dy);
      } else if (k === "K") {
        for (const [dx, dy] of [...ORTH, ...DIAG]) if (landOk(x + dx, y + dy)) add(x, y, x + dx, y + dy);
      } else if (k === "C") {
        for (const [dx, dy] of [...ORTH, ...DIAG]) if (isLand(x + dx, y + dy) && !hot(s, x + dx, y + dy) && (at(s, x + dx, y + dy) === "." || at(s, x + dx, y + dy) === "H")) add(x, y, x + dx, y + dy);
        for (const [dx, dy] of ARCH) {
          const tx = x + dx, ty = y + dy;
          if (!inGrid(tx, ty)) continue;
          const mid = terr(x + dx / 2, y + dy / 2);
          if (mid === "M" || mid === "T") continue;
          const q = at(s, tx, ty);
          if (q !== "." && bcColor(q) !== me) out.push({ from: bcSq(x, y), to: bcSq(tx, ty), capture: true, shot: true });
        }
      } else if (k === "A") {
        for (const [dx, dy] of DIAG) {
          let tx = x + dx, ty = y + dy, hop = false;
          while (true) {
            const t = terr(tx, ty);
            if (t === "W" || t === "M" || hot(s, tx, ty)) break;
            const q = at(s, tx, ty);
            if (q === "H") { add(x, y, tx, ty); break; }
            if (q === ".") add(x, y, tx, ty);
            else if (bcColor(q) !== me) { add(x, y, tx, ty); break; }
            else if (!hop && kind(q) === "P") hop = true; // jump one pawn of its own colour
            else break;
            if (t === "T") break;
            tx += dx; ty += dy;
          }
        }
      } else if (k === "Q" || k === "R" || k === "B") {
        const dirs = k === "R" ? ORTH : k === "B" ? DIAG : [...ORTH, ...DIAG];
        for (const [dx, dy] of dirs) {
          let tx = x + dx, ty = y + dy;
          while (true) {
            const t = terr(tx, ty);
            if (t === "M" || hot(s, tx, ty)) break;
            if (t === "W") {
              // rook vs frigate: the ray runs on over open water and sinks the first enemy ship (rook stays)
              if (k !== "R") break;
              let wx = tx, wy = ty;
              while (isWater(wx, wy)) {
                const q = at(s, wx, wy);
                if (q !== ".") {
                  if (SHIPS.includes(kind(q)) && bcColor(q) !== me) out.push({ from: bcSq(x, y), to: bcSq(wx, wy), capture: true, shot: true });
                  break;
                }
                wx += dx; wy += dy;
              }
              break;
            }
            const q = at(s, tx, ty);
            if (q === ".") add(x, y, tx, ty);
            else { if (bcColor(q) !== me) add(x, y, tx, ty); break; }
            if (t === "T") break;
            tx += dx; ty += dy;
          }
        }
      } else if (k === "I" || k === "U" || k === "W") {
        if (k === "I" && !isLand(x, y)) {
          // v3 §5.3: a pirate ship sails like a rook over open water and takes the enemy ship it meets
          for (const [dx, dy] of ORTH) {
            let tx = x + dx, ty = y + dy;
            while (isWater(tx, ty)) {
              const q = at(s, tx, ty);
              if (q !== ".") {
                if (bcColor(q) !== me && bcColor(q) !== null) {
                  if (kind(q) === "F") out.push({ from: bcSq(x, y), to: bcSq(tx, ty), capture: true, board: true });
                  else add(x, y, tx, ty);
                }
                break;
              }
              add(x, y, tx, ty);
              tx += dx; ty += dy;
            }
          }
        } else {
          const reach = k === "U" ? 5 : k === "W" ? 2 : 4;
          for (const [dx, dy] of [...ORTH, ...DIAG]) {
            for (let step = 1; step <= reach; step++) {
              const tx = x + dx * step, ty = y + dy * step;
              if (!inGrid(tx, ty)) break;
              const t = terr(tx, ty);
              if (t === "M" || hot(s, tx, ty)) break;
              const q = at(s, tx, ty);
              if (t === "W") {
                if (k === "I" && kind(q) === "F" && bcColor(q) !== me) out.push({ from: bcSq(x, y), to: bcSq(tx, ty), capture: true, board: true });
                break;
              }
              if (k === "U" || k === "W") {
                // the mage walks onto empty squares only; it charms instead of capturing (v3 §7.4)
                if (q !== ".") break;
                add(x, y, tx, ty);
                if (t === "T") break;
                continue;
              }
              if (q === "." || q === "H") add(x, y, tx, ty);
              else { if (bcColor(q) !== me && kind(q) !== "F") add(x, y, tx, ty); break; }
              if (t === "T") break;
            }
          }
          if (k === "W") {
            for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
              const rad = Math.max(Math.abs(dx), Math.abs(dy));
              if (rad < 1 || rad > 3) continue; // part 4: only within three squares
              const q = at(s, x + dx, y + dy);
              if (bcColor(q) === null || bcColor(q) === me) continue;
              if (kind(q) === "K" || SHIPS.includes(kind(q))) continue;
              out.push({ from: bcSq(x, y), to: bcSq(x + dx, y + dy), capture: false, charm: true });
            }
          }
        }
      } else if (k === "S") {
        // a transport boat: sails like a rook over open water (it never captures) …
        for (const [dx, dy] of ORTH) {
          let tx = x + dx, ty = y + dy;
          while (isWater(tx, ty) && at(s, tx, ty) === ".") {
            add(x, y, tx, ty);
            tx += dx; ty += dy;
          }
        }
        // … and the piece riding it may step ashore onto any neighbouring land square
        const rider = s.cargo[bcSq(x, y)];
        if (rider) {
          for (const [dx, dy] of [...ORTH, ...DIAG]) {
            const tx = x + dx, ty = y + dy;
            const q = at(s, tx, ty);
            if (!isLand(tx, ty) || (q !== "." && q !== "H")) continue; // v3 §5.4: dropped onto an empty land square
            out.push({ from: bcSq(x, y), to: bcSq(tx, ty), capture: false, chest: q === "H", disembark: true });
          }
        }
      } else if (k === "F") {
        const mate = shipMate(s, x, y);
        if (!mate) continue;
        const cellsOf: [number, number][] = [[x, y], mate];
        // sail (from this cell): both cells move by the same rook step over open water
        for (const [dx, dy] of ORTH) {
          for (let k2 = 1; k2 < 30; k2++) {
            let blocked = false, hit = false;
            for (const [cx, cy] of cellsOf) {
              const nx = cx + dx * k2, ny = cy + dy * k2;
              if (!isWater(nx, ny)) { blocked = true; break; }
              const q = at(s, nx, ny);
              if (q !== "." && q !== p) {
                if (SHIPS.includes(kind(q)) && bcColor(q) !== null && bcColor(q) !== me) hit = true;
                else blocked = true;
              }
            }
            if (blocked) break;
            out.push({ from: bcSq(x, y), to: bcSq(x + dx * k2, y + dy * k2), capture: hit, ship: [bcSq(x, y), bcSq(mate[0], mate[1])] });
            if (hit) break;
          }
        }
        // v3 §5.1: a frigate carries one piece too; it steps off from the cell it rode on
        const rider = s.cargo[bcSq(x, y)];
        if (rider) {
          for (const [dx, dy] of [...ORTH, ...DIAG]) {
            const tx = x + dx, ty = y + dy;
            const q = at(s, tx, ty);
            if (isLand(tx, ty) && (q === "." || q === "H")) out.push({ from: bcSq(x, y), to: bcSq(tx, ty), capture: false, chest: q === "H", disembark: true });
          }
        }
        // fire from this cell: 3 squares inland
        const tg: [number, number][] = [];
        cannonTargets(s, x, y, me, tg);
        for (const [tx, ty] of tg) out.push({ from: bcSq(x, y), to: bcSq(tx, ty), capture: true, shot: true });
      }
    }
  // boarding: a land piece (not the king) beside its own empty boat or frigate may climb aboard
  for (let y = BC_Y0; y <= BC_Y1; y++)
    for (let x = BC_X0; x <= BC_X1; x++) {
      const ship = at(s, x, y);
      if (ship !== (me === "w" ? "S" : "s") && ship !== (me === "w" ? "F" : "f")) continue;
      if (s.cargo[bcSq(x, y)]) continue;
      if (ship.toUpperCase() === "F") {
        const mate = shipMate(s, x, y);
        if (mate && s.cargo[bcSq(mate[0], mate[1])]) continue;
      }
      for (const [dx, dy] of [...ORTH, ...DIAG]) {
        const q = at(s, x + dx, y + dy);
        if (bcColor(q) !== me || !isLand(x + dx, y + dy) || !RIDERS.includes(kind(q))) continue;
        out.push({ from: bcSq(x + dx, y + dy), to: bcSq(x, y), capture: false, embark: true });
      }
    }
  // v3 §7.4: each side opens only the chest on its own island; Part 4: an invisible assassin can't be hit
  return out.filter((m) => {
    if (m.chest) {
      const [tx, ty] = bcPos(m.to)!;
      if (BC_CHESTS.find((c) => c.x === tx && c.y === ty)?.owner !== me) return false;
    }
    if ((m.capture || m.charm) && s.inv[m.to] && kind(at(s, ...bcPos(m.to)!)) === "A" && bcColor(at(s, ...bcPos(m.to)!)) !== me) return false;
    return true;
  });
}
const SHIPS = ["F", "S", "I"];
const RIDERS = ["Q", "R", "B", "N", "P", "C", "E", "A", "W", "U"];
export function bcApply(s: BcState, m: BcMove): BcState {
  use(s);
  const c = s.cells.map((r) => r.slice());
  const [fx, fy] = bcPos(m.from)!;
  const [tx, ty] = bcPos(m.to)!;
  const p = at(s, fx, fy);
  const target = at(s, tx, ty);
  const sink = (x: number, y: number) => {
    const q = at(s, x, y);
    const mate = shipMate(s, x, y);
    put(c, x, y, ".");
    if (mate && at(s, mate[0], mate[1]) === q) put(c, mate[0], mate[1], ".");
  };
  const cargo: Record<string, string> = { ...s.cargo };
  if (m.embark) {
    put(c, fx, fy, ".");
    cargo[m.to] = p;
  } else if (m.disembark) {
    const rider = cargo[m.from];
    delete cargo[m.from];
    put(c, tx, ty, rider);
    if (target === "H") spawnMage(c, bcColor(rider)!, tx, ty);
  } else if (m.charm) {
    put(c, tx, ty, target === target.toUpperCase() ? target.toLowerCase() : target.toUpperCase());
  } else if (m.board) {
    sink(tx, ty);
    put(c, fx, fy, ".");
    put(c, tx, ty, p);
  } else if (m.shot) {
    if (kind(target) === "F") sink(tx, ty);
    else put(c, tx, ty, ".");
  } else if (m.ship) {
    const cells = m.ship.map((q) => bcPos(q)!);
    const dx = tx - fx, dy = ty - fy;
    for (const [x, y] of cells) {
      const q = at(s, x + dx, y + dy);
      if (q !== "." && kind(q) === "F" && bcColor(q) !== bcColor(p)) sink(x + dx, y + dy);
    }
    for (const [x, y] of cells) put(c, x, y, ".");
    for (const [x, y] of cells) put(c, x + dx, y + dy, p);
    // the frigate's passenger sails with it
    const moved: Record<string, string> = {};
    for (const [x, y] of cells) {
      const r = cargo[bcSq(x, y)];
      if (r) { moved[bcSq(x + dx, y + dy)] = r; delete cargo[bcSq(x, y)]; }
    }
    Object.assign(cargo, moved);
  } else {
    put(c, fx, fy, ".");
    let np = p;
    if (m.promo) np = bcColor(p) === "w" ? m.promo.toUpperCase() : m.promo;
    put(c, tx, ty, np);
    if (m.ep) put(c, tx, fy, ".");
    if (target === "H" && bcColor(p)) spawnMage(c, bcColor(p)!, tx, ty);
    if (kind(p) === "S" && cargo[m.from]) {
      cargo[m.to] = cargo[m.from];
      delete cargo[m.from];
    }
  }
  // a boat that is gone (sunk, rammed, boarded) takes its rider down with it
  for (const sq of Object.keys(cargo)) {
    const at2 = bcPos(sq);
    const k2 = at2 ? kind(cellOf(c, at2[0], at2[1])) : "";
    if (k2 !== "S" && k2 !== "F") delete cargo[sq];
  }
  // Part 4 assassin: after its capture it stays invisible for its owner's next two moves (once a game)
  const me = s.turn;
  const inv: Record<string, number> = {};
  let invUsed = s.invUsed;
  for (const [sq, n] of Object.entries(s.inv)) {
    const key = sq === m.from && !m.shot && !m.charm && !m.embark ? m.to : sq;
    const left = bcColor(at(s, ...bcPos(sq)!)) === me ? n - 1 : n;
    if (left > 0) inv[key] = left;
  }
  if (kind(p) === "A" && m.capture && !m.shot && !invUsed.includes(me)) {
    inv[m.to] = 2;
    invUsed = me === "w" ? "w" + invUsed : invUsed + "b";
  }
  const lava: Record<string, number> = {};
  for (const [sq, n] of Object.entries(s.lava)) if (n > 1) lava[sq] = n - 1;
  const made = new Set(s.made);
  const storm = rage(c, lava, made, s.full, s.storm);
  for (const sq of Object.keys(inv)) {
    const q = bcPos(sq);
    if (!q || kind(cellOf(c, q[0], q[1])) !== "A") delete inv[sq];
  }
  const pawnOrCap = kind(p) === "P" || !!m.capture || !!m.chest || /[TV]/.test(storm);
  return {
    cells: c,
    turn: s.turn === "w" ? "b" : "w",
    ep: m.double ? bcSq(fx, (fy + ty) / 2) : null,
    half: pawnOrCap ? 0 : s.half + 1,
    full: s.full + (s.turn === "b" ? 1 : 0),
    lava,
    storm,
    cargo,
    made: [...made].sort(),
    inv,
    invUsed,
  };
}

function cellOf(c: string[][], x: number, y: number) {
  return inGrid(x, y) ? c[BC_Y1 - y][x - BC_X0] : "#";
}

/**
 * Events (v3 §8, Part 4): announced first, then they strike. A roll starts a warning ("t2" tornado,
 * "v2" volcanoes, counted in plies); when it runs out the event hits ("T" / "V") on that ply.
 * Tornado shoves a troop. Volcanoes: both snowy mountains erupt; lava lands within three squares
 * of each centre, removing what stands there, and lava on water becomes land. Same rolls in PHP.
 */
const MADE_CAP = 16; // keeps the position inside games.fen
function rage(c: string[][], lava: Record<string, number>, made: Set<string>, full: number, prev: string): string {
  let seed = (full * 997 + 13) % 2147483647 || 1;
  for (const row of c) for (const ch of row) seed = bcNext(seed + ch.charCodeAt(0));
  let act = "", warn = "";
  const tw = bcWarn(prev, "t"), vw = bcWarn(prev, "v");
  seed = bcNext(seed);
  if (tw > 1) warn += "t" + (tw - 1);
  else if (tw === 1) {
    act += "T";
    const pcs: [number, number][] = [];
    for (let y = 1; y <= 8; y++) for (let x = 0; x <= 13; x++) {
      const q = cellOf(c, x, y);
      if (q === "." || q === "H" || kind(q) === "K" || kind(q) === "F" || !isLand(x, y)) continue;
      pcs.push([x, y]);
    }
    if (pcs.length) {
      seed = bcNext(seed);
      let cx = pcs[seed % pcs.length][0], cy = pcs[seed % pcs.length][1];
      seed = bcNext(seed);
      const [dx, dy] = [...ORTH, ...DIAG][seed % 8];
      seed = bcNext(seed);
      const who = cellOf(c, cx, cy);
      for (let i = 0, dist = 1 + (seed % 3); i < dist; i++) {
        const nx = cx + dx, ny = cy + dy;
        if (!inGrid(nx, ny)) break;
        const t = terr(nx, ny);
        if (t === "W") { put(c, cx, cy, "."); break; }
        if (t === "M" || cellOf(c, nx, ny) !== ".") break;
        put(c, cx, cy, ".");
        put(c, nx, ny, who);
        cx = nx; cy = ny;
        if (t === "T") break;
      }
    }
  } // v3: the final video has no tornado, so none is rolled (an old save's pending one still resolves)
  seed = bcNext(seed);
  if (vw > 1) warn += "v" + (vw - 1);
  else if (vw === 1) {
    act += "V";
    for (const [ox, oy] of BC_VOLCANOES) {
      for (let my = oy; my <= oy + 1; my++) for (let mx = ox; mx <= ox + 1; mx++) if (kind(cellOf(c, mx, my)) === "E") put(c, mx, my, ".");
      const spots: [number, number][] = [];
      for (let ny = oy - 3; ny <= oy + 4; ny++) for (let nx = ox - 3; nx <= ox + 4; nx++) {
        if (!inGrid(nx, ny)) continue;
        if (Math.max(Math.abs(nx * 2 - (ox * 2 + 1)), Math.abs(ny * 2 - (oy * 2 + 1))) > 6) continue;
        const t = terr(nx, ny);
        const q = cellOf(c, nx, ny);
        if (t === "M" || t === "T" || q === "H" || kind(q) === "K") continue;
        if (t === "W" && q !== ".") continue; // ships ride it out
        spots.push([nx, ny]);
      }
      seed = bcNext(seed);
      const hits = Math.min(spots.length, 2 + (seed % 3));
      for (let i = 0; i < hits; i++) {
        seed = bcNext(seed);
        const [nx, ny] = spots.splice(seed % spots.length, 1)[0];
        const sq = bcSq(nx, ny);
        if (terr(nx, ny) === "W") {
          if (made.size >= MADE_CAP) continue;
          made.add(sq);
          MADE.add(sq);
        } else put(c, nx, ny, ".");
        lava[sq] = 3;
      }
    }
  } else if (seed % 100 < 8 && tw === 0 && !warn) warn += "v4";
  return act + warn;
}

/** v3 §7.4: the chest becomes a Mage of the opener's colour, beside it on the island. */
function spawnMage(c: string[][], me: BcColor, cx: number, cy: number) {
  for (const [dx, dy] of [...ORTH, ...DIAG]) {
    const x = cx + dx, y = cy + dy;
    if (isLand(x, y) && cellOf(c, x, y) === ".") {
      put(c, x, y, me === "w" ? "W" : "w");
      return;
    }
  }
}

export function bcLegalMoves(s: BcState): BcMove[] {
  return pseudo(s).filter((m) => !bcInCheck(bcApply(s, m), s.turn));
}

export function bcSan(s: BcState, m: BcMove): string {
  const [fx, fy] = bcPos(m.from)!;
  const p = kind(at(s, fx, fy));
  const n = bcApply(s, m);
  const legalN = bcLegalMoves(n);
  const chk = bcInCheck(n, n.turn) ? (legalN.length ? "+" : "#") : "";
  const letter = p === "P" ? "" : p;
  return `${letter}${m.from}${m.shot ? "*" : m.capture ? "x" : "-"}${m.to}${m.promo ? "=" + m.promo.toUpperCase() : ""}${chk}`;
}

export type BcStatus = { over: false } | { over: true; winner: BcColor | null; reason: string };
export function bcStatus(s: BcState): BcStatus {
  if (!kingOf(s, s.turn)) return { over: true, winner: s.turn === "w" ? "b" : "w", reason: "king-lost" };
  if (bcLegalMoves(s).length === 0) {
    return bcInCheck(s, s.turn) ? { over: true, winner: s.turn === "w" ? "b" : "w", reason: "checkmate" } : { over: true, winner: null, reason: "stalemate" };
  }
  if (s.half >= 100) return { over: true, winner: null, reason: "fifty-moves" };
  if (s.full > 200) return { over: true, winner: null, reason: "move-limit" };
  return { over: false };
}

/** Pick the legal move from -> to; a promotion picks the queen unless `promo` says otherwise. */
export function bcFind(s: BcState, from: string, to: string, promo?: string | null): BcMove | null {
  const c = bcLegalMoves(s).filter((m) => m.from === from && m.to === to);
  if (!c.length) return null;
  return c.find((m) => (m.promo ?? null) === (promo ?? (c[0].promo ? "q" : null))) ?? c[0];
}

const VAL: Record<string, number> = { K: 0, Q: 900, R: 500, B: 320, N: 300, P: 100, C: 260, E: 380, A: 520, F: 250, I: 360, W: 640, U: 180, H: 0, S: 120 };
export function bcEvaluate(s: BcState, side: BcColor): number {
  let sc = 0;
  for (let y = BC_Y0; y <= BC_Y1; y++)
    for (let x = BC_X0; x <= BC_X1; x++) {
      const p = at(s, x, y);
      if (p === ".") continue;
      const col = bcColor(p);
      if (!col) continue;
      const k = kind(p);
      let v = k === "F" ? VAL.F / 2 : VAL[k];
      if (k === "P") v += (col === "w" ? 7 - y : y - 2) * 8;
      if (k === "N" || k === "B" || k === "E" || k === "A") v += 12 - Math.abs(6.5 - x) * 2 - Math.abs(4.5 - y) * 2;
      const rider = k === "S" || k === "F" ? s.cargo[bcSq(x, y)] : undefined;
      if (rider) v += VAL[kind(rider)] ?? 0;
      sc += col === side ? v : -v;
    }
  return Math.round(sc);
}
