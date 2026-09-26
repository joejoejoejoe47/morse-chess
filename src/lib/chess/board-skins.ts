export type TableKind = "felt" | "plank" | "shine" | "legend" | "walnut" | "studio";

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
  pieceCut?: "club" | "staunton";
  htmlPieces?: boolean;
  anSet?: "pipe" | "ring" | "wars" | "mario" | "lotr";
  coinCost?: number;
};

export const MASTER_USERNAME = "MasterGus";
export const MASTER_SCORE = 9000;
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
    id: "pipe-court",
    name: "Pipe Court",
    blurb: "Animation board. A short hero leads the light. A horned king leads the dark.",
    cost: 0,
    tableKind: "felt",
    anSet: "pipe",
    lightSq: "#d7e38a",
    darkSq: "#6a4a28",
    table: "#3a6a32",
    felt: "#234a28",
    select: "#e0b04a",
    last: "#c47a32",
    whitePiece: "#f4e4d4",
    blackPiece: "#1c2818",
    whiteStroke: "#8a3030",
    blackStroke: "#d4a84a",
  },
  {
    ...BASE,
    id: "ring-march",
    name: "Ring March",
    blurb: "Animation board. A light host against a dark host. The figures walk when you move.",
    cost: 0,
    tableKind: "felt",
    anSet: "ring",
    lightSq: "#e4d2a8",
    darkSq: "#2a332c",
    table: "#3a2a1c",
    felt: "#1c2820",
    select: "#8a7048",
    last: "#5a6848",
    whitePiece: "#e6dcc8",
    blackPiece: "#141618",
    whiteStroke: "#4a4034",
    blackStroke: "#6e3030",
  },
  {
    ...BASE,
    id: "studio",
    name: "Studio",
    blurb: "A raised cabinet board with a thick wood frame, inlaid maple and walnut, and Staunton pieces.",
    cost: 0,
    tableKind: "studio",
    pieceCut: "staunton",
    htmlPieces: true,
    pieceScale: 1.2,
    collar: "#3a2418",
    lightSq: "#e8cda4",
    darkSq: "#6a4024",
    table: "#4a2e1a",
    felt: "#2a1a10",
    select: "#8a5a32",
    last: "#c4a06a",
    fillLight: "#f0d2a0",
    whitePiece: "#f7efe0",
    blackPiece: "#16120e",
    whiteStroke: "#3a2418",
    blackStroke: "#f0d8b8",
    sqMetal: 0.06,
    sqRough: 0.5,
    whiteMetal: 0.1,
    blackMetal: 0.14,
    whiteRough: 0.32,
    blackRough: 0.36,
    ring: "#2a1810",
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
  {
    ...BASE,
    id: "marble",
    name: "Marble",
    blurb: "A stone Staunton table. Jet and bone on a black marble frame.",
    cost: 1500,
    tableKind: "shine",
    pieceCut: "staunton",
    htmlPieces: true,
    pieceScale: 1.18,
    collar: "#2a2a30",
    lightSq: "#ececf2",
    darkSq: "#141418",
    table: "#0c0c10",
    felt: "#08080c",
    select: "#4a4a58",
    last: "#2a2a38",
    check: "#8a2030",
    fillLight: "#d8d8e8",
    whitePiece: "#f7f7fb",
    blackPiece: "#0a0a0c",
    whiteStroke: "#2a2a32",
    blackStroke: "#e8e8f0",
    sqMetal: 0.42,
    sqRough: 0.22,
    whiteMetal: 0.18,
    blackMetal: 0.28,
    whiteRough: 0.16,
    blackRough: 0.14,
    whiteEmissive: "#c8c8d8",
    blackEmissive: "#111118",
    whiteGlow: 0.12,
    blackGlow: 0.06,
    ring: "#2a2a32",
  },
  {
    ...BASE,
    id: "mahogany",
    name: "Mahogany",
    blurb: "Boxwood and rosewood on a wide mahogany frame.",
    cost: 1280,
    tableKind: "walnut",
    pieceCut: "staunton",
    htmlPieces: true,
    pieceScale: 1.16,
    collar: "#6a2a18",
    lightSq: "#edd4a4",
    darkSq: "#8a3a1c",
    table: "#6a2c14",
    felt: "#3a180c",
    select: "#b45a28",
    last: "#c47a40",
    check: "#8a2030",
    fillLight: "#f0c090",
    whitePiece: "#f3d7ae",
    blackPiece: "#5a1c10",
    whiteStroke: "#6a3a18",
    blackStroke: "#f0d2a8",
    sqMetal: 0.06,
    sqRough: 0.46,
    whiteMetal: 0.08,
    blackMetal: 0.1,
    whiteRough: 0.34,
    blackRough: 0.32,
    whiteEmissive: "#8a5a28",
    blackEmissive: "#2a0c08",
    whiteGlow: 0.06,
    blackGlow: 0.04,
    ring: "#4a1c10",
  },
  {
    ...BASE,
    id: "ring-host",
    name: "Dark Edition",
    blurb: "Forty coins. A dark table. Every figure is different, and the enemy side carries swords.",
    cost: 0,
    coinCost: 40,
    tableKind: "walnut",
    anSet: "lotr",
    lightSq: "#4a433c",
    darkSq: "#14110e",
    table: "#0c0a08",
    felt: "#070605",
    select: "#8a7048",
    last: "#3a342c",
    check: "#6a2030",
    fillLight: "#6a5a44",
    whitePiece: "#d8d0c4",
    blackPiece: "#0c0a08",
    whiteStroke: "#2a241c",
    blackStroke: "#6a5040",
    ring: "#1a1612",
    collar: "#3a3024",
    sqMetal: 0.22,
    sqRough: 0.55,
  },
  {
    ...BASE,
    id: "grassland",
    name: "Grassland",
    blurb: "A civic lawn cut into an old forest. The court is only stone lines. Inside every square is grass.",
    cost: 0,
    coinCost: 100_000_000,
    tableKind: "felt",
    lightSq: "#c5d89a",
    darkSq: "#3c6e38",
    table: "#234428",
    felt: "#1b3422",
    select: "#f6e27a",
    last: "#e7c45a",
    check: "#e07050",
    dot: "#fff6c8",
    fillLight: "#fff1cc",
    whitePiece: "#fffdf6",
    blackPiece: "#1a140e",
    whiteStroke: "#2a3a18",
    blackStroke: "#f4efe4",
    sqMetal: 0,
    sqRough: 1,
    ring: "#e7dcc6",
    collar: "#c6a24a",
  },
];

