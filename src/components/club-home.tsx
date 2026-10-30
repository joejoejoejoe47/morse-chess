import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Navigate, useNavigate, Link } from "@tanstack/react-router";
import { Lock, Timer, Wind, X } from "lucide-react";
import { ClubBrand, ClubHeaderActions, MorseCrest } from "@/components/club-brand";
import { CheckTile, PieceMark } from "@/components/chess/marks";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { sandboxUrlFor } from "@/lib/master-sandbox";
import { asset } from "@/lib/base";
import { canPlayGame, isOwnerPreview } from "@/lib/games/release";
import { VARIANT_INFO, type VariantId as RuleVariant } from "@/lib/variants/engine";
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
import { TeamSetup } from "@/components/variants/team-setup";
import { getFootballPrefs, saveFootballTeam, sendFootballChallenge, type FootballTeam } from "@/lib/server/football";
import { SplashSkeleton } from "@/components/auth-screen";
import { JoinSlips } from "@/components/club/join-slips";
import { ChallengeCountdown, useNow } from "@/components/challenge-countdown";

type VariantId = "checkmate" | "football" | "strategy" | "basketball";

type Flow =
  | { kind: "idle" }
  | { kind: "pick-mode"; intent: "random" | "challenge" | "bot" | "bot-v2"; variant?: RuleVariant; back?: PullScreen }
  | { kind: "pick-color"; intent: "bot" | "bot-v2"; mode: GameMode }
  | { kind: "select-game"; intent: "random" | "challenge"; screen?: PullScreen }
  | { kind: "variant-name"; intent: "random" | "challenge"; mode: VariantId }
  | { kind: "ask-name"; mode: GameMode; game?: string; variant?: RuleVariant }
  | { kind: "searching"; mode: GameMode }
  | { kind: "waiting"; mode: GameMode; username: string; challengeId?: string; variant?: RuleVariant; football?: boolean };

/** The UNRANKED pull-up has two screens: the main 3x2 grid and "Other games" (owner t209u). */
type PullScreen = "main" | "other";

