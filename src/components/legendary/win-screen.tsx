/**
 * Legendary win screen: gold confetti, a crown that drops onto the word VICTORY, and the coins you
 * won flying up into your balance (the balance counts up to the server's number).
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { getPurse } from "@/lib/server/mores";
import { playSfx } from "@/lib/legendary/sfx";
import { Coin, CrownMark } from "@/components/legendary/bits";

export function LegendaryWin({ coinAward, elo, eloDelta, title = "Victory", reason, actions }: { coinAward: number; elo: number; eloDelta: string; title?: string; reason?: string; actions: ReactNode }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void getPurse()
      .then((p: { coins?: number } | null) => {
        if (!live || !p) return;
        setBalance(p.coins ?? 0);
        setShown(Math.max(0, (p.coins ?? 0) - coinAward));
      })
      .catch(() => undefined);
    const t = window.setTimeout(() => coinAward > 0 && playSfx("coin"), 1500);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [coinAward]);
  // Count up while the coins land.
  useEffect(() => {
    if (balance === null || shown === null || shown >= balance) return;
    const id = window.setTimeout(() => setShown((s) => (s === null ? s : Math.min(balance, s + 1))), shown === balance - coinAward ? 1700 : 140);
    return () => window.clearTimeout(id);
  }, [balance, shown, coinAward]);

  const bits = useMemo(() => Array.from({ length: 64 }, (_, i) => i), []);
  const flyers = Math.min(10, Math.max(coinAward > 0 ? 4 : 0, coinAward * 2));
  return (
    <div className="mcl-win absolute inset-0 z-30 grid place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_40%,rgba(60,24,96,0.82),rgba(6,3,10,0.92)_70%)] px-5" data-legendary-win>
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {bits.map((i) => (
          <span
            key={i}
            className="mcl-confetti absolute top-0 block"
            style={
              {
                left: `${(i * 37) % 100}%`,
                width: `${5 + (i % 4) * 2}px`,
                height: `${9 + (i % 3) * 4}px`,
                background: ["#ffe08a", "#f2b632", "#fff4cf", "#c98a1c", "#b58cff"][i % 5],
                "--delay": `${(i % 16) * 0.08}s`,
                "--dur": `${2.4 + (i % 5) * 0.4}s`,
                "--dx": `${((i * 53) % 40) - 20}vw`,
                "--spin": `${360 + (i % 6) * 180}deg`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="relative w-full max-w-md text-center">
        <CrownMark className="mcl-crown-drop mx-auto h-20 w-24" />
        <h2 className="mcl-victory mt-1">{title}</h2>
        {reason ? <p className="mt-1 text-sm text-[#e9d9b0]">{reason}</p> : null}
        <p className="mt-3 font-[Cinzel] text-lg font-bold text-[#f6e7c3]">
          Elo {elo} <span className="text-[#7be3a0]">{eloDelta}</span>
        </p>
        <div className="relative mx-auto mt-4 w-fit">
        <div className="mcl-panel flex w-fit items-center gap-3 rounded-full px-5 py-2" data-win-balance>
          <Coin className="size-7" />
          <span className="font-[Cinzel] text-2xl font-bold tabular-nums text-[#ffe9a8]">{shown ?? "…"}</span>
          {coinAward > 0 ? <span className="font-[Cinzel] text-lg font-bold text-[#7be3a0]">+{coinAward}</span> : null}
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20" aria-hidden>
          {Array.from({ length: flyers }, (_, i) => (
            <span key={i} className="mcl-coin-fly absolute block size-9" style={{ "--i": i, "--x": `${(i % 2 ? 1 : -1) * (70 + i * 26)}px` } as CSSProperties}>
              <Coin className="!size-9 max-w-none" />
            </span>
          ))}
        </div>
        </div>
        {coinAward === 0 ? <p className="mt-2 text-xs text-[#a998c4]">No coins this time (short games and wins over MorseBot without checkmate pay none).</p> : null}
        <div className="mx-auto mt-6 flex max-w-xs flex-col gap-2">{actions}</div>
      </div>
    </div>
  );
}
