/**
 * Football gear (owner t245u): touchdown celebrations and replay songs, bought with Morse coins in
 * AV > FB mode and added to the avatar FB_CELEBRATIONS list (loadout fbCelebrate). Prices live here and are exported
 * to php/data/catalog.json (scripts/export-php-data.mjs) so the server's buyGear charges the same.
 *
 * Every 3D model is somebody else's free model (CC0 or CC BY, never CC BY-SA or paid) and is credited
 * here, in public/football/CREDITS.md and on the in-game credits screen (/credits).
 */

export type Credit = { what: string; author: string; url: string; license: "CC0 1.0" | "CC BY 3.0" | "CC BY 4.0" };

export type Celebration = {
  id: string;
  name: string;
  price: number;
  portrait: string;
  blurb: string;
  /** a short label for the effect type shown on the tile */
  icon: string;
  /** the models / baked tracks it uses (empty = made in code) */
  credits: Credit[];
};

export const CELEB_DEFAULT = "cel-fireworks";

const POLY_GOOGLE = "Poly by Google (via Poly Pizza)";

export const CELEBRATIONS: Celebration[] = [
  {
    id: "cel-fireworks",
    name: "Fireworks",
    price: 0,
    portrait: "",
    icon: "✸",
    blurb: "Rockets shoot up fast and burst over the end zone. Yours for free.",
    credits: [{ what: "Fireworks Demo - Free Download (baked particle track)", author: "Laurie Annis (Sketchfab)", url: "https://sketchfab.com/3d-models/fireworks-demo-free-download-a1d25b0cb6304797bed59abad55d9f20", license: "CC BY 4.0" }],
  },
  { id: "cel-confetti", name: "Confetti Cannons", price: 10, portrait: "", icon: "✦", blurb: "Four cannons blast team-colour confetti over the end zone.", credits: [] },
  { id: "cel-coins", name: "Coin Shower", price: 10, portrait: "", icon: "◎", blurb: "Gold Morse coins rain down on the scorer.", credits: [] },
  { id: "cel-lasers", name: "Laser Show", price: 15, portrait: "", icon: "⟋", blurb: "Neon lasers sweep the stadium from the roof.", credits: [] },
  { id: "cel-thunder", name: "Thunder Strike", price: 15, portrait: "", icon: "ϟ", blurb: "The sky goes dark and lightning hits the end zone.", credits: [] },
  {
    id: "cel-balloons",
    name: "Hot Air Balloons",
    price: 15,
    portrait: "",
    icon: "◓",
    blurb: "Three balloons rise up behind the end zone.",
    credits: [{ what: "Hot air balloon", author: POLY_GOOGLE, url: "https://poly.pizza/m/7Fej0Jd3_Di", license: "CC BY 3.0" }],
  },
  {
    id: "cel-blimp",
    name: "Team Blimp",
    price: 15,
    portrait: "",
    icon: "⬬",
    blurb: "A blimp drifts over the stadium with spotlights on the field.",
    credits: [{ what: "Blimp", author: POLY_GOOGLE, url: "https://poly.pizza/m/45-KKnBcxvE", license: "CC BY 3.0" }],
  },
  {
    id: "cel-hawks",
    name: "Hawk Squadron",
    price: 20,
    portrait: "",
    icon: "ᐱ",
    blurb: "A V of hawks swoops low over the end zone.",
    credits: [{ what: "Hawk Lp Rigged", author: "Sherkiz (via Poly Pizza)", url: "https://poly.pizza/m/RkN6MEbP6g", license: "CC BY 3.0" }],
  },
  {
    id: "cel-whale",
    name: "Sky Whale",
    price: 20,
    portrait: "",
    icon: "◖",
    blurb: "A giant whale swims through the sky over the stadium.",
    credits: [{ what: "Whale", author: "Quaternius (via Poly Pizza)", url: "https://poly.pizza/m/JGFwp6xWgk", license: "CC0 1.0" }],
  },
  {
    id: "cel-ufo",
    name: "UFO Visit",
    price: 20,
    portrait: "",
    icon: "⊚",
    blurb: "A flying saucer drops in, beams the end zone and zooms away.",
    credits: [{ what: "UFO", author: POLY_GOOGLE, url: "https://poly.pizza/m/eohMeC0WMlM", license: "CC BY 3.0" }],
  },
  {
    id: "cel-rocket",
    name: "Rocket Launch",
    price: 25,
    portrait: "",
    icon: "⇧",
    blurb: "A rocket blasts off behind the end zone and bursts in the sky.",
    credits: [{ what: "Rocketship", author: "Gabriel Valdivia (via Poly Pizza)", url: "https://poly.pizza/m/a5ChWS6uW0y", license: "CC BY 3.0" }],
  },
  {
    id: "cel-dragon",
    name: "Dragon Flyover",
    price: 30,
    portrait: "",
    icon: "🜂",
    blurb: "A dragon appears out of nowhere and flaps over the stadium breathing fire.",
    credits: [{ what: "Dragon Evolved", author: "Quaternius (via Poly Pizza)", url: "https://poly.pizza/m/LlwD0QNUPj", license: "CC0 1.0" }],
  },
];

/** The bought shows (not fireworks, which is the user's own free entry in avatar FB_CELEBRATIONS). */
export const CEL_SHOWS = CELEBRATIONS.filter((c) => c.id !== CELEB_DEFAULT);
export const isCelShow = (id: string | null | undefined) => !!id && CEL_SHOWS.some((c) => c.id === id);
