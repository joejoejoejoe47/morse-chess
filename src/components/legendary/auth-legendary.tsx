import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { asset } from "@/lib/base";
import { useAuthForm, type Mode } from "@/components/auth-screen";

const scr = (f: string) => asset(`/legendary/screens/${f}`);

/** MB-17: the Legendary sign-in — spotlit curtain stage, gem medallion, gold title, glowing glass card. */
export function LgAuthScreen() {
  const f = useAuthForm();
  const [flip, setFlip] = useState(0);
  const [dir, setDir] = useState<"in" | "out">("in");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setFlip((n) => n + 1);
  }, [f.mode]);

  const pick = (m: Mode) => {
    if (m === f.mode) return;
    setDir(m === "create" ? "in" : "out");
    f.setMode(m);
    f.setError(null);
  };

  return (
    <main className="mcl-auth" style={{ backgroundImage: `url(${scr("signin-bg.webp")})` }} data-lg-auth>
      <img src={scr("medal-gem.webp")} alt="" className="mcl-auth-medal" />
      <p className="mcl-auth-kicker">The Morse Table</p>
      <h1 className="mcl-auth-title" data-text="MORSE CHESS">
        MORSE CHESS
      </h1>
      <p className="mcl-auth-sub">
        Claim a seat. Keep an Elo. Sit across MorseBot, the house chess master, or send a challenge across the room.
      </p>

      <div className="mcl-auth-stage">
        <div
          key={flip}
          className={`mcl-auth-card ${flip ? (dir === "in" ? "mcl-flop-in" : "mcl-flop-out") : ""}`}
          data-mode={f.mode}
        >
          <div className="mcl-auth-back" aria-hidden>
            <img src={scr("medal-gem.webp")} alt="" />
            <span>The Morse Table</span>
          </div>
          <div className="mcl-auth-face">
          <div className="mcl-auth-tabs" role="tablist">
            {(
              [
                ["enter", "Sign in"],
                ["create", "Create account"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={f.mode === id}
                className={f.mode === id ? "is-on" : ""}
                onClick={() => pick(id)}
                data-auth-tab={id}
              >
                {label}
              </button>
            ))}
          </div>

          <form className="mcl-auth-form" onSubmit={f.onSubmit}>
            <label htmlFor="club-name">Username</label>
            <input
              id="club-name"
              autoComplete="username"
              autoFocus
              value={f.username}
              onChange={(e) => f.setUsername(e.target.value)}
              placeholder="IvoryRook"
              maxLength={20}
            />
            <label htmlFor="club-email">Email</label>
            <input
              id="club-email"
              type="email"
              autoComplete="email"
              value={f.email}
              onChange={(e) => f.setEmail(e.target.value)}
              placeholder="you@mail.com"
            />
            <label htmlFor="club-pass">Password</label>
            <div className="mcl-auth-pass">
              <input
                id="club-pass"
                type={f.show ? "text" : "password"}
                autoComplete={f.mode === "create" ? "new-password" : "current-password"}
                value={f.password}
                onChange={(e) => f.setPassword(e.target.value)}
                placeholder="at least 8 characters"
              />
              <button
                type="button"
                onClick={() => f.setShow((v) => !v)}
                aria-label={f.show ? "Hide password" : "Show password"}
              >
                {f.show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
              </button>
            </div>
            <p className="mcl-auth-err" role="alert">
              {f.error ?? ""}
            </p>
            <button type="submit" className="mcl-auth-go" disabled={f.pending}>
              {f.pending ? "Entering…" : f.mode === "create" ? "Claim your seat" : "Enter the club"}
            </button>
          </form>
          </div>
        </div>
        <div className="mcl-auth-floor" aria-hidden />
      </div>
    </main>
  );
}

/** MB-17: the Legendary loading screen — gold rays, gem medallion in gold rings, gold dust. */
export function LgEnterSplash({ onDone }: { onDone?: () => void }) {
  useEffect(() => {
    if (!onDone) return;
    const t = window.setTimeout(onDone, 3600);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return (
    <main className="mcl-load" style={{ backgroundImage: `url(${scr("loading-bg.webp")})` }} data-lg-loading>
      <div className="mcl-load-dust" aria-hidden>
        {Array.from({ length: 26 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${4 + ((i * 37) % 92)}%`,
              width: 2 + ((i * 7) % 5),
              animationDuration: `${6 + ((i * 13) % 7)}s`,
              animationDelay: `${-0.7 * i}s`,
            }}
          />
        ))}
      </div>
      <div className="mcl-load-medal">
        <span className="mcl-load-ring" aria-hidden />
        <img src={scr("medal-full.webp")} alt="" />
      </div>
      <p className="mcl-load-kicker">The Morse Table</p>
      <h1 className="mcl-load-title">MORSE CHESS</h1>
      <p className="mcl-load-sub">Opening the club…</p>
    </main>
  );
}
