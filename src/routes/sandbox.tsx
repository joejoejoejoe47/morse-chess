import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MorseApp } from "@/components/battle/app";
import { SplashSkeleton } from "@/components/auth-screen";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { masterSandboxUrl } from "@/lib/master-sandbox";
import { getHomeState } from "@/lib/server/mores";
import "@/battle-gate.css";

export const Route = createFileRoute("/sandbox")({
  component: SandboxPage,
});

function SandboxPage() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  // MasterGus is sent to his goblin project; everyone else gets the battle gate.
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setChecked(true);
      return;
    }
    let live = true;
    void getHomeState()
      .then((home: { profile?: { username?: string } | null } | null) => {
        const url = masterSandboxUrl(home?.profile?.username);
        if (url) {
          window.location.replace(url);
          return;
        }
        if (live) setChecked(true);
      })
      .catch(() => {
        if (live) setChecked(true);
      });
    return () => {
      live = false;
    };
  }, [user, isPending]);

  if (!checked) return <SplashSkeleton />;
  return <MorseApp onLounge={() => void navigate({ to: "/" })} />;
}
