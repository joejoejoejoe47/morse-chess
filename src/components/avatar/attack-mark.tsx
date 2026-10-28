/** Small line icons for the king attacks (AN attacks and LG attacks). */
export const ATTACK_MARKS: Record<string, string> = {
  march: "M5 17l7-7 7 7",
  stab: "M3 12h14M13 8l4 4-4 4",
  slash: "M5 19L19 5M13 5h6v6",
  kick: "M9 3v9l-4 7h3M9 12l6 3h5",
  punch: "M7 8h6a4 4 0 010 8H7zM7 8v8M3 10h2M3 14h2",
  chop: "M6 20L15 11M12 5a6 6 0 007 7l-4-4z",
  whirl: "M12 12a2 2 0 112 2 4 4 0 11-5-4 7 7 0 119 7",
  leap: "M3 20c3-13 14-13 17-2M17 15l3 3 2-4",
  fireball: "M11 12a4 4 0 108 0a4 4 0 10-8 0M2 9h7M1 12h8M2 15h7",
  thunder: "M13 2L6 13h6l-1 9 8-12h-6l0-8z",
  "lg-none": "M7 8h6a4 4 0 010 8H7zM7 8v8M3 10h2M3 14h2",
  "shield-block": "M12 3a9 9 0 100 18a9 9 0 100-18M12 7a5 5 0 100 10a5 5 0 100-10M12 10l.8 1.6 1.8.3-1.3 1.2.3 1.8-1.6-.9-1.6.9.3-1.8-1.3-1.2 1.8-.3z",
};

export function AttackMark({ id }: { id: string }) {
  const path = ATTACK_MARKS[id] ?? ATTACK_MARKS.march;
  return (
    <svg viewBox="0 0 24 24" className="size-10 shrink-0 rounded-lg bg-walnut p-1 text-cream" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
