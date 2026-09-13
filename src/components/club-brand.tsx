import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme";
import { ClubSignOut } from "@/components/club-sign-out";
import { cn } from "@/lib/utils";

export function MorseCrest({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full border border-line-strong bg-walnut font-display text-xl font-semibold text-cream shadow-[0_6px_18px_rgba(0,0,0,0.28)]",
        className,
      )}
      aria-hidden
    >
      M
    </span>
  );
}

export function ClubBrand({ to }: { to?: "/" }) {
  const inner = (
    <>
      <MorseCrest />
      <span className="font-display text-[1.85rem] font-semibold leading-none tracking-display text-ivory">
        Morse Chess
      </span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="inline-flex items-center gap-3.5 text-ivory hover:opacity-90">
        {inner}
      </Link>
    );
  }
  return <div className="inline-flex items-center gap-3.5">{inner}</div>;
}

export function ClubHeaderActions({
  username,
  score,
  extra,
}: {
  username?: string;
  score?: number;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {username ? <span className="text-base text-ivory">{username}</span> : null}
      {typeof score === "number" ? (
        <span className="rounded-full border border-line bg-panel px-4 py-2 text-[15px] text-ivory">
          Score <span className="font-medium">{score}</span>
        </span>
      ) : null}
      <ThemeToggle className="rounded-full" />
      {extra}
      <ClubSignOut className="rounded-full" />
    </div>
  );
}
