import { asset } from "@/lib/base";
export type PieceStyle = "2d" | "3d" | "an" | "ra";
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
    price: 200,
    portrait: asset("/avatars/kings/royal.jpg"),
    blurb: "Pays for the house. Wears no crown.",
    url: asset("/avatars/king-an.glb"),
    kind: "glb",
    height: 1.52,
  },
  {
    id: "pirate",
    name: "Pirate Captain",
    price: 4,
    portrait: asset("/avatars/kings/pirate.jpg"),
    blurb: "Salt and a cutlass.",
    url: asset("/avatars/pirate.glb"),
    kind: "glb",
    height: 1.45,
  },
  {
    id: "knight",
    name: "Silver Knight",
    price: 0,
    portrait: asset("/avatars/kings/knight.jpg"),
    blurb: "Closed helm, bright steel.",
    url: asset("/units/knight.glb"),
    kind: "glb",
    height: 1.5,
  },
  {
    id: "mage",
    name: "Court Mage",
    price: 6,
    portrait: asset("/avatars/kings/mage.jpg"),
    blurb: "Staff light on the squares.",
    url: asset("/units/mage.glb"),
    kind: "glb",
    height: 1.48,
  },
  {
    id: "rogue",
    name: "Rogue",
    price: 5,
    portrait: asset("/avatars/kings/rogue.jpg"),
    blurb: "Quiet steps, sharp knife.",
    url: asset("/units/rogue.glb"),
    kind: "glb",
    height: 1.42,
  },
  {
    id: "barbarian",
    name: "Barbarian",
    price: 5,
    portrait: asset("/avatars/kings/barbarian.jpg"),
    blurb: "Fur, axe, no patience.",
    url: asset("/units/barbarian.glb"),
    kind: "glb",
    height: 1.5,
  },
  {
    id: "hooded",
    name: "Hooded",
    price: 0,
    portrait: asset("/avatars/kings/hooded.jpg"),
    blurb: "The cowl keeps the crown.",
    url: asset("/units/rogue-hooded.glb"),
    kind: "glb",
    height: 1.46,
  },
];

export const SWORDS: GearItem[] = [
  { id: "none", name: "Bare hands", price: 0, portrait: "", blurb: "Nothing in the hand." },
  { id: "devil", name: "Devil sword", price: 4, portrait: "", blurb: "One sword, held in the right hand." },
  { id: "talwar", name: "Talwar", price: 4, portrait: "", blurb: "One curved sword, held in the right hand." },
  {
    id: "rook",
    name: "Rook sword",
    price: 5,
    portrait: "",
    blurb: "The silver knight becomes the blue rook.",
  },
];

export type CrownItem = GearItem & { gold: string; dark: string; model?: string };

export const CROWNS: CrownItem[] = [
  {
    id: "poly-band",
    name: "Band",
    price: 0,
    portrait: asset("/avatars/crowns/gold-circlet.jpg"),
    blurb: "A low gold band. It sits on the head.",
    gold: asset("/avatars/crowns/gold-circlet.jpg"),
    dark: asset("/avatars/crowns/dark-circlet.jpg"),
    model: asset("/avatars/crowns/poly-band.glb"),
  },
  {
    id: "halo",
    name: "Halo",
    price: 4,
    portrait: "",
    blurb: "A ring of light over the head.",
    gold: "",
    dark: "",
    model: asset("/avatars/crowns/halo.glb"),
  },
  {
    id: "royal-crown",
    name: "Royal Crown",
    price: 6,
    portrait: "",
    blurb: "The high crown, small on the head.",
    gold: "",
    dark: "",
    model: asset("/avatars/crowns/royal.glb"),
  },
];

export const MOUNTS: (GearItem & { url?: string; kind?: ModelKind; height?: number })[] = [
  { id: "none", name: "No dog", price: 0, portrait: "", blurb: "The king stands alone." },
  {
    id: "dog",
    name: "War dog",
    price: 8,
    portrait: "",
    blurb: "Stands with the ranger king. In a game he runs out and tears a capture to bits.",
    url: asset("/avatars/husky.glb"),
    kind: "glb",
    height: 0.78,
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
  if (!crown.gold && !crown.dark) return "";
  return team === "b" ? crown.dark : crown.gold;
}

/** Black view of each man: the same fighter, as a skeleton. */
const BONES: Record<string, { url: string; show: string[] }> = {
  knight: { url: asset("/units/skeleton-warrior.glb"), show: ["Skeleton_Warrior_Helmet", "Skeleton_Warrior_Cloak"] },
  barbarian: { url: asset("/units/skeleton-warrior.glb"), show: ["Skeleton_Warrior_Helmet"] },
  mage: { url: asset("/units/skeleton-mage.glb"), show: ["Skeleton_Mage_Hat"] },
  rogue: { url: asset("/units/skeleton-rogue.glb"), show: ["Skeleton_Rogue_Cape"] },
  hooded: { url: asset("/units/skeleton-rogue.glb"), show: ["Skeleton_Rogue_Hood", "Skeleton_Rogue_Cape"] },
  pirate: { url: asset("/units/skeleton-rogue.glb"), show: ["Skeleton_Rogue_Cape"] },
  royal: { url: asset("/units/skeleton-warrior.glb"), show: ["Skeleton_Warrior_Helmet", "Skeleton_Warrior_Cloak"] },
};

export function skeletonFor(id: string) {
  return BONES[id] ?? null;
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
  const style: PieceStyle = src.style === "2d" || src.style === "an" || src.style === "ra" || src.style === "3d" ? src.style : "3d";
  const team: TeamView = src.team === "b" ? "b" : "w";
  const pick = (id: unknown, fallback: string, rows: { id: string }[]) =>
    typeof id === "string" && rows.some((row) => row.id === id) ? id : fallback;
  const oldSword = ["sword", "dual", "shield", "staff", "long", "cutlass", "axe", "rapier"];
  const swordRaw = oldSword.includes(String(src.swordId)) ? "devil" : src.swordId;
  const oldCrown = ["circlet", "sun", "poly-arch", "arched", "laurel"];
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
