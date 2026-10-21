/**
 * History tile pictures: the chosen moment of a game drawn onto a canvas with the
 * colors of the board it was played on. 3D / AN / RA games get a tilted table view,
 * 2D games a flat top-down board. Drawing takes a few milliseconds, so tiles are
 * drawn as they scroll into view and kept in memory as data URLs.
 */
import { Chess } from "chess.js";
import type { BoardSkin } from "@/lib/chess/board-skins";

const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

const cache = new Map<string, string>();

export type ThumbSpec = {
  key: string;
  fen: string;
  lastMove: { from: string; to: string } | null;
  skin: BoardSkin;
  style: "2d" | "3d" | "an" | "ra";
  you: "w" | "b";
  mark?: string | null;
};

/** Sky behind the tilted board, per board. */
function backdrop(g: CanvasRenderingContext2D, size: number, skin: BoardSkin) {
  const grad = g.createLinearGradient(0, 0, 0, size);
  if (skin.id === "sky-arena") {
    grad.addColorStop(0, "#2c3f8f");
    grad.addColorStop(0.45, "#d89aa8");
    grad.addColorStop(0.62, "#f3c48a");
    grad.addColorStop(1, "#2a2230");
  } else if (skin.id === "grassland" || skin.id === "castle") {
    grad.addColorStop(0, "#9eb8cc");
    grad.addColorStop(0.55, "#c5d4e4");
    grad.addColorStop(1, "#3d6a32");
  } else if (skin.id === "rocco") {
    grad.addColorStop(0, "#3a4458");
    grad.addColorStop(0.6, "#8a6a5a");
    grad.addColorStop(1, "#1b1b1f");
  } else {
    grad.addColorStop(0, "#1a1c18");
    grad.addColorStop(0.55, mixHex(skin.felt, "#0c0d0b", 0.4));
    grad.addColorStop(1, "#0c0d0b");
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
}

function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) * (1 - t) + ch(pb, s) * t);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}

export function drawThumb(spec: ThumbSpec, size = 360): string {
  const hit = cache.get(spec.key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const g = canvas.getContext("2d")!;
  g.scale(dpr, dpr);
  const chess = new Chess(spec.fen);
  const flat = spec.style === "2d";
  const flip = spec.you === "b";
  const checkSq = (() => {
    if (!chess.isCheck()) return null;
    for (const row of chess.board())
      for (const p of row) if (p && p.type === "k" && p.color === chess.turn()) return p.square;
    return null;
  })();
  const colorOf = (sq: string, light: boolean) =>
    sq === checkSq
      ? spec.skin.check
      : spec.lastMove && (spec.lastMove.from === sq || spec.lastMove.to === sq)
        ? spec.skin.last
        : light
          ? spec.skin.lightSq
          : spec.skin.darkSq;

  // board space: x (file) and z (rank) in -4..4; project to the canvas
  let project: (x: number, z: number, y?: number) => [number, number, number];
  if (flat) {
    g.fillStyle = spec.skin.table;
    g.fillRect(0, 0, size, size);
    const m = size * 0.04;
    const cell = (size - 2 * m) / 8;
    project = (x, z) => [m + (x + 4) * cell, m + (4 - z) * cell, 1];
  } else {
    backdrop(g, size, spec.skin);
    const tilt = 0.86; // camera pitch (radians from horizontal)
    const dist = 13.5;
    const focal = size * 1.18;
    const cy = size * 0.5;
    project = (x, z, y = 0) => {
      // camera sits behind the near edge, pitched down at the board's center
      const w = -z; // toward the camera
      const cx = 0,
        cyw = dist * Math.sin(tilt),
        czw = dist * Math.cos(tilt);
      const rx = x - cx,
        ry = y - cyw,
        rz = w - czw;
      const depth = -(ry * Math.sin(tilt) + rz * Math.cos(tilt));
      const vy = ry * Math.cos(tilt) - rz * Math.sin(tilt);
      const s = focal / depth;
      return [size / 2 + rx * s, cy - vy * s, s];
    };
    // table slab
    const slab = 4.9;
    const corners = [
      project(-slab, slab),
      project(slab, slab),
      project(slab, -slab),
      project(-slab, -slab),
    ];
    const front = [project(-slab, -slab), project(slab, -slab)];
    g.fillStyle = mixHex(spec.skin.table, "#000000", 0.35);
    g.beginPath();
    g.moveTo(front[0][0], front[0][1]);
    g.lineTo(front[1][0], front[1][1]);
    g.lineTo(front[1][0], front[1][1] + size * 0.035);
    g.lineTo(front[0][0], front[0][1] + size * 0.035);
    g.closePath();
    g.fill();
    g.fillStyle = spec.skin.table;
    g.beginPath();
    corners.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.closePath();
    g.fill();
    if (spec.skin.ring) {
      g.strokeStyle = spec.skin.ring;
      g.lineWidth = 2;
      g.stroke();
    }
  }

  // squares (screen orientation: the player's side nearest)
  const toBoard = (file: number, rank: number) => {
    const fx = flip ? 7 - file : file;
    const rz = flip ? 7 - rank : rank;
    return { x: fx - 4, z: rz - 4 };
  };
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = `${"abcdefgh"[f]}${r + 1}`;
      const { x, z } = toBoard(f, r);
      const pts = [project(x, z + 1), project(x + 1, z + 1), project(x + 1, z), project(x, z)];
      g.fillStyle = colorOf(sq, (f + r) % 2 === 1);
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.closePath();
      g.fill();
    }
  }

  // pieces, far to near
  const list: { sq: string; type: string; color: "w" | "b"; x: number; z: number }[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p) continue;
      const f = p.square.charCodeAt(0) - 97;
      const r = Number(p.square[1]) - 1;
      const { x, z } = toBoard(f, r);
      list.push({ sq: p.square, type: p.type, color: p.color, x: x + 0.5, z: z + 0.5 });
    }
  }
  list.sort((a, b) => b.z - a.z);
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  for (const p of list) {
    const [px, py, s] = project(p.x, p.z);
    const fontPx = flat ? s * ((size * 0.92) / 8) * 0.86 : s * 1.18;
    if (!flat) {
      g.fillStyle = "rgba(0,0,0,0.32)";
      g.beginPath();
      g.ellipse(px, py, s * 0.34, s * 0.12, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.font = `${fontPx}px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif`;
    const baseY = flat ? py + fontPx * 0.36 : py + s * 0.08;
    g.lineWidth = Math.max(1.5, fontPx * 0.06);
    g.strokeStyle = p.color === "w" ? spec.skin.whiteStroke : spec.skin.blackStroke;
    g.fillStyle = p.color === "w" ? spec.skin.whitePiece : spec.skin.blackPiece;
    g.strokeText(GLYPH[p.type], px, baseY);
    g.fillText(GLYPH[p.type], px, baseY);
  }

  if (spec.mark) {
    const to = spec.lastMove?.to;
    if (to) {
      const f = to.charCodeAt(0) - 97;
      const r = Number(to[1]) - 1;
      const { x, z } = toBoard(f, r);
      const [px, py, s] = project(x + 0.5, z + 0.5);
      g.font = `${flat ? size * 0.09 : s * 0.9}px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
      g.fillText(
        spec.mark,
        px + (flat ? size * 0.04 : s * 0.35),
        py - (flat ? size * 0.03 : s * 0.95),
      );
    }
  }
  const url = canvas.toDataURL("image/webp", 0.86);
  cache.set(spec.key, url);
  return url;
}
