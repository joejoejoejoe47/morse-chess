/** Four-army chess on a cross of boards. The middle 2×2 is one square: the colosseum. */

export const PITCH = 1.22;
export const YOU: Team = "s";
export const TEAMS = ["s", "w", "n", "e"] as const;
export type Team = (typeof TEAMS)[number];
export type PType = "k" | "q" | "r" | "b" | "n" | "p";

export const TEAM_COLOR: Record<Team, string> = {
  s: "#e6b422",
  n: "#d04555",
  w: "#3b74f0",
  e: "#2f9e57",
};

export const TEAM_NAME: Record<Team, string> = {
  s: "Gold",
  n: "Crimson",
  w: "Blue",
  e: "Green",
};

export type Unit = { id: string; team: Team; type: PType; cell: string; moved: boolean };
export type Forum = { owner: Team | null; progress: number; takes: number };
export type AllyMap = Partial<Record<Team, Team | null>>;

export type CrossState = {
  units: Unit[];
  turn: Team;
  ally: AllyMap;
  out: Team[];
  forum: Forum;
  winner: Team | null;
  reason: string;
};

export type Move = { unitId: string; to: string };
export type PlayResult = { state: CrossState; prompt: boolean; shake: [string, string] | null };

const FORUM = "forum";
const VALUE: Record<PType, number> = { k: 100, q: 9, r: 5, b: 3, n: 3, p: 1 };
const KNIGHT = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];

function inBlock(x: number, z: number) {
  return (x === 3 || x === 4) && (z === 3 || z === 4);
}

export function cellId(x: number, z: number): string | null {
  if (!Number.isInteger(x) || !Number.isInteger(z)) return null;
  if (inBlock(x, z)) return FORUM;
  const vert = x >= 0 && x <= 7 && z >= -8 && z <= 15;
  const horz = z >= 0 && z <= 7 && x >= -8 && x <= 15;
  if (!vert && !horz) return null;
  return `${x},${z}`;
}

export function parseCell(id: string): { x: number; z: number } | null {
  if (id === FORUM) return { x: 3.5, z: 3.5 };
  const [a, b] = id.split(",");
  const x = Number(a);
  const z = Number(b);
  if (!Number.isInteger(x) || !Number.isInteger(z)) return null;
  return { x, z };
}

export function worldOf(id: string): [number, number, number] {
  const p = parseCell(id);
  if (!p) return [0, 0, 0];
  return [(p.x - 3.5) * PITCH, 0, (p.z - 3.5) * PITCH];
}

export function boardCells(): string[] {
  const ids: string[] = [];
  for (let x = -8; x <= 15; x++) {
    for (let z = -8; z <= 15; z++) {
      const id = cellId(x, z);
      if (id && id !== FORUM && !ids.includes(id)) ids.push(id);
    }
  }
  ids.push(FORUM);
  return ids;
}

export function onBoard(wx: number, wz: number) {
  const x = wx / PITCH + 3.5;
  const z = wz / PITCH + 3.5;
  const vert = x >= -0.62 && x <= 7.62 && z >= -8.62 && z <= 15.62;
  const horz = z >= -0.62 && z <= 7.62 && x >= -8.62 && x <= 15.62;
  return vert || horz;
}

function forward(team: Team): [number, number] {
  if (team === "s") return [0, 1];
  if (team === "n") return [0, -1];
  if (team === "w") return [1, 0];
  return [-1, 0];
}

function right(team: Team): [number, number] {
  const [dx, dz] = forward(team);
  return [dz, -dx];
}

function isEnemy(a: Team, b: Team, ally: AllyMap) {
  return a !== b && ally[a] !== b;
}

function occMap(units: Unit[]) {
  const map = new Map<string, Unit[]>();
  for (const unit of units) {
    const list = map.get(unit.cell) ?? [];
    list.push(unit);
    map.set(unit.cell, list);
  }
  return map;
}

function forumExits(dx: number, dz: number): string[] {
  if (!dx && !dz) return [];
  const exits: string[] = [];
  for (const bx of [3, 4]) {
    for (const bz of [3, 4]) {
      const id = cellId(bx + dx, bz + dz);
      if (id && id !== FORUM && !exits.includes(id)) exits.push(id);
    }
  }
  return exits;
}

