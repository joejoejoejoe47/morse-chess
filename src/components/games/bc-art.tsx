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

/**
 * The video's flat icon ship (t384u ref) in a 100x80 box: a hull, one square sail on a thin mast with
 * a small pennant and two stays, all wrapped in a thick outline. Black with a white outline for one
 * side, white with a black outline for the other. `pirate` paints a skull on the sail (t387u).
 */
export function BcShip({ white, pirate }: { white: boolean; pirate?: boolean; vertical?: boolean }) {
  const fill = white ? "#fff" : "#000";
  const ink = white ? "#000" : "#fff";
  const hull = "M3 52 L28 52 L31 60 L80 60 L97 45 C93 64 85 75 70 76 L22 76 C11 74 5 64 3 52 Z";
  const sail = "M28 13 C42 17 58 16 70 10 C74 22 75 36 72 49 C60 52 44 52 31 50 C34 38 33 25 28 13 Z";
  return (
    <g strokeLinejoin="round" strokeLinecap="round" data-bc-ship-art={pirate ? "pirate" : "ship"}>
      {/* outline */}
      <g stroke={ink} strokeWidth={8} fill={ink}>
        <path d={hull} />
        <path d={sail} />
      </g>
      <path d="M51 58 V5 M51 6 L96 45 M51 6 L8 52" stroke={ink} strokeWidth={6.5} fill="none" />
      <path d="M51 4 L62 1.5 L59 6 L62 9 L51 8 Z" fill={ink} stroke={ink} strokeWidth={4} />
      {/* body */}
      <path d="M51 58 V5" stroke={fill} strokeWidth={2.4} />
      <path d="M51 6 L96 45 M51 6 L8 52" stroke={fill} strokeWidth={1.8} fill="none" />
      <path d="M51 4 L62 1.5 L59 6 L62 9 L51 8 Z" fill={fill} />
      <path d={sail} fill={fill} />
      <path d={hull} fill={fill} />
      {pirate ? (
        <g fill={ink}>
          <circle cx={51} cy={27} r={9} />
          <rect x={45.5} y={31} width={11} height={7} rx={2} />
          <circle cx={47.5} cy={26.5} r={2.6} fill={fill} />
          <circle cx={54.5} cy={26.5} r={2.6} fill={fill} />
          <path d="M40 40 L62 46 M62 40 L40 46" stroke={ink} strokeWidth={3} />
          {[38, 48, 58, 68].map((x) => (
            <circle key={x} cx={x} cy={67} r={2.2} />
          ))}
        </g>
      ) : null}
    </g>
  );
}

/** One square of the video's lava: an orange/red/yellow pixel mosaic covering the whole cell. */
export const bcLavaTex = (n: number) => asset(`/legendary/bc/lava-${n & 3}.webp`);

/** The grassy one-square hill (t386u ref) in a 100x100 box: a faceted grey rim round a flat green top. */
export function BcHill() {
  const rim = "M18 8 L52 2 L80 10 L96 34 L92 66 L98 84 L72 98 L40 94 L10 98 L2 70 L8 40 Z";
  const top = "M26 18 L50 12 L74 20 L84 40 L78 62 L60 70 L64 84 L44 80 L26 86 L22 64 L14 46 Z";
  return (
    <g strokeLinejoin="round" data-bc-hill>
      <path d={rim} fill="#2a1a0c" opacity={0.35} transform="translate(2 3)" />
      <path d={rim} fill="#b4b0aa" />
      <path d="M18 8 L52 2 L50 12 L26 18 Z" fill="#cbc8c2" />
      <path d="M80 10 L96 34 L84 40 L74 20 Z" fill="#a19d97" />
      <path d="M96 34 L92 66 L78 62 L84 40 Z" fill="#8f8b85" />
      <path d="M92 66 L98 84 L72 98 L64 84 L78 62 Z" fill="#9a968f" />
      <path d="M40 94 L10 98 L26 86 L44 80 Z" fill="#a8a49e" />
      <path d="M2 70 L8 40 L14 46 L22 64 L26 86 L10 98 Z" fill="#bdb9b3" />
      <path d="M52 2 L80 10 L74 20 L50 12 Z" fill="#d6d3cd" />
      <path d={top} fill="#b8d67e" />
      <path d="M26 18 L50 12 L46 22 L32 26 Z M74 20 L84 40 L76 38 Z M60 70 L64 84 L56 78 Z" fill="#c8e290" />
      <path d="M22 64 L26 86 L32 74 Z M78 62 L60 70 L70 62 Z M14 46 L22 64 L20 50 Z" fill="#9cbf63" />
      <path d="M30 40 L36 36 L34 46 Z M60 32 L66 30 L64 40 Z" fill="#a9c972" opacity={0.8} />
      <path d="M40 4 L46 3 L44 9 Z" fill="#9bc066" />
    </g>
  );
}

