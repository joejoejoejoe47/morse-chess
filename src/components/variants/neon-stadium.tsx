import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { NeonSkyline } from "@/components/variants/neon-skyline";

/* The Galactic Football League stadium: a dark bowl, neon field, crowd and colored spotlights,
   all built from code (canvas textures, instanced meshes and lights). No images. */

export const TEAM = { w: "#2ee6ff", b: "#ff2d7a" } as const;
export type Scoreboard = { home: number; away: number; clock: string; note: string; homeName?: string; awayName?: string };

const PX = 160; // canvas pixels per board unit (crisp lines up close)
const FONT = `"Arial Black", "Helvetica Neue", Impact, "DejaVu Sans", sans-serif`;
export const MARGIN_L = 1; // field margin past each end zone (units)
export const MARGIN_W = 0.8; // sideline margin (units)

function glowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, glow: string, opts: { italic?: boolean; spacing?: number; stroke?: string } = {}) {
  ctx.save();
  ctx.font = `${opts.italic === false ? "" : "italic "}900 ${size}px ${FONT}`;
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${opts.spacing ?? 0}px`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = glow;
  ctx.shadowBlur = size * 0.45;
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = size * 0.15;
  ctx.fillText(text, x, y);
  if (opts.stroke) {
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(2, size * 0.045);
    ctx.strokeStyle = opts.stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.restore();
}

function shieldPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.bezierCurveTo(cx + w * 0.22, cy - h * 0.42, cx + w * 0.4, cy - h * 0.46, cx + w / 2, cy - h * 0.4);
  ctx.bezierCurveTo(cx + w * 0.52, cy + h * 0.05, cx + w * 0.3, cy + h * 0.34, cx, cy + h / 2);
  ctx.bezierCurveTo(cx - w * 0.3, cy + h * 0.34, cx - w * 0.52, cy + h * 0.05, cx - w / 2, cy - h * 0.4);
  ctx.bezierCurveTo(cx - w * 0.4, cy - h * 0.46, cx - w * 0.22, cy - h * 0.42, cx, cy - h / 2);
  ctx.closePath();
}

/** Knight-helmet shield crest, drawn at (cx, cy) with the given height. */
function crest(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number) {
  const w = h * 0.82;
  ctx.save();
  ctx.shadowColor = "#2ee6ff";
  ctx.shadowBlur = h * 0.18;
  shieldPath(ctx, cx, cy, w * 1.08, h * 1.06);
  ctx.fillStyle = "#ffb02e";
  ctx.fill();
  ctx.shadowBlur = 0;
  shieldPath(ctx, cx, cy, w, h);
  const g = ctx.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
  g.addColorStop(0, "#1c64ff");
  g.addColorStop(0.55, "#0b2a8a");
  g.addColorStop(1, "#06143f");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = h * 0.03;
  ctx.strokeStyle = "#7ff6ff";
  ctx.stroke();
  // helmet
  const hx = cx;
  const hy = cy - h * 0.08;
  const r = h * 0.2;
  ctx.beginPath();
  ctx.moveTo(hx - r, hy + r * 0.9);
  ctx.lineTo(hx - r, hy - r * 0.1);
  ctx.quadraticCurveTo(hx - r, hy - r * 1.15, hx, hy - r * 1.2);
  ctx.quadraticCurveTo(hx + r, hy - r * 1.15, hx + r, hy - r * 0.1);
  ctx.lineTo(hx + r, hy + r * 0.9);
  ctx.closePath();
  const steel = ctx.createLinearGradient(hx - r, hy, hx + r, hy);
  steel.addColorStop(0, "#9fb3c8");
  steel.addColorStop(0.5, "#eef6ff");
  steel.addColorStop(1, "#6d8198");
  ctx.fillStyle = steel;
  ctx.fill();
  ctx.lineWidth = h * 0.012;
  ctx.strokeStyle = "#0a1a3a";
  ctx.stroke();
  ctx.fillStyle = "#04102a"; // visor: eye slit and breathing holes
  ctx.beginPath();
  ctx.roundRect(hx - r * 0.8, hy - r * 0.22, r * 1.6, r * 0.24, r * 0.1);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = "#2ee6ff";
  ctx.shadowBlur = r * 0.5;
  ctx.fillStyle = "#7ff6ff";
  ctx.fillRect(hx - r * 0.6, hy - r * 0.14, r * 0.42, r * 0.08);
  ctx.fillRect(hx + r * 0.18, hy - r * 0.14, r * 0.42, r * 0.08);
  ctx.restore();
  ctx.fillStyle = "#c9d6e6"; // nose guard
  ctx.fillRect(hx - r * 0.07, hy - r * 0.3, r * 0.14, r * 0.42);
  ctx.fillStyle = "#04102a";
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hx + sx * r * (0.28 + i * 0.16), hy + r * 0.38 + i * r * 0.05, r * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  // plume
  ctx.beginPath();
  ctx.moveTo(hx, hy - r * 1.2);
  ctx.quadraticCurveTo(hx + r * 1.6, hy - r * 2.0, hx + r * 1.9, hy - r * 0.4);
  ctx.quadraticCurveTo(hx + r * 1.1, hy - r * 1.2, hx, hy - r * 0.9);
  ctx.fillStyle = "#ff8a1e";
  ctx.fill();
  // stars
  ctx.fillStyle = "#ffe9a8";
  for (const [dx, dy, s] of [[-0.3, -0.33, 0.03], [0.32, -0.3, 0.025], [-0.22, 0.2, 0.02], [0.25, 0.18, 0.022]] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx * w, cy + dy * h, s * h, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // ribbon text
  glowText(ctx, "NEBULA", cx, cy + h * 0.27, h * 0.17, "#ffd36a", "#ff8a1e", { stroke: "#3a1600", spacing: 2 });
  glowText(ctx, "KNIGHTS", cx, cy + h * 0.41, h * 0.12, "#7ff6ff", "#1c8cff", { stroke: "#021a3a", spacing: 3 });
}

/** End-zone corner emblem: the Knights' cyan helmet in a glowing ring. */
function helmetEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = "#2ee6ff";
  ctx.shadowBlur = s * 0.25;
  ctx.lineWidth = s * 0.05;
  ctx.strokeStyle = "#5ff4ff";
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(3,30,60,0.75)";
  ctx.fill();
  const r = s * 0.25;
  // football helmet in profile, facing right: shell, stripe, ear hole and face mask
  ctx.beginPath();
  ctx.ellipse(-r * 0.12, -r * 0.05, r * 1.0, r * 0.88, 0, Math.PI * 0.12, Math.PI * 1.98, false);
  ctx.lineTo(r * 0.55, r * 0.62);
  ctx.lineTo(-r * 0.2, r * 0.82);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, "#e6fdff");
  g.addColorStop(0.45, "#2ee6ff");
  g.addColorStop(1, "#0a5fa0");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#ffb02e"; // centre stripe
  ctx.lineWidth = s * 0.045;
  ctx.beginPath();
  ctx.ellipse(-r * 0.12, -r * 0.05, r * 0.86, r * 0.74, 0, Math.PI * 1.05, Math.PI * 1.78);
  ctx.stroke();
  ctx.fillStyle = "#03142a"; // ear hole
  ctx.beginPath();
  ctx.arc(-r * 0.12, r * 0.12, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#e8f6ff"; // face mask
  ctx.lineWidth = s * 0.03;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(r * 0.62, -r * 0.05);
  ctx.lineTo(r * 1.22, -r * 0.05);
  ctx.moveTo(r * 0.58, r * 0.3);
  ctx.lineTo(r * 1.22, r * 0.3);
  ctx.moveTo(r * 1.2, -r * 0.12);
  ctx.quadraticCurveTo(r * 1.32, r * 0.35, r * 0.95, r * 0.72);
  ctx.lineTo(r * 0.5, r * 0.66);
  ctx.stroke();
  ctx.restore();
}

/** End-zone corner emblem: the Phantoms' flaming magenta ghost. */
function phantomEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = "#ff2d7a";
  ctx.shadowBlur = s * 0.25;
  ctx.lineWidth = s * 0.05;
  ctx.strokeStyle = "#ff5fa8";
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(50,3,30,0.75)";
  ctx.fill();
  const r = s * 0.3;
  // flames behind
  ctx.fillStyle = "#ff8a1e";
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, r * 0.2);
  for (let i = 0; i <= 6; i++) {
    const x = -r * 0.8 + (i / 6) * r * 1.6;
    const top = -r * (1.05 + (i % 2 ? 0.45 : 0.1));
    ctx.quadraticCurveTo(x - r * 0.12, top * 0.7, x, top);
  }
  ctx.lineTo(r * 0.8, r * 0.2);
  ctx.fill();
  // ghost body
  ctx.beginPath();
  ctx.moveTo(-r * 0.65, r * 0.85);
  ctx.lineTo(-r * 0.65, -r * 0.2);
  ctx.quadraticCurveTo(-r * 0.65, -r * 0.95, 0, -r * 0.95);
  ctx.quadraticCurveTo(r * 0.65, -r * 0.95, r * 0.65, -r * 0.2);
  ctx.lineTo(r * 0.65, r * 0.85);
  for (let i = 0; i < 4; i++) {
    const x0 = r * 0.65 - (i / 4) * r * 1.3;
    ctx.quadraticCurveTo(x0 - r * 0.16, r * 0.55, x0 - r * 0.325, r * 0.85);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, "#ffd0ea");
  g.addColorStop(0.5, "#ff2d7a");
  g.addColorStop(1, "#8a0a50");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#200010"; // eyes and mouth
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * r * 0.25, -r * 0.3, r * 0.12, r * 0.18, sx * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, r * 0.15, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Text set around a circle (the ring of the centre crest). */
function arcText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number, mid: number, size: number, fill: string, glow: string, under = false) {
  ctx.save();
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.fillStyle = fill;
  ctx.shadowColor = glow;
  ctx.shadowBlur = size * 0.5;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const chars = [...text];
  const step = (size * 0.95) / r;
  const span = step * (chars.length - 1);
  chars.forEach((ch, i) => {
    const a = under ? mid + span / 2 - i * step : mid - span / 2 + i * step;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + (under ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** The ring behind the centre crest: two-tone neon, stars and the league name. */
function crestRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  ctx.save();
  const bg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
  bg.addColorStop(0, "rgba(20,40,120,0.55)");
  bg.addColorStop(1, "rgba(5,8,30,0.85)");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = R * 0.035;
  for (const [a0, a1, col] of [[Math.PI / 2, Math.PI * 1.5, "#2ee6ff"], [-Math.PI / 2, Math.PI / 2, "#ff2d7a"]] as const) {
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = R * 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.8, a0, a1);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#ffb02e";
  ctx.lineWidth = R * 0.012;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.9, 0, Math.PI * 2);
  ctx.stroke();
  arcText(ctx, "GALACTIC FOOTBALL", cx, cy, R * 0.9, -Math.PI / 2, R * 0.1, "#e8f6ff", "#6aa8ff");
  arcText(ctx, "LEAGUE", cx, cy, R * 0.9, Math.PI / 2, R * 0.1, "#ffe3a0", "#ff8a1e", true);
  ctx.fillStyle = "#ffe9a8";
  for (const a of [Math.PI * 0.18, Math.PI * 0.82, Math.PI * 1.82, Math.PI * 1.18]) {
    star(ctx, cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9, R * 0.045);
  }
  ctx.restore();
}

/** Field canvas.
 Length runs left→right (row 0 on the left), width top→bottom (column 0 at the top). */
function fieldCanvas(rows: number, cols: number, home: HomeTeam | null = null, day = false) {
  const W = (rows + MARGIN_L * 2) * PX;
  const H = Math.round((cols + MARGIN_W * 2) * PX);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const X = (k: number) => (MARGIN_L + k) * PX; // row boundary k
  const Y = (k: number) => (MARGIN_W + k) * PX; // column boundary k
  const top = Y(0);
  const bottom = Y(cols);
  ctx.fillStyle = day ? "#3d7d31" : "#050a12";
  ctx.fillRect(0, 0, W, H);
  // turf stripes, every half unit (5 yards); the park field is real daytime grass
  for (let i = 0; i < rows * 2; i++) {
    if (day) {
      // mown stripes: the mower lays the blades one way, then back, so the light and dark bands soften at the edges
      const g = ctx.createLinearGradient(X(i / 2), 0, X((i + 1) / 2), 0);
      const [a, b] = i % 2 ? ["#4a9238", "#3f8531"] : ["#62ad4a", "#58a443"];
      g.addColorStop(0, a);
      g.addColorStop(0.5, b);
      g.addColorStop(1, a);
      ctx.fillStyle = g;
    } else ctx.fillStyle = i % 2 ? "#0c2a24" : "#0a231f";
    ctx.fillRect(X(i / 2), top, PX / 2 + 1, bottom - top);
  }
  if (day) {
    // cross-mowing: faint stripes the other way give the checkerboard look of a cared-for field
    for (let j = 0; j < cols; j++) {
      if (j % 2) continue;
      ctx.fillStyle = "rgba(255,255,230,0.045)";
      ctx.fillRect(X(0), Y(j), X(rows) - X(0), PX);
    }
    // worn patches between the hashes, where the play happens most
    const wear = mulberry(19);
    for (let i = 0; i < 26; i++) {
      const x = X(2) + wear() * (X(rows - 2) - X(2));
      const y = Y(cols * 0.3) + wear() * (Y(cols * 0.7) - Y(cols * 0.3));
      const r = PX * (0.25 + wear() * 0.5);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(120,110,60,0.16)");
      g.addColorStop(1, "rgba(120,110,60,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // fine turf grain
  const rnd = mulberry(7);
  if (day) {
    // single blades: thin strokes leaning with the mowing, light tips and dark roots
    ctx.lineWidth = 1;
    for (let i = 0; i < 42000; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const stripe = Math.floor((x - X(0)) / (PX / 2));
      const lean = (stripe % 2 ? 1 : -1) * (0.6 + rnd() * 1.4);
      const len = 2 + rnd() * 4;
      ctx.strokeStyle = rnd() > 0.45 ? `rgba(170,220,110,${0.08 + rnd() * 0.12})` : `rgba(18,55,14,${0.08 + rnd() * 0.14})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lean, y - len);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(${rnd() > 0.5 ? "60,140,110" : "0,0,0"},${0.05 + rnd() * 0.06})`;
      ctx.fillRect(X(0) + rnd() * (X(rows) - X(0)), top + rnd() * (bottom - top), 2, 2 + rnd() * 4);
    }
  }
  // end zones
  const zone = (k0: number, k1: number, a: string, b: string) => {
    const g = ctx.createLinearGradient(X(k0), 0, X(k1), 0);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(X(k0), top, X(k1) - X(k0), bottom - top);
  };
  if (day) {
    zone(0, 2, "rgba(16,150,215,0.85)", "rgba(10,110,180,0.7)");
    zone(rows - 2, rows, "rgba(110,40,170,0.75)", "rgba(160,50,200,0.85)");
  } else {
    zone(0, 2, "rgba(10,120,190,0.55)", "rgba(6,60,110,0.35)");
    zone(rows - 2, rows, "rgba(120,10,70,0.35)", "rgba(200,20,90,0.55)");
  }
  // diagonal energy hatching in the end zones
  ctx.save();
  ctx.lineWidth = 3;
  for (const [k0, col] of [[0, "rgba(46,230,255,0.10)"], [rows - 2, "rgba(255,45,122,0.10)"]] as const) {
    ctx.beginPath();
    ctx.rect(X(k0), top, 2 * PX, bottom - top);
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = col;
    for (let s = -H; s < 2 * PX + H; s += 26) {
      ctx.beginPath();
      ctx.moveTo(X(k0) + s, top);
      ctx.lineTo(X(k0) + s - (bottom - top), bottom);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  // end zone names, read along the zone
  ctx.save();
  ctx.translate(X(1), (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  if (home) {
    // the player's own team name in their end zone, in their colour (one or two lines)
    const words = home.name.toUpperCase().split(" ");
    const top = words.length > 1 ? words.slice(0, Math.ceil(words.length / 2)).join(" ") : "";
    const bottom = words.length > 1 ? words.slice(Math.ceil(words.length / 2)).join(" ") : words[0];
    const fit = (t: string, base: number) => Math.min(base, (PX * 7.4) / Math.max(1, t.length * 0.78));
    const glow = home.color;
    const fill = mixHex(home.color, "#ffffff", 0.45);
    if (top) glowText(ctx, top, 0, -PX * 0.36, fit(top, PX * 0.78), fill, glow, { stroke: "#020814", spacing: 10 });
    glowText(ctx, bottom, 0, top ? PX * 0.42 : PX * 0.1, fit(bottom, top ? PX * 0.6 : PX * 0.86), fill, glow, { stroke: "#020814", spacing: 10 });
  } else {
    glowText(ctx, "NEBULA", 0, -PX * 0.36, PX * 0.78, "#5ff4ff", "#00a8ff", { stroke: "#012238", spacing: 10 });
    glowText(ctx, "KNIGHTS", 0, PX * 0.42, PX * 0.6, "#ffb02e", "#ff7a00", { stroke: "#2a1200", spacing: 10 });
  }
  ctx.restore();
  ctx.save();
  ctx.translate(X(rows - 1), (top + bottom) / 2);
  ctx.rotate(Math.PI / 2);
  glowText(ctx, "PLASMA", 0, -PX * 0.36, PX * 0.78, "#ff5fc0", "#ff0a6c", { stroke: "#300018", spacing: 10 });
  glowText(ctx, "PHANTOMS", 0, PX * 0.42, PX * 0.56, "#c98bff", "#8a2bff", { stroke: "#1a0030", spacing: 8 });
  ctx.restore();
  // faint square grid so moves still read like a board
  ctx.save();
  ctx.strokeStyle = day ? "rgba(255,255,255,0.12)" : "rgba(160,255,230,0.07)";
  ctx.lineWidth = 2;
  for (let f = 1; f < cols; f++) {
    ctx.beginPath();
    ctx.moveTo(X(2), Y(f));
    ctx.lineTo(X(rows - 2), Y(f));
    ctx.stroke();
  }
  ctx.restore();
  // hash marks every yard near the hash lines and sidelines
  ctx.save();
  for (let y = 0; y <= (rows - 4) * 10; y++) {
    const x = X(2) + (y / 10) * PX;
    const half = x < X(rows / 2) ? "rgba(190,250,255,0.55)" : "rgba(255,190,215,0.55)";
    ctx.fillStyle = half;
    if (y % 10 === 0) continue;
    const len = y % 5 === 0 ? PX * 0.16 : PX * 0.09;
    for (const yy of [top + 6, Y(cols / 2 - 1.25), Y(cols / 2 + 1.25), bottom - 6 - len]) ctx.fillRect(x - 1.5, yy, 3, len);
  }
  ctx.restore();
  // yard lines
  for (let k = 2; k <= rows - 2; k++) {
    const goal = k === 2 || k === rows - 2;
    const mid = k === rows / 2;
    const col = mid ? "#f4fbff" : k < rows / 2 ? "#a8f3ff" : "#ffb3cf";
    const glow = mid ? "#ffffff" : k < rows / 2 ? "#00d0ff" : "#ff2d7a";
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = goal ? 26 : 16;
    ctx.fillStyle = col;
    const w = goal ? 9 : mid ? 7 : 5;
    ctx.fillRect(X(k) - w / 2, top, w, bottom - top);
    ctx.fillRect(X(k) - w / 2, top, w, bottom - top);
    ctx.restore();
  }
  // yard numbers 10..50..10, both sidelines, with the little goal-ward arrows
  for (let k = 3; k <= rows - 3; k++) {
    const yards = 10 * Math.min(k - 2, rows - 2 - k);
    const left = k < rows / 2;
    const fill = k === rows / 2 ? "#ffffff" : left ? "#9ff6ff" : "#ff9cc2";
    const glow = k === rows / 2 ? "#a0e8ff" : left ? "#00c8ff" : "#ff2d7a";
    for (const [y, flip] of [[bottom - PX * 0.95, false], [top + PX * 0.95, true]] as const) {
      ctx.save();
      ctx.translate(X(k), y);
      if (flip) ctx.rotate(Math.PI);
      glowText(ctx, String(yards), 0, 0, PX * 0.42, fill, glow, { italic: false, spacing: 2 });
      if (yards !== 50) {
        const dir = left !== flip ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(dir * PX * 0.36, -PX * 0.07);
        ctx.lineTo(dir * PX * 0.36, PX * 0.09);
        ctx.lineTo(dir * PX * 0.46, PX * 0.01);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.shadowColor = glow;
        ctx.shadowBlur = 10;
        ctx.fill();
      }
      ctx.restore();
    }
  }
  // neon boundary, cyan half then magenta half
  ctx.save();
  ctx.lineWidth = 10;
  ctx.shadowBlur = 34;
  for (const [a, b, col] of [[0, rows / 2, "#2ee6ff"], [rows / 2, rows, "#ff2d7a"]] as const) {
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.beginPath();
    ctx.moveTo(X(rows / 2), top);
    ctx.lineTo(X(a === 0 ? 0 : rows), top);
    ctx.lineTo(X(a === 0 ? 0 : rows), bottom);
    ctx.lineTo(X(rows / 2), bottom);
    ctx.stroke();
    ctx.stroke();
    void b;
  }
  ctx.restore();
  // end-zone corner emblems, read from each end like the lettering
  for (const [k, draw, rot] of [[1, helmetEmblem, -Math.PI / 2], [rows - 1, phantomEmblem, Math.PI / 2]] as const) {
    for (const y of [Y(0.85), Y(cols - 0.85)]) {
      ctx.save();
      ctx.translate(X(k), y);
      ctx.rotate(rot);
      draw(ctx, 0, 0, PX * 1.25);
      ctx.restore();
    }
  }
  // center crest on its two-tone ring
  crestRing(ctx, X(rows / 2), (top + bottom) / 2, PX * 1.72);
  crest(ctx, X(rows / 2), (top + bottom) / 2, PX * 2.35);
  return c;
}

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function Field({ rows, cols, home, day = false, grass = null }: { rows: number; cols: number; home: HomeTeam | null; day?: boolean; grass?: THREE.Texture | null }) {
  const tex = useMemo(() => canvasTex(fieldCanvas(rows, cols, home, day)), [rows, cols, home?.name, home?.color, day]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.dispose(), [tex]);
  const L = rows + MARGIN_L * 2;
  const Wd = cols + MARGIN_W * 2;
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.125, 0]} receiveShadow>
        <planeGeometry args={[L, Wd]} />
        {/* the park field (t204u): real grass blades in the light, so the sun and shadows read on it */}
        <meshStandardMaterial
          key={grass ? "g" : "p"}
          map={tex}
          emissiveMap={tex}
          emissive="#ffffff"
          emissiveIntensity={day ? (grass ? 0.06 : 0.14) : 0.62}
          roughness={day ? 0.96 : 0.9}
          metalness={0}
          normalMap={grass ?? undefined}
          normalScale={grass ? new THREE.Vector2(0.9, 0.9) : undefined}
        />
      </mesh>
    </group>
  );
}

/* ── Stands ── */

const TIERS = 13;
const STEP_OUT = 0.62;
const STEP_UP = 0.36;

function roundRect(shape: THREE.Shape | THREE.Path, hw: number, hl: number, r: number) {
  shape.moveTo(-hw + r, -hl);
  shape.lineTo(hw - r, -hl);
  shape.quadraticCurveTo(hw, -hl, hw, -hl + r);
  shape.lineTo(hw, hl - r);
  shape.quadraticCurveTo(hw, hl, hw - r, hl);
  shape.lineTo(-hw + r, hl);
  shape.quadraticCurveTo(-hw, hl, -hw, hl - r);
  shape.lineTo(-hw, -hl + r);
  shape.quadraticCurveTo(-hw, -hl, -hw + r, -hl);
}

/** Points along a rounded rectangle perimeter, spaced `gap` apart. */
function perimeter(hw: number, hl: number, r: number, gap: number) {
  const shape = new THREE.Shape();
  roundRect(shape, hw, hl, r);
  const len = 2 * (2 * (hw - r) + 2 * (hl - r)) + 2 * Math.PI * r;
  const n = Math.floor(len / gap);
  return shape.getSpacedPoints(n).slice(0, n);
}

function Stands({ hw, hl }: { hw: number; hl: number }) {
  const tiers = useMemo(() => {
    const out: THREE.ExtrudeGeometry[] = [];
    for (let i = 0; i < TIERS; i++) {
      const w = hw + i * STEP_OUT;
      const l = hl + i * STEP_OUT;
      const s = new THREE.Shape();
      roundRect(s, w + STEP_OUT + 0.02, l + STEP_OUT + 0.02, 1.4 + i * STEP_OUT);
      const hole = new THREE.Path();
      roundRect(hole, w, l, 1.2 + i * STEP_OUT);
      s.holes.push(hole);
      out.push(new THREE.ExtrudeGeometry(s, { depth: STEP_UP * (i + 1) + 0.6, bevelEnabled: false, curveSegments: 10 }));
    }
    return out;
  }, [hw, hl]);
  useEffect(() => () => tiers.forEach((g) => g.dispose()), [tiers]);
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      {tiers.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshStandardMaterial color={i % 2 ? "#151b36" : "#1b2244"} roughness={0.9} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

/** Fans glow faintly in their own shirt colour so the stands read even far from the lamps. */
function selfLit(shader: { fragmentShader: string }) {
  shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.12;");
}

/** A cheer from the crowd: `level` 1 is a touchdown, smaller numbers are big plays. */
export type Hype = { id: number; level: number };

type CrowdUniforms = { uTime: { value: number }; uWave: { value: number }; uWave2: { value: number }; uWave2On: { value: number }; uHype: { value: number } };

/* The crowd moves on the GPU: every fan has a seat angle around the bowl, and a Mexican wave
   (one front, two when the crowd is excited) sweeps that angle. Fans under the front stand,
   throw their arms up and some jump; on big plays everyone jumps and waves. */
const CROWD_GLSL = `
uniform float uTime; uniform float uWave; uniform float uWave2; uniform float uWave2On; uniform float uHype;
attribute vec3 aSeat;
float crowdFront(float d) { return d > 0.0 ? exp(-(d * d) / 0.035) : exp(-(d * d) / 0.32); }
float crowdWrap(float a) { return mod(a + 3.14159265, 6.2831853) - 3.14159265; }
`;
function crowdMaterial(kind: "body" | "head" | "arm" | "stick" | "flag", uni: CrowdUniforms) {
  const mat = kind === "stick" || kind === "flag" ? new THREE.MeshBasicMaterial({ toneMapped: false, side: kind === "flag" ? THREE.DoubleSide : THREE.FrontSide }) : new THREE.MeshStandardMaterial({ roughness: kind === "head" ? 0.7 : 0.75 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uni);
    if (kind !== "stick" && kind !== "flag") selfLit(shader);
    shader.vertexShader = CROWD_GLSL + shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float jitter = 0.05 * sin(aSeat.y * 3.0);
      float w = crowdFront(crowdWrap(aSeat.x + jitter - uWave));
      w = max(w, uWave2On * crowdFront(crowdWrap(aSeat.x + jitter - uWave2)));
      float hop = aSeat.z * smoothstep(0.45, 0.8, w) * abs(sin(uTime * 8.0 + aSeat.y)) * 0.09;
      hop += uHype * abs(sin(uTime * (6.5 + mod(aSeat.y, 2.0)) + aSeat.y)) * 0.13;
      float lift = w * 0.13 + hop + 0.012 * sin(uTime * 1.7 + aSeat.y);
      float raise = max(w, uHype * (0.6 + 0.4 * sin(uTime * 5.0 + aSeat.y * 1.7)));
      ${kind === "arm" ? "transformed.x += sign(transformed.x) * transformed.y * 0.35 * raise; transformed.y *= raise;" : ""}
      ${kind === "stick" || kind === "flag" ? "lift += raise * 0.14;" : ""}
      ${kind === "flag" ? "transformed.z += sin(uTime * (6.0 + uHype * 4.0) + aSeat.y * 3.0 - position.x * 30.0) * 0.03 * max(0.0, position.x) / 0.17;" : ""}
      transformed.y += lift;`,
    );
  };
  mat.customProgramCacheKey = () => `gfl-crowd-${kind}`;
  return mat;
}