function rayFrom(x: number, z: number, dx: number, dz: number, blocks: Set<string>): string[] {
  const out: string[] = [];
  let cx = x;
  let cz = z;
  for (let n = 0; n < 32; n++) {
    const nx = cx + dx;
    const nz = cz + dz;
    if (inBlock(nx, nz)) {
      out.push(FORUM);
      if (blocks.has(FORUM)) return out;
      let sx = nx;
      let sz = nz;
      while (inBlock(sx, sz)) {
        sx += dx;
        sz += dz;
      }
      cx = sx - dx;
      cz = sz - dz;
      continue;
    }
    const id = cellId(nx, nz);
    if (!id) return out;
    out.push(id);
    if (blocks.has(id)) return out;
    cx = nx;
    cz = nz;
  }
  return out;
}

function slide(from: string, dx: number, dz: number, blocks: Set<string>): string[] {
  if (!dx && !dz) return [];
  if (from === FORUM) {
    const out: string[] = [];
    for (const exit of forumExits(dx, dz)) {
      const p = parseCell(exit);
      if (!p) continue;
      out.push(exit);
      if (blocks.has(exit)) continue;
      out.push(...rayFrom(p.x, p.z, dx, dz, blocks));
    }
    return [...new Set(out)];
  }
  const p = parseCell(from);
  if (!p) return [];
  return rayFrom(p.x, p.z, dx, dz, blocks);
}

