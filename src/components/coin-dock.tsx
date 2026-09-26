import { useEffect, useState } from "react";
import { getPurse } from "@/lib/server/mores";

export function CoinDock() {
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

  if (coins == null) return null;

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
        className="pointer-events-none fixed bottom-3 left-3 z-[60] flex flex-col items-center"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <img src="/morse-coin.png" alt="Morse coin" className="size-14 drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]" />
        <span className="font-display text-[22px] leading-none tracking-wide text-[#f6e7b2] [text-shadow:0_2px_8px_rgba(0,0,0,0.7)]">
          {coins}
        </span>
      </div>
    </>
  );
}
