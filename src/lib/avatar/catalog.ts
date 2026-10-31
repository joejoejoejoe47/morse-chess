import { asset } from "@/lib/base";
export type PieceStyle = "2d" | "3d" | "an" | "ra" | "lg" | "cl" | "pa";
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
  /** LG king attack: "lg-none" (his own punch) or "shield-block". */
  lgAttackId: string;
  /** Colour finish of the 3D king piece (AV "King pieces" grid). */
  finishId: string;
  /** LG minifig parts. Hair is a hat model. Weapon is a sword, or none. */
  lgBody: string;
  lgHead: string;
  lgHair: string;
  lgLegs: string;
  lgWeapon: string;
  /** Touchdown celebration. "fireworks" is free and owned. */
  fbCelebrate: string;
  /** Song that plays during a score replay. "song-none" is the crowd. */
  fbSong: string;
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
  {
    id: "clown",
    name: "Clown hat",
    price: 0,
    portrait: asset("/avatars/crowns/clown.jpg"),
    blurb: "A clown hat on the head.",
    gold: asset("/avatars/crowns/clown.jpg"),
    dark: asset("/avatars/crowns/clown.jpg"),
    model: asset("/avatars/crowns/clown.glb"),
  },
  {
    id: "chef",
    name: "Chef hat",
    price: 0,
    portrait: asset("/avatars/crowns/chef.jpg"),
    blurb: "A tall chef hat.",
    gold: asset("/avatars/crowns/chef.jpg"),
    dark: asset("/avatars/crowns/chef.jpg"),
    model: asset("/avatars/crowns/chef.glb"),
  },
  {
    id: "cappello",
    name: "Cappello",
    price: 0,
    portrait: asset("/avatars/crowns/cappello.jpg"),
    blurb: "A wide hat.",
    gold: asset("/avatars/crowns/cappello.jpg"),
    dark: asset("/avatars/crowns/cappello.jpg"),
    model: asset("/avatars/crowns/cappello.glb"),
  },
  {
    id: "gold-crown",
    name: "Gold Crown",
    price: 0,
    portrait: asset("/avatars/crowns/gold-crown.jpg"),
    blurb: "A gold crown set with jewels.",
    gold: asset("/avatars/crowns/gold-crown.jpg"),
    dark: asset("/avatars/crowns/gold-crown.jpg"),
    model: asset("/avatars/crowns/gold-crown.glb"),
  },
  {
    id: "viking",
    name: "Viking helmet",
    price: 0,
    portrait: "",
    blurb: "A viking helmet.",
    gold: "",
    dark: "",
    model: asset("/avatars/crowns/viking.glb"),
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
  { id: "king-gold", name: "Gold ring", price: 3, portrait: "", blurb: "A bright rim." },
  { id: "laurel", name: "Laurel", price: 3, portrait: "", blurb: "Leaves around the name." },
  { id: "night", name: "Night", price: 4, portrait: "", blurb: "Blue fire on the letters." },
  { id: "check", name: "Check", price: 2, portrait: "", blurb: "A boarder of squares." },
  { id: "coin", name: "Morse", price: 5, portrait: "", blurb: "Coins in the corners." },
];

export type AttackItem = GearItem & {
  /** Clip names tried in order on the king's model (KayKit names first, then the Quaternius ones). */
  clips: string[];
  /** Clip speed (1 = as made). */
  speed?: number;
  /** The extra effect drawn with the clip. */
  fx?: "spin" | "leap" | "fire" | "thunder" | "spark";
  /** How long the king holds the attack on the AN board (default 980ms). */
  ms?: number;
};

/**
 * AN king attacks: each one is a clip the AN units already have, some with an effect on top.
 * Plain ones are free; the big ones cost a few coins (bought with the same atomic buy as gear).
 */
