import { setLegoGood, setLegoScene, useLegoLook } from "@/lib/lego-look";
import { cn } from "@/lib/utils";

/** Latest saved LG board, the Avengers balcony, or a good-side swap (queen becomes Ant-Man). */
export function LegoVerseBar({ show }: { show: boolean }) {
  const { scene, good } = useLegoLook();
  if (!show) return null;
  const chip = (on: boolean) =>
    cn("min-h-10 px-3 py-1.5 text-[13px] font-medium", on ? "bg-ivory text-ink" : "text-mist hover:text-ivory");
  return (
    <div className="mt-2 flex justify-center" data-lego-verse>
      <div className="flex overflow-hidden rounded-full border border-line bg-panel">
        <button type="button" data-lego-scene="latest" className={chip(scene === "latest")} onClick={() => setLegoScene("latest")}>
          Latest board
        </button>
        <button type="button" data-lego-scene="avengers" className={chip(scene === "avengers")} onClick={() => setLegoScene("avengers")}>
          Avengers
        </button>
        <button
          type="button"
          data-lego-good={good === "ant" ? "ant" : "heroes"}
          className={chip(good === "ant")}
          title={good === "ant" ? "Good queen is Ant-Man. Press to put the heroes back." : "Change the good side. The queen becomes Ant-Man."}
          onClick={() => setLegoGood(good === "ant" ? "heroes" : "ant")}
        >
          {good === "ant" ? "Ant-Man queen" : "Change good side"}
        </button>
      </div>
    </div>
  );
}
