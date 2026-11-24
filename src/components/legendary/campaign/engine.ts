/**
 * Campaign chess engine (Morse Chess Legendary, owner t381u). Normal chess, plus the boss-arena
 * extras the five chapters need, plus the Army perks. Everything here is pure data so the bot,
 * the boards and the node tests share it.
 *
 *  - Squares are 0..63, index = rank * 8 + file, rank 0 = rank 1 (White's back rank).
 *  - Checkmate / stalemate / check are standard: a move is legal only if it does not leave your
 *    own king attacked, with Stone Walls blocking lines like a piece would.
 *  - Arena extras (only when the rule is on): rotating gears, glass pawns, stone walls, the
 *    rim collapse of Morse-Zero's phase 2. Fog is drawing only and lives in the boards.
 *  - Perks belong to the player (White) and only exist in campaign/raid/arena games.
 */

export type Color = "w" | "b";
export type Kind = "k" | "q" | "r" | "b" | "n" | "p";
/** `id` is the Army slot for the player's starting pieces ("ra", "nb", "pe"...); bosses use "x…". */
export type Piece = { c: Color; k: Kind; id: string; glass?: boolean };
export type PerkId = "shield-wall" | "phase-leap" | "batter" | "ricochet" | "inspire";

export type Rules = {
  /** Squares that turn pieces clockwise, in rotation order (each piece goes to the next square). */
  gears?: number[];
  /** Plies between gear turns (8 = every 4 full turns). */
  gearEvery?: number;
  /** Boss summons a Glass Pawn every N of its own moves. */
  glassEvery?: number;
  /** Stone walls: square -> hit points. Only rooks and queens can hit them. */
  walls?: Record<number, number>;
  /** Phantom fog radius (drawing only). */
  fog?: number;
  /** Morse-Zero: phase 2 starts when the boss has this share of its starting material left. */
  overlord?: { at: number };
  /** Raid: the boss gets extra pieces; the human side may be two players taking turns. */
  raid?: boolean;
};

export type State = {
  board: (Piece | null)[];
  turn: Color;
  castle: { wk: boolean; wq: boolean; bk: boolean; bq: boolean };
  ep: number;
  ply: number;
  /** Half-moves since the last capture or pawn move (50-move rule = 100). */
  quiet: number;
  rules: Rules;
  walls: Record<number, number>;
  /** Perks the player brought: piece id -> perk. */
  perks: Record<string, PerkId>;
  /** Once-per-game perks already spent (piece ids). */
  spent: Record<string, true>;
  /** Morse-Zero phase (1 or 2); in phase 2 no piece but a king may land on the outer rim. */
  phase: 1 | 2;
  /** Boss starting material (for the phase trigger). */
  bossStart: number;
  bossMoves: number;
};

export type MoveKind = "normal" | "double" | "ep" | "castle" | "promo" | "wall" | "shield-wall" | "phase-leap" | "ricochet";
export type Move = { from: number; to: number; kind: MoveKind; promo?: Kind; via?: number };

export type Event =
  | { t: "capture"; by: Piece; victim: Piece; at: number }
  | { t: "promote"; piece: Piece; to: Kind }
  | { t: "check"; by: Color }
  | { t: "gears"; moved: { from: number; to: number; piece: Piece }[] }
  | { t: "gears-jammed" }
  | { t: "wall-hit"; at: number; hp: number; by: Piece; dmg: number }
  | { t: "wall-down"; at: number }
  | { t: "glass-shatter"; at: number }
  | { t: "glass-summon"; at: number }
  | { t: "perk"; perk: PerkId; piece: Piece }
  | { t: "phase2" };