const BY_ID = new Map(BOARD_CATALOG.map((b) => [b.id, b]));

export function boardUsesFinePieces(board: BoardSkin | string) {
  const b = typeof board === "string" ? boardById(board) : board;
  return b.pieceCut === "staunton" || b.htmlPieces === true || b.cost >= 1300;
}

export function boardPriceLabel(board: BoardSkin) {
  const coins = board.coinCost ?? 0;
  if (coins >= 1_000_000) {
    const m = coins / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M coins`;
  }
  if (coins > 0) return `${coins} coins`;
  if (board.cost === 0) return "starter";
  return `${board.cost} Elo`;
}

export function boardById(id: string | null | undefined): BoardSkin {
  return BY_ID.get(id ?? "") ?? BOARD_CATALOG[0];
}

export function boardUnlocked(
  score: number,
  board: BoardSkin | string,
  _username?: string,
  owned: string[] = [],
) {
  const b = typeof board === "string" ? boardById(board) : board;
  if ((b.coinCost ?? 0) > 0) return owned.includes(b.id);
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

export function equippedSkin(
  score: number,
  serverId?: string | null,
  username?: string,
  owned: string[] = [],
) {
  const local = readEquipped();
  const candidate = serverId && serverId !== DEFAULT_BOARD_ID ? serverId : local || serverId || DEFAULT_BOARD_ID;
  const board = boardById(candidate);
  if (!boardUnlocked(score, board, username, owned)) return boardById(DEFAULT_BOARD_ID);
  return board;
}