function knightTargets(from: string): string[] {
  const origins =
    from === FORUM
      ? [
          [3, 3],
          [3, 4],
          [4, 3],
          [4, 4],
        ]
      : [parseCell(from) ? [parseCell(from)!.x, parseCell(from)!.z] : []];
  const out: string[] = [];
  for (const pair of origins) {
    if (pair.length < 2) continue;
    const ox = pair[0] as number;
    const oz = pair[1] as number;
    for (const [dx, dz] of KNIGHT) {
      const id = cellId(ox + dx, oz + dz);
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

function kingTargets(from: string): string[] {
  if (from === FORUM) return forumExits(1, 0).concat(forumExits(-1, 0), forumExits(0, 1), forumExits(0, -1), forumExits(1, 1), forumExits(1, -1), forumExits(-1, 1), forumExits(-1, -1)).filter((id, i, all) => all.indexOf(id) === i);
  const p = parseCell(from);
  if (!p) return [];
  const out: string[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const id = cellId(p.x + dx, p.z + dz);
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

function blocksOf(units: Unit[]) {
  const set = new Set<string>();
  for (const unit of units) set.add(unit.cell);
  return set;
}

function landingOk(unit: Unit, to: string, occ: Map<string, Unit[]>, ally: AllyMap) {
  const there = (occ.get(to) ?? []).filter((u) => u.id !== unit.id);
  if (to === FORUM) return true;
  if (!there.length) return true;
  return there.every((u) => isEnemy(unit.team, u.team, ally));
}

function pawnTargets(unit: Unit, occ: Map<string, Unit[]>, ally: AllyMap): string[] {
  const [fx, fz] = forward(unit.team);
  const [rx, rz] = right(unit.team);
  const dests: string[] = [];
  const empty = (id: string | null) => Boolean(id) && !(occ.get(id as string)?.filter((u) => u.id !== unit.id).length);
  if (unit.cell === FORUM) {
    for (const id of forumExits(fx, fz)) if (empty(id)) dests.push(id);
  } else {
    const p = parseCell(unit.cell);
    if (!p) return dests;
    const one = cellId(p.x + fx, p.z + fz);
    if (empty(one) && one) {
      dests.push(one);
      if (!unit.moved) {
        const two = cellId(p.x + fx * 2, p.z + fz * 2);
        if (empty(two) && two && two !== one) dests.push(two);
      }
    }
  }
  const caps =
    unit.cell === FORUM
      ? [...forumExits(fx + rx, fz + rz), ...forumExits(fx - rx, fz - rz)]
      : (() => {
          const p = parseCell(unit.cell)!;
          return [cellId(p.x + fx + rx, p.z + fz + rz), cellId(p.x + fx - rx, p.z + fz - rz)];
        })();
  for (const id of caps) {
    if (!id) continue;
    const foes = (occ.get(id) ?? []).some((u) => u.id !== unit.id && isEnemy(unit.team, u.team, ally));
    if (foes) dests.push(id);
  }
  return [...new Set(dests)];
}

function pseudo(unit: Unit, units: Unit[], ally: AllyMap): string[] {
  const occ = occMap(units);
  const blocks = blocksOf(units.filter((u) => u.id !== unit.id));
  let dests: string[] = [];
  if (unit.type === "p") dests = pawnTargets(unit, occ, ally);
  else if (unit.type === "n") dests = knightTargets(unit.cell);
  else if (unit.type === "k") dests = kingTargets(unit.cell);
  else {
    const dirs: [number, number][] = [];
    if (unit.type === "r" || unit.type === "q") dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    if (unit.type === "b" || unit.type === "q") dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    for (const [dx, dz] of dirs) dests.push(...slide(unit.cell, dx, dz, blocks));
  }
  return dests.filter((to) => to !== unit.cell && landingOk(unit, to, occ, ally));
}

function kingCell(units: Unit[], team: Team) {
  return units.find((u) => u.team === team && u.type === "k")?.cell ?? null;
}

function attacked(units: Unit[], ally: AllyMap, team: Team, cell: string) {
  for (const unit of units) {
    if (!isEnemy(team, unit.team, ally)) continue;
    if (pseudo(unit, units, ally).includes(cell)) return true;
  }
  return false;
}

function leavesKingSafe(state: CrossState, unit: Unit, to: string) {
  const next = state.units.map((u) => (u.id === unit.id ? { ...u, cell: to } : u));
  const cleaned = next.filter((u) => !(u.id !== unit.id && u.cell === to && isEnemy(unit.team, u.team, state.ally)));
  const capturedKing = state.units.some((u) => u.cell === to && u.type === "k" && isEnemy(unit.team, u.team, state.ally));
  if (capturedKing) return true;
  const home = kingCell(cleaned, unit.team);
  if (!home) return true;
  return !attacked(cleaned, state.ally, unit.team, home);
}

export function legalMoves(state: CrossState, team: Team): Move[] {
  if (state.winner || state.out.includes(team) || state.turn !== team) return [];
  const moves: Move[] = [];
  for (const unit of state.units) {
    if (unit.team !== team) continue;
    for (const to of pseudo(unit, state.units, state.ally)) {
      if (leavesKingSafe(state, unit, to)) moves.push({ unitId: unit.id, to });
    }
  }
  return moves;
}

function enemiesOn(state: CrossState, cell: string, team: Team) {
  return state.units.filter((u) => u.cell === cell && isEnemy(team, u.team, state.ally));
}

export function canAlly(state: CrossState, move: Move) {
  const unit = state.units.find((u) => u.id === move.unitId);
  if (!unit || move.to !== FORUM) return false;
  const foes = enemiesOn(state, FORUM, unit.team);
  const sides = [...new Set(foes.map((u) => u.team))];
  if (sides.length !== 1) return false;
  const other = sides[0];
  if (state.ally[unit.team] && state.ally[unit.team] !== other) return false;
  if (state.ally[other] && state.ally[other] !== unit.team) return false;
  return true;
}

function dropTeam(units: Unit[], team: Team) {
  return units.filter((u) => u.team !== team);
}

function clearAlly(ally: AllyMap, team: Team): AllyMap {
  const next: AllyMap = { ...ally, [team]: null };
  const other = ally[team];
  if (other) next[other] = null;
  return next;
}

function standing(units: Unit[], team: Team): "dead" | "alone" | "pawns" | "ok" {
  const mine = units.filter((u) => u.team === team);
  if (!mine.some((u) => u.type === "k")) return "dead";
  const rest = mine.filter((u) => u.type !== "k");
  if (!rest.length) return "alone";
  if (rest.every((u) => u.type === "p")) return "pawns";
  return "ok";
}

function promote(unit: Unit): Unit {
  if (unit.type !== "p" || unit.cell === FORUM) return unit;
  const p = parseCell(unit.cell);
  if (!p) return unit;
  const last =
    (unit.team === "s" && p.z === 15) ||
    (unit.team === "n" && p.z === -8) ||
    (unit.team === "w" && p.x === 15) ||
    (unit.team === "e" && p.x === -8);
  return last ? { ...unit, type: "q" } : unit;
}

function onlyOne(state: CrossState): Team | null {
  const live = TEAMS.filter((t) => !state.out.includes(t));
  return live.length === 1 ? live[0] : null;
}

function settleSide(state: CrossState, team: Team, why: string) {
  if (state.out.includes(team) || state.winner) return;
  state.out = [...state.out, team];
  state.units = dropTeam(state.units, team);
  state.ally = clearAlly(state.ally, team);
  if (state.forum.owner === team) state.forum = { owner: null, progress: 0, takes: state.forum.takes };
  const last = onlyOne(state);
  if (last && !state.winner) {
    state.winner = last;
    state.reason = why;
  }
}

function passTurn(state: CrossState) {
  if (state.winner) return;
  let guard = 0;
  while (guard++ < 8 && !state.winner) {
    const i = TEAMS.indexOf(state.turn);
    let next: Team | null = null;
    for (let k = 1; k <= 4; k++) {
      const t = TEAMS[(i + k) % 4];
      if (!state.out.includes(t)) {
        next = t;
        break;
      }
    }
    if (!next) {
      const last = onlyOne(state);
      if (last) {
        state.winner = last;
        state.reason = "The field is empty.";
      }
      return;
    }
    state.turn = next;
    const shape = standing(state.units, next);
    if (shape === "dead" || shape === "alone") {
      settleSide(state, next, `${TEAM_NAME[next]} fell.`);
      continue;
    }
    if (shape === "pawns") {
      state.winner = next;
      state.reason = `${TEAM_NAME[next]} kept a king and pawns.`;
      return;
    }
    const moves = legalMoves(state, next);
    if (moves.length) return;
    const home = kingCell(state.units, next);
    if (home && attacked(state.units, state.ally, next, home)) {
      settleSide(state, next, `${TEAM_NAME[next]} is checkmated.`);
      continue;
    }
  }
}

export function play(state: CrossState, move: Move, choice?: "dominate" | "ally"): PlayResult {
  if (state.winner) return { state, prompt: false, shake: null };
  const unit = state.units.find((u) => u.id === move.unitId);
  if (!unit || unit.team !== state.turn || state.out.includes(unit.team)) return { state, prompt: false, shake: null };
  if (!legalMoves(state, state.turn).some((m) => m.unitId === move.unitId && m.to === move.to)) {
    return { state, prompt: false, shake: null };
  }
  const foes = move.to === FORUM ? enemiesOn(state, FORUM, unit.team) : [];
  if (foes.length && !choice) return { state, prompt: true, shake: null };
  if (choice === "ally" && !canAlly(state, move)) choice = "dominate";

  const next = structuredClone(state) as CrossState;
  let shake: [string, string] | null = null;
  if (move.to === FORUM && foes.length && choice === "ally") {
    const other = foes[0].team;
    next.ally = { ...next.ally, [unit.team]: other, [other]: unit.team };
    shake = [unit.id, foes[0].id];
  } else if (move.to === FORUM && foes.length) {
    const killed = new Set(foes.map((u) => u.team));
    next.units = next.units.filter((u) => !foes.some((f) => f.id === u.id));
    for (const team of killed) {
      if (!next.units.some((u) => u.team === team && u.type === "k")) settleSide(next, team, `${TEAM_NAME[team]}'s king fell.`);
    }
    next.forum = { owner: unit.team, progress: 0, takes: next.forum.takes + (next.forum.owner === unit.team ? 0 : 1) };
  } else if (move.to !== FORUM) {
    const victim = next.units.find((u) => u.cell === move.to && u.id !== unit.id && isEnemy(unit.team, u.team, next.ally));
    if (victim) {
      next.units = next.units.filter((u) => u.id !== victim.id);
      if (victim.type === "k") settleSide(next, victim.team, `${TEAM_NAME[victim.team]}'s king fell.`);
    }
  } else if (next.forum.owner !== unit.team) {
    const ownerGone = !next.forum.owner || !next.units.some((u) => u.team === next.forum.owner && u.cell === FORUM);
    const ownerEnemy = next.forum.owner ? isEnemy(unit.team, next.forum.owner, next.ally) : false;
    if (!next.forum.owner || (ownerGone && ownerEnemy) || (ownerEnemy && !enemiesOn(next, FORUM, unit.team).length)) {
      next.forum = { owner: unit.team, progress: 0, takes: next.forum.takes + 1 };
    }
  }

  next.units = next.units.map((u) => (u.id === unit.id ? promote({ ...u, cell: move.to, moved: true }) : u));

  if (!next.winner) {
    const order = [unit.team, ...TEAMS.filter((team) => team !== unit.team)];
    for (const team of order) {
      if (next.out.includes(team)) continue;
      const shape = standing(next.units, team);
      if (shape === "dead" || shape === "alone") settleSide(next, team, `${TEAM_NAME[team]} has only a king.`);
      else if (shape === "pawns") {
        next.winner = team;
        next.reason = `${TEAM_NAME[team]} kept a king and pawns.`;
      }
      if (next.winner) break;
    }
  }

  if (!next.winner && next.units.some((u) => u.id === unit.id)) {
    const holders = next.units.filter((u) => u.team === unit.team && u.cell === FORUM).length;
    if (holders > 0 && next.forum.owner === unit.team) {
      const need = holders >= 2 ? 9 : 10;
      const progress = next.forum.progress + 1;
      next.forum = { ...next.forum, progress };
      if (progress >= need) {
        next.winner = unit.team;
        next.reason = `${TEAM_NAME[unit.team]} finished the colosseum.`;
      }
    }
  }

  if (!next.winner) {
    const last = onlyOne(next);
    if (last) {
      next.winner = last;
      next.reason = `${TEAM_NAME[last]} is the last army.`;
    }
  }
  passTurn(next);
  return { state: next, prompt: false, shake };
}

export function botMove(state: CrossState): Move | null {
  const moves = legalMoves(state, state.turn);
  if (!moves.length) return null;
  const byId = new Map(state.units.map((u) => [u.id, u]));
  let best = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const unit = byId.get(move.unitId);
    if (!unit) continue;
    const victim = state.units.find((u) => u.cell === move.to && isEnemy(unit.team, u.team, state.ally));
    let score = victim ? VALUE[victim.type] * 10 : 0;
    if (move.to === FORUM) score += 6;
    const [x, , z] = worldOf(move.to);
    score += Math.max(0, 14 - Math.hypot(x, z));
    const [fx, fz] = forward(unit.team);
    const from = parseCell(unit.cell);
    const to = parseCell(move.to);
    if (from && to) score += (to.x - from.x) * fx + (to.z - from.z) * fz;
    score += Math.random() * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

const BACK: PType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];

function army(team: Team, units: Unit[]) {
  const files: { x: number; z: number }[] = [];
  const pawns: { x: number; z: number }[] = [];
  for (let i = 0; i < 8; i++) {
    if (team === "s") {
      files.push({ x: i, z: -8 });
      pawns.push({ x: i, z: -7 });
    } else if (team === "n") {
      files.push({ x: 7 - i, z: 15 });
      pawns.push({ x: 7 - i, z: 14 });
    } else if (team === "w") {
      files.push({ x: -8, z: 7 - i });
      pawns.push({ x: -7, z: 7 - i });
    } else {
      files.push({ x: 15, z: i });
      pawns.push({ x: 14, z: i });
    }
  }
  BACK.forEach((type, i) => {
    const spot = files[i];
    units.push({ id: `${team}${type}${i}`, team, type, cell: cellId(spot.x, spot.z) as string, moved: false });
  });
  pawns.forEach((spot, i) => {
    units.push({ id: `${team}p${i}`, team, type: "p", cell: cellId(spot.x, spot.z) as string, moved: false });
  });
}

export function newGame(): CrossState {
  const units: Unit[] = [];
  for (const team of TEAMS) army(team, units);
  return {
    units,
    turn: "s",
    ally: {},
    out: [],
    forum: { owner: null, progress: 0, takes: 0 },
    winner: null,
    reason: "",
  };
}

export function spreadOn(cell: string, index: number, count: number): [number, number] {
  if (cell !== FORUM || count <= 1) return [0, 0];
  const a = (index / count) * Math.PI * 2;
  return [Math.cos(a) * 0.42, Math.sin(a) * 0.42];
}
