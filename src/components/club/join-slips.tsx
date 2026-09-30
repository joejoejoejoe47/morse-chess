import { useEffect, useState } from "react";
import { listJoinRequests, respondJoin } from "@/lib/server/clubs";
import { Button } from "@/components/ui/button";

export function JoinSlips() {
  const [rows, setRows] = useState<{ id: string; username: string; clubName: string }[]>([]);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const next = await listJoinRequests();
        if (live) setRows(next);
      } catch {
        /* not hosting a club yet */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1600);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  if (!rows.length) return null;
  return (
    <div className="mt-4 space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded-md border border-gold-line/50 bg-ink-soft p-4">
          <p className="text-sm text-ivory">
            <span className="font-medium">{row.username}</span> wants to join your chess club {row.clubName}.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="solid"
              onClick={() => {
                void respondJoin({ data: { id: row.id, welcome: true } }).then(() =>
                  setRows((list) => list.filter((item) => item.id !== row.id)),
                );
              }}
            >
              Welcome
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void respondJoin({ data: { id: row.id, welcome: false } }).then(() =>
                  setRows((list) => list.filter((item) => item.id !== row.id)),
                );
              }}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
