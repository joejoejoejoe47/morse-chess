export type PieceStyle = "2d" | "3d" | "an";
export type TeamView = "w" | "b";
export type ModelKind = "glb" | "fbx";

export type AvatarLoadout = {
  style: PieceStyle;
  team: TeamView;
  anId: string;
  kingId: string;
  swordId: string;
  crownId: string;
  mountId: string;
  frameId: string;
  attackId: string;
};

export type GearItem = {
  id: string;
  name: string;
  price: number;
  portrait: string;
  blurb: string;
};

export type CharacterItem = GearItem & {
  url: string;
  kind: ModelKind;
  height: number;
};

export const CHARACTERS: CharacterItem[] = [
  {
    id: "royal",
    name: "Royal",
    price: 0,
    portrait: "/avatars/kings/royal.jpg",
    blurb: "The house king.",
    url: "/avatars/king-an.glb",
    kind: "glb",
    height: 1.35,
  },
  {
    id: "pirate",
    name: "Pirate Captain",
    price: 4,
    portrait: "/avatars/kings/pirate.jpg",
    blurb: "Salt and a cutlass.",
    url: "/avatars/pirate.glb",
    kind: "glb",
    height: 1.45,
  },
  {
    id: "knight",
    name: "Silver Knight",
    price: 6,
    portrait: "/avatars/kings/knight.jpg",
    blurb: "Closed helm, bright steel.",
    url: "/units/knight.glb",
    kind: "glb",
    height: 1.5,
  },
  {
    id: "mage",
    name: "Court Mage",
    price: 6,
    portrait: "/avatars/kings/mage.jpg",
    blurb: "Staff light on the squares.",
    url: "/units/mage.glb",
    kind: "glb",
    height: 1.48,
  },
  {
    id: "rogue",
    name: "Rogue",
    price: 5,
    portrait: "/avatars/kings/rogue.jpg",
    blurb: "Quiet steps, sharp knife.",
    url: "/units/rogue.glb",
    kind: "glb",
    height: 1.42,
  },
  {
    id: "barbarian",
    name: "Barbarian",
    price: 5,
    portrait: "/avatars/kings/barbarian.jpg",
    blurb: "Fur, axe, no patience.",
    url: "/units/barbarian.glb",
    kind: "glb",
    height: 1.5,
  },
  {
    id: "hooded",
    name: "Hooded",
    price: 7,
    portrait: "/avatars/kings/hooded.jpg",
    blurb: "The cowl keeps the crown.",
    url: "/units/rogue-hooded.glb",
    kind: "glb",
    height: 1.46,
  },
];

export const SWORDS: GearItem[] = [
  { id: "none", name: "Bare hand", price: 0, portrait: "", blurb: "No blade." },
  { id: "long", name: "Longsword", price: 3, portrait: "/avatars/swords/long.jpg", blurb: "Straight and bright." },
  { id: "cutlass", name: "Cutlass", price: 3, portrait: "/avatars/swords/cutlass.jpg", blurb: "A sailor's curve." },
  { id: "axe", name: "Battle axe", price: 4, portrait: "/avatars/swords/axe.jpg", blurb: "Heavy on the square." },
  { id: "rapier", name: "Rapier", price: 4, portrait: "/avatars/swords/rapier.jpg", blurb: "A thin silver line." },
];

export type CrownItem = GearItem & { gold: string; dark: string };

export const CROWNS: CrownItem[] = [
  {
    id: "circlet",
    name: "Circlet",
    price: 0,
    portrait: "/avatars/crowns/gold-circlet.jpg",
    blurb: "The crown you start with.",
    gold: "/avatars/crowns/gold-circlet.jpg",
    dark: "/avatars/crowns/dark-circlet.jpg",
  },
  {
    id: "arched",
    name: "Arched",
    price: 5,
    portrait: "/avatars/crowns/gold-arched.jpg",
    blurb: "Gold arches. Iron spikes for black.",
    gold: "/avatars/crowns/gold-arched.jpg",
    dark: "/avatars/crowns/dark-spiked.jpg",
  },
  {
    id: "sun",
    name: "Sunburst",
    price: 6,
    portrait: "/avatars/crowns/gold-sun.jpg",
    blurb: "Bright rays. Horns when the side is black.",
    gold: "/avatars/crowns/gold-sun.jpg",
    dark: "/avatars/crowns/dark-horn.jpg",
  },
  {
    id: "laurel",
    name: "Laurel",
    price: 4,
    portrait: "/avatars/crowns/gold-laurel.jpg",
    blurb: "Gold leaves. Black thorns for the dark side.",
    gold: "/avatars/crowns/gold-laurel.jpg",
    dark: "/avatars/crowns/dark-thorn.jpg",
  },
];