/** Two tall smoke plumes flecked with glowing embers that sit on an erupting volcano (t389u ref). */
export function BcPlumes() {
  const plume = (x: number, h: number, seed: number) => {
    let s = seed;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const puffs: [number, number, number][] = [];
    for (let y = 0; y < h; y += 6) puffs.push([x + (rnd() - 0.5) * 10, -y, 14 - (y / h) * 3 + rnd() * 3]);
    const embers: [number, number, number][] = Array.from({ length: 26 }, () => [x + (rnd() - 0.5) * 20, -rnd() * h * 0.75, 1 + rnd() * 1.8]);
    return (
      <g key={seed} className="bc2-plume" style={{ animationDelay: `${-seed * 0.37}s` }}>
        {puffs.map(([px, py, r], i) => (
          <circle key={`o${i}`} cx={px} cy={py} r={r + 1.5} fill="#1c120c" />
        ))}
        {puffs.map(([px, py, r], i) => (
          <circle key={`f${i}`} cx={px - 1.5} cy={py - 1} r={r} fill={i % 2 ? "#3b2a20" : "#33241b"} />
        ))}
        {puffs.map(([px, py, r], i) => (i % 2 ? <circle key={`h${i}`} cx={px - 4} cy={py - 3} r={r * 0.4} fill="#57443a" opacity={0.7} /> : null))}
        {embers.map(([ex, ey, r], i) => (
          <rect key={`e${i}`} x={ex} y={ey} width={r * 1.6} height={r} fill={i % 3 ? "#ff7a1a" : "#ffc23a"} className="bc2-ember" style={{ animationDelay: `${(i * 0.13) % 1.2}s` }} />
        ))}
      </g>
    );
  };
  return (
    <g data-bc-plumes>
      {plume(32, 62, 3)}
      {plume(66, 70, 8)}
    </g>
  );
}

/** Low-poly grey rock with snow, about 2x2 cells, drawn in a 100x100 box (it overhangs a little). */
const MTN_OUTLINE = "M6 30 L18 12 L40 6 L52 12 L70 4 L88 14 L96 34 L93 60 L98 80 L84 94 L60 90 L40 96 L16 92 L4 74 L8 52 Z";

/** A jagged white snow cap: an irregular star of spikes around (cx, cy). */
function snowStar(cx: number, cy: number, r: number, seed: number): { lit: string; shade: string } {
  const n = 9;
  const pts: [number, number][] = [];
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r * (0.75 + rnd() * 0.5) : r * (0.3 + rnd() * 0.12);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92]);
  }
  const d = (ps: [number, number][]) => "M" + ps.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L") + " Z";
  // shaded lower-right half: the centre plus the spikes from 3 o'clock round to 8 o'clock
  const half = pts.slice(n / 2 | 0, (n / 2 | 0) + n + 1);
  return { lit: d(pts), shade: d([[cx, cy], ...half]) };
}

/**
 * A mountain (100x100) in the video's flat style (t383u ref): a soft-edged gray rock blob that
 * covers its 2x2 cells, angular faceted shading and crisp white jagged snow peaks.
 */
