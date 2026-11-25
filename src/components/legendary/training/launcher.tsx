/** MB-20: a big "Training Grounds" door on the Legendary home, the mirror of the Campaign door (left of the gear). */
import { Link } from "@tanstack/react-router";
import { asset } from "@/lib/base";
import { playSfx } from "@/lib/legendary/sfx";

export function TrainingLauncher() {
  return (
    <Link
      to="/training"
      onClick={() => playSfx("whoosh")}
      className="mct-launch absolute z-40"
      data-training-launch
      aria-label="Open the Training Grounds: play the computer"
    >
      <span className="tx">
        <b>Training</b>
        <small>vs computer · 8 levels</small>
      </span>
      <span className="ic"><img src={asset("/legendary/ui/mi-training.svg")} alt="" draggable={false} /></span>
      <style>{CSS}</style>
    </Link>
  );
}

const CSS = `
.mct-launch { right: calc(50% + 44px); bottom: max(0.85rem, env(safe-area-inset-bottom)); display: flex; align-items: center; gap: 9px; padding: 8px 8px 8px 18px; border-radius: 999px; text-align: right;
  background: linear-gradient(180deg, rgba(92, 34, 170, 0.92), rgba(34, 9, 64, 0.95)); box-shadow: inset 0 0 0 1.5px #d9a84a, 0 0 18px rgba(242, 182, 50, 0.35), 0 6px 18px rgba(0, 0, 0, 0.55);
  color: #f4e9cf; text-decoration: none; animation: mct-launch-glow 2.6s ease-in-out infinite 1.3s; }
.mct-launch:hover { filter: brightness(1.15); }
.mct-launch .ic { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff0b0, #f2c445 55%, #9a6410); box-shadow: 0 0 10px rgba(255, 210, 90, 0.7); }
.mct-launch .ic img { width: 30px; height: 30px; }
.mct-launch b { display: block; font-family: Cinzel, Georgia, serif; font-weight: 800; font-size: 17px; line-height: 1.05; letter-spacing: 0.06em; text-transform: uppercase;
  background: linear-gradient(180deg, #fff2c2, #f2cd6a 45%, #c98a1c 70%, #ffe08a); -webkit-background-clip: text; background-clip: text; color: transparent; }
.mct-launch small { display: block; font-size: 10.5px; color: #d9c6f2; white-space: nowrap; }
@keyframes mct-launch-glow { 50% { box-shadow: inset 0 0 0 1.5px #f2c75c, 0 0 28px rgba(242, 182, 50, 0.6), 0 6px 18px rgba(0, 0, 0, 0.55); } }
@media (max-width: 767px) { .mct-launch { right: auto; left: 12px; bottom: calc(max(0.75rem, env(safe-area-inset-bottom)) + 172px); flex-direction: row-reverse; padding: 8px 18px 8px 8px; text-align: left; } }
`;
