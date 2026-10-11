import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { ClubBrand, ClubHeaderActions } from "@/components/club-brand";
import { SoundtrackPanel } from "@/components/soundtrack-panel";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/soundtrack")({ component: SoundtrackDoor });

function SoundtrackDoor() {
  const door = useClubDoor();
  const { user } = useCurrentUserState();
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-3xl px-4 py-3 sm:px-8 sm:py-4">
      <div className="check-wash pointer-events-none absolute inset-0" />
      <header className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 bg-ink/88 px-4 py-3 backdrop-blur-md sm:-mx-8 sm:px-8">
        <ClubBrand to="/" />
        <ClubHeaderActions />
      </header>
      <section className="relative mt-6">
        <p className="text-xs uppercase tracking-[0.2em] text-mist">The soundtrack</p>
        <h1 className="mt-2 font-display text-4xl text-ivory">Songs that follow the game.</h1>
        <p className="mt-3 max-w-xl text-base text-mist">
          Upload songs from this browser, put them in order, and unmute. The list keeps playing at the table and on the hill, even when the other player’s sound is on.
        </p>
      </section>
      <div className="relative mt-8">
        {user ? <SoundtrackPanel accountId={user.id} page /> : null}
      </div>
      <Link to="/bell" className="relative mt-6 inline-block text-sm text-gold-line underline-offset-4 hover:underline">
        Back to the bell
      </Link>
    </main>
  );
}