export const VALUE: Record<Kind, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const sq = (name: string) => (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
export const sqName = (i: number) => String.fromCharCode(97 + (i & 7)) + String.fromCharCode(49 + (i >> 3));
export const fileOf = (i: number) => i & 7;
export const rankOf = (i: number) => i >> 3;
export const onRim = (i: number) => fileOf(i) === 0 || fileOf(i) === 7 || rankOf(i) === 0 || rankOf(i) === 7;
const other = (c: Color): Color => (c === "w" ? "b" : "w");

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const BACK: Kind[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
/** Army slot ids by starting file: rooks "ra"/"rh", knights "nb"/"ng", bishops "bc"/"bf", "q", "k", pawns "pa".."ph". */
export function slotId(kind: Kind, file: number): string {
  if (kind === "k" || kind === "q") return kind;
  return kind + String.fromCharCode(97 + file);
}
export const ARMY_SLOTS: { id: string; kind: Kind; file: number }[] = [
  ...BACK.map((k, f) => ({ id: slotId(k, f), kind: k, file: f })),
  ...Array.from({ length: 8 }, (_, f) => ({ id: slotId("p", f), kind: "p" as Kind, file: f })),
];

/** The normal starting position. The boss (Black) can get extra pieces from `extra`. */
export function newGame(rules: Rules = {}, perks: Record<string, PerkId> = {}, extra: { sq: number; k: Kind }[] = []): State {
  const board: (Piece | null)[] = Array(64).fill(null);
  for (let f = 0; f < 8; f++) {
    board[f] = { c: "w", k: BACK[f], id: slotId(BACK[f], f) };
    board[8 + f] = { c: "w", k: "p", id: slotId("p", f) };
    board[48 + f] = { c: "b", k: "p", id: "xp" + f };
    board[56 + f] = { c: "b", k: BACK[f], id: "x" + BACK[f] + f };
  }
  extra.forEach((e, i) => {
    board[e.sq] = { c: "b", k: e.k, id: "xe" + i };
  });
  const walls = { ...(rules.walls ?? {}) };
  for (const w of Object.keys(walls)) board[+w] = null;
  const s: State = {
    board,
    turn: "w",
    castle: { wk: true, wq: true, bk: true, bq: true },
    ep: -1,
    ply: 0,
    quiet: 0,
    rules,
    walls,
    perks,
    spent: {},
    phase: 1,
    bossStart: 0,
    bossMoves: 0,
  };
  s.bossStart = material(s, "b");
  return s;
}

export function clone(s: State): State {
  return {
    ...s,
    board: s.board.slice(),
    castle: { ...s.castle },
    walls: { ...s.walls },
    spent: { ...s.spent },
  };
}

export function material(s: State, c: Color): number {
  let n = 0;
  for (const p of s.board) if (p && p.c === c && !p.glass) n += VALUE[p.k];
  return n;
}

export const isWall = (s: State, i: number) => (s.walls[i] ?? 0) > 0;
export function kingSq(s: State, c: Color): number {
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (p && p.c === c && p.k === "k") return i;
  }
  return -1;
}

const at = (f: number, r: number) => (f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f);

/** Is square `i` attacked by side `by`? Walls block lines. Queen Inspire never shields a king. */
export function attacked(s: State, i: number, by: Color): boolean {
  const f = fileOf(i);
  const r = rankOf(i);
  const pr = by === "w" ? r - 1 : r + 1;
  for (const df of [-1, 1]) {
    const j = at(f + df, pr);
    const p = j >= 0 ? s.board[j] : null;
    if (p && p.c === by && p.k === "p") return true;
  }
  for (const [df, dr] of KNIGHT) {
    const j = at(f + df, r + dr);
    const p = j >= 0 ? s.board[j] : null;
    if (p && p.c === by && p.k === "n") return true;
  }
  for (const [df, dr] of KING) {
    const j = at(f + df, r + dr);
    const p = j >= 0 ? s.board[j] : null;
    if (p && p.c === by && p.k === "k") return true;
  }
  for (const [dirs, kinds] of [[ROOK, "rq"], [BISHOP, "bq"]] as const) {
    for (const [df, dr] of dirs) {
      let ff = f + df;
      let rr = r + dr;
      for (;;) {
        const j = at(ff, rr);
        if (j < 0 || isWall(s, j)) break;
        const p = s.board[j];
        if (p) {
          if (p.c === by && kinds.includes(p.k)) return true;
          break;
        }
        ff += df;
        rr += dr;
      }
    }
  }
  return false;
}

export const inCheck = (s: State, c: Color = s.turn) => {
  const k = kingSq(s, c);
  return k >= 0 && attacked(s, k, other(c));
};

/** Queen Inspire: an enemy pawn may not capture a pawn standing next to that pawn's queen (with the perk). */
function inspired(s: State, victimSq: number): boolean {
  const v = s.board[victimSq];
  if (!v || v.k !== "p") return false;
  const f = fileOf(victimSq);
  const r = rankOf(victimSq);
  for (const [df, dr] of KING) {
    const j = at(f + df, r + dr);
    const q = j >= 0 ? s.board[j] : null;
    if (q && q.c === v.c && q.k === "q" && s.perks[q.id] === "inspire") return true;
  }
  return false;
}

/** Landing rule for Morse-Zero phase 2: the outer rim is collapsing. */
const landOk = (s: State, p: Piece, to: number) => s.phase !== 2 || p.k === "k" || !onRim(to);

function pseudo(s: State, from: number, out: Move[], perksOn = true) {
  const p = s.board[from];
  if (!p || p.c !== s.turn) return;
  const f = fileOf(from);
  const r = rankOf(from);
  const push = (to: number, kind: MoveKind = "normal", via?: number) => {
    if (!landOk(s, p, to)) return;
    if (p.k === "p" && (rankOf(to) === 7 || rankOf(to) === 0) && kind !== "shield-wall") {
      for (const k of ["q", "r", "b", "n"] as Kind[]) out.push({ from, to, kind: "promo", promo: k });
    } else out.push({ from, to, kind, via });
  };
  const free = (j: number) => j >= 0 && !s.board[j] && !isWall(s, j);
  const enemy = (j: number) => j >= 0 && !!s.board[j] && s.board[j]!.c !== p.c;
  if (p.k === "p") {
    const dir = p.c === "w" ? 1 : -1;
    const one = at(f, r + dir);
    if (free(one)) {
      push(one);
      const start = p.c === "w" ? 1 : 6;
      const two = at(f, r + 2 * dir);
      if (r === start && free(two)) push(two, "double");
    }
    for (const df of [-1, 1]) {
      const j = at(f + df, r + dir);
      if (j < 0) continue;
      if (enemy(j) && !(s.board[j]!.k === "p" && inspired(s, j))) push(j);
      else if (j === s.ep && !s.board[j]) {
        const cap = at(f + df, r);
        if (!(cap >= 0 && inspired(s, cap))) push(j, "ep");
      }
    }
    // Shield Wall: once per game, one step sideways if a friendly pawn stands right beside it.
    if (perksOn && s.perks[p.id] === "shield-wall" && !s.spent[p.id]) {
      const beside = [-1, 1].some((df) => {
        const j = at(f + df, r);
        const q = j >= 0 ? s.board[j] : null;
        return !!q && q.c === p.c && q.k === "p";
      });
      if (beside) for (const df of [-1, 1]) { const j = at(f + df, r); if (free(j)) push(j, "shield-wall"); }
    }
    return;
  }
  if (p.k === "n" || p.k === "k") {
    for (const [df, dr] of p.k === "n" ? KNIGHT : KING) {
      const j = at(f + df, r + dr);
      if (free(j) || enemy(j)) push(j);
    }
    if (p.k === "n" && perksOn && s.perks[p.id] === "phase-leap" && !s.spent[p.id]) {
      // Phase Leap: once per game, two squares straight, over anything (walls and gears too).
      for (const [df, dr] of ROOK) {
        const j = at(f + 2 * df, r + 2 * dr);
        if (free(j) || enemy(j)) push(j, "phase-leap");
      }
    }
    if (p.k === "k") castles(s, from, out);
    return;
  }
  const dirs = p.k === "r" ? ROOK : p.k === "b" ? BISHOP : [...ROOK, ...BISHOP];
  const seen = new Set<number>();
  for (const [df, dr] of dirs) {
    let ff = f + df;
    let rr = r + dr;
    for (;;) {
      const j = at(ff, rr);
      if (j < 0) break;
      if (isWall(s, j)) {
        // Only the player's rooks and queens can batter a Stone Wall.
        if (p.c === "w" && (p.k === "r" || p.k === "q")) out.push({ from, to: j, kind: "wall" });
        break;
      }
      if (s.board[j]) {
        if (s.board[j]!.c !== p.c) { push(j); seen.add(j); }
        break;
      }
      push(j);
      seen.add(j);
      ff += df;
      rr += dr;
    }
  }
  // Ricochet: once per game, one diagonal slide may bounce off the board edge at 90 degrees.
  if (p.k === "b" && perksOn && s.perks[p.id] === "ricochet" && !s.spent[p.id]) {
    for (const [df0, dr0] of BISHOP) {
      let df = df0;
      let dr = dr0;
      let ff = f;
      let rr = r;
      let bounced = false;
      for (let guard = 0; guard < 20; guard++) {
        let nf = ff + df;
        let nr = rr + dr;
        if (at(nf, nr) < 0) {
          if (bounced || (ff === f && rr === r)) break;
          const hitF = nf < 0 || nf > 7;
          const hitR = nr < 0 || nr > 7;
          if (hitF && hitR) break; // straight into a corner: nothing to bounce off
          if (hitF) df = -df;
          if (hitR) dr = -dr;
          bounced = true;
          nf = ff + df;
          nr = rr + dr;
        }
        const j = at(nf, nr);
        if (j < 0 || j === from || isWall(s, j)) break;
        const q = s.board[j];
        if (bounced && !seen.has(j)) {
          if (!q || q.c !== p.c) push(j, "ricochet", ff + rr * 8);
        }
        if (q) break;
        ff = nf;
        rr = nr;
      }
    }
  }
}

function castles(s: State, from: number, out: Move[]) {
  const p = s.board[from]!;
  const home = p.c === "w" ? 4 : 60;
  if (from !== home || inCheck(s, p.c)) return;
  const them = other(p.c);
  const rights = p.c === "w" ? [s.castle.wk, s.castle.wq] : [s.castle.bk, s.castle.bq];
  const sides: [number, number[], number[], number][] = [
    [home + 3, [home + 1, home + 2], [home + 1, home + 2], home + 2],
    [home - 4, [home - 1, home - 2, home - 3], [home - 1, home - 2], home - 2],
  ];
  sides.forEach(([rookSq, empty, safe, to], i) => {
    if (!rights[i]) return;
    const rook = s.board[rookSq];
    if (!rook || rook.c !== p.c || rook.k !== "r") return;
    if (empty.some((j) => s.board[j] || isWall(s, j))) return;
    if (safe.some((j) => attacked(s, j, them))) return;
    out.push({ from, to, kind: "castle" });
  });
}

/** Apply a move with no legality check. Returns the events it caused (captures, perks, walls...). */
export function apply(s0: State, m: Move, live = true): { s: State; ev: Event[] } {
  const s = clone(s0);
  const ev: Event[] = [];
  const p = s.board[m.from]!;
  const mover = s.turn;
  s.ep = -1;
  s.quiet++;
  if (m.kind === "wall") {
    const dmg = s.perks[p.id] === "batter" ? 2 : 1;
    const hp = Math.max(0, (s.walls[m.to] ?? 0) - dmg);
    ev.push({ t: "wall-hit", at: m.to, hp, by: p, dmg });
    if (hp <= 0) {
      delete s.walls[m.to];
      ev.push({ t: "wall-down", at: m.to });
    } else s.walls[m.to] = hp;
  } else {
    let victimSq = m.to;
    if (m.kind === "ep") victimSq = m.to + (mover === "w" ? -8 : 8);
    const victim = s.board[victimSq];
    if (victim) {
      ev.push({ t: "capture", by: p, victim, at: victimSq });
      s.board[victimSq] = null;
      s.quiet = 0;
    }
    s.board[m.to] = p;
    s.board[m.from] = null;
    if (p.k === "p") s.quiet = 0;
    if (m.kind === "double") s.ep = (m.from + m.to) >> 1;
    if (m.kind === "promo" && m.promo) {
      const np = { ...p, k: m.promo };
      s.board[m.to] = np;
      ev.push({ t: "promote", piece: np, to: m.promo });
    }
    if (m.kind === "castle") {
      const kingSide = m.to > m.from;
      const rf = kingSide ? m.from + 3 : m.from - 4;
      const rt = kingSide ? m.from + 1 : m.from - 1;
      s.board[rt] = s.board[rf];
      s.board[rf] = null;
    }
    if (m.kind === "shield-wall" || m.kind === "phase-leap" || m.kind === "ricochet") {
      s.spent[p.id] = true;
      ev.push({ t: "perk", perk: m.kind, piece: p });
    }
  }
  // castling rights follow the pieces actually on their home squares
  const still = (i: number, c: Color, k: Kind) => s.board[i]?.c === c && s.board[i]?.k === k;
  s.castle = {
    wk: s.castle.wk && still(4, "w", "k") && still(7, "w", "r"),
    wq: s.castle.wq && still(4, "w", "k") && still(0, "w", "r"),
    bk: s.castle.bk && still(60, "b", "k") && still(63, "b", "r"),
    bq: s.castle.bq && still(60, "b", "k") && still(56, "b", "r"),
  };
  s.turn = other(mover);
  s.ply++;
  if (mover === "b") s.bossMoves++;
  // ── arena effects after the ply ──
  const R = s.rules;
  if (R.gears && R.gears.length > 1 && s.ply % (R.gearEvery ?? 8) === 0) {
    const g = R.gears;
    const next = s.board.slice();
    const moved: { from: number; to: number; piece: Piece }[] = [];
    g.forEach((from, i) => {
      const to = g[(i + 1) % g.length];
      next[to] = s.board[from];
      if (s.board[from]) moved.push({ from, to, piece: s.board[from]! });
    });
    const trial = { ...s, board: next };
    // Gears jam rather than leave the side that just moved in check (checkmate rules stay intact).
    if (moved.length && !inCheck(trial, mover)) {
      s.board = next;
      ev.push({ t: "gears", moved });
      s.castle = {
        wk: s.castle.wk && still(4, "w", "k") && still(7, "w", "r"),
        wq: s.castle.wq && still(4, "w", "k") && still(0, "w", "r"),
        bk: s.castle.bk && still(60, "b", "k") && still(63, "b", "r"),
        bq: s.castle.bq && still(60, "b", "k") && still(56, "b", "r"),
      };
    } else if (moved.length) ev.push({ t: "gears-jammed" });
  }
  if (R.glassEvery) {
    // A glass pawn shatters the moment any of your pieces attacks it.
    for (let i = 0; i < 64; i++) {
      const q = s.board[i];
      if (q && q.glass && attacked(s, i, other(q.c))) {
        s.board[i] = null;
        ev.push({ t: "glass-shatter", at: i });
      }
    }
  }
  if (R.overlord && s.phase === 1 && material(s, "b") <= s.bossStart * R.overlord.at) {
    s.phase = 2;
    ev.push({ t: "phase2" });
  }
  if (live && inCheck(s, s.turn)) ev.push({ t: "check", by: mover });
  return { s, ev };
}

/** Glass Pawn summon (Queen Aurelia): a random safe empty square on ranks 5-6. Call after the boss moves. */
export function summonGlass(s0: State, rand: () => number = Math.random): { s: State; ev: Event[] } {
  const s = s0;
  if (!s.rules.glassEvery || s.bossMoves === 0 || s.bossMoves % s.rules.glassEvery !== 0) return { s, ev: [] };
  const spots: number[] = [];
  for (let i = 32; i < 48; i++) {
    if (s.board[i] || isWall(s, i) || attacked(s, i, "w")) continue;
    const t = clone(s);
    t.board[i] = { c: "b", k: "p", id: "glass", glass: true };
    if (inCheck(t, "w")) continue; // never summon a check
    spots.push(i);
  }
  if (!spots.length) return { s, ev: [] };
  const i = spots[Math.floor(rand() * spots.length)];
  const t = clone(s);
  t.board[i] = { c: "b", k: "p", id: "glass" + s.bossMoves, glass: true };
  return { s: t, ev: [{ t: "glass-summon", at: i }] };
}

export function legalMoves(s: State, from = -1): Move[] {
  const out: Move[] = [];
  if (from >= 0) pseudo(s, from, out, s.turn === "w");
  else for (let i = 0; i < 64; i++) pseudo(s, i, out, s.turn === "w");
  const me = s.turn;
  return out.filter((m) => {
    const { s: t } = apply(s, m, false);
    const k = kingSq(t, me);
    return k >= 0 && !attacked(t, k, other(me));
  });
}

export type Status = { over: false } | { over: true; winner: Color | null; reason: string };

export function status(s: State): Status {
  if (kingSq(s, "w") < 0) return { over: true, winner: "b", reason: "Your king fell" };
  if (kingSq(s, "b") < 0) return { over: true, winner: "w", reason: "The boss king fell" };
  if (!legalMoves(s).length) {
    if (inCheck(s)) return { over: true, winner: other(s.turn), reason: "Checkmate" };
    return { over: true, winner: null, reason: "Stalemate" };
  }
  if (s.quiet >= 100) return { over: true, winner: null, reason: "50 moves without a capture" };
  const left = s.board.filter(Boolean) as Piece[];
  if (left.every((p) => p.k === "k" || p.glass)) return { over: true, winner: null, reason: "Only the kings are left" };
  if (s.ply >= 400) return { over: true, winner: null, reason: "The battle went on too long" };
  return { over: false };
}

/** Short move text for the log ("Nf3", "Qxe7+", "Shield Wall c4", "Wall hit d5"). */
export function moveText(s: State, m: Move): string {
  const p = s.board[m.from];
  if (!p) return "?";
  if (m.kind === "wall") return `${p.k.toUpperCase()} hits the wall ${sqName(m.to)}`;
  if (m.kind === "castle") return m.to > m.from ? "O-O" : "O-O-O";
  const cap = !!s.board[m.to] || m.kind === "ep";
  const letter = p.k === "p" ? (cap ? sqName(m.from)[0] : "") : p.k.toUpperCase();
  let t = `${letter}${cap ? "x" : ""}${sqName(m.to)}${m.promo ? "=" + m.promo.toUpperCase() : ""}`;
  if (m.kind === "shield-wall") t = `Shield Wall ${sqName(m.to)}`;
  if (m.kind === "phase-leap") t = `Phase Leap N${sqName(m.to)}`;
  if (m.kind === "ricochet") t = `Ricochet B${cap ? "x" : ""}${sqName(m.to)}`;
  const { s: n } = apply(s, m, false);
  if (inCheck(n)) t += legalMoves(n).length ? "+" : "#";
  return t;
}