export function BcMountain() {
  const big = snowStar(64, 36, 19, 7);
  const small = snowStar(28, 50, 13, 3);
  return (
    <g strokeLinejoin="round">
      <defs>
        <filter id="bc-mtn-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        <clipPath id="bc-mtn-clip">
          <path d={MTN_OUTLINE} />
        </clipPath>
      </defs>
      <path d={MTN_OUTLINE} fill="#2a1a0c" opacity={0.45} transform="translate(2 3)" filter="url(#bc-mtn-soft)" />
      <path d={MTN_OUTLINE} fill="#a19e99" filter="url(#bc-mtn-soft)" opacity={0.9} />
      <g clipPath="url(#bc-mtn-clip)">
        <path d={MTN_OUTLINE} fill="#b9b6b1" transform="translate(50 50) scale(0.96) translate(-50 -50)" />
        <path d="M6 30 L40 6 L36 30 L20 40 Z" fill="#c9c6c1" />
        <path d="M40 6 L70 4 L58 24 L44 22 Z" fill="#d0cdc8" />
        <path d="M70 4 L96 34 L80 30 L72 18 Z" fill="#c4c1bc" />
        <path d="M44 22 L58 24 L52 46 L36 30 Z" fill="#aaa7a2" />
        <path d="M80 30 L96 34 L93 60 L78 52 Z" fill="#9e9b96" />
        <path d="M52 46 L78 52 L70 70 L50 62 Z" fill="#a5a29d" />
        <path d="M8 52 L20 40 L36 56 L18 72 L4 74 Z" fill="#b0ada8" />
        <path d="M36 56 L50 62 L44 80 L22 84 L18 72 Z" fill="#93908b" />
        <path d="M70 70 L93 60 L98 80 L84 94 L66 86 Z" fill="#989590" />
        <path d="M44 80 L66 86 L60 90 L40 96 L30 90 Z" fill="#9b9893" />
        <path d="M58 24 L72 18 L80 30 L78 52 L52 46 Z" fill="#bab7b2" />
        <path d="M30 60 L36 56 L40 70 Z M60 66 L66 64 L64 78 Z M82 40 L86 46 L80 50 Z M22 30 L28 26 L26 36 Z" fill="#6f6b66" opacity={0.7} />
        <path d="M14 20 L30 12 L22 24 Z M48 10 L60 8 L52 16 Z M86 22 L92 30 L84 28 Z" fill="#cfccc6" opacity={0.75} />
      </g>
      {[big, small].map((st, i) => (
        <g key={i}>
          <path d={st.lit} fill="#000" opacity={0.18} transform="translate(1.4 2)" />
          <path d={st.lit} fill="#fbfcfd" />
          <path d={st.shade} fill="#d4d8de" />
        </g>
      ))}
    </g>
  );
}

/**
 * The video's bush (t384u ref) in a 100x100 box: a big round puffy cluster of layered leaf blobs,
 * darker scalloped undersides, lighter tops and pale leaf flecks, filling its square.
 */
function scallop(cx: number, cy: number, r: number, n: number, k: number) {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + k;
    out.push([cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78, r * 0.32]);
  }
  out.push([cx, cy, r * 0.8]);
  return out;
}
export function BcBush() {
  const puffs: [number, number, number][] = [[50, 30, 21], [27, 42, 19], [73, 44, 19], [32, 66, 20], [66, 68, 20], [50, 52, 22], [50, 78, 16]];
  const draw = (r0: number, dx: number, dy: number, scale: number, fill: (i: number) => string, key: string) =>
    puffs.flatMap(([x, y, r], i) =>
      scallop(x + dx, y + dy, r * scale + r0, 11, i * 0.7).map(([px, py, pr], j) => <circle key={`${key}${i}-${j}`} cx={px} cy={py} r={pr} fill={fill(i)} />),
    );
  return (
    <g data-bc-bush-art>
      <ellipse cx={53} cy={86} rx={40} ry={9} fill="#000" opacity={0.22} />
      {draw(3, 0, 1.5, 1, () => "#1f4d1d", "o")}
      {draw(0, 0, 0, 1, (i) => (i % 2 ? "#2f6e2a" : "#33772d"), "m")}
      {draw(0, -3, -3.5, 0.72, (i) => (i % 2 ? "#4c9441" : "#529b46"), "l")}
      {draw(0, -5, -6, 0.42, (i) => (i % 3 ? "#6aaa58" : "#74b261"), "t")}
      {puffs.map(([x, y], i) => (
        <g key={`f${i}`} fill="#9ccc84" opacity={0.45}>
          <circle cx={x - 8} cy={y - 9} r={1.8} />
          <circle cx={x - 3} cy={y - 11} r={1.4} />
          <circle cx={x - 10} cy={y - 4} r={1.2} />
        </g>
      ))}
    </g>
  );
}
