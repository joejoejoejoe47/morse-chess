import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const sql = await getSql();
          const rows = await sql`select 1 as ok`;
          return Response.json({ ok: true, rows });
        } catch (err) {
          const error = err as { message?: string; code?: string };
          console.error("[health] database failed", err);
          return Response.json(
            { ok: false, message: error.message ?? "database failed", code: error.code ?? null },
            { status: 500 },
          );
        }
      },
    },
  },
});
