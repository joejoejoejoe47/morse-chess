import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-panel p-6 text-ivory shadow-[0_18px_50px_-28px_rgba(0,0,0,0.65)]",
        className,
      )}
      {...props}
    />
  );
}
