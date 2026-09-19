export type TableKind = "felt" | "plank" | "shine" | "legend" | "walnut";

export type BoardSkin = {
  id: string;
  name: string;
  blurb: string;
  cost: number;
  tableKind: TableKind;
  lightSq: string;
  darkSq: string;
  whitePiece: string;
  blackPiece: string;
  whiteStroke: string;
  blackStroke: string;
  table: string;
  felt: string;
  select: string;
  last: string;
  check: string;
  dot: string;
  fillLight: string;
  sqMetal: number;
  sqRough: number;
  whiteMetal: number;
  blackMetal: number;
  whiteRough: number;
  blackRough: number;
  whiteEmissive: string;
  blackEmissive: string;
  whiteGlow: number;
  blackGlow: number;
  ring: string | null;
  pieceScale: number;
  collar: string | null;
  sealed?: boolean;
  animated?: boolean;
};

export const MASTER_USERNAME = "MasterGus";
export const MASTER_SCORE = 8888;
export const DEFAULT_BOARD_ID = "lodge";

export function isMasterUsername(name: string) {
  return name.trim().toLowerCase() === MASTER_USERNAME.toLowerCase();
}

const BASE: Omit<BoardSkin, "id" | "name" | "blurb" | "cost" | "tableKind"> = {
  lightSq: "#f6e7c4",
  darkSq: "#17362a",
  whitePiece: "#fffdf8",
  blackPiece: "#070605",
  whiteStroke: "#24160e",
  blackStroke: "#f7eedc",
  table: "#3c261c",
  felt: "#24332c",
  select: "#3f5d4e",
  last: "#8a6a4e",
  check: "#9a4036",
  dot: "#f3ead8",
  fillLight: "#c9b48a",
  sqMetal: 0.04,
  sqRough: 0.62,
  whiteMetal: 0.08,
  blackMetal: 0.22,
  whiteRough: 0.28,
  blackRough: 0.2,
  whiteEmissive: "#6a4a28",
  blackEmissive: "#000000",
  whiteGlow: 0.08,
  blackGlow: 0,
  ring: null,
  pieceScale: 1,
  collar: null,
};

