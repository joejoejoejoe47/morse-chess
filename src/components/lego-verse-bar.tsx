import { CAST_POOL, hydrateCast, setLegoCastRole, setLegoGood, setLegoScene, useLegoLook, type CastRole } from "@/lib/lego-look";
import { saveCast } from "@/lib/lego-cast-save";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

const ROLES: { id: CastRole; label: string }[] = [
  { id: "k", label: "King" },
  { id: "q", label: "Queen" },
  { id: "r", label: "Rook" },
  { id: "b", label: "Bishop" },
  { id: "n", label: "Knight" },
  { id: "p", label: "Pawn" },
];

/** Latest saved LG board. The lineup can be changed on the board preview, not during a real game. */
export function LegoVerseBar({ show, arrange = false }: { show: boolean; arrange?: boolean }) {
  const { scene, good, cast } = useLegoLook();
  useEffect(() => {
    hydrateCast();
  }, []);
  if (!show) return null;
  const chip = (on: boolean) =>
    cn("min-h-10 px-3 py-1.5 text-[13px] font-medium", on ? "bg-ivory text-ink" : "text-mist hover:text-ivory");
  const avengers = scene === "avengers";
  return (
    <div className="mt-2 flex flex-col items-center gap-2" data-lego-verse>
      <div className="flex overflow-hidden rounded-full border border-line bg-panel">
        <button type="button" data-lego-scene="latest" className={chip(scene === "latest")} onClick={() => setLegoScene("latest")}>
          Latest board
        </button>
        <button type="button" data-lego-scene="avengers" className={chip(avengers)} onClick={() => setLegoScene("avengers")}>
          Avengers
        </button>
        {avengers ? null : (
          <button
            type="button"
            data-lego-good={good === "ant" ? "ant" : "heroes"}
            className={chip(good === "ant")}
            title={good === "ant" ? "Good queen is Ant-Man. Press to put the heroes back." : "Change the good side. The queen becomes Ant-Man."}
            onClick={() => setLegoGood(good === "ant" ? "heroes" : "ant")}
          >
            {good === "ant" ? "Ant-Man queen" : "Change good side"}
          </button>
        )}
      </div>
      {avengers && arrange ? (
        <div className="flex max-w-full flex-wrap justify-center gap-1.5 px-2" data-lego-cast>
          {ROLES.map((role) => (
            <label key={role.id} className="flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-1 text-[12px] text-mist">
              {role.label}
              <select
                className="bg-transparent text-ivory"
                data-lego-role={role.id}
                value={cast[role.id]}
                onChange={(e) => {
                  setLegoCastRole(role.id, e.target.value);
                  saveCast();
                }}
              >
                {CAST_POOL.filter((row) => role.id !== "p" || row.id !== "ironman").map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}