import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { ROOM_SWATCHES, saveLookPrefs, useLookPrefs } from "@/lib/chess/look-prefs";
import { cn } from "@/lib/utils";

export function BoardAdjustPanel({
  title = "Board look",
  enterLabel = "Enter",
  onEnter,
  onClose,
}: {
  title?: string;
  enterLabel?: string;
  onEnter: () => void;
  onClose?: () => void;
}) {
  const prefs = useLookPrefs();
  const pickerValue = prefs.roomColor ?? "#0c0d0b";

  return (
    <div className="pointer-events-auto w-full max-w-md rounded-xl border border-line bg-ink/92 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-mist">On this board</p>
          <h2 className="mt-1 font-display text-2xl text-ivory">{title}</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            className="rounded-full border border-line px-3 text-sm text-mist hover:border-line-strong hover:text-ivory"
            onClick={onClose}
          >
            Close
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-[13px] uppercase tracking-[0.14em] text-mist">Piece outline</p>
          <div className="mt-2 flex overflow-hidden rounded-full border border-line bg-panel">
            <button
              type="button"
              className={cn(
                "min-h-11 flex-1 px-4 text-sm font-medium",
                prefs.outline ? "bg-ivory text-ink" : "text-mist hover:text-ivory",
              )}
              onClick={() => saveLookPrefs({ outline: true })}
            >
              On
            </button>
            <button
              type="button"
              className={cn(
                "min-h-11 flex-1 px-4 text-sm font-medium",
                !prefs.outline ? "bg-ivory text-ink" : "text-mist hover:text-ivory",
              )}
              onClick={() => saveLookPrefs({ outline: false })}
            >
              Off
            </button>
          </div>
        </div>

        <div>
          <p className="text-[13px] uppercase tracking-[0.14em] text-mist">Background</p>
          <p className="mt-1 text-[13px] text-mist">Stays for the next games until you change it.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {ROOM_SWATCHES.map((swatch) => {
              const active =
                swatch.value === null ? prefs.roomColor === null : prefs.roomColor === swatch.value;
              return (
                <button
                  key={swatch.id}
                  type="button"
                  title={swatch.label}
                  aria-label={swatch.label}
                  className={cn(
                    "size-11 rounded-full border",
                    active ? "border-gold-line ring-2 ring-gold-line/50" : "border-line",
                  )}
                  style={{
                    background:
                      swatch.value ??
                      "linear-gradient(135deg, #0c0d0b 50%, #f6f1e4 50%)",
                  }}
                  onClick={() => saveLookPrefs({ roomColor: swatch.value })}
                />
              );
            })}
            <label className="relative grid size-11 place-items-center overflow-hidden rounded-full border border-line bg-panel">
              <span className="pointer-events-none text-[10px] uppercase tracking-[0.08em] text-mist">Pick</span>
              <input
                type="color"
                value={pickerValue}
                aria-label="Pick a background color"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) => saveLookPrefs({ roomColor: e.target.value })}
              />
            </label>
          </div>
        </div>

        <div>
          <p className="text-[13px] uppercase tracking-[0.14em] text-mist">Club light</p>
          <div className="mt-2">
            <ThemeToggle className="rounded-full" />
          </div>
        </div>
      </div>

      <Button variant="solid" className="mt-5 w-full rounded-full" onClick={onEnter}>
        {enterLabel}
      </Button>
    </div>
  );
}
