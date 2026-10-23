import { apiUrl } from "@/lib/base";

type RpcOptions = { data?: unknown } | undefined;

/** Waits before re-sending a request whose connection failed (the host drops one now and then). */
const NET_BACKOFF_MS = [400, 1200, 2500];

/**
 * Calls that change something only once (a purchase, a move, a sent message, a new game) are not
 * re-sent on a network failure, because the first try may have reached the server. Everything
 * else (reads, and saves/claims that are safe to repeat) is.
 */
const ONCE_ONLY = /^(buy|send|start|create|place|respond|resign|join|enter|seat|crown|delete|use|cancel)|^(makeMove|hillMove|claimTimeout|hillLeave|leaveQueue|joinQueue)$/;
const SAFE_TO_REPEAT = (name: string) => !ONCE_ONLY.test(name);

/**
 * Client for the PHP backend. Replaces TanStack Start's createServerFn:
 * `rpc("getAvatar")({ data })` POSTs `{ data }` to `/api/rpc/getAvatar` and
 * resolves with `result`, or throws an Error carrying the server's message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rpc<T = any>(name: string): (opts?: RpcOptions) => Promise<T> {
  return async (opts?: RpcOptions): Promise<T> => {
    const body = JSON.stringify({ data: opts?.data ?? {} });
    const tries = SAFE_TO_REPEAT(name) ? NET_BACKOFF_MS.length + 1 : 1;
    let res: Response | null = null;
    for (let attempt = 0; attempt < tries && !res; attempt++) {
      if (attempt > 0) await new Promise((r) => window.setTimeout(r, NET_BACKOFF_MS[attempt - 1]));
      try {
        res = await fetch(apiUrl(`/api/rpc/${name}`), {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body,
        });
      } catch {
        if (attempt + 1 < tries) console.warn(`[rpc] ${name}: network error, retry ${attempt + 1}/${tries - 1}`);
      }
    }
    if (!res) throw new Error("Could not reach the club. Check your connection and try again.");
    const reply = (await res.json().catch(() => null)) as
      | { ok?: boolean; result?: T; error?: { message?: string } | string; message?: string }
      | null;
    if (!res.ok || !reply || reply.ok === false) {
      const err = reply?.error;
      const message = (typeof err === "object" ? err?.message : err) || reply?.message || "Something went wrong. Try once more.";
      throw new Error(message);
    }
    return reply.result as T;
  };
}
