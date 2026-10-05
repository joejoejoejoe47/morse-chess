import { apiUrl } from "@/lib/base";

type RpcOptions = { data?: unknown } | undefined;

/**
 * Client for the PHP backend. Replaces TanStack Start's createServerFn:
 * `rpc("getAvatar")({ data })` POSTs `{ data }` to `/api/rpc/getAvatar` and
 * resolves with `result`, or throws an Error carrying the server's message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rpc<T = any>(name: string): (opts?: RpcOptions) => Promise<T> {
  return async (opts?: RpcOptions): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/rpc/${name}`), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: opts?.data ?? {} }),
      });
    } catch {
      throw new Error("Could not reach the club. Check your connection and try again.");
    }
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; result?: T; error?: { message?: string } | string; message?: string }
      | null;
    if (!res.ok || !body || body.ok === false) {
      const err = body?.error;
      const message = (typeof err === "object" ? err?.message : err) || body?.message || "Something went wrong. Try once more.";
      throw new Error(message);
    }
    return body.result as T;
  };
}
