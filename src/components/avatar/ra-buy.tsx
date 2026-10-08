import { useEffect, useState } from "react";
import { buyGear, getAvatar, saveAvatar } from "@/lib/server/avatar";
import { asset } from "@/lib/base";
import { cn } from "@/lib/utils";

const RA_PRICE = 200;

export function RaShop({
  open,
  coins,
  busy,
  error,
  onClose,
  onBuy,
}: {
  open: boolean;
  coins: number;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onBuy: () => void;
}) {
  if (!open) return null;
  const short = coins < RA_PRICE;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-[#3a3126] bg-[#16130f] shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <img src={asset("/avatars/ra-preview.jpg")} alt="Real animation" className="h-64 w-full object-cover" />
        <div className="space-y-3 p-4">
          <p className="font-display text-2xl text-[#f4efe6]">Real animation</p>
          <p className="text-sm text-[#d9c7a4]">Men in fantasy clothes. They strike with the animation library.</p>
          <button
            type="button"
            disabled={busy || short}
            className="w-full rounded-xl bg-[#e6c56a] px-3 py-3 text-sm font-medium text-[#1a140f] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onBuy}
          >
            {busy ? "Buying…" : `Buy RA for ${RA_PRICE} Morse coins`}
          </button>
          {short ? <p className="text-sm text-[#f4d2c8]">You need {RA_PRICE} Morse coins. You have {coins.toLocaleString()}.</p> : null}
          {error ? <p className="text-sm text-[#f4d2c8]">{error}</p> : null}
          <button type="button" className="w-full text-sm text-[#cfc4b2]" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function RaBuy({
  className,
  active,
  onView,
}: {
  className?: string;
  active?: boolean;
  onView: () => void;
}) {
  const [owned, setOwned] = useState(false);
  const [coins, setCoins] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getAvatar()
      .then((row) => {
        setOwned(Boolean(row?.owned.includes("royal")));
        setCoins(row?.coins ?? 0);
      })
      .catch(() => undefined);
  }, []);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        className={cn(className, active && owned && "bg-ivory text-ink")}
        onClick={() => {
          if (owned) {
            onView();
            return;
          }
          setError("");
          setOpen(true);
        }}
      >
        RA
      </button>
      <RaShop
        open={open}
        coins={coins}
        busy={busy}
        error={error}
        onClose={() => setOpen(false)}
        onBuy={() => {
          if (coins < RA_PRICE || busy) return;
          setBusy(true);
          setError("");
          void buyGear({ data: { id: "royal" } })
            .then(async (bought) => {
              const row = await getAvatar();
              if (row) await saveAvatar({ data: { loadout: { ...row.loadout, style: "ra" } } });
              setOwned(bought.owned.includes("royal"));
              setCoins(bought.coins);
              setOpen(false);
              onView();
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Not enough Morse coins."))
            .finally(() => setBusy(false));
        }}
      />
    </>
  );
}