export const ATTACKS: AttackItem[] = [
  { id: "march", name: "Normal", price: 0, portrait: "", blurb: "One cut with the blade.", clips: ["1H_Melee_Attack_Chop", "Sword_Slash", "Swo"] },
  { id: "stab", name: "Stab", price: 0, portrait: "", blurb: "A quick straight thrust.", clips: ["1H_Melee_Attack_Stab", "Sword_Slash", "Swo"], speed: 1.45 },
  { id: "slash", name: "Slash", price: 0, portrait: "", blurb: "A wide cut from the shoulder.", clips: ["1H_Melee_Attack_Slice_Diagonal", "Sword_Slash", "Swo"] },
  { id: "kick", name: "Kick", price: 0, portrait: "", blurb: "A big boot to the chest.", clips: ["Unarmed_Melee_Attack_Kick", "Kick_Right", "Kick_Left"] },
  { id: "punch", name: "Punch", price: 0, portrait: "", blurb: "A royal right hook.", clips: ["Unarmed_Melee_Attack_Punch_A", "Punch_Right", "Pun"], speed: 1.4 },
  { id: "chop", name: "Chop", price: 4, portrait: "", blurb: "Both hands, straight down, with sparks.", clips: ["2H_Melee_Attack_Chop", "Sword_Slash", "Swo"], speed: 1.4, fx: "spark" },
  { id: "whirl", name: "Whirlwind", price: 6, portrait: "", blurb: "Spins with a ring of gold wind.", clips: ["2H_Melee_Attack_Spin", "Roll"], speed: 1.9, fx: "spin", ms: 1300 },
  { id: "leap", name: "Sky Leap", price: 8, portrait: "", blurb: "Jumps high and lands with a shockwave.", clips: ["1H_Melee_Attack_Jump_Chop", "2H_Melee_Attack_Slice", "Sword_Slash", "Swo"], fx: "leap", ms: 1350 },
  { id: "fireball", name: "Fireball", price: 8, portrait: "", blurb: "Throws a ball of fire.", clips: ["Spellcast_Shoot", "Gun_Shoot", "Punch_Right", "Pun"], fx: "fire", ms: 1250 },
  { id: "thunder", name: "Thunder", price: 10, portrait: "", blurb: "Calls lightning down on the enemy.", clips: ["Spellcast_Raise", "Spellcast_Long", "Wave"], speed: 1.6, fx: "thunder", ms: 1400 },
];

/** LG king attacks (the Brick Verse kings). */
export const LG_ATTACKS: GearItem[] = [
  { id: "lg-none", name: "Normal", price: 0, portrait: "", blurb: "The king's own punch." },
  {
    id: "shield-block",
    name: "Shield Block",
    price: 8,
    portrait: "",
    blurb: "Blocks the enemy's hit, throws his shield, the enemy bursts and the shield flies back. Needs a king with a shield.",
  },
];

/** Touchdown shows. Fireworks is free and already yours. The rest are bought, then pinned to preview. */
export const FB_CELEBRATIONS: GearItem[] = [
  { id: "fireworks", name: "Fireworks", price: 0, portrait: "", blurb: "Yours already. They shoot up fast and burst before the replay." },
  { id: "dragon", name: "Dragon", price: 8, portrait: "", blurb: "A dragon flaps in from nowhere and over the stadium." },
  { id: "horse", name: "War horse", price: 6, portrait: "", blurb: "A horse charges the goal line." },
  { id: "husky", name: "Husky", price: 6, portrait: "", blurb: "The war dog sprints the score." },
  { id: "carrier", name: "Sky carrier", price: 8, portrait: "", blurb: "The carrier slides over the lights." },
  { id: "pirate", name: "Pirate", price: 6, portrait: "", blurb: "The captain runs the goal line." },
];

/** Replay songs. More can be added later. Walking Down the Street In a Car is 10 Morse coins. */
export const FB_SONGS: GearItem[] = [
  { id: "song-none", name: "Crowd only", price: 0, portrait: "", blurb: "Just the stadium. Free." },
  { id: "song-walking", name: "Walking Down the Street In a Car", price: 10, portrait: "", blurb: "Plays through the replay of a score." },
];

