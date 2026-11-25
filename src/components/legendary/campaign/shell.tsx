/** Shared chrome for the Campaign pages: the Legendary header, the door, and the campaign state. */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { LEGENDARY } from "@/lib/legendary/theme";
import { playSfx } from "@/lib/legendary/sfx";
import { Coin, PlayerAvatar, ui, useMyPhoto } from "@/components/legendary/bits";
import { cn } from "@/lib/utils";
import { campaignState, type CampaignState } from "./data";
import "./campaign.css";

export function useCampaign() {
  const [state, setState] = useState<CampaignState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    campaignState()
      .then((s) => { setState(s); setError(null); })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { state, setState, error, reload };
}

/** Legendary only, signed in only. */
export function CampaignDoor({ children }: { children: ReactNode }) {
  const door = useClubDoor();
  if (!LEGENDARY) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink p-6 text-center text-ivory">
        <div>
          <p className="font-display text-3xl">The Campaign lives in Morse Chess Legendary</p>
          <a href="/chessLegendary/campaign" className="mt-4 inline-block text-[#e7c56a] underline">Open Legendary</a>
        </div>
      </main>
    );
  }
  if (door.status === "pending") return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  return <>{children}</>;
}

export function CampaignHeader({ on, coins, frame }: { on: "map" | "army" | "battle" | "raids" | "builder"; coins?: number | null; frame?: string }) {
  const door = useClubDoor();
  const user = door.status === "in" ? door.user : null;
  const { photo } = useMyPhoto(!!user);
  const name = (user as { displayName?: string | null } | null)?.displayName ?? "";
  return (
    <header className="mcc-head" data-campaign-head>
      <Link to="/" className="mcc-logo" aria-label="Back to the lounge" onClick={() => playSfx("tap")} data-campaign-home>
        <img src={ui("logo-shield.webp")} alt="" draggable={false} />
        <span className="max-sm:hidden">
          <span className="w1">Morse Chess</span>
          <span className="w2">Legendary</span>
        </span>
      </Link>
      <nav className="mcc-nav" aria-label="Campaign">
        <Link to="/campaign" className={cn(on === "map" && "is-on")} onClick={() => playSfx("tap")}>World Map</Link>
        <Link to="/campaign/army" className={cn(on === "army" && "is-on")} onClick={() => playSfx("tap")} data-nav-army>Army</Link>
        <Link to="/campaign/raids" className={cn(on === "raids" && "is-on")} onClick={() => playSfx("tap")} data-nav-raids>Raids</Link>
        <span className="is-soon" title="The arena builder is coming next">Arena Builder<small>soon</small></span>
      </nav>
      <div className="mcc-right">
        <span className="mcc-chip" title="Morse coins" data-campaign-coins>
          <Coin />
          <span className="tabular-nums">{coins == null ? "…" : coins.toLocaleString()}</span>
        </span>
        <Link to="/avatar" className="mcc-me" aria-label="My AV king" onClick={() => playSfx("tap")}>
          <PlayerAvatar userId={user?.id} photo={photo} letter={(photo?.letter || name || "M").slice(0, 1).toUpperCase()} size={40} frame={frame ?? "plain"} />
        </Link>
      </div>
    </header>
  );
}

export function LoadingCampaign({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="text-center">
        <div className="mcc-goldtext text-3xl">{error ? "The map is lost in the fog" : "Unrolling the map…"}</div>
        {error ? (
          <>
            <p className="mt-2 text-sm text-[#c7b7a0]">{error}</p>
            <button type="button" className="mcc-btn is-sm mt-4" onClick={onRetry}>Try again</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
