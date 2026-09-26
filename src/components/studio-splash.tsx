import { useEffect, useState } from "react";

const KEY = "morse-studio-splash";

export function StudioSplash() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) === "1") {
        setOn(false);
        return;
      }
    } catch {
      /* show it */
    }
    const timer = window.setTimeout(() => {
      setOn(false);
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!on) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black">
      <img src="/morse-studios.png" alt="Morse Studios" className="h-full w-full object-cover object-center" />
    </div>
  );
}
