import { useEffect, useState, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ClubTheme = "light" | "dark";
const KEY = "mores-theme";
const EVENT = "mores-theme";

function readTheme(): ClubTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function applyTheme(theme: ClubTheme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.remove("dark");
  if (theme === "dark") root.classList.add("dark");
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let saved: ClubTheme | null = null;
    try {
      const v = localStorage.getItem(KEY);
      if (v === "light" || v === "dark") saved = v;
    } catch {
      saved = null;
    }
    applyTheme(saved ?? readTheme());
  }, []);
  return <>{children}</>;
}

export function useTheme(): ClubTheme {
  return useSyncExternalStore(subscribe, readTheme, () => "dark");
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("min-w-24", className)}
      onClick={() => applyTheme(next)}
      aria-label={next === "light" ? "Switch to light board" : "Switch to dark board"}
    >
      {ready && theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
      {ready && theme === "dark" ? "Light" : "Dark"}
    </Button>
  );
}
