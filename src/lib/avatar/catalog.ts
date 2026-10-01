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
  yaw?: number;
};

export const CHARACTERS: CharacterItem[] = [
  {
    id: "piece",
    name: "King",
    price: 0,
    portrait: "",
    blurb: "The normal king. Free.",
    url: "",
    kind: "glb",
    height: 1.15,
  },
  {
    id: "royal",
    name: "Royal",
    price: 150,
    portrait: "/avatars/kings/royal.jpg",
    blurb: "Pays for the house. Wears no crown.",
    url: "/avatars/king-an.glb",
    kind: "glb",
    height: 1.52,
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
    price: 0,
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
  { id: "none", name: "Bare hands", price: 0, portrait: "", blurb: "Nothing in the hand." },
  { id: "devil", name: "Devil sword", price: 4, portrait: "", blurb: "One sword, held in the right hand." },
  { id: "talwar", name: "Talwar", price: 4, portrait: "", blurb: "One curved sword, held in the right hand." },
];

export type CrownItem = GearItem & { gold: string; dark: string; model?: string };

export const CROWNS: CrownItem[] = [
  {
    id: "poly-band",
    name: "Band",
    price: 0,
    portrait: "/avatars/crowns/gold-circlet.jpg",
    blurb: "A low gold band. It sits on the head.",
    gold: "/avatars/crowns/gold-circlet.jpg",
    dark: "/avatars/crowns/dark-circlet.jpg",
    model: "/avatars/crowns/poly-band.glb",
  },
  {
    id: "arched",
    name: "Arched",
    price: 5,
    portrait: "/avatars/crowns/gold-arched.jpg",
    blurb: "Gold arches, smaller than the head.",
    gold: "/avatars/crowns/gold-arched.jpg",
    dark: "/avatars/crowns/dark-spiked.jpg",
  },
  {
    id: "laurel",
    name: "Laurel",
    price: 4,
    portrait: "/avatars/crowns/gold-laurel.jpg",
    blurb: "A ring of leaves on the head.",
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
  { id: "march", name: "Normal", price: 0, portrait: "", blurb: "The king stands ready." },
  { id: "chop", name: "Chop", price: 4, portrait: "", blurb: "One clean cut with the blade." },
];

export const STARTER_IDS = ["piece", "knight", "none", "poly-band", "plain", "march"];

export const DEFAULT_LOADOUT: AvatarLoadout = {
  style: "3d",
  team: "w",
  anId: "knight",
  kingId: "piece",
  swordId: "none",
  crownId: "poly-band",
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
  const oldSword = ["sword", "dual", "shield", "staff", "long", "cutlass", "axe", "rapier"];
  const swordRaw = oldSword.includes(String(src.swordId)) ? "devil" : src.swordId;
  const oldCrown = ["circlet", "sun", "poly-arch"];
  const crownRaw = oldCrown.includes(String(src.crownId)) ? "poly-band" : src.crownId;
  const oldAttack = ["flip", "slam", "sweep", "charge", "flash", "bow"];
  const attackRaw = oldAttack.includes(String(src.attackId)) ? "chop" : src.attackId;
  return {
    style,
    team,
    anId: pick(src.anId, "knight", CHARACTERS),
    kingId: pick(src.kingId, "piece", CHARACTERS),
    swordId: pick(swordRaw, "none", SWORDS),
    crownId: pick(crownRaw, "poly-band", CROWNS),
    mountId: pick(src.mountId, "none", MOUNTS),
    frameId: pick(src.frameId, "plain", FRAMES),
    attackId: pick(attackRaw, "march", ATTACKS),
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
