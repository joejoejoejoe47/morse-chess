/**
 * Battle Chess (owner t375u; Forceman's "The New Chess Is Insane", rules in mcl-art/battlechess-rules.md).
 * A 14x8 wooden island in an ocean: water ditches, mountains, bushes, Frigates, Archers, an Assassin
 * and an Eagle. White sits at the top (rank 8) and moves first; White pawns move DOWN.
 * php/src/BoardGames.php (bc* functions) is a line-by-line copy; keep them in step.
 *
 * Grid: x = -3..16 (files; a..n are x 0..13), y = -2..11 (ranks; land is 1..8).
 * Square names: one file letter + the rank number. Files left of a are x,y,z (x=-3, y=-2, z=-1);
 * files after n are o,p,q. Ranks may be 0, -1, -2, 9, 10, 11 in the ocean.
 * State string: "bc|<14 rows, y=11 first, 20 chars each, joined by '/'>|turn|ep|half|full".
 * Pieces: K Q R B N P, C archer, E eagle, A assassin, F frigate (uses 2 cells). Upper case = White.
 * Marked assumptions from the spec: no castling; no frigate rotation (the ship keeps its starting
 * orientation); frigates and rooks capture ships remotely (shots), the shooter stays put.
 */
export type BcColor = "w" | "b";
export type BcState = { cells: string[][]; turn: BcColor; ep: string | null; half: number; full: number }; // cells[yi][xi]
export type BcMove = { from: string; to: string; capture: boolean; shot?: boolean; promo?: string; ep?: boolean; double?: boolean; ship?: [string, string] };

export const BC_X0 = -3, BC_X1 = 16, BC_Y0 = -2, BC_Y1 = 11;
export const BC_W = BC_X1 - BC_X0 + 1; // 20
export const BC_H = BC_Y1 - BC_Y0 + 1; // 14
const FILES = "xyzabcdefghijklmnopq"; // index = x + 3

export const bcSq = (x: number, y: number) => FILES[x + 3] + y;
export function bcPos(s: string): [number, number] | null {
  const xi = FILES.indexOf(s[0]);
  const y = Number(s.slice(1));
  if (xi < 0 || !/^-?\d+$/.test(s.slice(1)) || y < BC_Y0 || y > BC_Y1) return null;
  return [xi - 3, y];
}
const inGrid = (x: number, y: number) => x >= BC_X0 && x <= BC_X1 && y >= BC_Y0 && y <= BC_Y1;

/** Terrain: 'L' land, 'W' water, 'M' mountain, 'T' bush (bush is land). */
export function bcTerrain(x: number, y: number): "L" | "W" | "M" | "T" {
  if (x < 0 || x > 13 || y < 1 || y > 8) return "W";
  if (y === 3 && x <= 2) return "W";
  if (y === 6 && x >= 11) return "W";
  if ((x <= 1 && y >= 7) || (x >= 12 && y <= 2)) return "M";
  if ((x === 6 && y === 5) || (x === 7 && y === 4)) return "T";
  return "L";
}
const isLand = (x: number, y: number) => { const t = bcTerrain(x, y); return t === "L" || t === "T"; };
const isWater = (x: number, y: number) => inGrid(x, y) && bcTerrain(x, y) === "W";

const at = (s: BcState, x: number, y: number) => (inGrid(x, y) ? s.cells[BC_Y1 - y][x - BC_X0] : "#");
const put = (c: string[][], x: number, y: number, p: string) => { c[BC_Y1 - y][x - BC_X0] = p; };
export const bcColor = (p: string): BcColor | null => (p === "." || p === "#" ? null : p === p.toUpperCase() ? "w" : "b");
const kind = (p: string) => p.toUpperCase();

export const BATTLE_START = (() => {
  const c: string[][] = Array.from({ length: BC_H }, () => Array.from({ length: BC_W }, () => "."));
  const row = (y: number, s: string) => { for (let x = 0; x < 14; x++) if (s[x] !== ".") put(c, x, y, s[x]); };
  row(8, "...REBKQBNRABR");
  row(7, "...PPPPPPPPCNN");
  row(6, "C.............");
  row(3, ".............c");
  row(2, "nncpppppppp...");
  row(1, "rbarnbkqber...");
  put(c, 10, 9, "F"); put(c, 11, 9, "F"); // k9-l9
  put(c, 2, 0, "f"); put(c, 3, 0, "f"); // c0-d0
  return bcString({ cells: c, turn: "w", ep: null, half: 0, full: 1 });
})();

