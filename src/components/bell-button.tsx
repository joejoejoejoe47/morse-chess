import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BellOff } from "lucide-react";
import { loadBellSettings, subscribeBellSettings } from "@/lib/bell";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

export function BellButton({ className }: { className?: string }) {
  const { user } = useCurrentUserState();
  const accountId = user?.id ?? null;
  const [unmuted, setUnmuted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setUnmuted(loadBellSettings(accountId).unmuted);
    sync();
    setReady(true);
    return subscribeBellSettings(sync);
  }, [accountId]);

  return (
    <Link
      to="/bell"
      aria-label={unmuted ? "Challenge bell settings, on" : "Challenge bell settings, muted"}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full border border-line-strong bg-walnut text-cream shadow-[0_8px_20px_rgba(0,0,0,0.28)] transition-[border-color,transform] duration-150 hover:border-gold-line hover:text-ivory",
        unmuted && "border-gold-line text-ivory",
        className,
      )}
    >
      {ready && unmuted ? <Bell className="size-4" /> : <BellOff className="size-4 opacity-80" />}
    </Link>
  );
}