export const MOUNTS: (GearItem & { url?: string; kind?: ModelKind; height?: number })[] = [
  { id: "none", name: "On foot", price: 0, portrait: "", blurb: "Stands on the square." },
  {
    id: "horse",
    name: "Horse",
    price: 8,
    portrait: "/avatars/mounts/horse.jpg",
    blurb: "The king rides.",
    url: "/avatars/horse.glb",
    kind: "glb",
    height: 1.05,
  },
  {
    id: "cow",
    name: "Cow",
    price: 6,
    portrait: "/avatars/mounts/cow.jpg",
    blurb: "A steadier throne.",
    url: "/avatars/cow.fbx",
    kind: "fbx",
    height: 0.95,
  },
];

export const FRAMES: GearItem[] = [
  { id: "plain", name: "Plain", price: 0, portrait: "", blurb: "Just the name." },
  { id: "gold", name: "Gold ring", price: 3, portrait: "", blurb: "A bright rim." },
  { id: "laurel", name: "Laurel", price: 3, portrait: "", blurb: "Leaves around the name." },
  { id: "night", name: "Night", price: 4, portrait: "", blurb: "Blue fire on the letters." },
  { id: "check", name: "Check", price: 2, portrait: "", blurb: "A boarder of squares." },
  { id: "coin", name: "Morse", price: 5, portrait: "", blurb: "Coins in the corners." },
];

export const ATTACKS: GearItem[] = [
  { id: "march", name: "March", price: 0, portrait: "", blurb: "The step you start with." },
  { id: "slam", name: "Slam", price: 3, portrait: "", blurb: "The king drops onto the square." },
  { id: "sweep", name: "Sweep", price: 3, portrait: "", blurb: "A wide blade turn." },
  { id: "charge", name: "Charge", price: 5, portrait: "", blurb: "Horse or not, they rush." },
  { id: "flash", name: "Flash", price: 4, portrait: "", blurb: "The crown lights the capture." },
  { id: "bow", name: "Bow", price: 3, portrait: "", blurb: "A low courtesy, then the take." },
];

export const STARTER_IDS = ["royal", "none", "circlet", "plain", "march"];

export const DEFAULT_LOADOUT: AvatarLoadout = {
  style: "3d",
  team: "w",
  anId: "royal",
  kingId: "royal",
  swordId: "none",
  crownId: "circlet",
  mountId: "none",
  frameId: "plain",
  attackId: "march",
};

const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));

export const characterById = (id: string) => byId(CHARACTERS).get(id) ?? CHARACTERS[0];
export const swordById = (id: string) => byId(SWORDS).get(id) ?? SWORDS[0];
export const crownById = (id: string) => byId(CROWNS).get(id) ?? CROWNS[0];
export const mountById = (id: string) => byId(MOUNTS).get(id) ?? MOUNTS[0];
export const frameById = (id: string) => byId(FRAMES).get(id) ?? FRAMES[0];
export const attackById = (id: string) => byId(ATTACKS).get(id) ?? ATTACKS[0];

export function crownArt(id: string, team: TeamView) {
  const crown = crownById(id);
  return team === "b" ? crown.dark : crown.gold;
}

export function allGear() {
  return [...CHARACTERS, ...SWORDS, ...CROWNS, ...MOUNTS, ...FRAMES, ...ATTACKS];
}

export function gearPrice(id: string) {
  return allGear().find((item) => item.id === id)?.price ?? 0;
}

export function isKnownGear(id: string) {
  return allGear().some((item) => item.id === id);
}

export function parseLoadout(raw: unknown): AvatarLoadout {
  const src = raw && typeof raw === "object" ? (raw as Partial<AvatarLoadout>) : {};
  const style: PieceStyle = src.style === "2d" || src.style === "an" || src.style === "3d" ? src.style : "3d";
  const team: TeamView = src.team === "b" ? "b" : "w";
  const pick = (id: unknown, fallback: string, rows: { id: string }[]) =>
    typeof id === "string" && rows.some((row) => row.id === id) ? id : fallback;
  return {
    style,
    team,
    anId: pick(src.anId, "royal", CHARACTERS),
    kingId: pick(src.kingId, "royal", CHARACTERS),
    swordId: pick(src.swordId, "none", SWORDS),
    crownId: pick(src.crownId, "circlet", CROWNS),
    mountId: pick(src.mountId, "none", MOUNTS),
    frameId: pick(src.frameId, "plain", FRAMES),
    attackId: pick(src.attackId, "march", ATTACKS),
  };
}

export function loadoutNeeds(loadout: AvatarLoadout) {
  return [
    loadout.anId,
    loadout.kingId,
    loadout.swordId,
    loadout.crownId,
    loadout.mountId,
    loadout.frameId,
    loadout.attackId,
  ];
}

export function letterOf(name: string) {
  const hit = name.match(/[A-Z]/);
  return (hit?.[0] ?? name.trim()[0] ?? "?").toUpperCase();
}