export const BOARD_CATALOG: BoardSkin[] = [
  {
    ...BASE,
    id: "lodge",
    name: "Lodge",
    blurb: "The first Morse table. Flat green felt, club wood.",
    cost: 0,
    tableKind: "felt",
    pieceScale: 1,
    collar: null,
  },
  {
    ...BASE,
    id: "pine",
    name: "Pine",
    blurb: "Pale squares on a low pine plank.",
    cost: 1240,
    tableKind: "plank",
    pieceScale: 1.04,
    collar: "#c4a06a",
    lightSq: "#f8ecc8",
    darkSq: "#3d5428",
    table: "#c4a06a",
    felt: "#4a5c38",
    fillLight: "#e8d4a0",
    whitePiece: "#fffaf0",
    blackPiece: "#050506",
  },
  {
    ...BASE,
    id: "crimson",
    name: "Crimson",
    blurb: "Black and red. Open at 1600 Elo.",
    cost: 1600,
    tableKind: "plank",
    pieceScale: 1.05,
    collar: "#8a2430",
    lightSq: "#c41c24",
    darkSq: "#0a0a0c",
    table: "#1a0808",
    felt: "#120606",
    select: "#e03840",
    last: "#6a1018",
    fillLight: "#e09090",
    whitePiece: "#fff8f4",
    blackPiece: "#050506",
    whiteStroke: "#3a080c",
    blackStroke: "#f3ead8",
  },
  {
    ...BASE,
    id: "frost",
    name: "Frost",
    blurb: "Ice squares on a pale lacquered top.",
    cost: 1320,
    tableKind: "shine",
    pieceScale: 1.08,
    collar: "#c8d8e8",
    lightSq: "#eef4fa",
    darkSq: "#6a86a0",
    table: "#d8e4ee",
    felt: "#8aa8c0",
    select: "#7aa0c8",
    last: "#9ab4c8",
    fillLight: "#d0e8ff",
    whitePiece: "#ffffff",
    blackPiece: "#050506",
    whiteStroke: "#4a6078",
    blackStroke: "#e8f4ff",
    sqMetal: 0.28,
    sqRough: 0.32,
    whiteMetal: 0.35,
    blackMetal: 0.4,
    whiteRough: 0.18,
  },
  {
    ...BASE,
    id: "emerald",
    name: "Emerald",
    blurb: "Marble green on a glossy wood table.",
    cost: 1360,
    tableKind: "shine",
    pieceScale: 1.06,
    collar: "#d4b46a",
    lightSq: "#dce8d4",
    darkSq: "#1f4a3a",
    table: "#16352c",
    felt: "#0f2a22",
    select: "#3d8f6e",
    last: "#2f6b52",
    fillLight: "#8fd4b0",
    whitePiece: "#f7fff4",
    blackPiece: "#050506",
    whiteStroke: "#1f4a3a",
    blackStroke: "#d7f0e2",
    whiteMetal: 0.28,
    blackMetal: 0.32,
    sqMetal: 0.2,
  },
  {
    ...BASE,
    id: "gilt",
    name: "Gilt",
    blurb: "Gold inlay, the wood starts to shine.",
    cost: 1400,
    tableKind: "shine",
    pieceScale: 1.07,
    collar: "#f0d48a",
    lightSq: "#efe0b8",
    darkSq: "#3a2a12",
    table: "#2a1e0c",
    felt: "#1c1408",
    select: "#d4b46a",
    last: "#b08a3a",
    fillLight: "#f0d48a",
    whitePiece: "#fff4c8",
    blackPiece: "#050506",
    whiteStroke: "#6a4a12",
    blackStroke: "#f0d48a",
    sqMetal: 0.28,
    sqRough: 0.34,
    whiteMetal: 0.55,
    blackMetal: 0.5,
    whiteRough: 0.16,
    whiteEmissive: "#8a6a20",
    whiteGlow: 0.16,
    ring: "#d4b46a",
  },
  {
    ...BASE,
    id: "cherry",
    name: "Cherry",
    blurb: "Lacquered cherry wood, deep and wet-looking.",
    cost: 1440,
    tableKind: "shine",
    pieceScale: 1.06,
    collar: "#e0a070",
    lightSq: "#f0c8a8",
    darkSq: "#6a2218",
    table: "#5a1c14",
    felt: "#2a0c0c",
    select: "#c45a3a",
    last: "#8a3828",
    fillLight: "#f0a070",
    whitePiece: "#fff0e4",
    blackPiece: "#050506",
    whiteStroke: "#6a2818",
    blackStroke: "#f0c8b0",
    sqMetal: 0.42,
    sqRough: 0.22,
    whiteMetal: 0.45,
    blackMetal: 0.5,
    whiteRough: 0.14,
    blackRough: 0.18,
    ring: "#e0a070",
  },
  {
    ...BASE,
    id: "tide",
    name: "Tide",
    blurb: "Shiny dark blue ivory, shiny black ebony.",
    cost: 1480,
    tableKind: "shine",
    pieceScale: 1.05,
    collar: "#9ec4ff",
    lightSq: "#163a72",
    darkSq: "#05060a",
    whitePiece: "#f7f9ff",
    blackPiece: "#020203",
    whiteStroke: "#9ec4ff",
    blackStroke: "#c8c8d0",
    table: "#05060a",
    felt: "#06101c",
    select: "#2a6fd4",
    last: "#123a6a",
    check: "#8a2030",
    dot: "#9ec4ff",
    fillLight: "#4a8adf",
    sqMetal: 0.55,
    sqRough: 0.22,
    whiteMetal: 0.88,
    blackMetal: 0.92,
    whiteRough: 0.14,
    blackRough: 0.1,
    whiteEmissive: "#0a2a6a",
    blackEmissive: "#111218",
    whiteGlow: 0.28,
    blackGlow: 0.08,
    ring: "#3a6ab0",
  },
  {
    ...BASE,
    id: "aurora",
    name: "Aurora",
    blurb: "The Morse legend. Chrome, gold, and a table that looks poured.",
    cost: 1520,
    tableKind: "legend",
    pieceScale: 1.1,
    collar: "#f0d48a",
    lightSq: "#0c2f72",
    darkSq: "#020204",
    whitePiece: "#f6f1e4",
    blackPiece: "#000000",
    whiteStroke: "#d8e8ff",
    blackStroke: "#f2d48a",
    table: "#020208",
    felt: "#030816",
    select: "#d4b46a",
    last: "#1a5ad0",
    check: "#8a2030",
    dot: "#f0d48a",
    fillLight: "#7eb0ff",
    sqMetal: 0.72,
    sqRough: 0.12,
    whiteMetal: 0.95,
    blackMetal: 0.96,
    whiteRough: 0.08,
    blackRough: 0.06,
    whiteEmissive: "#1a5ad0",
    blackEmissive: "#3a2a08",
    whiteGlow: 0.42,
    blackGlow: 0.12,
    ring: "#f0d48a",
  },
  {
    ...BASE,
    id: "walnut",
    name: "Walnut",
    blurb: "A real wood top. Maple and walnut squares on a polished slab.",
    cost: 1560,
    tableKind: "walnut",
    pieceScale: 1.12,
    collar: "#3a2418",
    lightSq: "#e6cba0",
    darkSq: "#6b4328",
    table: "#5a3a22",
    felt: "#3a2416",
    select: "#8a6238",
    last: "#c4a06a",
    fillLight: "#f0d2a0",
    whitePiece: "#fff6e8",
    blackPiece: "#050506",
    whiteStroke: "#5a3a22",
    blackStroke: "#f0d8b0",
    sqMetal: 0.08,
    sqRough: 0.48,
    whiteMetal: 0.12,
    blackMetal: 0.16,
    whiteRough: 0.3,
    blackRough: 0.38,
    ring: "#3a2418",
  },
  {
    ...BASE,
    id: "mystery",
    name: "Mystery",
    blurb: "Sealed until you own it. Then the squares walk red, orange, yellow, and on.",
    cost: 1600,
    tableKind: "shine",
    sealed: true,
    animated: true,
    lightSq: "#c41c24",
    darkSq: "#1a0a08",
    table: "#120808",
    felt: "#0a0404",
    select: "#f0d48a",
    last: "#8a4a18",
    fillLight: "#f0a040",
    whitePiece: "#fff8ee",
    blackPiece: "#050506",
    whiteStroke: "#3a2416",
    blackStroke: "#f3ead8",
    sqMetal: 0.35,
    sqRough: 0.28,
    ring: "#f0a040",
  },
];

