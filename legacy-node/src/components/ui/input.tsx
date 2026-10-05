import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-12 w-full rounded-md border border-line-strong bg-ink-soft px-3 text-base text-ivory placeholder:text-mist/70",
        "transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-2/80",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
