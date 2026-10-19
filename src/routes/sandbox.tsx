import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MorseApp } from "@/components/battle/app";
import { SplashSkeleton } from "@/components/auth-screen";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { sandboxUrlFor } from "@/lib/master-sandbox";
import { getHomeState } from "@/lib/server/mores";
import "@/battle-gate.css";

export const Route = createFileRoute("/sandbox")({
  component: SandboxPage,
});

function SandboxPage() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  // Signed in: MasterGus goes to his goblin editor, everyone else plays his project.
  // Signed out: the battle gate, as before.
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
        if (!live) return;
        window.location.replace(sandboxUrlFor(home?.profile?.username));
      })
      .catch(() => {
        // Signed in but the club could not be read: still not MasterGus's editor.
        if (live) window.location.replace(sandboxUrlFor(null));
      });
    return () => {
      live = false;
    };
  }, [user, isPending]);

  if (!checked) return <SplashSkeleton />;
  return <MorseApp onLounge={() => void navigate({ to: "/" })} />;
}