function armGeometry() {
  const parts = [-1, 1].map((side) => {
    const g = new THREE.BoxGeometry(0.034, 0.17, 0.034);
    g.translate(side * 0.088, 0.085, 0);
    return g;
  });
  const merged = new THREE.BufferGeometry();
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of parts) {
    const gi = g.index!;
    pos.push(...(g.attributes.position.array as Float32Array));
    nor.push(...(g.attributes.normal.array as Float32Array));
    for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + base);
    base += g.attributes.position.count;
    g.dispose();
  }
  merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  merged.setIndex(idx);
  return merged;
}

/** A hand-held flag: a thin pole with a cloth to its right (the cloth flutters in the shader). */
function flagGeometry() {
  const pole = new THREE.BoxGeometry(0.012, 0.34, 0.012);
  pole.translate(0, 0.17, 0);
  const cloth = new THREE.PlaneGeometry(0.17, 0.11, 5, 1);
  cloth.translate(0.085, 0.28, 0);
  const g = mergeGeometries([pole, cloth])!;
  pole.dispose();
  cloth.dispose();
  return g;
}

function Crowd({ hw, hl, hype }: { hw: number; hl: number; hype?: Hype | null }) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const arms = useRef<THREE.InstancedMesh>(null);
  const sticks = useRef<THREE.InstancedMesh>(null);
  const flags = useRef<THREE.InstancedMesh>(null);
  const seats = useMemo(() => {
    const rnd = mulberry(42);
    const list: { x: number; y: number; z: number; team: "w" | "b" | "n"; ph: number; stick: boolean; flag: boolean; jumper: boolean }[] = [];
    for (let i = 1; i < TIERS; i++) {
      const w = hw + i * STEP_OUT + STEP_OUT * 0.5;
      const l = hl + i * STEP_OUT + STEP_OUT * 0.5;
      for (const p of perimeter(w, l, 1.2 + i * STEP_OUT + STEP_OUT * 0.5, 0.165)) {
        if (rnd() < 0.08) continue; // a few empty seats
        // world: shape x → x, shape y → -z after the stands' rotation
        const x = p.x + (rnd() - 0.5) * 0.06;
        const z = -p.y + (rnd() - 0.5) * 0.06;
        const side = z > 0 ? "w" : "b";
        const roll = rnd();
        const held = rnd();
        list.push({ x, y: STEP_UP * (i + 1) - 0.6 + 0.62, z, team: roll < 0.62 ? side : roll < 0.8 ? (side === "w" ? "b" : "w") : "n", ph: rnd() * Math.PI * 2, stick: held < 0.18, flag: held > 0.93, jumper: rnd() < 0.3 });
      }
    }
    return list;
  }, [hw, hl]);
  const palette = useMemo(
    () => ({
      w: ["#1559c8", "#1aa0d8", "#2c3fc0", "#0db8d0", "#d07a1c"].map((c) => new THREE.Color(c)),
      b: ["#d0225f", "#9c0c3a", "#c83c92", "#6c22c8", "#c84620"].map((c) => new THREE.Color(c)),
      n: ["#2a2f45", "#5a5f70", "#c8c2b8", "#1a1d29", "#ffd23a"].map((c) => new THREE.Color(c)),
      skin: ["#f1c9a5", "#c98b5e", "#8d5a3b", "#5e3a24", "#e8b38c"].map((c) => new THREE.Color(c)),
    }),
    [],
  );
  const uni = useMemo<CrowdUniforms>(() => ({ uTime: { value: 0 }, uWave: { value: 0 }, uWave2: { value: Math.PI }, uWave2On: { value: 0 }, uHype: { value: 0 } }), []);
  const mats = useMemo(() => ({ body: crowdMaterial("body", uni), head: crowdMaterial("head", uni), arm: crowdMaterial("arm", uni), stick: crowdMaterial("stick", uni), flag: crowdMaterial("flag", uni) }), [uni]);
  const armGeo = useMemo(() => armGeometry(), []);
  const flagGeo = useMemo(() => flagGeometry(), []);
  useEffect(() => () => { Object.values(mats).forEach((m) => m.dispose()); armGeo.dispose(); flagGeo.dispose(); }, [mats, armGeo, flagGeo]);
  useEffect(() => {
    const m = new THREE.Matrix4();
    const rnd = mulberry(9);
    const sticksList = seats.filter((s) => s.stick);
    const seatAttr = (list: typeof seats) => {
      const a = new Float32Array(list.length * 3);
      list.forEach((s, i) => {
        a[i * 3] = Math.atan2(s.z / hl, s.x / hw);
        a[i * 3 + 1] = s.ph;
        a[i * 3 + 2] = s.jumper ? 1 : 0;
      });
      return new THREE.InstancedBufferAttribute(a, 3);
    };
    const all = seatAttr(seats);
    for (const ref of [bodies, heads, arms]) ref.current?.geometry.setAttribute("aSeat", all);
    sticks.current?.geometry.setAttribute("aSeat", seatAttr(sticksList));
    const flagsList = seats.filter((s) => s.flag);
    flags.current?.geometry.setAttribute("aSeat", seatAttr(flagsList));
    flagsList.forEach((s, i) => {
      m.makeRotationY(Math.atan2(-s.x, -s.z) + Math.PI / 2);
      m.setPosition(s.x, s.y + 0.22, s.z);
      flags.current?.setMatrixAt(i, m);
      flags.current?.setColorAt(i, new THREE.Color(s.team === "b" ? "#ff2d7a" : s.team === "w" ? "#2ee6ff" : "#ffb02e"));
    });
    seats.forEach((s, i) => {
      const face = Math.atan2(-s.x, -s.z);
      m.makeRotationY(face);
      m.setPosition(s.x, s.y + 0.12, s.z);
      bodies.current?.setMatrixAt(i, m);
      const shirt = palette[s.team][Math.floor(rnd() * 5)];
      bodies.current?.setColorAt(i, shirt);
      m.setPosition(s.x, s.y + 0.2, s.z);
      arms.current?.setMatrixAt(i, m);
      arms.current?.setColorAt(i, shirt);
      m.setPosition(s.x, s.y + 0.29, s.z);
      heads.current?.setMatrixAt(i, m);
      heads.current?.setColorAt(i, palette.skin[Math.floor(rnd() * 5)]);
    });
    sticksList.forEach((s, i) => {
      m.makeTranslation(s.x, s.y + 0.46, s.z);
      sticks.current?.setMatrixAt(i, m);
      sticks.current?.setColorAt(i, new THREE.Color(s.team === "b" ? "#ff3b8f" : s.team === "w" ? "#45f0ff" : "#fff1a0"));
    });
    for (const ref of [bodies, heads, arms, sticks, flags]) {
      if (!ref.current) continue;
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [seats, palette, hw, hl]);
  const level = useRef(0);
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!hype || hype.id === seen.current) return;
    seen.current = hype.id;
    level.current = Math.max(level.current, hype.level);
  }, [hype]);
  useFrame(({ clock }, raw) => {
    const dt = Math.min(raw, 0.1);
    level.current = Math.max(0, level.current - dt * 0.15);
    const h = level.current;
    uni.uTime.value = clock.elapsedTime;
    // the wave laps the bowl in about 8 s; an excited crowd runs two waves, faster
    uni.uWave.value = (uni.uWave.value + dt * (0.78 + 1.2 * h)) % (Math.PI * 2);
    uni.uWave2.value = uni.uWave.value + Math.PI;
    uni.uWave2On.value += ((h > 0.25 ? 1 : 0) - uni.uWave2On.value) * (1 - Math.exp(-3 * dt));
    uni.uHype.value = Math.min(1, h * 1.15);
  });
  const nSticks = seats.filter((s) => s.stick).length;
  const nFlags = seats.filter((s) => s.flag).length;
  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, mats.body, seats.length]} frustumCulled={false}>
        <boxGeometry args={[0.15, 0.22, 0.1]} />
      </instancedMesh>
      <instancedMesh ref={arms} args={[armGeo, mats.arm, seats.length]} frustumCulled={false} />
      <instancedMesh ref={heads} args={[undefined, mats.head, seats.length]} frustumCulled={false}>
        <sphereGeometry args={[0.056, 8, 6]} />
      </instancedMesh>
      <instancedMesh ref={sticks} args={[undefined, mats.stick, Math.max(1, nSticks)]} frustumCulled={false}>
        <sphereGeometry args={[0.045, 6, 4]} />
      </instancedMesh>
      <instancedMesh ref={flags} args={[flagGeo, mats.flag, Math.max(1, nFlags)]} frustumCulled={false} />
    </group>
  );
}

