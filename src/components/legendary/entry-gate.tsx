/**
 * The Legendary entry gate (owner t381u): the first time a player enters /chessLegendary/ they pay a
 * one-time 100 Morse coin tribute. Players without enough coins see how many they still need and
 * where to earn them, and cannot get past the gate. Server: php/src/LegendaryGate.php.
 */
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { legendaryAccess, unlockLegendary, type GateAccess } from "@/lib/server/legendary";
import { playSfx } from "@/lib/legendary/sfx";

const CLASSIC = "/chess/";

function Crown() {
  return (
    <svg viewBox="0 0 120 90" className="mcl-gate-crown" aria-hidden>
      <defs>
        <linearGradient id="mcl-gate-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c2" />
          <stop offset=".45" stopColor="#f2c94c" />
          <stop offset="1" stopColor="#9a6a12" />
        </linearGradient>
      </defs>
      <path d="M10 70 L18 22 L42 48 L60 10 L78 48 L102 22 L110 70 Z" fill="url(#mcl-gate-g)" stroke="#5a3a00" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="10" y="70" width="100" height="12" rx="3" fill="url(#mcl-gate-g)" stroke="#5a3a00" strokeWidth="2.5" />
      {[18, 60, 102].map((x, i) => (
        <circle key={i} cx={x} cy={i === 1 ? 10 : 22} r="6" fill="#8b5cf6" stroke="#fff3c2" strokeWidth="2" />
      ))}
      <circle cx="60" cy="58" r="7" fill="#7c3aed" stroke="#fff3c2" strokeWidth="2" />
    </svg>
  );
}

function Coin({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="mcl-gate-coin">
      <circle cx="12" cy="12" r="10.5" fill="#f2c94c" stroke="#8a5a00" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="#b8860b" strokeWidth="1" />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="700" fill="#6b4300" fontFamily="Cinzel,serif">M</text>
    </svg>
  );
}

export function LegendaryEntryGate() {
  const { user, isPending } = useCurrentUserState();
  const [access, setAccess] = useState<GateAccess | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (isPending || !user) {
      setAccess(null);
      return;
    }
    let live = true;
    const load = () =>
      legendaryAccess()
        .then((a) => live && setAccess(a))
        .catch(() => undefined);
    void load();
    // coins can arrive while the gate is up (a gift, a sale): refresh now and then
    const t = window.setInterval(load, 20000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, [user, isPending]);

  if (!access || (access.unlocked && !opening)) return null;

  async function pay() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await unlockLegendary();
      playSfx("coin");
      window.setTimeout(() => playSfx("rankup"), 350);
      setOpening(true);
      window.dispatchEvent(new CustomEvent("mcl-coins-changed"));
      window.setTimeout(() => {
        setAccess((a) => (a ? { ...a, unlocked: true } : a));
        setOpening(false);
      }, 1850);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
      void legendaryAccess().then(setAccess).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const short = access.need > 0;
  const pct = Math.min(100, Math.round((access.coins / access.fee) * 100));
  return (
    <div className={`mcl-gate ${opening ? "is-opening" : ""}`} role="dialog" aria-modal="true" aria-label="The Legendary gate" data-legendary-gate={short ? "short" : "pay"}>
      <div className="mcl-gate-doors" aria-hidden>
        <div className="mcl-gate-door is-left" />
        <div className="mcl-gate-door is-right" />
      </div>
      <div className="mcl-gate-rays" aria-hidden />
      <div className="mcl-gate-card">
        <span className="mcl-gate-corner is-tl" aria-hidden />
        <span className="mcl-gate-corner is-tr" aria-hidden />
        <span className="mcl-gate-corner is-bl" aria-hidden />
        <span className="mcl-gate-corner is-br" aria-hidden />
        <Crown />
        <p className="mcl-gate-kicker">The Morse Table</p>
        <h1 className="mcl-gate-title">The Legendary Gate</h1>
        <p className="mcl-gate-sub">
          {short ? "Every Legend pays the tribute once." : "Pay the tribute once, and Legendary is yours forever."}
        </p>
        <div className="mcl-gate-fee">
          <Coin size={34} />
          <span className="mcl-gate-fee-n">{access.fee}</span>
          <span className="mcl-gate-fee-l"><span className="block">Morse coins</span><span className="block">One time</span></span>
        </div>
        <div className="mcl-gate-purse" data-gate-coins={access.coins}>
          <div className="mcl-gate-purse-row">
            <span>Your purse</span>
            <span className="mcl-gate-purse-n">
              <Coin size={16} /> {access.coins.toLocaleString()}
            </span>
          </div>
          <div className="mcl-gate-bar">
            <div className="mcl-gate-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {short ? (
          <>
            <p className="mcl-gate-need" data-gate-need={access.need}>
              You need <b>{access.need}</b> more Morse {access.need === 1 ? "coin" : "coins"} to enter.
            </p>
            <ul className="mcl-gate-ways">
              <li><b>Win games</b> at Morse Chess: 2 coins a win, 5 against a higher-rated player.</li>
              <li><b>Checkmate MorseBot</b> to earn coins for the win.</li>
              <li><b>Sell</b> boards and sets you own on the Market.</li>
              <li><b>Friends</b> can give you coins in GC.</li>
            </ul>
            <a className="mcl-gate-btn" href={CLASSIC} data-gate-earn onClick={() => playSfx("tap")}>
              Earn coins at Morse Chess
            </a>
          </>
        ) : (
          <button type="button" className="mcl-gate-btn" onClick={() => void pay()} disabled={busy || opening} data-gate-pay>
            {opening ? "The gate opens…" : busy ? "Paying…" : `Pay ${access.fee} & Enter`}
          </button>
        )}
        {err ? <p className="mcl-gate-err">{err}</p> : null}
        <a className="mcl-gate-back" href={CLASSIC}>Back to Morse Chess</a>
      </div>
    </div>
  );
}
