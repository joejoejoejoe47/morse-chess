import { useEffect, useRef } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "An unexpected error occurred. Try reloading the page.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

function staleChunk(message: string) {
  return /dynamically imported module|module script failed|Importing a module script failed/i.test(message);
}

export function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  const message = errorMessage(error);
  const once = useRef(false);

  useEffect(() => {
    if (!staleChunk(message) || once.current) return;
    once.current = true;
    reset();
    let tried = false;
    try {
      tried = sessionStorage.getItem("mores-boards-retry") === "1";
      if (!tried) sessionStorage.setItem("mores-boards-retry", "1");
    } catch {
      tried = true;
    }
    if (tried) return;
    const timer = window.setTimeout(() => {
      window.location.assign("/boards");
    }, 600);
    return () => window.clearTimeout(timer);
  }, [message, reset]);

  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">{message}</p>
    </main>
  );
}