/* ── Neon trims, banners and boards ── */

function NeonWall({ hw, hl, home }: { hw: number; hl: number; home: HomeTeam | null }) {
  // the low wall around the field: an LED ad ribbon, cyan on the Knights' half, magenta on the Phantoms' half
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 2048;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#03060d";
    ctx.fillRect(0, 0, 2048, 64);
    const words = ["GFL", "NEBULA KNIGHTS", "GALACTIC FOOTBALL LEAGUE", "PLASMA PHANTOMS", "GO KNIGHTS!", "GFL CHAMPIONSHIP"];
    let x = 30;
    let i = 0;
    while (x < 2048) {
      const word = words[i % words.length];
      const col = i % 2 ? "#ff4f9a" : "#4ff0ff";
      ctx.font = `italic 900 36px ${FONT}`;
      const w = ctx.measureText(word).width;
      glowText(ctx, word, x + w / 2, 33, 36, col, col, { spacing: 2 });
      x += w + 90;
      i++;
    }
    const t = canvasTex(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  }, []);
  // the far sideline carries the team names, like the reference: each half in its team's colour
  const teamTex = useMemo(() => {
    const make = (name: string, col: string, glow: string) => {
      const c = document.createElement("canvas");
      c.width = 2048;
      c.height = 96;
      const ctx = c.getContext("2d")!;
      const g = ctx.createLinearGradient(0, 0, 0, 96);
      g.addColorStop(0, "#05081a");
      g.addColorStop(0.5, "#0b0f2a");
      g.addColorStop(1, "#05081a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 2048, 96);
      glowText(ctx, name, 1024, 50, 64, col, glow, { spacing: 14 });
      ctx.save();
      ctx.fillStyle = col;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 14;
      for (const x of [160, 300, 1748, 1888]) star(ctx, x, 48, 18);
      ctx.restore();
      return canvasTex(c);
    };
    return {
      w: home ? make(home.name.toUpperCase(), mixHex(home.color, "#ffffff", 0.55), home.color) : make("NEBULA KNIGHTS", "#9ff8ff", "#1cc8ff"),
      b: make("PLASMA PHANTOMS", "#ffb3d6", "#ff2d7a"),
    };
  }, [home?.name, home?.color]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { tex.dispose(); teamTex.w.dispose(); teamTex.b.dispose(); }, [tex, teamTex]);
  const h = 0.42;
  const sides: { pos: [number, number, number]; rot: number; len: number; col: string; team?: "w" | "b" }[] = [
    { pos: [hw, h / 2, hl / 2], rot: -Math.PI / 2, len: hl, col: TEAM.w },
    { pos: [hw, h / 2, -hl / 2], rot: -Math.PI / 2, len: hl, col: TEAM.b },
    { pos: [-hw, h / 2, hl / 2], rot: Math.PI / 2, len: hl, col: home?.color ?? TEAM.w, team: "w" },
    { pos: [-hw, h / 2, -hl / 2], rot: Math.PI / 2, len: hl, col: TEAM.b, team: "b" },
    { pos: [0, h / 2, hl], rot: Math.PI, len: hw * 2, col: TEAM.w },
    { pos: [0, h / 2, -hl], rot: 0, len: hw * 2, col: TEAM.b },
  ];
  return (
    <group>
      {sides.map((s, i) => (
        <group key={i} position={s.pos} rotation={[0, s.rot, 0]}>
          <mesh>
            <planeGeometry args={[s.len, h]} />
            <meshBasicMaterial map={s.team ? teamTex[s.team] : tex} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, h / 2 + 0.02, 0]}>
            <boxGeometry args={[s.len, 0.045, 0.045]} />
            <meshBasicMaterial color={s.col} toneMapped={false} />
          </mesh>
          <mesh position={[0, -h / 2 + 0.01, 0]}>
            <boxGeometry args={[s.len, 0.03, 0.03]} />
            <meshBasicMaterial color={s.col} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function boardCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  return canvasTex(c);
}

function frame(ctx: CanvasRenderingContext2D, w: number, h: number, a: string, b: string, r = 28) {
  ctx.fillStyle = "#050814";
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, r);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.save();
  ctx.lineWidth = 8;
  ctx.strokeStyle = g;
  ctx.shadowColor = a;
  ctx.shadowBlur = 24;
  ctx.stroke();
  ctx.restore();
}

function TopBanner({ x, y }: { x: number; y: number }) {
  const champ = useMemo(
    () =>
      boardCanvas(1024, 192, (ctx) => {
        frame(ctx, 1024, 192, "#b04bff", "#4f7bff", 40);
        glowText(ctx, "GFL CHAMPIONSHIP", 512, 100, 70, "#f3e9ff", "#b04bff", { spacing: 8 });
      }),
    [],
  );
  const teams = useMemo(
    () =>
      boardCanvas(1600, 128, (ctx) => {
        frame(ctx, 1600, 128, "#2ee6ff", "#ff2d7a", 20);
        glowText(ctx, "NEBULA KNIGHTS", 420, 66, 62, "#6ff3ff", "#00a8ff", { spacing: 4 });
        glowText(ctx, "VS", 800, 66, 54, "#ffffff", "#c070ff");
        glowText(ctx, "PLASMA PHANTOMS", 1180, 66, 62, "#ff6fc0", "#ff0a6c", { spacing: 4 });
      }),
    [],
  );
  useEffect(() => () => { champ.dispose(); teams.dispose(); }, [champ, teams]);
  return (
    <group position={[x, y, 0]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 1.05, 0]} rotation={[-0.2, 0, 0]}>
        <planeGeometry args={[5.0, 0.94]} />
        <meshBasicMaterial map={champ} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.3]} rotation={[-0.35, 0, 0]}>
        <planeGeometry args={[11, 0.88]} />
        <meshBasicMaterial map={teams} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Pennant({ position, rotY, text, sub, a, b }: { position: [number, number, number]; rotY: number; text: string; sub: string; a: string; b: string }) {
  const tex = useMemo(
    () =>
      boardCanvas(512, 384, (ctx) => {
        frame(ctx, 512, 384, a, b, 30);
        glowText(ctx, text, 256, 160, 120, "#ffffff", a, { spacing: 6 });
        glowText(ctx, sub, 256, 270, 52, b, b, { spacing: 4 });
      }),
    [text, sub, a, b],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh rotation={[-0.25, 0, 0]}>
        <planeGeometry args={[2.4, 1.8]} />
        <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/* ── Light ── */

export function glowSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const beamVert = `
varying float vY; varying vec3 vN; varying vec3 vV;
uniform float uH;
void main(){
  vY = position.y / uH + 0.5;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const beamFrag = `
varying float vY; varying vec3 vN; varying vec3 vV;
uniform vec3 uColor; uniform float uOpacity;
void main(){
  float edge = pow(abs(dot(vN, vV)), 1.6);
  float a = (0.12 + 0.88 * pow(vY, 0.9)) * edge * uOpacity;
  gl_FragColor = vec4(uColor, a);
}`;

function Beam({ from, to, color, width = 1.4, opacity = 0.32 }: { from: THREE.Vector3; to: THREE.Vector3; color: string; width?: number; opacity?: number }) {
  const len = from.distanceTo(to);
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uH: { value: len } }), [color, opacity, len]);
  return (
    <mesh position={mid} quaternion={quat} renderOrder={5}>
      <cylinderGeometry args={[0.06, width, len, 24, 1, true]} />
      <shaderMaterial vertexShader={beamVert} fragmentShader={beamFrag} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Rig({ hw, hl }: { hw: number; hl: number }) {
  const sprite = useMemo(() => glowSprite(), []);
  useEffect(() => () => sprite.dispose(), [sprite]);
  const top = STEP_UP * TIERS + 1.3;
  const out = (TIERS - 1) * STEP_OUT;
  const rigs = useMemo(() => {
    const far = -(hw + out);
    return [
      { at: new THREE.Vector3(far, top, 5.2), aim: new THREE.Vector3(1.2, 0, 3.2), color: "#22d3ff" },
      { at: new THREE.Vector3(far + 0.3, top + 0.6, 1.8), aim: new THREE.Vector3(-0.5, 0, 1.2), color: "#3a5bff" },
      { at: new THREE.Vector3(far, top + 0.8, -1.4), aim: new THREE.Vector3(0.4, 0, -0.8), color: "#b04bff" },
      { at: new THREE.Vector3(far + 0.3, top + 0.4, -4.4), aim: new THREE.Vector3(-0.8, 0, -3.4), color: "#ff8a1e" },
      { at: new THREE.Vector3(far, top, -7.4), aim: new THREE.Vector3(1, 0, -5.4), color: "#ff2d7a" },
      { at: new THREE.Vector3(-1.5, top - 0.6, hl + out), aim: new THREE.Vector3(0.5, 0, 4.5), color: "#2ee6ff" },
      { at: new THREE.Vector3(-1.5, top - 0.6, -(hl + out)), aim: new THREE.Vector3(0.5, 0, -4.5), color: "#ff3b8f" },
    ];
  }, [hw, hl, out, top]);
  return (
    <group>
      {rigs.map((r, i) => (
        <group key={i}>
          <Lamp at={r.at} aim={r.aim} color={r.color} />
          <Beam from={r.at} to={r.aim} color={r.color} width={1.9} opacity={0.5} />
          <sprite position={r.at} scale={[1.6, 1.6, 1]}>
            <spriteMaterial map={sprite} color={r.color} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </sprite>
          <mesh position={r.at}>
            <boxGeometry args={[0.5, 0.3, 0.5]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Lamp({ at, aim, color }: { at: THREE.Vector3; aim: THREE.Vector3; color: string }) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.copy(aim);
    return o;
  }, [aim]);
  useEffect(() => {
    if (light.current) light.current.target = target;
  }, [target]);
  return (
    <>
      <primitive object={target} />
      <spotLight ref={light} position={at} color={color} intensity={34} angle={0.36} penumbra={0.7} decay={1} distance={0} />
    </>
  );
}

/* ── Stadium dressing: goal posts, sideline teams, upper deck, neon trim, sweeping beams ── */

/** A strip standing on a closed path of points (u runs along it), for lit bands and neon trim. */
function bandGeometry(pts: THREE.Vector2[], y0: number, y1: number, uPer: number, color?: (x: number, z: number) => THREE.Color) {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let d = 0;
  const n = pts.length;
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    if (i > 0) d += p.distanceTo(pts[(i - 1) % n]);
    // shape x → world x, shape y → world -z (the stands are rotated the same way)
    pos.push(p.x, y0, -p.y, p.x, y1, -p.y);
    uv.push(d / uPer, 0, d / uPer, 1);
    if (color) {
      const c = color(p.x, -p.y);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (color) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

const CYAN = new THREE.Color("#2ee6ff");
const MAGENTA = new THREE.Color("#ff2d7a");
const PURPLE = new THREE.Color("#a04bff");
/** Cyan on the Knights' half (+z), magenta on the Phantoms' half, purple where they meet. */
const teamTint = (_x: number, z: number) => {
  const u = THREE.MathUtils.smoothstep(z, -2.5, 2.5);
  return u > 0.5 ? PURPLE.clone().lerp(CYAN, (u - 0.5) * 2) : MAGENTA.clone().lerp(PURPLE, u * 2);
};

/** Neon trim on the bowl plus the lit upper deck of suites above the top row. */
function BowlLights({ hw, hl }: { hw: number; hl: number }) {
  const parts = useMemo(() => {
    const ring = (i: number, r: number, pad: number) => {
      const shape = new THREE.Shape();
      roundRect(shape, hw + i * STEP_OUT + pad, hl + i * STEP_OUT + pad, r);
      return shape.getSpacedPoints(240);
    };
    const trims = [4, 8].map((i) => bandGeometry(ring(i, 1.2 + i * STEP_OUT, 0.01), STEP_UP * i - 0.02, STEP_UP * i + 0.035, 1, teamTint));
    const outer = ring(TIERS, 1.4 + (TIERS - 1) * STEP_OUT, 0.03);
    const y0 = STEP_UP * TIERS;
    return {
      trims,
      suites: bandGeometry(outer, y0, y0 + 0.9, 1.1),
      rim: bandGeometry(outer, y0 + 0.9, y0 + 0.97, 1, teamTint),
      roof: bandGeometry(outer, y0 + 1.5, y0 + 1.56, 1, teamTint),
    };
  }, [hw, hl]);
  const windows = useMemo(() => {
    const t = boardCanvas(256, 64, (ctx) => {
      ctx.fillStyle = "#070a18";
      ctx.fillRect(0, 0, 256, 64);
      const rnd = mulberry(5);
      for (let i = 0; i < 8; i++) {
        const warm = rnd() > 0.35;
        ctx.fillStyle = warm ? `rgba(255,${190 + Math.floor(rnd() * 50)},120,${0.55 + rnd() * 0.4})` : `rgba(120,220,255,${0.5 + rnd() * 0.4})`;
        ctx.fillRect(i * 32 + 3, 14, 26, 34);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(i * 32 + 3, 14, 26, 4);
      }
    });
    t.wrapS = THREE.RepeatWrapping;
    return t;
  }, []);
  useEffect(
    () => () => {
      windows.dispose();
      parts.trims.forEach((g) => g.dispose());
      parts.suites.dispose();
      parts.rim.dispose();
      parts.roof.dispose();
    },
    [windows, parts],
  );
  return (
    <group>
      {[...parts.trims, parts.rim, parts.roof].map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial vertexColors toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh geometry={parts.suites}>
        <meshBasicMaterial map={windows} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Glowing yellow goal posts on both end lines. */
export function GoalPosts({ rows }: { rows: number }) {
  const sprite = useMemo(() => glowSprite(), []);
  useEffect(() => () => sprite.dispose(), [sprite]);
  const gold = "#ffe14a";
  return (
    <group>
      {[rows / 2, -rows / 2].map((z) => {
        const back = Math.sign(z) * 0.42;
        return (
          <group key={z} position={[0, 0.12, z]}>
            <mesh position={[0, 0.5, back]}>
              <cylinderGeometry args={[0.05, 0.06, 1.0, 10]} />
              <meshBasicMaterial color={gold} toneMapped={false} />
            </mesh>
            <mesh position={[0, 1.0, back / 2]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.04, 0.04, Math.abs(back), 8]} />
              <meshBasicMaterial color={gold} toneMapped={false} />
            </mesh>
            <mesh position={[0, 1.0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.04, 0.04, 1.9, 10]} />
              <meshBasicMaterial color={gold} toneMapped={false} />
            </mesh>
            {[-0.93, 0.93].map((x) => (
              <group key={x}>
                <mesh position={[x, 1.8, 0]}>
                  <cylinderGeometry args={[0.032, 0.036, 1.6, 8]} />
                  <meshBasicMaterial color={gold} toneMapped={false} />
                </mesh>
                <sprite position={[x, 2.62, 0]} scale={[0.45, 0.45, 1]}>
                  <spriteMaterial map={sprite} color="#fff08a" blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
                </sprite>
              </group>
            ))}
            <sprite position={[0, 1.0, 0]} scale={[2.6, 0.5, 1]}>
              <spriteMaterial map={sprite} color="#ffd23a" opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </sprite>
          </group>
        );
      })}
    </group>
  );
}

/** Players and coaches standing on both sidelines in front of their benches (instanced, no shadows). */
function Sidelines({ cols }: { cols: number }) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const benches = useRef<THREE.InstancedMesh>(null);
  const people = useMemo(() => {
    const rnd = mulberry(77);
    const list: { x: number; z: number; team: "w" | "b"; coach: boolean; face: number; h: number }[] = [];
    for (const side of [1, -1] as const) {
      const team = side > 0 ? "w" : "b";
      for (let i = 0; i < 14; i++) {
        const z = -2.9 + i * 0.45 + (rnd() - 0.5) * 0.12;
        list.push({ x: side * (cols / 2 + 0.42 + (rnd() - 0.5) * 0.1), z, team, coach: false, face: (-side * Math.PI) / 2 + (rnd() - 0.5) * 0.6, h: 0.95 + rnd() * 0.12 });
      }
      for (const z of [-0.55, 0.7]) list.push({ x: side * (cols / 2 + 0.18), z, team, coach: true, face: (-side * Math.PI) / 2, h: 1.02 });
    }
    return list;
  }, [cols]);
  const mats = useMemo(() => {
    const body = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    body.onBeforeCompile = selfLit;
    const head = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 });
    head.onBeforeCompile = selfLit;
    return { body, head, bench: new THREE.MeshStandardMaterial({ color: "#1b2448", roughness: 0.6, emissive: "#0d1a40", emissiveIntensity: 0.6 }) };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const jersey = { w: new THREE.Color("#1aa8ff"), b: new THREE.Color("#e0206a") };
    const helmet = { w: new THREE.Color("#7ff6ff"), b: new THREE.Color("#ff6fb0") };
    const coat = new THREE.Color("#20232e");
    const cap = new THREE.Color("#0e1018");
    people.forEach((p, i) => {
      q.setFromAxisAngle(up, p.face);
      m.compose(new THREE.Vector3(p.x, 0.12 + 0.15 * p.h, p.z), q, new THREE.Vector3(p.coach ? 1.1 : 1, p.h, 1));
      bodies.current?.setMatrixAt(i, m);
      bodies.current?.setColorAt(i, p.coach ? coat : jersey[p.team]);
      m.compose(new THREE.Vector3(p.x, 0.12 + 0.3 * p.h + 0.06, p.z), q, new THREE.Vector3(1, 1, 1));
      heads.current?.setMatrixAt(i, m);
      heads.current?.setColorAt(i, p.coach ? cap : helmet[p.team]);
    });
    [1, -1].forEach((side, i) => {
      m.makeTranslation(side * (cols / 2 + 0.72), 0.2, 0);
      benches.current?.setMatrixAt(i, m);
    });
    for (const ref of [bodies, heads, benches]) {
      if (!ref.current) continue;
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [people, cols]);
  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, mats.body, people.length]}>
        <boxGeometry args={[0.17, 0.3, 0.11]} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, mats.head, people.length]}>
        <sphereGeometry args={[0.068, 10, 8]} />
      </instancedMesh>
      <instancedMesh ref={benches} args={[undefined, mats.bench, 2]}>
        <boxGeometry args={[0.16, 0.16, 6.2]} />
      </instancedMesh>
    </group>
  );
}

/** Coloured spotlights on the roof that sweep slowly over the field (cyan, purple, orange). */
function SweepBeams({ hw, hl }: { hw: number; hl: number }) {
  const out = (TIERS - 1) * STEP_OUT;
  const y = STEP_UP * TIERS + 1.9;
  const list = useMemo(
    () => [
      { at: new THREE.Vector3(-(hw + out * 0.8), y, hl * 0.45), color: "#22d3ff", ph: 0 },
      { at: new THREE.Vector3(-(hw + out * 0.9), y + 0.4, 0), color: "#a04bff", ph: 2.1 },
      { at: new THREE.Vector3(-(hw + out * 0.8), y, -hl * 0.45), color: "#ff8a1e", ph: 4.2 },
    ],
    [hw, hl, out, y],
  );
  const groups = useRef<(THREE.Group | null)[]>([]);
  const L = 15;
  const uniforms = useMemo(() => list.map((b) => ({ uColor: { value: new THREE.Color(b.color) }, uOpacity: { value: 0.42 }, uH: { value: L } })), [list]);
  const sprite = useMemo(() => glowSprite(), []);
  useEffect(() => () => sprite.dispose(), [sprite]);
  const aim = useMemo(() => new THREE.Vector3(), []);
  const down = useMemo(() => new THREE.Vector3(0, -1, 0), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    list.forEach((b, i) => {
      const g = groups.current[i];
      if (!g) return;
      aim.set(Math.sin(t * 0.37 + b.ph) * 3.2, 0, b.at.z * 0.6 + Math.cos(t * 0.29 + b.ph * 1.3) * 4.5);
      g.quaternion.setFromUnitVectors(down, aim.sub(b.at).normalize());
    });
  });
  return (
    <group>
      {list.map((b, i) => (
        <group key={i} position={b.at}>
          <group ref={(el) => void (groups.current[i] = el)}>
            <mesh position={[0, -L / 2, 0]} renderOrder={5}>
              <cylinderGeometry args={[0.07, 1.25, L, 20, 1, true]} />
              <shaderMaterial vertexShader={beamVert} fragmentShader={beamFrag} uniforms={uniforms[i]} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
            </mesh>
          </group>
          <sprite scale={[1.3, 1.3, 1]}>
            <spriteMaterial map={sprite} color={b.color} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </sprite>
          <mesh>
            <boxGeometry args={[0.36, 0.26, 0.36]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Camera: broadside like a TV shot on wide screens, end-on on tall phones. */
export function StadiumCam({ rows, reset }: { rows: number; reset: number }) {
  const { camera, size, controls } = useThree();
  const wide = size.width >= size.height * 1.05;
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const fov0 = persp.fov;
    persp.fov = wide ? 48 : 40;
    persp.updateProjectionMatrix();
    // a little lower and further back than before, so the city skyline shows above the far stands
    const aim = wide ? new THREE.Vector3(-rows * 0.257, 0, 0) : new THREE.Vector3(0, 0, -0.4);
    if (wide) camera.position.set(rows * 1.0, rows * 0.6, 0.001);
    else camera.position.set(0, rows * 1.5, rows * 0.8);
    camera.lookAt(aim);
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    orbit?.target?.copy(aim);
    orbit?.update?.();
    return () => {
      persp.fov = fov0;
      persp.updateProjectionMatrix();
    };
  }, [wide, rows, camera, controls, reset]);
  return null;
}

/** One camera set-up of the touchdown replay. `from`/`to` are the moving player's squares in world x/z. */
export type CamShot = { id: number; kind: number; from: [number, number]; to: [number, number]; end: number; hero?: boolean; follow?: boolean };

/** Where the ball is right now (world space), written every frame by whoever has it: the carrier,
 *  the ball in flight or the loose ball. The touchdown replay camera follows it. */
export const BALL_TRACK = { pos: new THREE.Vector3(), seen: 0, lock: -1 };

/** The replay director: hard cuts between TV angles, then the camera tracks and slowly pushes in. */
export function CinemaCam({ shot }: { shot: CamShot }) {
  const { camera, controls } = useThree();
  const look = useRef(new THREE.Vector3());
  const born = useRef(0);
  const cut = useRef<number | null>(null);
  useEffect(() => {
    const orbit = controls as unknown as { enabled?: boolean } | null;
    if (orbit) orbit.enabled = false;
    const persp = camera as THREE.PerspectiveCamera;
    const fov0 = persp.fov;
    persp.fov = 38;
    persp.updateProjectionMatrix();
    return () => {
      if (orbit) orbit.enabled = true;
      persp.fov = fov0;
      persp.updateProjectionMatrix();
    };
  }, [camera, controls]);
  function frameAt(u: number, t: number) {
    const fx = shot.from[0] + (shot.to[0] - shot.from[0]) * u;
    const fz = shot.from[1] + (shot.to[1] - shot.from[1]) * u;
    let dx = shot.to[0] - shot.from[0];
    let dz = shot.to[1] - shot.from[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const target = new THREE.Vector3(fx, 0.45, fz);
    const push = 1 - Math.min(1, t / 1.6) * 0.22; // a slow push-in during the shot
    let pos: THREE.Vector3;
    if (shot.hero) {
      const a = 0.6 + t * 0.45;
      pos = new THREE.Vector3(fx + Math.cos(a) * 2.4 * push, 1.25, fz + Math.sin(a) * 2.4 * push);
      target.y = 0.55;
    } else if (shot.kind % 4 === 0) {
      // low on the near sideline, level with the players (the far side has the ribbon wall)
      pos = new THREE.Vector3(Math.min(4.3, fx + 4.2 * push), 1.9, fz - dz * 1.4);
    } else if (shot.kind % 4 === 1) {
      // behind the runner, looking down the field
      pos = new THREE.Vector3(fx - dx * 3.2 * push + 0.6, 2.2, fz - dz * 3.2 * push);
      target.set(fx + dx * 1.6, 0.4, fz + dz * 1.6);
    } else if (shot.kind % 4 === 2) {
      // from the end zone he is running at
      pos = new THREE.Vector3(fx * 0.4 + 1.8, 2.2, shot.end + Math.sign(shot.end) * 0.8);
    } else {
      // high crane shot
      pos = new THREE.Vector3(fx + 2.4 * push, 6.2 * push, fz + 3.4 * push);
    }
    // stay inside the bowl and in front of the goal posts so nothing fills the lens
    pos.x = Math.max(-4.1, Math.min(4.3, pos.x));
    pos.z = Math.max(-6.7, Math.min(6.7, pos.z));
    return { pos, target };
  }
  const chase = useRef(new THREE.Vector3());
  useFrame(({ clock }, raw) => {
    const dt = Math.min(raw, 0.1);
    if (shot.follow) {
      // follow ONLY the ball carrier: a chase camera behind and beside him, looking at the ball
      const ball = BALL_TRACK.pos;
      const toward = Math.sign(shot.end) || 1;
      const t = clock.elapsedTime;
      const side = 2.5 + Math.sin(t * 0.25) * 0.4;
      const want = new THREE.Vector3(Math.max(-4.1, Math.min(4.3, ball.x + side)), 2.0, Math.max(-6.7, Math.min(6.7, ball.z - toward * 2.9)));
      const aim = new THREE.Vector3(ball.x, 0.5, ball.z + toward * 0.6);
      if (cut.current !== shot.id) {
        cut.current = shot.id;
        chase.current.copy(aim);
        camera.position.copy(want);
        look.current.copy(aim);
      }
      camera.position.lerp(want, 1 - Math.exp(-2.6 * dt));
      look.current.lerp(aim, 1 - Math.exp(-5.5 * dt));
      camera.lookAt(look.current);
      return;
    }
    if (cut.current !== shot.id) {
      cut.current = shot.id;
      born.current = clock.elapsedTime;
      const f = frameAt(0, 0);
      camera.position.copy(f.pos);
      look.current.copy(f.target);
      camera.lookAt(look.current);
      return;
    }
    const t = clock.elapsedTime - born.current;
    const u = Math.min(1, Math.max(0, (t - 0.05) / 0.72));
    const f = frameAt(u * u * (3 - 2 * u), t);
    const k = 1 - Math.exp(-3.2 * dt);
    camera.position.lerp(f.pos, k);
    look.current.lerp(f.target, 1 - Math.exp(-5 * dt));
    camera.lookAt(look.current);
  });
  return null;
}

export type StadiumShow = {
  hype?: Hype | null;
  shot?: CamShot | null;
  fireworks?: { id: number; z: number } | null;
};

export const Fireworks = lazy(() => import("@/components/variants/fireworks"));

/** The player's own team (name and colour) painted into their end zone, wall and rings. */
export type HomeTeam = { name: string; color: string };

/** a + (b - a) * k for #rrggbb colours */
export function mixHex(a: string, b: string, k: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) + ((((pb >> sh) & 255) - ((pa >> sh) & 255)) * k));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

export function NeonStadium({ rows, cols, show = null, home = null }: { rows: number; cols: number; show?: StadiumShow | null; home?: HomeTeam | null }) {
  const hw = cols / 2 + MARGIN_W + 0.35; // inner wall, across
  const hl = rows / 2 + MARGIN_L + 0.35; // inner wall, along
  const out = (TIERS - 1) * STEP_OUT;
  // when the replay ends, put the normal TV camera back
  const [reset, setReset] = useState(0);
  const cinema = Boolean(show?.shot);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !cinema) setReset((n) => n + 1);
    was.current = cinema;
  }, [cinema]);
  return (
    <group>
      <color attach="background" args={["#03040b"]} />
      <fog attach="fog" args={["#05040f", 26, 60]} />
      <hemisphereLight args={["#6c7cff", "#1a0820", 0.85]} />
      <ambientLight intensity={0.22} color="#8fa0ff" />
      <directionalLight
        position={[5, 16, 2]}
        intensity={1.75}
        color="#eef3ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0004}
      />
      {/* team-colored rim light from each end zone */}
      <directionalLight position={[0, 4, 14]} intensity={0.9} color={home?.color ?? TEAM.w} />
      <directionalLight position={[0, 4, -14]} intensity={0.9} color={TEAM.b} />
      <pointLight position={[0, 3, 0]} intensity={6} distance={12} decay={1.2} color="#9a7bff" />
      {show?.shot ? <CinemaCam shot={show.shot} /> : <StadiumCam rows={rows} reset={reset} />}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[hw * 2 + 0.4, hl * 2 + 0.4]} />
        <meshStandardMaterial color="#04070d" roughness={0.9} />
      </mesh>
      <NeonSkyline hw={hw + out} hl={hl + out} />
      <Field rows={rows} cols={cols} home={home} />
      <NeonWall hw={hw} hl={hl} home={home} />
      <Stands hw={hw} hl={hl} />
      <Crowd hw={hw} hl={hl} hype={show?.hype ?? null} />
      <Rig hw={hw} hl={hl} />
      <SweepBeams hw={hw} hl={hl} />
      <BowlLights hw={hw} hl={hl} />
      <GoalPosts rows={rows} />
      <Sidelines cols={cols} />
      <Pennant position={[2.2, STEP_UP * TIERS * 0.62, hl + out * 0.62]} rotY={2.56} text="GO" sub={`${(home?.name ?? "Knights").toUpperCase()}!`} a={home?.color ?? "#2ee6ff"} b="#ffb02e" />
      <Pennant position={[2.2, STEP_UP * TIERS * 0.62, -(hl + out * 0.62)]} rotY={0.585} text="GFL" sub="CHAMPIONSHIP" a="#b04bff" b="#ff2d7a" />
      <TopBanner x={-(hw + out * 0.62)} y={STEP_UP * TIERS * 0.5} />
      <Pennant position={[-(hw + out * 0.55), STEP_UP * TIERS * 0.75, hl + out * 0.55]} rotY={Math.PI * 0.75} text="GFL" sub="CHAMPIONSHIP" a="#2ee6ff" b="#9fd0ff" />
      <Pennant position={[-(hw + out * 0.55), STEP_UP * TIERS * 0.75, -(hl + out * 0.55)]} rotY={Math.PI * 0.25} text="GO" sub="KNIGHTS!" a="#ff2d7a" b="#ffb02e" />
      <Suspense fallback={null}>
        <Fireworks burst={show?.fireworks ?? null} side={cols / 2 + 1.7} />
      </Suspense>
    </group>
  );
}

/* ── Glowing move paths ── */

export function Arc({ from, to, color, opacity = 1, lift = 0.5 }: { from: [number, number, number]; to: [number, number, number]; color: string; opacity?: number; lift?: number }) {
  const { tube, glow, head, quat } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const d = a.distanceTo(b);
    const m = a.clone().add(b).multiplyScalar(0.5);
    m.y += lift + d * 0.14;
    const curve = new THREE.QuadraticBezierCurve3(a, m, b.clone().lerp(m, 0.12));
    const end = curve.getPoint(1);
    const tan = curve.getTangent(1);
    return {
      tube: new THREE.TubeGeometry(curve, 40, 0.05, 10, false),
      glow: new THREE.TubeGeometry(curve, 40, 0.14, 10, false),
      head: end,
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize()),
    };
  }, [from[0], from[1], from[2], to[0], to[1], to[2], lift]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { tube.dispose(); glow.dispose(); }, [tube, glow]);
  return (
    <group renderOrder={6}>
      <mesh geometry={tube}>
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh geometry={glow}>
        <meshBasicMaterial color={color} transparent opacity={0.38 * opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={head} quaternion={quat}>
        <coneGeometry args={[0.17, 0.38, 16]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** A move arrow that fades out after a couple of seconds. */
export function FadingArc({ from, to, color }: { from: [number, number, number]; to: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    if (born.current == null) born.current = clock.elapsedTime;
    const age = clock.elapsedTime - born.current;
    const k = age < 2.2 ? 1 : Math.max(0, 1 - (age - 2.2) / 0.9);
    g.visible = k > 0.01;
    g.traverse((n) => {
      const mat = (n as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (mat && "opacity" in mat) {
        mat.userData.base ??= mat.opacity;
        mat.opacity = mat.userData.base * k;
      }
    });
  });
  return (
    <group ref={ref}>
      <Arc from={from} to={to} color={color} />
    </group>
  );
}

/** Glowing team disc under a player. */
export function TeamRing({ side, position, color }: { side: "w" | "b"; position: [number, number, number]; color?: string }) {
  const col = color ?? TEAM[side];
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <ringGeometry args={[0.3, 0.4, 36]} />
        <meshBasicMaterial color={col} transparent opacity={0.95} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} renderOrder={1}>
        <circleGeometry args={[0.46, 36]} />
        <meshBasicMaterial color={col} transparent opacity={0.22} blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Glowing target marker for a legal square. */
export function TargetMark({ position, color, strong = false }: { position: [number, number, number]; color: string; strong?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5) * 0.08);
  });
  return (
    <group position={position}>
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <ringGeometry args={strong ? [0.34, 0.47, 32] : [0.2, 0.31, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <circleGeometry args={[strong ? 0.5 : 0.4, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
