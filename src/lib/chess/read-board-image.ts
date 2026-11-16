import { PATHS, type PieceKind } from "@/components/chess/marks";

export type SeenSpot = { c: "w" | "b"; t: PieceKind };
export type SeenBoard = Partial<Record<string, SeenSpot>>;

const FILES = "abcdefgh";
const KINDS: PieceKind[] = ["k", "q", "r", "b", "n", "p"];
const N = 16;

type RGB = [number, number, number];

function dist(a: RGB, b: RGB) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function at(data: Uint8ClampedArray, w: number, h: number, x: number, y: number): RGB {
  const ix = Math.max(0, Math.min(w - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(h - 1, Math.round(y)));
  const i = (iy * w + ix) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function mean(colors: RGB[]): RGB {
  const s: RGB = [0, 0, 0];
  for (const c of colors) {
    s[0] += c[0];
    s[1] += c[1];
    s[2] += c[2];
  }
  const n = colors.length || 1;
  return [s[0] / n, s[1] / n, s[2] / n];
}

function lum(c: RGB) {
  return c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
}

/** Squash a mask onto its own bounding box so a small piece matches a full template. */
function normalize(mask: Uint8Array, n: number): Uint8Array | null {
  let minX = n;
  let minY = n;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!mask[y * n + x]) continue;
      count++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (count < 10) return null;
  const out = new Uint8Array(N * N);
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const sx = minX + Math.min(bw - 1, Math.floor(((x + 0.5) / N) * bw));
      const sy = minY + Math.min(bh - 1, Math.floor(((y + 0.5) / N) * bh));
      out[y * N + x] = mask[sy * n + sx];
    }
  }
  return out;
}

function iou(a: Uint8Array, b: Uint8Array) {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ? 1 : 0;
    const bv = b[i] ? 1 : 0;
    inter += av & bv;
    union += av | bv;
  }
  return union ? inter / union : 0;
}

function guessKind(mask: Uint8Array): PieceKind {
  let count = 0;
  let top = 0;
  let left = 0;
  let right = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!mask[y * N + x]) continue;
      count++;
      if (y < 5) top++;
      if (x < N / 2) left++;
      else right++;
    }
  }
  const frac = count / (N * N);
  const asym = count ? Math.abs(left - right) / count : 0;
  const topRow = top / (5 * N);
  if (asym > 0.2) return "n";
  if (frac < 0.46 && topRow < 0.45) return "p";
  if (topRow > 0.55) return "r";
  if (topRow < 0.28) return "b";
  if (topRow < 0.42) return "k";
  return "q";
}

type Grid = { x0: number; y0: number; cell: number; even: RGB; odd: RGB; score: number };

function sidesOf(colors: RGB[]): Array<"w" | "b"> | null {
  if (colors.length < 2) return null;
  let a = colors[0];
  let b = colors[colors.length - 1];
  let onB = colors.map(() => false);
  for (let iter = 0; iter < 6; iter++) {
    onB = colors.map((c) => dist(c, b) < dist(c, a));
    const as = colors.filter((_, i) => !onB[i]);
    const bs = colors.filter((_, i) => onB[i]);
    if (as.length) a = mean(as);
    if (bs.length) b = mean(bs);
  }
  if (!colors.some((_, i) => onB[i]) || !colors.some((_, i) => !onB[i])) return null;
  if (dist(a, b) < 36) return null;
  const bIsWhite = lum(b) > lum(a);
  return onB.map((sideB) => (sideB === bIsWhite ? "w" : "b"));
}

function findGrid(data: Uint8ClampedArray, w: number, h: number): Grid | null {
  let best: Grid | null = null;
  const side = Math.min(w, h);
  for (let cell = Math.floor(side / 8.2); cell >= Math.max(12, Math.floor(side / 16)); cell -= 2) {
    const board = cell * 8;
    const step = Math.max(3, cell >> 2);
    for (let y0 = 0; y0 + board <= h; y0 += step) {
      for (let x0 = 0; x0 + board <= w; x0 += step) {
        const even: RGB[] = [];
        const odd: RGB[] = [];
        for (let r = 0; r < 8; r++) {
          for (let f = 0; f < 8; f++) {
            const cx = x0 + f * cell;
            const cy = y0 + r * cell;
            const rim = mean([
              at(data, w, h, cx + cell * 0.14, cy + cell * 0.14),
              at(data, w, h, cx + cell * 0.86, cy + cell * 0.14),
              at(data, w, h, cx + cell * 0.14, cy + cell * 0.86),
              at(data, w, h, cx + cell * 0.86, cy + cell * 0.86),
            ]);
            ((f + r) % 2 === 0 ? even : odd).push(rim);
          }
        }
        const Em = mean(even);
        const Om = mean(odd);
        if (dist(Em, Om) < 28) continue;
        let score = 0;
        for (const c of even) if (dist(c, Em) + 8 < dist(c, Om)) score++;
        for (const c of odd) if (dist(c, Om) + 8 < dist(c, Em)) score++;
        if (!best || score > best.score) best = { x0, y0, cell, even: Em, odd: Om, score };
      }
    }
  }
  return best && best.score >= 46 ? best : null;
}

