import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { asset } from "@/lib/base";
import { buyBoard } from "@/lib/server/mores";

export const LEGO_PRICE = 60;

const BRICKS: { color: string; dx: number; dy: number; r: number; w: number; delay: number }[] = [
  { color: "#c91a09", dx: -88, dy: -96, r: -200, w: 2, delay: 0 },
  { color: "#1e5aa8", dx: 92, dy: -104, r: 240, w: 2, delay: 0.25 },
  { color: "#f2cd37", dx: -112, dy: -24, r: -160, w: 1, delay: 0.5 },
  { color: "#237841", dx: 108, dy: -36, r: 190, w: 1, delay: 0.75 },
  { color: "#f4f4f4", dx: -40, dy: -128, r: -280, w: 2, delay: 1.0 },
  { color: "#fe8a18", dx: 44, dy: -134, r: 300, w: 1, delay: 1.25 },
  { color: "#c91a09", dx: -120, dy: 56, r: -120, w: 1, delay: 1.5 },
  { color: "#1e5aa8", dx: 118, dy: 50, r: 150, w: 2, delay: 1.75 },
  { color: "#81007b", dx: 0, dy: -150, r: 360, w: 2, delay: 0.4 },
  { color: "#f2cd37", dx: -70, dy: -150, r: -320, w: 1, delay: 1.1 },
  { color: "#237841", dx: 76, dy: -150, r: 280, w: 2, delay: 1.6 },
  { color: "#f4f4f4", dx: 130, dy: -90, r: -240, w: 1, delay: 0.9 },
];

/** One LEGO brick: a block with round studs on top. */
function Brick({ color, w, style }: { color: string; w: number; style?: CSSProperties }) {
  return (
    <span className="lego-brick" style={{ ...style, width: w * 22 + 4, background: color }}>
      {Array.from({ length: w * 2 }, (_, i) => (
        <i key={i} style={{ background: color }} />
      ))}
    </span>
  );
}

const CSS = `
.lego-tile { position: relative; overflow: hidden; container-type: size; background: radial-gradient(circle at 50% 70%, #ffcf6a 0%, #ff8a3d 26%, #5a4a8c 62%, #121a47 100%); }
.lego-tile .lego-box { position: absolute; left: 50%; top: 62%; width: 38%; height: 30%; transform: translate(-50%, -50%); background: #f2cd37; border-radius: 6px;
  box-shadow: inset 0 -8px 0 rgba(0,0,0,0.18), 0 10px 18px rgba(0,0,0,0.35); animation: lego-shake 1.1s ease-in-out infinite; }
.lego-tile .lego-box::before { content: ""; position: absolute; left: 0; right: 0; top: -12%; height: 24%; background: #ffe27a; border-radius: 6px 6px 2px 2px; transform-origin: 0% 100%; animation: lego-lid 2.2s ease-in-out infinite; }
.lego-tile .lego-box b { position: absolute; inset: 22% 10% auto; text-align: center; font: 800 13px/1 system-ui, sans-serif; color: #c91a09; letter-spacing: 0.04em; text-shadow: 0 1px 0 #fff4c2; }
.lego-brick { position: absolute; left: 50%; top: 56%; height: 16px; border-radius: 3px; box-shadow: inset 0 -4px 0 rgba(0,0,0,0.2), 0 3px 6px rgba(0,0,0,0.35);
  display: flex; gap: 2px; justify-content: space-around; padding: 0 3px; opacity: 0; animation: lego-burst 2.2s cubic-bezier(0.2, 0.7, 0.3, 1) infinite; }
.lego-brick i { display: block; width: 8px; height: 5px; margin-top: -5px; border-radius: 3px 3px 0 0; box-shadow: inset 0 -1px 0 rgba(0,0,0,0.2); }
@keyframes lego-burst {
  0% { opacity: 0; transform: translate(-50%, 0) scale(0.4) rotate(0deg); }
  8% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(-50% + var(--dx) * 0.4cqw), calc(var(--dy) * 0.4cqh)) scale(1.05) rotate(var(--r)); }
}
@keyframes lego-lid { 0%, 100% { transform: rotate(0deg); } 18%, 60% { transform: rotate(-28deg); } }
@keyframes lego-shake { 0%, 100% { transform: translate(-50%, -50%); } 10% { transform: translate(-51%, -50%) rotate(-2deg); } 20% { transform: translate(-49%, -50%) rotate(2deg); } 30% { transform: translate(-50%, -50%); } }
.bv-logo { position: relative; display: inline-flex; flex-direction: column; align-items: center; line-height: 0.86; transform: rotate(-4deg);
  font: 900 1em/0.86 "Arial Black", "Segoe UI Black", Impact, system-ui, sans-serif; letter-spacing: 0.02em; text-transform: uppercase; }
.bv-logo span { display: block; color: #ffd400; -webkit-text-stroke: 0.06em #b40000; paint-order: stroke fill;
  text-shadow: 0 0.04em 0 #7a0000, 0 0.08em 0 #4a0000, 0 0.14em 0.16em rgba(0,0,0,0.55); }
.bv-logo span + span { color: #fff; -webkit-text-stroke-color: #1e5aa8; font-size: 1.18em; text-shadow: 0 0.04em 0 #123a73, 0 0.08em 0 #0a2147, 0 0.14em 0.16em rgba(0,0,0,0.55); }
.bv-logo::after { content: ""; position: absolute; inset: -10% -20%; background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.75) 50%, transparent 62%);
  mix-blend-mode: overlay; animation: bv-shine 3.2s ease-in-out infinite; pointer-events: none; }
@keyframes bv-shine { 0%, 55% { transform: translateX(-120%); } 85%, 100% { transform: translateX(120%); } }
.lego-tile .bv-title { position: absolute; left: 0; right: 0; top: 7%; display: flex; justify-content: center; font-size: 13cqw; z-index: 2; animation: bv-bob 2.2s ease-in-out infinite; }
.lego-tile .bv-stars { position: absolute; inset: 0; background-image: radial-gradient(1.5px 1.5px at 12% 18%, #fff, transparent), radial-gradient(1px 1px at 78% 12%, #fff, transparent),
  radial-gradient(1.5px 1.5px at 88% 40%, #ffe27a, transparent), radial-gradient(1px 1px at 30% 8%, #fff, transparent), radial-gradient(1.5px 1.5px at 6% 46%, #cfe3ff, transparent),
  radial-gradient(1px 1px at 60% 28%, #fff, transparent); animation: bv-twinkle 2.6s ease-in-out infinite alternate; }
@keyframes bv-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3%); } }
@keyframes bv-twinkle { from { opacity: 0.45; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .lego-brick, .lego-tile .lego-box, .lego-tile .lego-box::before, .bv-logo::after, .lego-tile .bv-title { animation-duration: 6s; } }
`;

