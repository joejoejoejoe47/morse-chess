import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

async function handle(request: Request) {
  try {
    const response = await auth.handler(request);
    if (response.status < 500) return response;
    const text = await response.clone().text();
    if (text.trim()) return response;
    const message =
      (globalThis as typeof globalThis & { __morseDbError?: string }).__morseDbError ||
      "The club database is over its plan limit, so seats cannot be opened right now.";
    return new Response(JSON.stringify({ message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[auth] handler failed", err);
    const message =
      (globalThis as typeof globalThis & { __morseDbError?: string }).__morseDbError ||
      (err instanceof Error ? err.message : "Sign-in failed.");
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