export type KingFinish = GearItem & {
  /** Body lacquer, trim bands and crown metal of the AV pedestal king. */
  body: string;
  trim: string;
  crown: string;
  /** 0 = matte lacquer, 1 = polished metal. */
  metal: number;
  legendary?: boolean;
};

/** The nine king pieces in the AV grid, then the locked legendary one. */
export const FINISHES: KingFinish[] = [
  { id: "king-gold", name: "Gold King", price: 0, portrait: "", blurb: "Gilded from base to cross.", body: "#b8872f", trim: "#e6c25a", crown: "#e6c25a", metal: 0.9 },
  { id: "king-gunmetal", name: "Gunmetal King", price: 0, portrait: "", blurb: "Grey steel with a gold crown.", body: "#55565a", trim: "#c9a24a", crown: "#d8b252", metal: 0.85 },
  { id: "king-amethyst", name: "Amethyst King", price: 0, portrait: "", blurb: "Deep purple lacquer.", body: "#2f1d45", trim: "#c9a24a", crown: "#d8b252", metal: 0.45 },
  { id: "king-navy", name: "Navy King", price: 0, portrait: "", blurb: "Midnight blue with silver.", body: "#1b2238", trim: "#a9adb5", crown: "#b9bdc4", metal: 0.45 },
  { id: "king-crimson", name: "Crimson King", price: 0, portrait: "", blurb: "Oxblood red and gold.", body: "#6b2117", trim: "#c9a24a", crown: "#d8b252", metal: 0.45 },
  { id: "king-ivory", name: "Ivory King", price: 0, portrait: "", blurb: "White with a silver crown.", body: "#dcd8cf", trim: "#bfc2c7", crown: "#d6d8dc", metal: 0.35 },
  { id: "king-onyx", name: "Onyx King", price: 0, portrait: "", blurb: "Black and gold. The house king.", body: "#121110", trim: "#d1a740", crown: "#e2b84e", metal: 0.4 },
  { id: "king-sun", name: "Sun King", price: 0, portrait: "", blurb: "Bright polished gold.", body: "#d9a93c", trim: "#f2d27a", crown: "#f2d27a", metal: 1 },
  { id: "king-iron", name: "Iron King", price: 0, portrait: "", blurb: "Dark iron and silver.", body: "#2e3034", trim: "#8d9198", crown: "#a3a7ad", metal: 0.8 },
  { id: "king-royal-legacy", name: "Royal Legacy King", price: 20, portrait: "", blurb: "Legendary. Gold, onyx and a ruby cross.", body: "#0b0a09", trim: "#f0c75a", crown: "#ffd66b", metal: 1, legendary: true },
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
  lgAttackId: "lg-none",
  finishId: "king-onyx",
  lgBody: "cap",
  lgHead: "cap",
  lgHair: "none",
  lgLegs: "cap",
  lgWeapon: "none",
  fbCelebrate: "fireworks",
  fbSong: "song-none",
};

export const LEGO_PARTS: { id: string; name: string; file: string }[] = [
  { id: "cap", name: "Star Captain", file: "captain-america.glb" },
  { id: "spiderman", name: "Web Slinger", file: "spiderman.glb" },
  { id: "ironman", name: "Iron Flyer", file: "ironman.glb" },
  { id: "panther", name: "Shadow Cat", file: "blackpanther.glb" },
  { id: "strange", name: "Wizard", file: "wizard.glb" },
  { id: "agent", name: "Space Police", file: "space-police.glb" },
  { id: "widow", name: "Spy Queen", file: "widow.glb" },
  { id: "skeleton", name: "Skeleton", file: "skeleton.glb" },
  { id: "blacktron", name: "Blacktron", file: "blacktron.glb" },
  { id: "goblin", name: "Bomb Glider", file: "insectoid.glb" },
  { id: "doombot", name: "Tyrant Bot", file: "gigabot.glb" },
  { id: "doom", name: "Iron Tyrant", file: "doom-bigbrick.glb" },
];