export function bcParse(str: string): BcState | null {
  const p = str.split("|");
  if (p.length !== 6 || p[0] !== "bc") return null;
  const rows = p[1].split("/");
  if (rows.length !== BC_H) return null;
  const cells: string[][] = [];
  for (const r of rows) {
    const out: string[] = [];
    for (const m of r.matchAll(/(\d+)|(\D)/g)) {
      if (m[1]) for (let i = Number(m[1]); i > 0; i--) out.push(".");
      else out.push(m[2]);
    }
    if (out.length !== BC_W) return null;
    cells.push(out);
  }
  return { cells, turn: p[2] === "b" ? "b" : "w", ep: p[3] === "-" ? null : p[3], half: Number(p[4]) || 0, full: Number(p[5]) || 1 };
}
export function bcString(s: BcState): string {
  // Empty runs are written as numbers (like FEN) so a position fits games.fen VARCHAR(255).
  const rle = (r: string[]) => r.join("").replace(/\.+/g, (m) => String(m.length));
  return ["bc", s.cells.map(rle).join("/"), s.turn, s.ep ?? "-", String(s.half), String(s.full)].join("|");
}

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
    if (!isLand(x + dx, y + dy) && bcTerrain(x + dx, y + dy) !== "M") continue;
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
        if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) return true;
      } else if (k === "C") {
        if ((Math.abs(dx) === 2 || dx === 0) && (Math.abs(dy) === 2 || dy === 0) && (dx !== 0 || dy !== 0)) {
          const mx = xx + dx / 2, my = yy + dy / 2;
          const t = bcTerrain(mx, my);
          if (t !== "M" && t !== "T") return true;
        }
      } else if (k === "A") {
        if (Math.abs(dx) === Math.abs(dy) && dx !== 0) {
          const sx = Math.sign(dx), sy = Math.sign(dy);
          let ok = true;
          for (let i = 1; i < Math.abs(dx); i++) {
            const t = bcTerrain(xx + sx * i, yy + sy * i);
            if (t !== "L") { ok = false; break; } // mountain / water / bush stop it
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
          if (bcTerrain(cx, cy) !== "L" || at(s, cx, cy) !== ".") { ok = false; break; }
          cx += sx; cy += sy;
        }
        if (ok) return true;
      }
    }
  return false;
}

