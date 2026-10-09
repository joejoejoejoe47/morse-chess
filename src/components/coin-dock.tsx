import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getPurse } from "@/lib/server/mores";
import { asset } from "@/lib/base";

/** Pages with a top-right control bar mark it `data-coin-bar`. Home has none, so the purse stays in the corner. */
function tuckUnderBar(): number | null {
  const bar = document.querySelector<HTMLElement>("[data-coin-bar]");
  if (!bar) return null;
  const barBox = bar.getBoundingClientRect();
  const slotTop = 12;
  const slotBottom = slotTop + 48;
  const slotLeft = window.innerWidth - 120;
  const hits =
    barBox.right > slotLeft &&
    barBox.left < window.innerWidth - 8 &&
    barBox.bottom > slotTop &&
    barBox.top < slotBottom;
  if (!hits) return null;
  return Math.ceil(barBox.bottom + 8);
}

export function CoinDock() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [coins, setCoins] = useState<number | null>(null);
  const [fly, setFly] = useState(false);
  const [tuck, setTuck] = useState<number | null>(null);
  const home = path === "/" || path === "";

  useEffect(() => {
    let live = true;
    const pull = () => {
      void getPurse()
        .then((purse) => {
          if (live && purse) setCoins(purse.coins);
        })
        .catch(() => undefined);
    };
    pull();
    const timer = window.setInterval(pull, 4000);
    const onAward = (event: Event) => {
      const detail = (event as CustomEvent<{ coins: number }>).detail;
      if (!detail) return;
      setFly(true);
      window.setTimeout(() => {
        setCoins(detail.coins);
        setFly(false);
      }, 1200);
    };
    window.addEventListener("morse-coins", onAward);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener("morse-coins", onAward);
    };
  }, []);

  useEffect(() => {
    if (home) {
      setTuck(null);
      return;
    }
    const place = () => setTuck(tuckUnderBar());
    place();
    const ro = new ResizeObserver(place);
    const watch = () => {
      ro.disconnect();
      const bar = document.querySelector("[data-coin-bar]");
      if (bar) ro.observe(bar);
    };
    watch();
    window.addEventListener("resize", place);
    const timer = window.setInterval(() => {
      watch();
      place();
    }, 400);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.clearInterval(timer);
    };
  }, [home, path]);

  if (coins == null || path.startsWith("/club") || path.startsWith("/avatar")) return null;

  return (
    <>
      {fly
        ? [0, 1, 2, 3, 4].map((i) => (
            <img
              key={i}
              src={asset("/morse-coin.png")}
              alt=""
              className="coin-fly pointer-events-none z-[70]"
              style={{
                left: `calc(50% + ${(i - 2) * 54}px)`,
                top: `calc(40% + ${(i % 2 === 0 ? -1 : 1) * 28}px)`,
                animationDelay: `${i * 70}ms`,
              }}
            />
          ))
        : null}
      <div
        className={
          tuck == null
            ? "pointer-events-none fixed top-3 right-3 z-[60] flex items-center gap-2 rounded-full border border-[#6d5a32] bg-black/60 px-3 py-1.5"
            : "pointer-events-none fixed right-3 z-[60] flex items-center gap-2 rounded-full border border-[#6d5a32] bg-black/60 px-3 py-1.5"
        }
        style={tuck == null ? { marginTop: "env(safe-area-inset-top)" } : { top: tuck }}
      >
        <img src={asset("/morse-coin.png")} alt="Morse coin" className="size-7 shrink-0" />
        <span className="font-display text-lg leading-none tabular-nums text-[#f6e7b2]">{coins.toLocaleString()}</span>
      </div>
    </>
  );
}
