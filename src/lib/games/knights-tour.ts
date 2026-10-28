/** Knight's Tour helpers. board[r][f] = move number (1..64) or 0. */
export type KTBoard = number[][];
const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

export function ktEmpty(): KTBoard {
  return Array.from({ length: 8 }, () => Array(8).fill(0));
}

export function ktTargets(b: KTBoard, at: [number, number] | null): [number, number][] {
  if (!at) return [];
  return KN.map(([dr, df]) => [at[0] + dr, at[1] + df] as [number, number]).filter(
    ([r, f]) => r >= 0 && r < 8 && f >= 0 && f < 8 && b[r][f] === 0,
  );
}

/** Warnsdorff hint: the target with the fewest onward moves. */
export function ktHint(b: KTBoard, at: [number, number] | null): [number, number] | null {
  const ts = ktTargets(b, at);
  if (!ts.length) return null;
  let best = ts[0], n = 9;
  for (const t of ts) {
    const nb = b.map((row) => row.slice());
    nb[t[0]][t[1]] = 99;
    const k = ktTargets(nb, t).length;
    if (k < n) { n = k; best = t; }
  }
  return best;
}
