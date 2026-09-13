import { useState } from "react";
import { signOut, clearPreviewBearer } from "@/lib/auth/client";
import { clearClubSession } from "@/lib/auth/club-session";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ClubSignOut({ className }: { className?: string }) {
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("min-w-24 text-[15px]", className)}
      disabled={signingOut}
      onClick={() => {
        setSigningOut(true);
        setFailed(false);
        clearClubSession();
        clearPreviewBearer();
        void signOut("/").catch(() => {
          window.location.href = "/";
          setSigningOut(false);
          setFailed(true);
        });
      }}
    >
      {signingOut ? "Signing out…" : failed ? "Try again" : "Sign out"}
    </Button>
  );
}
