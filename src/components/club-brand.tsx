import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme";
import { ClubSignOut } from "@/components/club-sign-out";
import { BellControls } from "@/components/bell-button";
import { cn } from "@/lib/utils";
import { LEGENDARY } from "@/lib/legendary/theme";

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

export function ClubBrand({ to, tone = "light" }: { to?: "/"; tone?: "light" | "dark" }) {
  const color = tone === "dark" ? "#1c1914" : "#f6f1e4";
  const inner = LEGENDARY ? (
    <span className="flex flex-col items-start leading-none" data-legendary-brand>
      <span className="mcl-wordmark text-[1.55rem]">MORSE CHESS</span>
      <span className="mt-0.5 font-[Cinzel] text-[10px] font-bold tracking-[0.45em] text-[#b58cff]">LEGENDARY</span>
    </span>
  ) : (
    <>
      <MorseCrest />
      <span
        className="font-display text-[1.85rem] font-semibold leading-none tracking-display"
        style={{ color }}
      >
        Morse Chess
      </span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="inline-flex items-center gap-3.5 hover:opacity-90" style={{ color }}>
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
          Elo <span className="font-medium">{score}</span>
        </span>
      ) : null}
      <BellControls />
      <ThemeToggle className="rounded-full" />
      <ClubSignOut className="rounded-full" />
      {extra}
    </div>
  );
}
