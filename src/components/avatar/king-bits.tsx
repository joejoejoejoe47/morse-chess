/** Small AV king stage pieces shared by the AV page and the store's king preview. */
import { useRef } from "react";
import { RaPawn, raUnitUrl } from "@/components/chess/ra-men";
import { StonePerson, type Gait } from "@/components/chess/stone-people";
import { RaCrown, WarDog } from "@/components/chess/war-dog";

export function RaPreview({ team, crownId, dog, striking = false }: { team: "w" | "b"; crownId: string; dog: boolean; striking?: boolean }) {
  const gait = useRef<Gait>({ phase: 0, amp: 0, act: "idle", fade: 1 });
  gait.current.act = striking ? "attack" : "idle";
  return (
    <group>
      <RaPawn gait={gait} url={raUnitUrl("k")} team={team === "b" ? "red" : "blue"} role="k" />
      <RaCrown crownId={crownId} team={team} />
      {dog ? (
        <group position={[0.75, 0, 0.2]}>
          <WarDog act="idle" />
        </group>
      ) : null}
    </group>
  );
}

export function BlueRook() {
  const gait = useRef<Gait>({ phase: 0, amp: 0, act: "idle", fade: 1 });
  return <StonePerson type="r" white cast="stone" gait={gait} flip={false} />;
}


export function CrownFlat({ id, dark }: { id: string; dark: boolean }) {
  const metal = dark ? "#2a241c" : "#e4c56a";
  const edge = dark ? "#0c0a08" : "#7a5620";
  const leaf = dark ? "#3e4a36" : "#8fa56a";
  const crown =
    id === "halo"
      ? ""
      : id === "royal-crown"
        ? "M8 58 L16 22 L28 40 L50 8 L72 40 L84 22 L92 58 Z"
        : id === "poly-arch"
          ? "M10 58 L22 30 Q50 4 78 30 L90 58 Z"
          : "M12 58 L18 40 L32 48 L50 28 L68 48 L82 40 L88 58 Z";
  return (
    <svg
      viewBox="0 0 100 70"
      className="pointer-events-none absolute left-1/2 top-[27%] w-[34%] -translate-x-1/2"
      aria-hidden
    >
      {id === "halo" ? (
        <ellipse cx="50" cy="36" rx="28" ry="10" fill="none" stroke={metal} strokeWidth="5" />
      ) : id === "laurel" ? (
        <g fill={leaf} stroke={edge} strokeWidth="1.2">
          {[-1, 1].map((side) => (
            <g key={side} transform={`translate(50 48) scale(${side} 1)`}>
              {[0, 1, 2, 3, 4].map((i) => (
                <ellipse
                  key={i}
                  cx={8 + i * 6}
                  cy={-4 + i * 2}
                  rx="6"
                  ry="3.2"
                  transform={`rotate(${-36 + i * 14} ${8 + i * 6} ${-4 + i * 2})`}
                />
              ))}
            </g>
          ))}
        </g>
      ) : (
        <path d={crown} fill={metal} stroke={edge} strokeWidth="2" strokeLinejoin="round" />
      )}
      <rect x="8" y="54" width="84" height="8" rx="1.5" fill={metal} stroke={edge} strokeWidth="1.5" />
    </svg>
  );
}
