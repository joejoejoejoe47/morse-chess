import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { buySandbox, sandboxStatus } from "@/lib/server/mores";

export function SandboxGate() {
  const navigate = useNavigate();
  const [owned, setOwned] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coins, setCoins] = useState<number | null>(null);

  useEffect(() => {
    void sandboxStatus()
      .then((row) => {
        setOwned(row.owned);
        setCoins(row.coins);
      })
      .catch(() => undefined);
  }, []);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await buySandbox();
      if (!res.ok) {
        setError(res.error);
        setCoins(res.coins);
        return;
      }
      setOwned(true);
      setCoins(res.coins);
      setOpen(false);
      window.dispatchEvent(new CustomEvent("morse-coins", { detail: { coins: res.coins } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The purse would not open.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="relative mt-4 flex min-h-14 w-full items-center justify-center rounded-xl border border-[#c9a46a] bg-[#1c140c]/90 px-6 font-display text-2xl tracking-[0.22em] text-[#f6e7c1] shadow-[0_10px_24px_rgba(0,0,0,0.28)] hover:border-[#e7c98a]"
        onClick={() => {
          if (owned) {
            void navigate({ to: "/sandbox" });
            return;
          }
          setOpen(true);
        }}
      >
        {owned ? "PLAY SANDBOX" : "SANDBOX GAME"}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#8a7048] bg-[#120e0a] shadow-2xl"
            style={{
              backgroundImage: "linear-gradient(180deg, rgba(8,6,4,0.35), rgba(8,6,4,0.78)), url(/sandbox/you-turn.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="px-6 py-8 text-center">
              <p className="text-xs uppercase tracking-[0.35em] text-[#e7c98a]">Sandbox</p>
              <h2 className="mt-2 font-display text-4xl text-[#f8f1e4]">Cross Colosseum</h2>
              <p className="mt-3 text-base text-[#f3eadc]">
                You need to buy it for 90 Morse coins.
                {coins != null ? ` You have ${coins.toLocaleString()}.` : ""}
              </p>
              {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full bg-[#c9a46a] px-6 py-3 font-display text-lg text-[#1a120c] disabled:opacity-60"
                  onClick={() => void buy()}
                >
                  {busy ? "Buying…" : "Buy · 90"}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#d9c7a2] px-6 py-3 text-[#f6efe2]"
                  onClick={() => setOpen(false)}
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
