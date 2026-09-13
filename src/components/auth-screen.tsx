import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { GROK_PROVIDERS, authClient, signIn, clearPreviewBearer } from "@/lib/auth/client";
import { markClubSession, markOauthPending } from "@/lib/auth/club-session";
import { claimUsername, usernameAvailable } from "@/lib/server/mores";
import { USERNAME_RE, usernameToEmail } from "@/lib/mores-constants";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MorseCrest } from "@/components/club-brand";

type Mode = "create" | "enter";

export function AuthScreen() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("enter");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = username.trim();
    const mail = email.trim().toLowerCase();
    if (mode === "create" && !USERNAME_RE.test(name)) {
      setError("Username must be at least 8 characters (letters, numbers, or underscores).");
      return;
    }
    if (mode === "enter" && !mail && !USERNAME_RE.test(name) && !name.includes("@")) {
      setError("Enter your username or the email you created with.");
      return;
    }
    if (mode === "create" && (mail.length < 8 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))) {
      setError("Email must be a real address of at least 8 characters.");
      return;
    }
    if (mode === "enter" && mail && (mail.length < 8 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))) {
      setError("Email must be at least 8 characters.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    try {
      clearPreviewBearer();
      try {
        await authClient.signOut();
      } catch {
        /* leftover session */
      }
      if (mode === "create") {
        const free = await usernameAvailable({ data: { username: name } });
        if (!free) {
          setError("That club name is already taken.");
          return;
        }
        const { error: signErr } = await authClient.signUp.email({
          email: mail,
          password,
          name,
        });
        if (signErr) {
          const msg = signErr.message || "Could not create that account.";
          setError(/already|exist|registered/i.test(msg) ? "That email already has a seat. Sign in." : msg);
          return;
        }
        await authClient.getSession();
        await claimUsername({ data: { username: name } });
      } else {
        const guesses = [
          mail,
          name.includes("@") ? name.toLowerCase() : "",
          name && !name.includes("@") ? usernameToEmail(name) : "",
        ].filter((v, i, a) => v && a.indexOf(v) === i);
        let last = "Invalid email or password.";
        let ok = false;
        for (const addr of guesses) {
          const { error: signErr } = await authClient.signIn.email({ email: addr, password });
          if (!signErr) {
            ok = true;
            break;
          }
          last = signErr.message || last;
        }
        if (!ok) {
          setError(
            /invalid email or password/i.test(last)
              ? "No seat with that email and password. Use Create account first, then sign in with the same email."
              : last,
          );
          return;
        }
        await authClient.getSession();
      }
      markClubSession();
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-wood relative flex min-h-dvh flex-col items-center justify-center px-5 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="absolute right-5 top-5">
        <ThemeToggle className="rounded-full" />
      </div>

      <MorseCrest className="size-[4.5rem] text-[1.75rem]" />
      <p className="mt-5 text-[13px] font-medium uppercase tracking-[0.42em] text-gold-line">
        The Morse table
      </p>
      <h1 className="mt-2 font-display text-[clamp(2.6rem,8vw,4.5rem)] font-semibold leading-none text-ivory">
        Morse Chess
      </h1>
      <p className="mt-3 max-w-md text-center text-base font-light text-mist">
        Claim a seat. Keep a score. Sit across MorseBot, the house chess master, or send a challenge
        across the room.
      </p>

      <div className="mt-8 w-full max-w-[26.5rem] rounded-[18px] border border-line-strong bg-panel/90 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ["enter", "Sign in"],
              ["create", "Create account"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                setError(null);
              }}
              className={
                mode === id
                  ? "rounded-full bg-forest px-3 py-2.5 text-[13px] font-medium uppercase tracking-[0.06em] text-ivory"
                  : "rounded-full border border-line px-3 py-2.5 text-[13px] font-medium uppercase tracking-[0.06em] text-mist"
              }
            >
              {label}
            </button>
          ))}
        </div>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="club-name">Username</Label>
            <Input
              id="club-name"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="IvoryRook"
              maxLength={20}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="club-email">Email</Label>
            <Input
              id="club-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@mail.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="club-pass">Password</Label>
            <div className="relative">
              <Input
                id="club-pass"
                type={show ? "text" : "password"}
                autoComplete={mode === "create" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="at least 8 characters"
                className="pr-11"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-mist hover:text-ivory"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          {error ? <p className="min-h-5 text-[15px] text-danger">{error}</p> : <p className="min-h-5" />}
          <Button type="submit" variant="solid" size="lg" className="w-full rounded-xl" disabled={pending}>
            {pending ? "Entering…" : "Enter the club"}
          </Button>
        </form>
        {GROK_PROVIDERS.length > 0 ? (
          <>
            <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-mist">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="mt-4 grid gap-2">
              {GROK_PROVIDERS.map((p) => (
                <Button
                  key={p.providerId}
                  type="button"
                  variant="secondary"
                  className="w-full rounded-xl"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    markOauthPending();
                    void signIn(p.providerId, { callbackURL: "/" }).then(
                      () => {
                        markClubSession();
                        void navigate({ to: "/" });
                      },
                      (err) => {
                        setError(err instanceof Error ? err.message : "Sign-in failed.");
                      },
                    );
                  }}
                >
                  Continue with {p.label}
                </Button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

export function EnterSplash({ onDone }: { onDone?: () => void }) {
  useEffect(() => {
    if (!onDone) return;
    const t = window.setTimeout(onDone, 3600);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <main className="auth-wood relative flex min-h-dvh flex-col items-center justify-center px-5">
      <div className="relative grid size-[11.5rem] place-items-center">
        <svg className="absolute inset-0" viewBox="0 0 100 100" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            className="text-gold-line/25"
          />
          <circle
            className="morse-enter-spin text-gold-line"
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="52 224"
          />
        </svg>
        <MorseCrest className="size-[4.5rem] text-[1.75rem]" />
      </div>
      <p className="mt-8 text-[13px] font-medium uppercase tracking-[0.42em] text-gold-line">
        The Morse table
      </p>
      <h1 className="mt-2 font-display text-4xl text-ivory">Morse Chess</h1>
      <p className="mt-3 text-base text-mist">Opening the club…</p>
    </main>
  );
}

export function SplashSkeleton() {
  return (
    <main className="auth-wood relative flex min-h-dvh flex-col items-center justify-center px-5">
      <MorseCrest className="size-16 text-2xl" />
      <p className="mt-5 text-[13px] font-medium uppercase tracking-[0.42em] text-gold-line">
        Morse
      </p>
      <h1 className="mt-3 font-display text-4xl text-ivory">Opening the club…</h1>
      <p className="mt-3 text-base text-mist">White to move shortly.</p>
    </main>
  );
}
