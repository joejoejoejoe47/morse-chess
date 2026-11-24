/**
 * Battle Chess art (MB-19, video 4pmjgON8Y68): the video uses the classic flat "cburnett" chess set
 * (Colin M.L. Burnett, GPLv2+ / CC BY-SA 3.0, via lichess) on wood-grain squares and a wood-grain
 * blue sea. The new pieces below are drawn in the same style: a solid fill, a 1.5 black outline,
 * inner lines in the opposite colour. Everything is in a 45x45 box like the cburnett files.
 */
import { asset } from "@/lib/base";

export const BC_STD = new Set(["K", "Q", "R", "B", "N", "P"]);
export const bcPieceUrl = (c: "w" | "b", kind: string) => asset(`/legendary/bc/pieces/${c}${kind}.svg`);
export const bcTex = (kind: "land-l" | "land-d" | "sea-l" | "sea-d", n: number) => asset(`/legendary/bc/${kind}-${n & 3}.webp`);

/** New pieces in the cburnett style. White = white fill / black ink; Black = black fill / white inner ink. */
export function BcSpecial({ kind, white }: { kind: string; white: boolean }) {
  const fill = white ? "#fff" : "#000";
  const inner = white ? "#000" : "#fff";
  const o = { fill, stroke: "#000", strokeWidth: 1.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  if (kind === "E")
    // eagle head in profile, hooked beak to the right like the video
    return (
      <g>
        <path {...o} d="M9 40 L12 33 C8 29 7 23 9 18 C12 11 19 7 26 8 C31 8.5 35 11 37.5 14.5 L40.5 16 C42 18 42 21 40 23.5 C38.6 25.2 36.6 25.6 35 25 C34.5 28 33 31 31 33 L34 40 L29.5 37.5 L28 41 L24.5 37 L22 41 L19.5 36.5 L16 40 L15 35 Z" />
        <path d="M37.5 14.5 C35.5 16.5 33.5 17.5 30.5 17.6 C32 19.5 34 21.5 35 25" fill="none" stroke={inner} strokeWidth={1.2} />
        <circle cx={28.5} cy={14.6} r={1.7} fill={inner} />
        <path d="M23 13.5 C25.5 12 28.5 12 31.5 13" fill="none" stroke={inner} strokeWidth={1.3} />
        <path d="M14 22 C16 25 18 26.5 21 27 M13 28 C16 30.5 19 31.5 23 31.5 M17 34 C20 35 23 35 26 34" fill="none" stroke={inner} strokeWidth={1} />
      </g>
    );
  if (kind === "C")
    // archer: drawn bow with an arrow, pointing up-right
    return (
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.5 9.5 C3 22 10 38 35.5 33.5" stroke="#000" strokeWidth={5.5} />
        <path d="M11.5 9.5 C3 22 10 38 35.5 33.5" stroke={fill} strokeWidth={2.6} />
        <path d="M11.5 9.5 L35.5 33.5" stroke={white ? "#000" : "#fff"} strokeWidth={0.9} />
        <path d="M7.5 37.5 L36 9" stroke="#000" strokeWidth={4.2} />
        <path d="M7.5 37.5 L36 9" stroke={fill} strokeWidth={1.8} />
        <path d="M39.5 5.5 L37.8 13.2 L31.8 7.2 Z" fill={fill} stroke="#000" strokeWidth={1.4} />
        <path d="M10.2 34.8 L5 34 L4.2 38.4 L9 40 Z M12.6 32.4 L8.4 30.4 L6.2 34.2" fill={fill} stroke="#000" strokeWidth={1.2} />
      </g>
    );
  if (kind === "A")
    // assassin: a pointed hood, the face opening in the other colour
    return (
      <g>
        <path {...o} d="M22.5 5 C15 10 10.5 18 10.5 28 L9.5 38.5 L35.5 38.5 L34.5 28 C34.5 18 30 10 22.5 5 Z" />
        <path d="M16.8 38 L16.8 27 C16.8 21.5 19.6 18.6 22.5 18.6 C25.4 18.6 28.2 21.5 28.2 27 L28.2 38 Z" fill={inner} stroke="#000" strokeWidth={1.2} />
        <path {...o} d="M8.5 38.5 H36.5 V41.5 H8.5 Z" />
      </g>
    );
  if (kind === "W")
    // wizard: a curled pointed hat on a wide brim
    return (
      <g>
        <path {...o} d="M13 33 C16.5 26 18.5 18 21.5 11.5 C23 8 26.5 5.5 31 6.5 C27.8 8.6 27 11.8 27.6 16 C28.4 22 30.5 28 32.5 33 Z" />
        <ellipse {...o} cx={22.5} cy={34.5} rx={15} ry={4} />
        <path d="M14.8 29.5 C19.5 31 25.5 31 31 29.5" fill="none" stroke={inner} strokeWidth={1.4} />
        <path d="M22 16 L23 18.4 L25.5 18.6 L23.6 20.2 L24.2 22.7 L22 21.3 L19.9 22.7 L20.5 20.2 L18.6 18.6 L21.1 18.4 Z" fill={inner} />
      </g>
    );
  if (kind === "I")
    // pirate: a tricorn with a skull and crossed swords
    return (
      <g>
        <path {...o} d="M6 25 C9 16 15 12.5 22.5 12.5 C30 12.5 36 16 39 25 C34 22.5 29 23 22.5 27 C16 23 11 22.5 6 25 Z" />
        <circle cx={22.5} cy={19} r={3.4} fill={inner} />
        <path d="M20.7 23 H24.3" stroke={inner} strokeWidth={1.6} />
        <circle cx={21.2} cy={18.6} r={0.9} fill={fill} />
        <circle cx={23.8} cy={18.6} r={0.9} fill={fill} />
        <path d="M11 39 L33 29 M34 39 L12 29" stroke="#000" strokeWidth={4} strokeLinecap="round" />
        <path d="M11 39 L33 29 M34 39 L12 29" stroke={fill} strokeWidth={1.8} strokeLinecap="round" />
      </g>
    );
  if (kind === "U")
    return (
      <g>
        <path {...o} d="M12 9 H21 V29 L29 30 C32.5 30.5 34 33 34 36.5 V38.5 H12 Z" />
        <path d="M12 14 H21 M12 33 H34" stroke={inner} strokeWidth={1.3} />
      </g>
    );
  if (kind === "H")
    // treasure chest (side-less, like the video's orange chests)
    return (
      <g strokeLinejoin="round">
        <path d="M7 19 C7 11 38 11 38 19 V22 H7 Z" fill="#e3922d" stroke="#3b2208" strokeWidth={1.5} />
        <path d="M7 22 H38 V37 H7 Z" fill="#c8741c" stroke="#3b2208" strokeWidth={1.5} />
        <path d="M7 22 H38" stroke="#ffd36b" strokeWidth={2} />
        <path d="M13 13.5 V37 M32 13.5 V37" stroke="#ffd36b" strokeWidth={1.8} />
        <rect x={19.5} y={19.5} width={6} height={7.5} rx={1} fill="#ffd36b" stroke="#3b2208" strokeWidth={1.2} />
        <path d="M22.5 21.2 V24 M22.5 25.4 V25.6" stroke="#3b2208" strokeWidth={1.3} strokeLinecap="round" />
      </g>
    );
  return <circle cx={22.5} cy={22.5} r={12} {...o} />;
}

/** A galleon over two cells, drawn in a 90x60 box (it rises above its cells like the video's ships). */
export function BcShip({ white, vertical }: { white: boolean; vertical: boolean }) {
  const fill = white ? "#fff" : "#000";
  const ink = white ? "#000" : "#fff";
  const halo = white ? "#000" : "#fff";
  const hull = "M4 40 L18 40 L20 44 L76 44 L88 36 C84 48 76 55 62 56 L24 56 C14 55 7 49 4 40 Z";
  const stern = "M4 40 L5 30 L20 30 L21 40 Z";
  const s1 = "M22 14 C30 17 40 17 46 14 C48 22 48 30 46 38 C40 40 30 40 22 38 C24 30 24 22 22 14 Z";
  const s2 = "M50 6 C58 9 66 9 72 6 C74 16 74 26 72 36 C66 38 58 38 50 36 C52 26 52 16 50 6 Z";
  const jib = "M75 12 L89 34 L75 36 Z";
  const g = (
    <g strokeLinejoin="round" strokeLinecap="round">
      <g stroke={halo} strokeWidth={5} fill={halo}>
        <path d={hull} />
        <path d={stern} />
        <path d={s1} />
        <path d={s2} />
        <path d={jib} />
      </g>
      <path d="M34 42 V8 M61 42 V2 M75 40 V10" stroke={ink} strokeWidth={1.6} />
      <path d={s1} fill={fill} stroke={ink} strokeWidth={1.5} />
      <path d={s2} fill={fill} stroke={ink} strokeWidth={1.5} />
      <path d={jib} fill={fill} stroke={ink} strokeWidth={1.5} />
      <path d="M25 26 C31 28 39 28 44 26 M53 21 C59 23 66 23 70 21" fill="none" stroke={ink} strokeWidth={1} />
      <path d={hull} fill={fill} stroke={ink} strokeWidth={1.5} />
      <path d={stern} fill={fill} stroke={ink} strokeWidth={1.5} />
      <path d="M10 49 H78" stroke={ink} strokeWidth={1.3} />
      {[24, 33, 42, 51, 60, 69].map((x) => (
        <rect key={x} x={x} y={45.6} width={3.4} height={2.2} fill={ink} />
      ))}
      <path d="M61 2 L70 4.5 L61 7 Z" fill={ink} />
    </g>
  );
  return vertical ? <g transform="translate(60 0) rotate(90)">{g}</g> : g;
}

/** Low-poly grey rock with snow, about 2x2 cells, drawn in a 100x100 box (it overhangs a little). */
export function BcMountain() {
  return (
    <g strokeLinejoin="round">
      <path d="M2 92 L8 60 L22 34 L40 18 L52 22 L66 8 L82 30 L94 56 L98 92 Z" fill="#000" opacity={0.28} transform="translate(3 4)" />
      <path d="M2 92 L8 60 L22 34 L40 18 L52 22 L66 8 L82 30 L94 56 L98 92 Z" fill="#9aa0aa" stroke="#4a4f58" strokeWidth={1.4} />
      <path d="M22 34 L40 18 L46 46 Z" fill="#c4c9d1" />
      <path d="M40 18 L52 22 L46 46 Z" fill="#e9ecf0" />
      <path d="M52 22 L66 8 L62 40 Z" fill="#f6f7f9" />
      <path d="M66 8 L82 30 L62 40 Z" fill="#b9bec7" />
      <path d="M82 30 L94 56 L70 58 L62 40 Z" fill="#8c929c" />
      <path d="M8 60 L22 34 L46 46 L30 70 Z" fill="#a9aeb8" />
      <path d="M46 46 L62 40 L70 58 L54 76 L30 70 Z" fill="#7d838d" />
      <path d="M2 92 L8 60 L30 70 L24 92 Z" fill="#8f959f" />
      <path d="M24 92 L30 70 L54 76 L60 92 Z" fill="#6c727c" />
      <path d="M60 92 L54 76 L70 58 L94 56 L98 92 Z" fill="#7a808a" />
      <path d="M58 14 L66 8 L70 18 L63 24 Z M36 24 L40 18 L44 28 Z M76 26 L82 30 L78 36 Z" fill="#fff" />
      <path d="M2 92 L8 60 L22 34 L40 18 L52 22 L66 8 L82 30 L94 56 L98 92 Z" fill="none" stroke="#4a4f58" strokeWidth={1.4} />
    </g>
  );
}

/** A round leafy bush (100x100), scalloped like the video's tree tops. */
export function BcBush() {
  const blobs: [number, number, number][] = [[50, 34, 20], [30, 44, 18], [70, 44, 18], [38, 62, 19], [62, 62, 19], [50, 50, 22]];
  return (
    <g>
      <ellipse cx={54} cy={80} rx={34} ry={10} fill="#000" opacity={0.25} />
      {blobs.map(([x, y, r], i) => (
        <circle key={`o${i}`} cx={x} cy={y} r={r + 2.5} fill="#1d4a1a" />
      ))}
      {blobs.map(([x, y, r], i) => (
        <circle key={`f${i}`} cx={x} cy={y} r={r} fill={i % 2 ? "#3c8a35" : "#46993d"} />
      ))}
      {blobs.map(([x, y, r], i) => (
        <circle key={`h${i}`} cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.45} fill="#6cbf55" opacity={0.55} />
      ))}
      {[[36, 40], [58, 30], [66, 56], [44, 66], [52, 48]].map(([x, y], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r={2.2} fill="#a6e08c" opacity={0.8} />
      ))}
    </g>
  );
}