const BY_ID = new Map(BOARD_CATALOG.map((b) => [b.id, b]));

export function boardById(id: string | null | undefined): BoardSkin {
  return BY_ID.get(id ?? "") ?? BOARD_CATALOG[0];
}

export function boardUnlocked(score: number, board: BoardSkin | string, _username?: string) {
  const b = typeof board === "string" ? boardById(board) : board;
  return (Number.isFinite(score) ? score : 0) >= b.cost;
}

export function boardCanPreview(score: number, board: BoardSkin | string, username?: string) {
  const b = typeof board === "string" ? boardById(board) : board;
  if (b.sealed) return boardUnlocked(score, b, username);
  return true;
}

function hslToHex(h: number, s: number, l: number) {
  const sat = s / 100;
  const lit = l / 100;
  const a = sat * Math.min(lit, 1 - lit);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = lit - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function mysteryPair(t = Date.now() / 900): [string, string] {
  const h1 = ((t * 42) % 360 + 360) % 360;
  const h2 = (h1 + 32) % 360;
  return [hslToHex(h1, 78, 48), hslToHex(h2, 62, 16)];
}

const EQUIP_KEY = "morse-equipped-board";

export function rememberEquipped(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EQUIP_KEY, id);
  } catch {
    /* ignore */
  }
}

export function readEquipped() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(EQUIP_KEY);
  } catch {
    return null;
  }
}

export function equippedSkin(score: number, serverId?: string | null, username?: string) {
  const local = readEquipped();
  const candidate = serverId && serverId !== DEFAULT_BOARD_ID ? serverId : local || serverId || DEFAULT_BOARD_ID;
  const board = boardById(candidate);
  if (!boardUnlocked(score, board, username)) return boardById(DEFAULT_BOARD_ID);
  return board;
}
