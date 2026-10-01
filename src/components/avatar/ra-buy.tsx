import { useEffect, useState } from "react";
import { buyGear, getAvatar, saveAvatar } from "@/lib/server/avatar";
import { cn } from "@/lib/utils";

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
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getAvatar()
      .then((row) => setOwned(Boolean(row?.owned.includes("royal"))))
      .catch(() => undefined);
  }, []);

  return (
    <button
      type="button"
      disabled={busy}
      className={cn(className, active && owned && "bg-ivory text-ink")}
      onClick={() => {
        onView();
        if (owned || busy) return;
        if (!armed) {
          setArmed(true);
          return;
        }
        setBusy(true);
        void buyGear({ data: { id: "royal" } })
          .then(async (bought) => {
            const row = await getAvatar();
            if (row) await saveAvatar({ data: { loadout: { ...row.loadout, style: "an", anId: "royal" } } });
            setOwned(bought.owned.includes("royal"));
          })
          .catch(() => undefined)
          .finally(() => setBusy(false));
      }}
    >
      {owned ? "RA" : armed ? "Pay 150" : "Buy RA"}
    </button>
  );
}
