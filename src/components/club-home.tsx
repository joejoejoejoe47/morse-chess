import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, Link } from "@tanstack/react-router";
import { Timer, Wind, X } from "lucide-react";
import { ClubBrand, ClubHeaderActions, MorseCrest } from "@/components/club-brand";
import { CheckTile, PieceMark } from "@/components/chess/marks";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  cancelChallenge,
  claimUsername,
  getHomeState,
  joinQueue,
  leaveQueue,
  respondChallenge,
  sendChallenge,
  startBotGame,
  type HomeState,
} from "@/lib/server/mores";
import { BOT_USERNAME, BOT_V2_USERNAME, USERNAME_RE, suggestClubName, type GameMode } from "@/lib/mores-constants";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SplashSkeleton } from "@/components/auth-screen";

type Flow =
  | { kind: "idle" }
  | { kind: "pick-mode"; intent: "random" | "challenge" | "bot" | "bot-v2" }
  | { kind: "ask-name"; mode: GameMode }
  | { kind: "searching"; mode: GameMode }
  | { kind: "waiting"; mode: GameMode; username: string; challengeId?: string };

export function ClubHome() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [home, setHome] = useState<HomeState | null>(null);
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const [claim, setClaim] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (claim) return;
    const guess = suggestClubName(user?.displayName ?? user?.primaryEmail?.split("@")[0]);
    if (guess) setClaim(guess);
  }, [user, claim]);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const next = await getHomeState();
        if (!live) return;
        setHome(next);
        setLoadError(null);
        if (next.queueMiss) {
          setError("Nobody answered the pull-up.");
          setFlow({ kind: "idle" });
        }
        if (next.activeGameId) {
          void navigate({ to: "/play/$gameId", params: { gameId: next.activeGameId } });
        }
      } catch (e) {
        if (live) setLoadError(e instanceof Error ? e.message : "Could not load the club.");
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1200);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [navigate]);

  if (isPending || !user) return <SplashSkeleton />;
  if (!home) {
    return (
      <main className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-8">
        <div className="check-wash pointer-events-none absolute inset-0" />
        <SplashSkeleton />
        {loadError ? <p className="relative mt-4 text-sm text-danger">{loadError}</p> : null}
      </main>
    );
  }

  if (home.activeGameId) {
    return <Navigate to="/play/$gameId" params={{ gameId: home.activeGameId }} />;
  }

  async function onClaim(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!USERNAME_RE.test(claim.trim())) {
      setError("Username must be at least 8 characters (letters, numbers, or underscores).");
      return;
    }
    setBusy(true);
    try {
      await claimUsername({ data: { username: claim.trim() } });
      setHome(await getHomeState());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim that name.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseMode(mode: GameMode) {
    if (flow.kind !== "pick-mode") return;
    setError(null);
    if (flow.intent === "challenge") {
      setFlow({ kind: "ask-name", mode });
      return;
    }
    setBusy(true);
    try {
      if (flow.intent === "bot" || flow.intent === "bot-v2") {
        const { gameId } = await startBotGame({
          data: { mode, bot: flow.intent === "bot-v2" ? "v2" : "v1" },
        });
        await navigate({ to: "/play/$gameId", params: { gameId } });
        return;
      }
      const { gameId } = await joinQueue({ data: { mode } });
      if (gameId) {
        await navigate({ to: "/play/$gameId", params: { gameId } });
        return;
      }
      setFlow({ kind: "searching", mode });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a match.");
    } finally {
      setBusy(false);
    }
  }

  async function submitChallenge(e: FormEvent) {
    e.preventDefault();
    if (flow.kind !== "ask-name") return;
    setError(null);
    const name = target.trim();
    if (!USERNAME_RE.test(name)) {
      setError("Enter a club name (8–20 letters, numbers, or underscores).");
      return;
    }
    setBusy(true);
    try {
      const res = await sendChallenge({ data: { username: name, mode: flow.mode } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if ("gameId" in res && res.gameId) {
        await navigate({ to: "/play/$gameId", params: { gameId: res.gameId } });
        return;
      }
      setFlow({ kind: "waiting", mode: flow.mode, username: name, challengeId: res.challengeId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that challenge.");
    } finally {
      setBusy(false);
    }
  }

  if (!home.profile) {
    return (
      <main className="auth-wood relative flex min-h-dvh flex-col items-center justify-center px-5 py-10">
        <div className="absolute right-5 top-5">
          <ClubHeaderActions />
        </div>
        <MorseCrest className="size-[4.5rem] text-[1.75rem]" />
        <p className="mt-5 text-[13px] font-medium uppercase tracking-[0.42em] text-gold-line">The Morse table</p>
        <h1 className="mt-2 font-display text-[clamp(2.6rem,8vw,4.5rem)] font-semibold leading-none text-ivory">
          Morse Chess
        </h1>
        <p className="mt-3 max-w-md text-center text-base font-light text-mist">
          Pick the name other players type for an intended pull-up.
        </p>
        <form
          className="mt-8 w-full max-w-[26.5rem] rounded-[18px] border border-line-strong bg-panel/90 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md"
          onSubmit={onClaim}
        >
          <Label htmlFor="claim">Username</Label>
          <Input
            id="claim"
            className="mt-2"
            value={claim}
            autoFocus
            onChange={(e) => setClaim(e.target.value)}
            placeholder="IvoryRook"
            maxLength={20}
          />
          {error ? <p className="mt-3 text-[15px] text-danger">{error}</p> : <p className="mt-3 min-h-5" />}
          <Button type="submit" variant="solid" size="lg" className="mt-2 w-full rounded-xl" disabled={busy}>
            {busy ? "Saving…" : "Enter the club"}
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-6xl px-4 py-5 sm:px-8 sm:py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="check-wash pointer-events-none absolute inset-0" />
      <header className="relative flex flex-wrap items-center justify-between gap-4">
        <ClubBrand />
        <ClubHeaderActions username={home.profile.username} score={home.profile.score} />
      </header>

      <section className="relative mt-10">
        <p className="text-xs uppercase tracking-[0.2em] text-mist">The lounge</p>
        <h1 className="mt-2 max-w-2xl font-display text-4xl text-ivory">Your board is waiting.</h1>
        <p className="mt-3 max-w-xl text-base text-mist">
          Pull a random seat. Everyone online is asked. First yes sits. Two randoms in the same five
          seconds pair at once. Alone in the chair, MorseBot sits. Timed games give each player one
          minute a turn. The Board cabinet is at the bottom of the lounge.
        </p>
        {error && flow.kind === "idle" ? <p className="mt-3 text-base text-danger">{error}</p> : null}
      </section>

      <section className="relative mt-8 grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setFlow({ kind: "pick-mode", intent: "random" })}
          className="felt-inset rounded-xl border border-line p-6 text-left transition-[border-color] duration-200 hover:border-line-strong"
        >
          <div className="flex items-center gap-3">
            <CheckTile />
            <PieceMark kind="n" className="size-7 text-cream" />
          </div>
          <h2 className="mt-4 font-display text-2xl text-ivory">Random pull-up</h2>
          <p className="mt-2 text-sm text-mist">
            Sit across from whoever answers first. Everyone at the boards is asked. Two randoms pair
            at once. Five seconds with no yes is an error — unless you are sitting alone, then MorseBot
            takes the chair.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setFlow({ kind: "pick-mode", intent: "challenge" })}
          className="felt-inset rounded-xl border border-line p-6 text-left transition-[border-color] duration-200 hover:border-line-strong"
        >
          <div className="flex items-center gap-3">
            <CheckTile />
            <PieceMark kind="k" className="size-7 text-cream" />
          </div>
          <h2 className="mt-4 font-display text-2xl text-ivory">Intended pull-up</h2>
          <p className="mt-2 text-sm text-mist">
            Type their username. They must have signed in and created that account. They tap yes, and you
            both sit at the 3D table. MorseBot answers if you name MorseBot.
          </p>
        </button>
      </section>
      <div className="relative mt-3 flex flex-wrap gap-x-4 gap-y-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm text-mist underline-offset-4 hover:text-ivory hover:underline"
          onClick={() => setFlow({ kind: "pick-mode", intent: "bot" })}
        >
          <PieceMark kind="p" className="size-4 text-cream" />
          Timed or breeze vs {BOT_USERNAME}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm text-mist underline-offset-4 hover:text-ivory hover:underline"
          onClick={() => setFlow({ kind: "pick-mode", intent: "bot-v2" })}
        >
          <PieceMark kind="q" className="size-4 text-cream" />
          Timed or breeze vs {BOT_V2_USERNAME}
        </button>
      </div>

      <section className="relative mt-10 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="min-h-48">
          <div className="flex items-center gap-2">
            <PieceMark kind="q" className="size-5 text-cream" />
            <h2 className="font-display text-2xl">Challenges</h2>
          </div>
          <p className="mt-1 text-sm text-mist">Slips land here the moment someone names you.</p>
          <div className="mt-5 space-y-3">
            {home.inbox.length === 0 ? (
              <p className="text-sm text-mist">No one is waiting on you right now.</p>
            ) : (
              home.inbox.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-3 rounded-md border border-line bg-ink-soft p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm text-ivory">
                    {c.kind === "pull" ? (
                      <>
                        Random pull-up — <span className="font-medium">{c.fromUsername}</span> is asking
                        everyone. First yes sits. {c.mode}.
                      </>
                    ) : (
                      <>
                        <span className="font-medium">{c.fromUsername}</span> wants to battle you in chess{" "}
                        {c.mode}.
                      </>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="solid"
                      onClick={async () => {
                        const res = await respondChallenge({ data: { id: c.id, accept: true } });
                        if (res.ok && res.gameId) {
                          await navigate({ to: "/play/$gameId", params: { gameId: res.gameId } });
                        }
                      }}
                    >
                      Sit down
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => respondChallenge({ data: { id: c.id, accept: false } })}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))
            )}
            {home.outgoing
              .filter((c) => c.status === "pending")
              .map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-line p-4"
                >
                  <p className="text-sm text-mist">
                    Waiting on {c.toUsername} for a {c.mode} game.
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => cancelChallenge({ data: { id: c.id } })}>
                    Cancel
                  </Button>
                </div>
              ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2">
              <PieceMark kind="r" className="size-5 text-cream" />
              <h2 className="font-display text-2xl">At the boards</h2>
            </div>
            <div className="mt-4 space-y-2">
              {home.online.length === 0 ? (
                <p className="text-sm text-mist">
                  The other chairs are empty. MorseBot, the house chess master, is always ready.
                </p>
              ) : (
                home.online.map((p) => (
                  <button
                    key={p.username}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-panel-2"
                    onClick={() => {
                      setTarget(p.username);
                      setFlow({ kind: "pick-mode", intent: "challenge" });
                    }}
                  >
                    <span className="inline-flex items-center gap-2 text-sm text-ivory">
                      <PieceMark kind="p" className="size-4 text-mist" />
                      {p.username}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-mist">{p.score}</span>
                  </button>
                ))
              )}
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-2">
              <PieceMark kind="b" className="size-5 text-cream" />
              <h2 className="font-display text-2xl">Standings</h2>
            </div>
            <ol className="mt-4 space-y-2">
              {home.leaders.map((p, i) => (
                <li key={p.username} className="flex items-center justify-between text-sm">
                  <span className="text-mist">
                    <span className="mr-2 font-mono tabular-nums text-cream">{i + 1}</span>
                    {p.username}
                  </span>
                  <span className="font-mono tabular-nums text-ivory">{p.score}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </section>

      <div className="relative mt-12 flex justify-center">
        <Button asChild variant="solid" size="lg" className="min-w-40 rounded-full px-10">
          <Link to="/boards">Board</Link>
        </Button>
      </div>
      <p className="file-rail relative mt-8 text-center text-xs">a b c d e f g h</p>

      {(flow.kind !== "idle" || home.queued) && (
        <div className="fixed inset-0 z-40 grid place-items-end bg-ink/70 p-4 sm:place-items-center">
          <div className="w-full max-w-md rounded-xl border border-line bg-panel p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-2xl text-ivory">
                {flow.kind === "pick-mode"
                  ? "How do you want to play?"
                  : flow.kind === "ask-name"
                    ? "Who sits across the board?"
                    : flow.kind === "searching" || home.queued
                      ? "Finding a board"
                      : "Challenge sent"}
              </h2>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-md text-mist hover:bg-panel-2 hover:text-ivory"
                onClick={async () => {
                  if (home.queued) await leaveQueue();
                  setFlow({ kind: "idle" });
                  setError(null);
                }}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {flow.kind === "pick-mode" ? (
              <div className="mt-5 grid gap-3">
                {flow.intent === "challenge" && target ? (
                  <p className="text-sm text-mist">
                    Sitting across <span className="text-ivory">{target}</span>. Timed or breeze?
                  </p>
                ) : null}
                <Button
                  variant="solid"
                  size="lg"
                  className="h-auto justify-start py-4"
                  disabled={busy}
                  onClick={() => chooseMode("timed")}
                >
                  <Timer className="size-4" />
                  <span className="text-left">
                    <span className="block">Timed</span>
                    <span className="block text-xs font-normal text-ink/70">
                      One minute each. Clock pauses when you move.
                    </span>
                  </span>
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="h-auto justify-start py-4"
                  disabled={busy}
                  onClick={() => chooseMode("breeze")}
                >
                  <Wind className="size-4" />
                  <span className="text-left">
                    <span className="block">Breeze</span>
                    <span className="block text-xs font-normal text-mist">
                      No clock. Think as long as you like.
                    </span>
                  </span>
                </Button>
              </div>
            ) : null}

            {flow.kind === "ask-name" ? (
              <form className="mt-5 space-y-4" onSubmit={submitChallenge}>
                <Badge>{flow.mode} game</Badge>
                <div className="space-y-2">
                  <Label htmlFor="opp">Club name</Label>
                  <Input
                    id="opp"
                    autoFocus
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="Type their club name"
                  />
                </div>
                {error ? <p className="text-sm text-danger">{error}</p> : null}
                <Button type="submit" variant="solid" className="w-full" disabled={busy}>
                  {busy ? "Sending…" : "Send challenge"}
                </Button>
              </form>
            ) : null}

            {flow.kind === "searching" || home.queued ? (
              <SearchingPanel score={home.profile.score} mode={flow.kind === "searching" ? flow.mode : home.queueMode} />
            ) : null}

            {flow.kind === "waiting" ? (
              <p className="mt-5 text-sm text-mist">
                {home.profile.username} wants to battle {flow.username} in chess {flow.mode}. Waiting for
                their yes.
              </p>
            ) : null}

            {error && (flow.kind === "pick-mode" || flow.kind === "idle") ? (
              <p className="mt-3 text-sm text-danger">{error}</p>
            ) : null}
          </div>
        </div>
      )}
    </main>
  );
}

function SearchingPanel({ score, mode }: { score: number; mode: GameMode | null }) {
  const [left, setLeft] = useState(5);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      setLeft(Math.max(0, 5 - Math.floor((Date.now() - started) / 1000)));
    }, 200);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="mt-5 space-y-3">
      <p className="text-sm text-mist">
        Asking everyone at the boards{mode ? ` for ${mode}` : ""}. First yes sits. Score {score}.
      </p>
      <p className="font-display text-3xl tabular-nums text-ivory">{left}s</p>
      <div className="h-1 overflow-hidden rounded-full bg-ink-soft">
        <div className="h-full bg-forest transition-[width] duration-200" style={{ width: `${(left / 5) * 100}%` }} />
      </div>
    </div>
  );
}
