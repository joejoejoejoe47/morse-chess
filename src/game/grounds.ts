import { asset } from "@/lib/base";

export type GroundId = "throne" | "yard" | "glade" | "keep";

export const GROUNDS: { id: GroundId; name: string; line: string; image: string }[] = [
  { id: "throne", name: "Throne Room", line: "The first hall. No coin is asked.", image: asset("/battle/throne.jpg") },
  { id: "yard", name: "Castle Yard", line: "Grass, banners, and the wall.", image: asset("/battle/yard.jpg") },
  { id: "glade", name: "Waterfall Glade", line: "Mist, moss, and a stone board.", image: asset("/battle/glade.jpg") },
  { id: "keep", name: "Mountain Keep", line: "Torchlight under the peaks.", image: asset("/battle/keep.jpg") },
];