/** The Brick Verse logo: chunky toy-box lettering with a shine sweeping across it. */
export function BrickVerseLogo({ className }: { className?: string }) {
  return (
    <span className={"bv-logo " + (className ?? "")} aria-label="Brick Verse">
      <span aria-hidden="true">Brick</span>
      <span aria-hidden="true">Verse</span>
    </span>
  );
}

/** The store picture for Lego Universe: a box with LEGO bricks bursting out of it. */
export function LegoTile() {
  return (
    <div className="lego-tile aspect-square w-full rounded-lg border border-black/20" data-lego-tile>
      <style>{CSS}</style>
      <div className="bv-stars" />
      <div className="bv-title">
        <BrickVerseLogo />
      </div>
      {BRICKS.map((b, i) => (
        <Brick
          key={i}
          color={b.color}
          w={b.w}
          style={{ ["--dx" as string]: `${b.dx}`, ["--dy" as string]: `${b.dy}`, ["--r" as string]: `${b.r}deg`, animationDelay: `${b.delay}s` } as CSSProperties}
        />
      ))}
      <div className="lego-box">
        <b>BRICKS</b>
      </div>
    </div>
  );
}

/** Full-screen picture of the board behind the "buy for 60 Morse coins" prompt. */
export function LegoShop({
  coins,
  owned,
  onClose,
  onLook,
  onBought,
}: {
  coins: number;
  owned: boolean;
  onClose: () => void;
  onLook: () => void;
  onBought: (purse: { coins: number; owned: string[] }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = coins < LEGO_PRICE;
  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await buyBoard({ data: { boardId: "lego-universe" } });
      if (!res.ok) setError(res.error ?? "Could not buy Brick Verse.");
      else onBought({ coins: res.coins, owned: res.owned });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not buy Brick Verse.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50" data-lego-shop>
      <img src={asset("/lego/preview.jpg")} alt="Brick Verse: the board on the Hero Tower balcony" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex justify-center p-4 sm:p-8">
        <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#10131f]/90 p-5 text-[#f4efe6] shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-[#f2cd37]">Board</p>
          <style>{CSS}</style>
          <h2 className="mt-2 text-[40px]">
            <BrickVerseLogo />
          </h2>
          <p className="mt-2 text-sm text-[#cfd6ea]">
            The board on the balcony of the Hero Tower. Unlocks <b>LG</b> mode: brick heroes (Smash Giant, Web Slinger, Iron Flyer...) against the Iron Tyrant&apos;s villains, all animated.
          </p>
          {owned ? (
            <button type="button" className="mt-4 w-full rounded-xl bg-[#f2cd37] px-3 py-3 text-sm font-medium text-[#1a140f]" onClick={onLook}>
              You own it. Walk around it
            </button>
          ) : null}
          {owned ? (
            <Link
              to="/lego-builder"
              data-lego-create
              className="mt-2 block w-full rounded-xl border border-[#f2cd37] px-3 py-3 text-center text-sm font-medium text-[#f2cd37] hover:bg-[#f2cd37]/10"
            >
              Create Brick board
            </Link>
          ) : null}
          {!owned ? (
            <button
              type="button"
              disabled={busy || short}
              className="mt-4 w-full rounded-xl bg-[#f2cd37] px-3 py-3 text-sm font-medium text-[#1a140f] disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void buy()}
            >
              {busy ? "Buying…" : `Buy for ${LEGO_PRICE} Morse coins`}
            </button>
          ) : null}
          {!owned && short ? <p className="mt-2 text-sm text-[#f4d2c8]">You need {LEGO_PRICE} Morse coins. You have {coins.toLocaleString()}.</p> : null}
          {error ? <p className="mt-2 text-sm text-[#f4d2c8]">{error}</p> : null}
          <div className="mt-3 flex justify-between text-sm text-[#cfc4b2]">
            <button type="button" onClick={onLook} className="hover:text-white">
              {owned ? "" : "Look around"}
            </button>
            <button type="button" onClick={onClose} className="hover:text-white">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
