/** A big "Campaign" door on the Legendary home (owner t394u: the new places were too hard to find behind the gear menu). */
import { Link } from "@tanstack/react-router";
import { Swords } from "lucide-react";
import { playSfx } from "@/lib/legendary/sfx";

export function CampaignLauncher() {
  return (
    <Link
      to="/campaign"
      onClick={() => playSfx("whoosh")}
      className="mcc-launch absolute z-40"
      data-campaign-launch
      aria-label="Open the Campaign: five bosses and your army"
    >
      <span className="ic"><Swords className="size-5" /></span>
      <span className="tx">
        <b>Campaign</b>
        <small>5 bosses · your army</small>
      </span>
      <style>{CSS}</style>
    </Link>
  );
}

const CSS = `
.mcc-launch { left: calc(50% + 44px); bottom: max(0.85rem, env(safe-area-inset-bottom)); display: flex; align-items: center; gap: 9px; padding: 8px 18px 8px 8px; border-radius: 999px;
  background: linear-gradient(180deg, rgba(92, 34, 170, 0.92), rgba(34, 9, 64, 0.95)); box-shadow: inset 0 0 0 1.5px #d9a84a, 0 0 18px rgba(242, 182, 50, 0.35), 0 6px 18px rgba(0, 0, 0, 0.55);
  color: #f4e9cf; text-decoration: none; animation: mcc-launch-glow 2.6s ease-in-out infinite; }
.mcc-launch:hover { filter: brightness(1.15); }
.mcc-launch .ic { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; color: #2a1606; background: radial-gradient(circle at 35% 30%, #fff0b0, #f2c445 55%, #9a6410); box-shadow: 0 0 10px rgba(255, 210, 90, 0.7); }
.mcc-launch b { display: block; font-family: Cinzel, Georgia, serif; font-weight: 800; font-size: 17px; line-height: 1.05; letter-spacing: 0.06em; text-transform: uppercase;
  background: linear-gradient(180deg, #fff2c2, #f2cd6a 45%, #c98a1c 70%, #ffe08a); -webkit-background-clip: text; background-clip: text; color: transparent; }
.mcc-launch small { display: block; font-size: 10.5px; color: #d9c6f2; white-space: nowrap; }
@keyframes mcc-launch-glow { 50% { box-shadow: inset 0 0 0 1.5px #f2c75c, 0 0 28px rgba(242, 182, 50, 0.6), 0 6px 18px rgba(0, 0, 0, 0.55); } }
@media (max-width: 767px) { .mcc-launch { left: auto; right: 12px; bottom: calc(max(0.75rem, env(safe-area-inset-bottom)) + 172px); } }
`;