function sampleMask(data: Uint8ClampedArray, w: number, h: number, x0: number, y0: number, cell: number, wood: RGB) {
  const n = 32;
  const mask = new Uint8Array(n * n);
  const sum: RGB = [0, 0, 0];
  let on = 0;
  const inset = 0.16;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = x0 + (inset + ((x + 0.5) / n) * (1 - 2 * inset)) * cell;
      const py = y0 + (inset + ((y + 0.5) / n) * (1 - 2 * inset)) * cell;
      const color = at(data, w, h, px, py);
      if (dist(color, wood) > 32) {
        mask[y * n + x] = 1;
        sum[0] += color[0];
        sum[1] += color[1];
        sum[2] += color[2];
        on++;
      }
    }
  }
  const color: RGB = on ? [sum[0] / on, sum[1] / on, sum[2] / on] : wood;
  return { mask, on, color };
}

/**
 * Read an overhead or screenshot board into squares.
 * Top row of the picture lands on rank 8, so the board you drop looks like the picture.
 * `templates` are normalized 16×16 silhouettes, one per piece kind.
 */
export function readBoardPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  templates: Partial<Record<PieceKind, Uint8Array>> | null,
): SeenBoard | null {
  const grid = findGrid(data, width, height);
  if (!grid) return null;
  const hits: { sq: string; kind: PieceKind; color: RGB; wood: RGB }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const wood = (f + r) % 2 === 0 ? grid.even : grid.odd;
      const { mask, on, color } = sampleMask(data, width, height, grid.x0 + f * grid.cell, grid.y0 + r * grid.cell, grid.cell, wood);
      if (on < 28) continue;
      const shape = normalize(mask, 32);
      if (!shape) continue;
      let kind: PieceKind = guessKind(shape);
      let best = 0.34;
      if (templates) {
        for (const k of KINDS) {
          const t = templates[k];
          if (!t) continue;
          const score = iou(shape, t);
          if (score > best) {
            best = score;
            kind = k;
          }
        }
      }
      hits.push({ sq: `${FILES[f]}${8 - r}`, kind, color, wood });
    }
  }
  if (hits.length < 2) return null;
  const side = sidesOf(hits.map((h) => h.color));
  const board: SeenBoard = {};
  hits.forEach((hit, i) => {
    const byLum: "w" | "b" = lum(hit.color) > lum(hit.wood) + 18 || lum(hit.color) > 168 ? "w" : "b";
    board[hit.sq] = { c: side ? side[i] : byLum, t: hit.kind };
  });
  return board;
}

let masks: Partial<Record<PieceKind, Uint8Array>> | null = null;

function pieceTemplates(): Partial<Record<PieceKind, Uint8Array>> {
  if (masks) return masks;
  masks = {};
  if (typeof document === "undefined") return masks;
  const n = 48;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n;
  const g = canvas.getContext("2d");
  if (!g) return masks;
  for (const kind of KINDS) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, n, n);
    g.setTransform(n / 40, 0, 0, n / 40, 0, 0);
    g.fillStyle = "#000";
    g.fill(new Path2D(PATHS[kind]));
    const px = g.getImageData(0, 0, n, n).data;
    const raw = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) raw[i] = px[i * 4 + 3] > 24 ? 1 : 0;
    const norm = normalize(raw, n);
    if (norm) masks[kind] = norm;
  }
  return masks;
}

/** A dropped picture of a game, shrunk and read. Null when no board is visible. */
export async function readBoardFile(file: Blob): Promise<SeenBoard | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("bad image"));
      el.src = url;
    });
    const max = 360;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(16, Math.round(img.width * scale));
    const h = Math.max(16, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h);
    return readBoardPixels(px.data, w, h, pieceTemplates());
  } finally {
    URL.revokeObjectURL(url);
  }
}