export function ClubHome() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [botMinutes, setBotMinutes] = useState<1 | 5 | 10>(1);
  const [home, setHome] = useState<HomeState | null>(null);
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const [claim, setClaim] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // football: "Change team!" under the username box opens the team card (saved per user)
  const [teamCard, setTeamCard] = useState<{ team: FootballTeam | null } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const seenInvite = useRef("");
  const now = useNow();
  const live = (c: { deadline?: number }) => c.deadline == null || c.deadline > now;

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
        const got = Date.now();
        for (const c of [...next.inbox, ...next.outgoing]) {
          if (c.expiresInMs != null) c.deadline = got + c.expiresInMs;
        }
        if (!live) return;
        setHome(next);
        setLoadError(null);
        if (next.queueMiss) {
          setError("Nobody answered the pull-up.");
          setFlow({ kind: "idle" });
        }
        if (next.activeGameId) {
          void navigate({ to: "/play/$gameId", params: { gameId: next.activeGameId } });
        } else if (next.footballGameId) {
          // a Football challenge was accepted (or you are still in that game): open it (t234u)
          void navigate({ to: "/variant/$mode", params: { mode: "football" }, search: { game: next.footballGameId } });
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

  useEffect(() => {
    if (flow.kind !== "waiting" || !flow.challengeId || !home) return;
    const row = home.outgoing.find((c) => c.id === flow.challengeId);
    if (row?.status === "pending") {
      seenInvite.current = flow.challengeId;
      return;
    }
    if (seenInvite.current === flow.challengeId) {
      if (flow.football && row?.status === "declined") setError(`${flow.username} said no to Football this time.`);
      setFlow({ kind: "idle" });
    }
  }, [home, flow]);

  // Sender side: the invitation lapsed (4 minutes) — clear the waiting state right away.
  const waitingRow =
    flow.kind === "waiting" && flow.challengeId ? home?.outgoing.find((c) => c.id === flow.challengeId) : undefined;
  const waitingExpired = !!waitingRow?.deadline && waitingRow.status === "pending" && waitingRow.deadline <= now;
  useEffect(() => {
    if (!waitingExpired || flow.kind !== "waiting") return;
    setFlow({ kind: "idle" });
    setError(`Your invitation to ${flow.username} expired after 4 minutes.`);
  }, [waitingExpired, flow]);

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

  function launchVariant(mode: VariantId, versus: string) {
    try {
      sessionStorage.setItem("morse-variant-vs", versus.trim() || "MorseBot");
    } catch {
      /* ignore */
    }
    setFlow({ kind: "idle" });
    void navigate({ to: "/variant/$mode", params: { mode } });
  }

  /** Football with a username (t234u): a real challenge to that player. No name (or the bot) = vs the bot here. */
  async function challengeFootball(name: string) {
    const who = name.trim();
    if (!who || /^morsebot/i.test(who)) {
      launchVariant("football", who || "MorseBot");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await sendFootballChallenge({ data: { username: who } });
      if (!res.ok) {
        setError(res.error ?? "Could not send the challenge.");
      } else if (res.bot) {
        launchVariant("football", res.username ?? who);
      } else if (res.gameId) {
        void navigate({ to: "/variant/$mode", params: { mode: "football" }, search: { game: res.gameId } });
      } else {
        setFlow({ kind: "waiting", mode: "timed", username: res.username ?? who, challengeId: res.challengeId, football: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the challenge.");
    } finally {
      setBusy(false);
    }
  }

  function openGame(game: "knights-tour" | "horde" | "breakthrough" | "apocalypse") {
    setFlow({ kind: "idle" });
    setError(null);
    void navigate({ to: "/games/$game", params: { game } });
  }

  function pickVariant(mode: VariantId) {
    if (flow.kind !== "select-game") return;
    if (flow.intent === "challenge") {
      setFlow({ kind: "variant-name", intent: flow.intent, mode });
      return;
    }
    launchVariant(mode, "MorseBot");
  }

  /** A rules variant tile (Horde, Atomic, ...): pick Timed/Breeze next, same as normal chess (owner t205u). */
  function playVariant(variant: RuleVariant, back: PullScreen) {
    if (flow.kind !== "select-game") return;
    setError(null);
    setFlow({ kind: "pick-mode", intent: flow.intent, variant, back });
  }

  async function chooseMode(mode: GameMode) {
    if (flow.kind !== "pick-mode") return;
    setError(null);
    if (flow.intent === "challenge") {
      setFlow({ kind: "ask-name", mode, variant: flow.variant });
      return;
    }
    if (flow.intent === "random" && flow.variant) {
      // Random pull-up in a variant: MorseBot sits across (unranked, no coins).
      setBusy(true);
      try {
        const { gameId } = await startBotGame({
          data: { mode, bot: "v1", minutes: botMinutes, color: "random", variant: flow.variant },
        });
        await navigate({ to: "/play/$gameId", params: { gameId } });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start that game.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (flow.intent === "bot" || flow.intent === "bot-v2") {
      // Next: White, Black or Random (owner t198u).
      setFlow({ kind: "pick-color", intent: flow.intent, mode });
      return;
    }
    setBusy(true);
    try {
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

  async function chooseColor(color: "white" | "black" | "random") {
    if (flow.kind !== "pick-color") return;
    setError(null);
    setBusy(true);
    try {
      const { gameId } = await startBotGame({
        data: { mode: flow.mode, bot: flow.intent === "bot-v2" ? "v2" : "v1", minutes: botMinutes, color },
      });
      await navigate({ to: "/play/$gameId", params: { gameId } });
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
      setError("Enter a username (8–20 letters, numbers, or underscores).");
      return;
    }
    setBusy(true);
    try {
      const res = await sendChallenge({ data: { username: name, mode: flow.mode, variant: flow.variant } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if ("gameId" in res && res.gameId) {
        await navigate({ to: "/play/$gameId", params: { gameId: res.gameId } });
        return;
      }
      setFlow({ kind: "waiting", mode: flow.mode, username: name, challengeId: res.challengeId, variant: flow.variant });
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
    <main className="relative mx-auto min-h-dvh w-full max-w-6xl px-4 py-3 sm:px-8 sm:py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="check-wash pointer-events-none absolute inset-0" />
      <header className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 bg-ink/88 px-4 py-3 backdrop-blur-md sm:-mx-8 sm:px-8">
        <ClubBrand />
        <ClubHeaderActions
          username={home.profile.username}
          score={home.profile.score}
          extra={
            <>
            <Link
              to="/boards"
              className="felt-inset inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-5 text-[15px] font-medium text-ivory hover:border-line-strong"
            >
              <PieceMark kind="k" className="size-4 text-cream" />
              Board
            </Link>
            <Link
              to="/avatar"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gold-line/55 bg-walnut px-5 text-[15px] font-medium text-cream shadow-[0_8px_20px_rgba(0,0,0,0.28)] hover:border-gold-line hover:text-ivory"
            >
              AV
            </Link>
            </>
          }
        />
      </header>

      <section className="relative mt-5">
        <p className="text-xs uppercase tracking-[0.2em] text-mist">The lounge</p>
        <h1 className="mt-2 max-w-2xl font-display text-4xl text-ivory">Your board is waiting.</h1>
        <p className="mt-3 max-w-xl text-base text-mist">
          Pull a random seat. Everyone online is asked. The first yes sits. Two random players in the same five
          seconds pair at once. Alone in the chair, MorseBot sits. Timed games give each player one
          minute per turn.
        </p>
        {error && flow.kind === "idle" ? <p className="mt-3 text-base text-danger">{error}</p> : null}
      </section>

      <section className="relative mt-8 grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setFlow({ kind: "select-game", intent: "random" })}
          className="felt-inset rounded-xl border border-line p-6 text-left transition-[border-color] duration-200 hover:border-line-strong"
        >
          <div className="flex items-center gap-3">
            <CheckTile />
            <PieceMark kind="n" className="size-7 text-cream" />
          </div>
          <h2 className="mt-4 font-display text-2xl text-ivory">Random pull-up</h2>
          <p className="mt-2 text-sm text-mist">
            Sit across from whoever answers first. Everyone at the boards is asked. Two random players pair
            at once. Five seconds with no yes is an error — unless you are sitting alone, then MorseBot
            takes the chair.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setFlow({ kind: "select-game", intent: "challenge" })}
          className="felt-inset rounded-xl border border-line p-6 text-left transition-[border-color] duration-200 hover:border-line-strong"
        >
          <div className="flex items-center gap-3">
            <CheckTile />
            <PieceMark kind="k" className="size-7 text-cream" />
          </div>
          <h2 className="mt-4 font-display text-2xl text-ivory">Intended pull-up</h2>
          <p className="mt-2 text-sm text-mist">
            Type the user's username. The user must have signed in and created that account. The user taps yes, and you
            both sit at the 3D table. MorseBot answers if you name MorseBot.
          </p>
        </button>
      </section>
      <a
        href={sandboxUrlFor(home.profile.username)}
        className="felt-inset relative mt-4 block rounded-xl border border-line p-6 text-left transition-[border-color] duration-200 hover:border-line-strong"
      >
        <div className="flex items-center gap-3">
          <CheckTile />
          <PieceMark kind="r" className="size-7 text-cream" />
        </div>
        <h2 className="mt-4 font-display text-2xl text-ivory">Sandbox game</h2>
        <p className="mt-2 text-sm text-mist">
          The shelf is free. Open it, then buy a game you do not own, or play one you already have.
        </p>
      </a>
      <Link
        to="/club"
        className="relative mt-4 flex min-h-14 w-full items-center justify-center rounded-xl border border-gold-line/55 bg-walnut/90 px-6 font-display text-2xl tracking-[0.28em] text-ivory shadow-[0_10px_24px_rgba(0,0,0,0.28)] hover:border-gold-line"
      >
        CHESS CLUB
      </Link>
      <Link
        to="/history"
        data-history-button
        className="relative mt-3 flex min-h-14 w-full items-center justify-center rounded-none border border-gold-line/55 bg-ink/80 px-6 font-display text-2xl tracking-[0.28em] text-ivory shadow-[0_10px_24px_rgba(0,0,0,0.28)] hover:border-gold-line"
      >
        HISTORY
      </Link>
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
          <JoinSlips />
          <div className="mt-5 space-y-3">
            {home.inbox.filter(live).length === 0 ? (
              <p className="text-sm text-mist">No one is waiting on you right now.</p>
            ) : (
              home.inbox.filter(live).map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-3 rounded-md border border-line bg-ink-soft p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm text-ivory">
                    {c.kind === "football" ? (
                      <span data-inbox-football>
                        <span className="font-medium">{c.fromUsername}</span> wants to play <span className="font-medium">Football</span> with you (no coins, no Elo).
                      </span>
                    ) : c.kind === "pull" ? (
                      <>
                        Random pull-up — <span className="font-medium">{c.fromUsername}</span> is asking
                        everyone. The first yes sits. {c.mode}.
                      </>
                    ) : (
                      <>
                        <span className="font-medium">{c.fromUsername}</span> wants to battle you in a {c.mode}{" "}
                        {c.variant ? <span data-inbox-variant={c.variant}>{VARIANT_INFO[c.variant].name} (unranked)</span> : "chess"} game.
                      </>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    {c.deadline != null ? <ChallengeCountdown deadline={c.deadline} now={now} /> : null}
                    <Button
                      size="sm"
                      variant="solid"
                      onClick={async () => {
                        const res = await respondChallenge({ data: { id: c.id, accept: true } });
                        if (res.ok && res.gameId && c.kind === "football") {
                          await navigate({ to: "/variant/$mode", params: { mode: "football" }, search: { game: res.gameId } });
                        } else if (res.ok && res.gameId) {
                          await navigate({ to: "/play/$gameId", params: { gameId: res.gameId } });
                        } else if (!res.ok && res.error) {
                          setError(res.error);
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
              .filter((c) => c.status === "pending" && live(c))
              .map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-line p-4"
                >
                  <p className="text-sm text-mist">
                    {c.kind === "football" ? `Waiting on ${c.toUsername} for a Football game.` : <>Waiting on {c.toUsername} for a {c.mode}{c.variant ? ` ${VARIANT_INFO[c.variant].name}` : ""} game.</>}
                  </p>
                  {c.deadline != null ? <ChallengeCountdown deadline={c.deadline} now={now} /> : null}
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
                  The other chairs are empty. Only people you have already played on an intended pull-up show up here. MorseBot, the house chess master, is always ready.
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

      <p className="file-rail relative mt-8 text-center text-xs">a b c d e f g h</p>

      {flow.kind === "select-game" ? (
        <PullUpScreen
          intent={flow.intent}
          screen={flow.screen ?? "main"}
          username={home.profile?.username ?? ""}
          error={error}
          onScreen={(screen) => { setError(null); setFlow({ kind: "select-game", intent: flow.intent, screen }); }}
          onClose={() => { setFlow({ kind: "idle" }); setError(null); }}
          onNormal={() => setFlow({ kind: "pick-mode", intent: flow.intent })}
          onRules={(v, back) => playVariant(v, back)}
          onLocal={(g) => openGame(g)}
          onClassic={(m) => pickVariant(m)}
        />
      ) : null}

      {teamCard ? (
        <div className="fixed inset-0 z-50">
          <TeamSetup
            key={teamCard.team ? `${teamCard.team.name}${teamCard.team.color}` : "new"}
            initial={teamCard.team}
            title="Change team!"
            onClose={() => setTeamCard(null)}
            onSave={async (team) => {
              await saveFootballTeam({ data: team });
              setTeamCard(null);
            }}
          />
        </div>
      ) : null}

      {(flow.kind !== "idle" && flow.kind !== "select-game" || home.queued) && (
        <div className="fixed inset-0 z-40 grid place-items-end bg-ink/70 p-4 sm:place-items-center">
          <div className={"w-full rounded-xl border border-line bg-panel p-6 " + (flow.kind === "select-game" ? "max-w-4xl" : "max-w-md")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                {flow.kind === "pick-mode" && (flow.intent === "random" || flow.intent === "challenge") ? (
                  <button type="button" className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#e7c56a]" onClick={() => { setError(null); setFlow({ kind: "select-game", intent: flow.intent === "challenge" ? "challenge" : "random", screen: flow.back }); }}>
                    Back
                  </button>
                ) : null}
                {flow.kind === "pick-color" ? (
                  <button type="button" className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#e7c56a]" onClick={() => { setError(null); setFlow({ kind: "pick-mode", intent: flow.intent }); }}>
                    Back
                  </button>
                ) : null}
                {flow.kind === "variant-name" ? (
                  <button type="button" className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#e7c56a]" onClick={() => { setError(null); setFlow({ kind: "select-game", intent: flow.intent, screen: "other" }); }}>
                    Back
                  </button>
                ) : null}
                {flow.kind === "ask-name" ? (
                  <button type="button" className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#e7c56a]" onClick={() => { setError(null); setFlow({ kind: "pick-mode", intent: "challenge", variant: flow.variant, back: flow.variant ? screenOf(flow.variant) : undefined }); }}>
                    Back
                  </button>
                ) : null}
                <h2 className="font-display text-2xl text-ivory">
                {flow.kind === "select-game"
                  ? "Choose your game"
                  : flow.kind === "variant-name"
                    ? "Who sits across the board?"
                  : flow.kind === "pick-mode"
                    ? "How do you want to play?"
                  : flow.kind === "pick-color"
                    ? "Which side do you want?"
                    : flow.kind === "ask-name"
                      ? "Who sits across the board?"
                      : flow.kind === "searching" || home.queued
                        ? "Finding a board"
                        : "Challenge sent"}
                </h2>
              </div>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-md text-mist hover:bg-panel-2 hover:text-ivory"
                onClick={async () => {
                  if (home.queued) await leaveQueue();
                  // closing a Football challenge you are waiting on takes it back (t234u)
                  if (flow.kind === "waiting" && flow.football && flow.challengeId) await cancelChallenge({ data: { id: flow.challengeId } }).catch(() => undefined);
                  setFlow({ kind: "idle" });
                  setError(null);
                }}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {flow.kind === "variant-name" ? (
              <form
                className="mt-5 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (flow.mode === "football") void challengeFootball(target);
                  else launchVariant(flow.mode, target);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="variant-user">Username</Label>
                  <Input id="variant-user" autoFocus value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Who sits across from you" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="solid" size="lg" disabled={busy}>{flow.mode === "football" && target.trim() ? "Send" : "Sit down"}</Button>
                  {flow.mode === "football" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      data-change-team
                      onClick={() => {
                        setTeamCard({ team: null });
                        void getFootballPrefs()
                          .then((p) => setTeamCard((c) => (c ? { team: p.team } : c)))
                          .catch(() => undefined);
                      }}
                    >
                      Change team!
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : null}

            {flow.kind === "pick-mode" ? (
              <div className="mt-5 grid gap-3">
                {flow.variant ? (
                  <p className="text-sm text-mist" data-pick-variant={flow.variant}>
                    <span className="font-semibold text-[#e7c56a]">{VARIANT_INFO[flow.variant].name}</span> · {VARIANT_INFO[flow.variant].short}.{" "}
                    {flow.intent === "random" ? "MorseBot sits across." : "Your friend plays the same rules."} Unranked — no Elo, no coins.
                  </p>
                ) : null}
                {flow.variant ? (
                  // The game's rules, read before the first move (owner t220u).
                  <ol data-pick-rules={flow.variant} className="list-decimal space-y-1 rounded-lg border border-[#e7c56a]/25 bg-black/20 py-3 pl-8 pr-3 text-[13px] leading-snug text-cream">
                    {VARIANT_INFO[flow.variant].rules.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ol>
                ) : null}
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
                      {flow.intent === "bot" || flow.intent === "bot-v2" || (flow.intent === "random" && flow.variant)
                        ? `${botMinutes === 1 ? "One minute" : `${botMinutes} minutes`} each. Clock pauses when you move.`
                        : "One minute each. Clock pauses when you move."}
                    </span>
                  </span>
                </Button>
                {flow.intent === "bot" || flow.intent === "bot-v2" || (flow.intent === "random" && flow.variant) ? (
                  <div className="flex items-center gap-2 text-sm text-mist" role="radiogroup" aria-label="Clock">
                    <span>Clock</span>
                    {([1, 5, 10] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={botMinutes === m}
                        className={
                          "min-h-9 rounded-none border px-3 " +
                          (botMinutes === m ? "border-gold-line bg-walnut text-ivory" : "border-line text-mist hover:text-ivory")
                        }
                        onClick={() => setBotMinutes(m)}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                ) : null}
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

            {flow.kind === "pick-color" ? (
              <div className="mt-5" data-bot-color-chooser>
                <p className="text-sm text-mist">
                  vs {flow.intent === "bot-v2" ? BOT_V2_USERNAME : BOT_USERNAME} · {flow.mode === "timed" ? `${botMinutes} min each` : "Breeze"}. White moves first.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {(
                    [
                      { id: "white", label: "White", note: "You move first", tile: "bg-[#ece3d0] text-[#1c1712]", piece: "k" },
                      { id: "black", label: "Black", note: "Bot moves first", tile: "bg-[#1c1712] text-[#ece3d0] border border-line", piece: "k" },
                      { id: "random", label: "Random", note: "Flip a coin", tile: "bg-[linear-gradient(135deg,#ece3d0_50%,#1c1712_50%)] text-[#8a6d3b]", piece: "q" },
                    ] as const
                  ).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      data-bot-color={c.id}
                      disabled={busy}
                      onClick={() => chooseColor(c.id)}
                      className="flex flex-col items-center gap-2 rounded-lg border border-line bg-panel-2 px-2 py-3 text-ivory hover:border-gold-line disabled:opacity-60"
                    >
                      <span className={"grid size-12 place-items-center rounded-md " + c.tile}>
                        <PieceMark kind={c.piece} className="size-7" />
                      </span>
                      <span className="text-base font-semibold">{c.label}</span>
                      <span className="text-xs text-mist">{c.note}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {flow.kind === "ask-name" ? (
              <form className="mt-5 space-y-4" onSubmit={submitChallenge}>
                <Badge>{flow.variant ? `${VARIANT_INFO[flow.variant].name} · ` : ""}{flow.mode} game</Badge>
                <div className="space-y-2">
                  <Label htmlFor="opp">Username</Label>
                  <Input
                    id="opp"
                    autoFocus
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="Type the user's name"
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

            {flow.kind === "waiting" && flow.football ? (
              <div className="mt-5 text-sm text-mist" data-football-waiting>
                Football challenge sent to <span className="text-ivory">{flow.username}</span>. Waiting for their yes — the game opens by itself when they sit down.
                {waitingRow?.deadline ? (
                  <span className="mt-2 block">
                    <ChallengeCountdown deadline={waitingRow.deadline} now={now} />
                  </span>
                ) : null}
                <Button
                  className="mt-3"
                  size="sm"
                  variant="secondary"
                  data-cancel-football
                  onClick={async () => {
                    if (flow.challengeId) await cancelChallenge({ data: { id: flow.challengeId } }).catch(() => undefined);
                    setFlow({ kind: "idle" });
                  }}
                >
                  Cancel challenge
                </Button>
              </div>
            ) : flow.kind === "waiting" ? (
              <p className="mt-5 text-sm text-mist">
                {home.profile.username} wants to battle {flow.username} in a {flow.mode}{" "}
                {flow.variant ? VARIANT_INFO[flow.variant].name : "chess"} game. Waiting for
                the user's yes.
                {waitingRow?.deadline ? (
                  <span className="mt-2 block">
                    <ChallengeCountdown deadline={waitingRow.deadline} now={now} />
                  </span>
                ) : null}
              </p>
            ) : null}

            {error && (flow.kind === "pick-mode" || flow.kind === "pick-color" || flow.kind === "idle" || flow.kind === "variant-name") ? (
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
        Asking everyone at the boards{mode ? ` for ${mode}` : ""}. First yes sits. Elo {score}.
      </p>
      <p className="font-display text-3xl tabular-nums text-ivory">{left}s</p>
      <div className="h-1 overflow-hidden rounded-full bg-ink-soft">
        <div className="h-full bg-forest transition-[width] duration-200" style={{ width: `${(left / 5) * 100}%` }} />
      </div>
    </div>
  );
}

/** Which pull-up screen a rules variant's tile lives on (for Back). */
function screenOf(v: RuleVariant): PullScreen {
  return v === "horde" || v === "atomic" || v === "koth" ? "main" : "other";
}

type TileState = "play" | "preview" | "soon";
type LocalGame = "knights-tour" | "apocalypse";

type TileSpec = {
  id: string;
  art: string;
  big: string;
  small: string;
  state: TileState;
  go: () => void;
};

/**
 * The UNRANKED pull-up (owner t209u): a 3x2 grid of engraved bronze tiles like the old pull-up,
 * plus an "Other games" screen in the same style. Every game except normal chess shows
 * COMING SOON until it is approved in src/lib/games/release.ts; MasterGus sees "Owner preview".
 */
function PullUpScreen({
  intent,
  screen,
  username,
  error,
  onScreen,
  onClose,
  onNormal,
  onRules,
  onLocal,
  onClassic,
}: {
  intent: "random" | "challenge";
  screen: PullScreen;
  username: string;
  error: string | null;
  onScreen: (s: PullScreen) => void;
  onClose: () => void;
  onNormal: () => void;
  onRules: (v: RuleVariant, back: PullScreen) => void;
  onLocal: (g: LocalGame) => void;
  onClassic: (m: VariantId) => void;
}) {
  const gate = (id: string): TileState =>
    !canPlayGame(id, username) ? "soon" : isOwnerPreview(id, username) ? "preview" : "play";
  const rules = (v: RuleVariant, back: PullScreen): TileSpec => ({
    id: v,
    art: v,
    big: VARIANT_INFO[v].name,
    small: VARIANT_INFO[v].short,
    state: gate(v),
    go: () => onRules(v, back),
  });
  const main: TileSpec[] = [
    { id: "normal", art: "classic", big: "1v1", small: "Normal chess", state: "play", go: onNormal },
    { id: "apocalypse", art: "apocalypse", big: "Apocalypse", small: "5×5 · secret moves", state: gate("apocalypse"), go: () => onLocal("apocalypse") },
    rules("horde", "main"),
    rules("atomic", "main"),
    rules("koth", "main"),
    { id: "other", art: "other", big: "Other games", small: "10 more ways to play", state: "play", go: () => onScreen("other") },
  ];
  const football: TileState = gate("football");
  const other: TileSpec[] = [
    { id: "football", art: "football", big: "Football", small: "1v1 on the gridiron", state: football, go: () => onClassic("football") },
    { id: "basketball", art: "basketball", big: "Basketball", small: "Five a side", state: gate("basketball"), go: () => onClassic("basketball") },
    { id: "checkmate", art: "checkmate", big: "Checkmate", small: "End game", state: gate("checkmate"), go: () => onClassic("checkmate") },
    { id: "strategy", art: "strategy", big: "Strategy", small: "Morse", state: gate("strategy"), go: () => onClassic("strategy") },
    { id: "knights-tour", art: "knights-tour", big: "Knight's Tour", small: "Visit every square", state: gate("knights-tour"), go: () => onLocal("knights-tour") },
    rules("breakthrough", "other"),
    rules("heist", "other"),
    rules("parade", "other"),
    rules("cavalry", "other"),
    rules("mini", "other"),
  ];
  const tiles = screen === "other" ? other : main;
  return (
    <div className="pull-backdrop fixed inset-0 z-[65] overflow-y-auto" data-pullup-screen data-pullup-view={screen}>
      <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
        <div className="pull-panel relative w-full max-w-6xl rounded-2xl p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {screen === "other" ? (
                <button type="button" data-pullup-back className="pull-chip" onClick={() => onScreen("main")}>
                  ← Back
                </button>
              ) : null}
              <span className="pull-emblem grid size-11 place-items-center rounded-full" aria-hidden>
                <PieceMark kind={screen === "other" ? "p" : "n"} className="size-6" />
              </span>
              <div>
                <h2 className="pull-heading text-2xl sm:text-3xl">{screen === "other" ? "Other games" : "Unranked"}</h2>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#c9a76a]/80">
                  {intent === "random" ? "Random pull-up" : "Intended pull-up"} · no Elo, no coins
                </p>
              </div>
            </div>
            <button type="button" aria-label="Close" className="pull-chip grid size-10 place-items-center !p-0" onClick={onClose}>
              <X className="size-5" />
            </button>
          </div>
          <div
            key={screen}
            data-pullup-tiles
            className={"grid gap-3 sm:gap-4 sm:grid-cols-2 " + (screen === "other" ? "lg:grid-cols-4" : "lg:grid-cols-3")}
          >
            {tiles.map((t, i) => (
              <PullTile key={t.id} spec={t} index={i} compact={screen === "other"} />
            ))}
          </div>
          {error ? <p className="mt-3 text-center text-sm text-[#e7c56a]">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}

function PullTile({ spec, index, compact }: { spec: TileSpec; index: number; compact: boolean }) {
  const soon = spec.state === "soon";
  const long = spec.big.length > 9;
  // One long word (CHECKMATE, BREAKTHROUGH) cannot wrap, so it gets a smaller size on the 4-up grid.
  const longWord = !spec.big.includes(" ") && spec.big.length >= 9;
  const size = compact
    ? longWord ? "text-[clamp(1.05rem,1.55vw,1.5rem)]" : long ? "text-[clamp(1.35rem,2vw,1.9rem)]" : "text-[clamp(1.6rem,2.5vw,2.4rem)]"
    : long ? "text-[clamp(1.6rem,2.7vw,2.5rem)]" : "text-[clamp(2.1rem,3.8vw,3.6rem)]";
  return (
    <button
      type="button"
      data-pullup-tile={spec.id}
      data-tile-state={spec.state}
      aria-disabled={soon}
      aria-label={`${spec.big} — ${spec.small}${soon ? " (coming soon)" : ""}`}
      className={"pull-tile pull-in group relative aspect-[16/8] overflow-hidden rounded-xl text-left sm:aspect-[16/10] " + (soon ? "is-soon" : "")}
      style={{ "--pull-delay": `${index * 55}ms` } as CSSProperties}
      onClick={() => { if (!soon) spec.go(); }}
    >
      <img
        src={asset(`/pullup/${spec.art}.webp`)}
        alt=""
        width={960}
        height={540}
        decoding="async"
        draggable={false}
        className="pull-art absolute inset-0 h-full w-full select-none object-cover"
      />
      <span className="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,7,4,0.92)_0%,rgba(10,7,4,0.45)_38%,rgba(10,7,4,0)_70%)]" />
      <span className="pull-shine pointer-events-none absolute inset-0" aria-hidden />
      <span className="pointer-events-none absolute inset-[5px] rounded-[9px] border border-[#e9cf94]/20" aria-hidden />
      {spec.state === "preview" ? (
        <span data-owner-preview className="pull-badge absolute right-2.5 top-2.5">Owner preview</span>
      ) : null}
      {soon ? (
        <span data-coming-soon className="pull-soon absolute right-2.5 top-2.5">
          <Lock className="size-3" /> Coming soon
        </span>
      ) : null}
      <span className="absolute bottom-3 left-4 right-4 sm:bottom-4 sm:left-5">
        <span className={"pull-title block leading-[0.95] " + size}>{spec.big}</span>
        <span className="mt-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ead9b4] sm:text-xs">
          {spec.small}
          {spec.id === "other" ? " →" : ""}
        </span>
      </span>
    </button>
  );
}
