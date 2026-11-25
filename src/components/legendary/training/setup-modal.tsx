import { useEffect, useRef, useState } from "react";
import { ChevronDown, Cpu, X } from "lucide-react";
import { asset } from "@/lib/base";
import {
  DAY_STEPS,
  INC_STEPS,
  MINUTE_STEPS,
  T_VARIANTS,
  minutesLabel,
  type TMode,
  type TSetup,
  type TSide,
} from "@/lib/legendary/training";

const piece = (c: string) => asset(`/legendary/bc/pieces/${c}.svg`);

/** MB-20: lichess "Play against computer", dressed for the Legendary club. */
export function TrainingSetup({
  initial,
  onPlay,
  onClose,
}: {
  initial: TSetup;
  onPlay: (s: TSetup) => void;
  onClose?: () => void;
}) {
  const [s, setS] = useState<TSetup>(initial);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const set = (p: Partial<TSetup>) => setS((o) => ({ ...o, ...p }));
  const v = T_VARIANTS.find((x) => x.id === s.variant) ?? T_VARIANTS[0];

  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [open]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const modes: [TMode, string][] = [
    ["unlimited", "Unlimited"],
    ["realtime", "Real time"],
    ["corr", "Correspondence"],
  ];
  const sides: [TSide, string, string][] = [
    ["white", "White", "wK"],
    ["random", "Random side", "half"],
    ["black", "Black", "bK"],
  ];

  return (
    <div className="mcl-tr-modal-wrap" role="dialog" aria-modal aria-label="Play against computer" data-training-setup>
      <div className="mcl-tr-modal">
        {onClose ? (
          <button type="button" className="mcl-tr-x" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </button>
        ) : null}
        <h2 className="mcl-tr-modal-title">Play against computer</h2>
        <div className="mcl-tr-modal-body">
          <div className="mcl-tr-select" ref={menu}>
            <button type="button" className="mcl-tr-select-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-variant-select>
              <span className="mcl-tr-vicon">{v.icon}</span>
              <span className="mcl-tr-vname">{v.name}</span>
              <span className="mcl-tr-vdesc">{v.desc}</span>
              <ChevronDown className="ml-auto size-4 shrink-0 text-[#e2b84e]" />
            </button>
            {open ? (
              <div className="mcl-tr-select-menu" role="listbox">
                {T_VARIANTS.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="option"
                    aria-selected={x.id === s.variant}
                    className={x.id === s.variant ? "is-on" : ""}
                    onClick={() => {
                      set({ variant: x.id });
                      setOpen(false);
                    }}
                  >
                    <span className="mcl-tr-vicon">{x.icon}</span>
                    <span className="mcl-tr-vname">{x.name}</span>
                    <span className="mcl-tr-vdesc">{x.desc}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mcl-tr-tabs" role="tablist">
            {modes.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={s.mode === id} className={s.mode === id ? "is-on" : ""} onClick={() => set({ mode: id })} data-mode={id}>
                {label}
              </button>
            ))}
          </div>

          <div className="mcl-tr-timebox">
            {s.mode === "unlimited" ? <p>Take all the time you need</p> : null}
            {s.mode === "realtime" ? (
              <>
                <Slider label="Minutes per side" value={minutesLabel(s.minutes)} steps={MINUTE_STEPS} cur={s.minutes} onPick={(m) => set({ minutes: m })} />
                <Slider label="Increment in seconds" value={String(s.inc)} steps={INC_STEPS} cur={s.inc} onPick={(m) => set({ inc: m })} />
              </>
            ) : null}
            {s.mode === "corr" ? <Slider label="Days per turn" value={String(s.days)} steps={DAY_STEPS} cur={s.days} onPick={(m) => set({ days: m })} /> : null}
          </div>

          <p className="mcl-tr-h">Strength</p>
          <div className="mcl-tr-levels" role="radiogroup" aria-label="Strength">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={s.level === n} className={s.level === n ? "is-on" : ""} onClick={() => set({ level: n })} data-level={n}>
                {n}
              </button>
            ))}
          </div>

          <p className="mcl-tr-h">Side</p>
          <div className="mcl-tr-sides" role="radiogroup" aria-label="Side">
            {sides.map(([id, label, img]) => (
              <button key={id} type="button" role="radio" aria-checked={s.side === id} className={s.side === id ? "is-on" : ""} onClick={() => set({ side: id })} data-side={id}>
                {img === "half" ? (
                  <span className="mcl-tr-halfking">
                    <img src={piece("wK")} alt="" />
                    <img src={piece("bK")} alt="" />
                  </span>
                ) : (
                  <img src={piece(img)} alt="" />
                )}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mcl-tr-modal-foot">
          <button type="button" className="mcl-tr-play" onClick={() => onPlay(s)} data-training-play>
            <Cpu className="size-6 text-[#ffd877]" />
            Play against computer
          </button>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, steps, cur, onPick }: { label: string; value: string; steps: number[]; cur: number; onPick: (n: number) => void }) {
  const idx = Math.max(0, steps.indexOf(cur));
  return (
    <label className="mcl-tr-slider">
      <span>
        {label}: <b>{value}</b>
      </span>
      <input type="range" min={0} max={steps.length - 1} step={1} value={idx} onChange={(e) => onPick(steps[Number(e.target.value)])} />
    </label>
  );
}