export const LG_HAIR = [
  { id: "none", name: "No hair" },
  { id: "clown", name: "Clown hat" },
  { id: "chef", name: "Chef hat" },
  { id: "cappello", name: "Cappello" },
  { id: "gold-crown", name: "Gold Crown" },
  { id: "viking", name: "Viking helmet" },
];

export const LG_WEAPONS = [
  { id: "none", name: "Bare hands" },
  { id: "devil", name: "Devil sword" },
  { id: "talwar", name: "Talwar" },
];

export const legoPartById = (id: string) => LEGO_PARTS.find((row) => row.id === id) ?? LEGO_PARTS[0];

const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));

export const characterById = (id: string) => byId(CHARACTERS).get(id) ?? CHARACTERS[0];
export const swordById = (id: string) => byId(SWORDS).get(id) ?? SWORDS[0];
export const crownById = (id: string) => byId(CROWNS).get(id) ?? CROWNS[0];
export const mountById = (id: string) => byId(MOUNTS).get(id) ?? MOUNTS[0];
export const frameById = (id: string) => byId(FRAMES).get(id) ?? FRAMES[0];
export const finishById = (id: string) => byId(FINISHES).get(id) ?? FINISHES.find((f) => f.id === "king-onyx")!;
export const attackById = (id: string) => byId(ATTACKS).get(id) ?? ATTACKS[0];
export const lgAttackById = (id: string) => byId(LG_ATTACKS).get(id) ?? LG_ATTACKS[0];

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
  return [...CHARACTERS, ...SWORDS, ...CROWNS, ...MOUNTS, ...FRAMES, ...ATTACKS, ...LG_ATTACKS, ...FINISHES, ...FB_CELEBRATIONS, ...FB_SONGS];
}

export function gearPrice(id: string) {
  return allGear().find((item) => item.id === id)?.price ?? 0;
}

export function isKnownGear(id: string) {
  return allGear().some((item) => item.id === id);
}

export function parseLoadout(raw: unknown): AvatarLoadout {
  const src = raw && typeof raw === "object" ? (raw as Partial<AvatarLoadout>) : {};
  const style: PieceStyle = src.style === "2d" || src.style === "an" || src.style === "ra" || src.style === "lg" || src.style === "cl" || src.style === "pa" || src.style === "3d" ? src.style : "3d";
  const team: TeamView = src.team === "b" ? "b" : "w";
  const pick = (id: unknown, fallback: string, rows: { id: string }[]) =>
    typeof id === "string" && rows.some((row) => row.id === id) ? id : fallback;
  const oldSword = ["sword", "dual", "shield", "staff", "long", "cutlass", "axe", "rapier"];
  const swordRaw = oldSword.includes(String(src.swordId)) ? "devil" : src.swordId;
  const oldCrown = ["circlet", "sun", "poly-arch", "arched", "laurel"];
  // The propeller hat became the Gold Crown: anyone who wore it keeps a hat.
  const crownRaw = src.crownId === "propeller" ? "gold-crown" : oldCrown.includes(String(src.crownId)) ? "poly-band" : src.crownId;
  const hairRaw = src.lgHair === "propeller" ? "gold-crown" : src.lgHair;
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
    lgAttackId: pick(src.lgAttackId, "lg-none", LG_ATTACKS),
    finishId: pick(src.finishId, "king-onyx", FINISHES),
    lgBody: pick(src.lgBody, "cap", LEGO_PARTS),
    lgHead: pick(src.lgHead, "cap", LEGO_PARTS),
    lgHair: pick(hairRaw, "none", LG_HAIR),
    lgLegs: pick(src.lgLegs, "cap", LEGO_PARTS),
    lgWeapon: pick(src.lgWeapon, "none", LG_WEAPONS),
    fbCelebrate: pick(src.fbCelebrate, "fireworks", FB_CELEBRATIONS),
    fbSong: pick(src.fbSong, "song-none", FB_SONGS),
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
    loadout.lgAttackId,
    loadout.finishId,
  ];
}

export function letterOf(name: string) {
  const hit = name.match(/[A-Z]/);
  return (hit?.[0] ?? name.trim()[0] ?? "?").toUpperCase();
}
