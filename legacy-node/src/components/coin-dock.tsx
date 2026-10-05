import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getPurse } from "@/lib/server/mores";

export function CoinDock() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [coins, setCoins] = useState<number | null>(null);
  const [fly, setFly] = useState(false);

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

  if (coins == null || path.startsWith("/club") || path.startsWith("/avatar")) return null;

  return (
    <>
      {fly
        ? [0, 1, 2, 3, 4].map((i) => (
            <img
              key={i}
              src="/morse-coin.png"
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
        className="pointer-events-none fixed top-3 right-3 z-[60] flex items-center gap-2 rounded-full border border-[#6d5a32] bg-black/60 px-3 py-1.5"
        style={{ marginTop: "env(safe-area-inset-top)" }}
      >
        <img src="/morse-coin.png" alt="Morse coin" className="size-7 shrink-0" />
        <span className="font-display text-lg leading-none tabular-nums text-[#f6e7b2]">{coins.toLocaleString()}</span>
      </div>
    </>
  );
}