function kingOf(s: BcState, c: BcColor): [number, number] | null {
  const want = c === "w" ? "K" : "k";
  for (let y = 1; y <= 8; y++) for (let x = 0; x <= 13; x++) if (at(s, x, y) === want) return [x, y];
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
  const out: BcMove[] = [];
  const me = s.turn;
  const add = (fx: number, fy: number, tx: number, ty: number, extra: Partial<BcMove> = {}) => {
    const p = at(s, tx, ty);
    out.push({ from: bcSq(fx, fy), to: bcSq(tx, ty), capture: p !== "." && p !== "#", ...extra });
  };
  const landOk = (x: number, y: number) => isLand(x, y) && bcColor(at(s, x, y)) !== me;
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
        if (isLand(x, y + fwd) && at(s, x, y + fwd) === ".") {
          promo(y + fwd, {}, x);
          if (y === start && isLand(x, y + 2 * fwd) && at(s, x, y + 2 * fwd) === ".") add(x, y, x, y + 2 * fwd, { double: true });
        }
        for (const dx of [-1, 1]) {
          const tx = x + dx, ty = y + fwd;
          const q = at(s, tx, ty);
          if (isLand(tx, ty) && q !== "." && bcColor(q) !== me && kind(q) !== "F") promo(ty, {}, tx);
          else if (s.ep && s.ep === bcSq(tx, ty)) add(x, y, tx, ty, { capture: true, ep: true });
        }
      } else if (k === "N" || k === "E") {
        const jumps = k === "N" ? KN : [...KN, ...EAG];
        for (const [dx, dy] of jumps) if (landOk(x + dx, y + dy)) add(x, y, x + dx, y + dy);
      } else if (k === "K") {
        for (const [dx, dy] of [...ORTH, ...DIAG]) if (landOk(x + dx, y + dy)) add(x, y, x + dx, y + dy);
      } else if (k === "C") {
        for (const [dx, dy] of [...ORTH, ...DIAG]) if (isLand(x + dx, y + dy) && at(s, x + dx, y + dy) === ".") add(x, y, x + dx, y + dy);
        for (const [dx, dy] of ARCH) {
          const tx = x + dx, ty = y + dy;
          if (!inGrid(tx, ty)) continue;
          const mid = bcTerrain(x + dx / 2, y + dy / 2);
          if (mid === "M" || mid === "T") continue;
          const q = at(s, tx, ty);
          if (q !== "." && bcColor(q) !== me) out.push({ from: bcSq(x, y), to: bcSq(tx, ty), capture: true, shot: true });
        }
      } else if (k === "A") {
        for (const [dx, dy] of DIAG) {
          let tx = x + dx, ty = y + dy;
          while (true) {
            const t = bcTerrain(tx, ty);
            if (t === "W" || t === "M") break;
            const q = at(s, tx, ty);
            if (bcColor(q) !== me) add(x, y, tx, ty);
            if (t === "T") break;
            tx += dx; ty += dy;
          }
        }
      } else if (k === "Q" || k === "R" || k === "B") {
        const dirs = k === "R" ? ORTH : k === "B" ? DIAG : [...ORTH, ...DIAG];
        for (const [dx, dy] of dirs) {
          let tx = x + dx, ty = y + dy;
          while (true) {
            const t = bcTerrain(tx, ty);
            if (t === "M") break;
            if (t === "W") {
              // rook vs frigate: the ray runs on over open water and sinks the first enemy ship (rook stays)
              if (k !== "R") break;
              let wx = tx, wy = ty;
              while (isWater(wx, wy)) {
                const q = at(s, wx, wy);
                if (q !== ".") {
                  if (kind(q) === "F" && bcColor(q) !== me) out.push({ from: bcSq(x, y), to: bcSq(wx, wy), capture: true, shot: true });
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
                if (kind(q) === "F" && bcColor(q) !== me) hit = true;
                else blocked = true;
              }
            }
            if (blocked) break;
            out.push({ from: bcSq(x, y), to: bcSq(x + dx * k2, y + dy * k2), capture: hit, ship: [bcSq(x, y), bcSq(mate[0], mate[1])] });
            if (hit) break;
          }
        }
        // fire from this cell: 3 squares inland
        const tg: [number, number][] = [];
        cannonTargets(s, x, y, me, tg);
        for (const [tx, ty] of tg) out.push({ from: bcSq(x, y), to: bcSq(tx, ty), capture: true, shot: true });
      }
    }
  return out;
}
export function bcApply(s: BcState, m: BcMove): BcState {
  const c = s.cells.map((r) => r.slice());
  const [fx, fy] = bcPos(m.from)!;
  const [tx, ty] = bcPos(m.to)!;
  const p = at(s, fx, fy);
  const target = at(s, tx, ty);
  // remove a whole ship that is hit
  const sink = (x: number, y: number) => {
    const q = at(s, x, y);
    const mate = shipMate(s, x, y);
    put(c, x, y, ".");
    if (mate && at(s, mate[0], mate[1]) === q) put(c, mate[0], mate[1], ".");
  };
  if (m.shot) {
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
  } else {
    put(c, fx, fy, ".");
    let np = p;
    if (m.promo) np = bcColor(p) === "w" ? m.promo.toUpperCase() : m.promo;
    put(c, tx, ty, np);
    if (m.ep) put(c, tx, fy, ".");
  }
  const pawnOrCap = kind(p) === "P" || m.capture;
  return {
    cells: c,
    turn: s.turn === "w" ? "b" : "w",
    ep: m.double ? bcSq(fx, (fy + ty) / 2) : null,
    half: pawnOrCap ? 0 : s.half + 1,
    full: s.full + (s.turn === "b" ? 1 : 0),
  };
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

const VAL: Record<string, number> = { K: 0, Q: 900, R: 500, B: 320, N: 300, P: 100, C: 260, E: 380, A: 520, F: 250 };
export function bcEvaluate(s: BcState, side: BcColor): number {
  let sc = 0;
  for (let y = BC_Y0; y <= BC_Y1; y++)
    for (let x = BC_X0; x <= BC_X1; x++) {
      const p = at(s, x, y);
      if (p === ".") continue;
      const col = bcColor(p)!;
      const k = kind(p);
      let v = k === "F" ? VAL.F / 2 : VAL[k];
      if (k === "P") v += (col === "w" ? 7 - y : y - 2) * 8;
      if (k === "N" || k === "B" || k === "E" || k === "A") v += 12 - Math.abs(6.5 - x) * 2 - Math.abs(4.5 - y) * 2;
      sc += col === side ? v : -v;
    }
  return Math.round(sc);
}
