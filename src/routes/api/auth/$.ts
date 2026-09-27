import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

async function handle(request: Request) {
  try {
    return await auth.handler(request);
  } catch (err) {
    console.error("[auth] handler failed", err);
    const message = err instanceof Error ? err.message : "Sign-in failed.";
    return new Response(JSON.stringify({ message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});

