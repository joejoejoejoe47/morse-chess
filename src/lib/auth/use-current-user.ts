import { useEffect, useRef } from "react";
import { authClient, authEnabled } from "./client";

/** Normalized user shape used across the app, auth on or off. */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  /** True when this is the sandbox/dev fallback (auth not configured). */
  isDevFallback: boolean;
};

/**
 * Stable fallback user, used ONLY when auth is disabled
 * (`VITE_AUTH_ENABLED=false`, the shipped default). With auth on, the sandbox
 * live preview does real sign-in via the baked preview client. Its id is
 * `"dev-user"` — the SAME id `verify.server.ts` returns server-side — so per-user
 * rows written in that mode belong to one consistent owner.
 */
export const DEV_USER: AppUser = {
  id: "dev-user",
  displayName: "Dev User",
  primaryEmail: "dev@example.com",
  profileImageUrl: null,
  isDevFallback: true,
};

/** `useCurrentUserState()` result: the user plus the session-loading flag. */
export type CurrentUserState = {
  /** The user — `null` BOTH while the session loads and when signed out. */
  user: AppUser | null;
  /** True while the session is still resolving — don't treat `user: null` as signed out yet. */
  isPending: boolean;
};

/**
 * Current user + loading state. Same behavior in live preview and when deployed:
 *   - Auth enabled -> the real signed-in user; `user` is `null` while
 *                            the session resolves (`isPending: true`) and when
 *                            signed out (`isPending: false`). Session comes from
 *                            Better Auth `useSession()` → `/api/auth/get-session`
 *                            (cookie when deployed; bearer in live preview).
 *   - Auth disabled (`VITE_AUTH_ENABLED=false`) -> `DEV_USER`, never pending.
 *
 * Protect a route by waiting out `isPending` before acting on `user` —
 * redirecting on `user: null` alone bounces signed-in visitors to sign-in on
 * every hard reload:
 *
 *   import { RedirectToSignIn } from "@/lib/auth/gates";
 *   const { user, isPending } = useCurrentUserState();
 *   if (isPending) return null;              // still resolving — don't redirect yet
 *   if (!user) return <RedirectToSignIn />;  // definitely signed out
 *
 * `authEnabled` is a module-level constant fixed at load, so the guarded hook
 * call keeps a stable hook order across every render of a given component.
 */
// The last signed-in user, so a dropped connection to the club never looks like "signed out".
// Only a real answer from the server ("no session": 200 with null, or 401) signs the visitor out.
const LAST_USER_KEY = "morse-last-user";
const SESSION_RETRY_MS = [800, 2000, 4000, 8000, 15000, 30000];
let lastUser: AppUser | null | undefined;

function readLastUser(): AppUser | null {
  if (lastUser !== undefined) return lastUser;
  lastUser = null;
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    const parsed = raw ? (JSON.parse(raw) as AppUser) : null;
    if (parsed && typeof parsed.id === "string") lastUser = parsed;
  } catch {
    /* storage unavailable */
  }
  return lastUser;
}

function rememberUser(user: AppUser | null) {
  if (readLastUser()?.id === user?.id && (user === null || JSON.stringify(lastUser) === JSON.stringify(user))) return;
  lastUser = user;
  try {
    if (user) localStorage.setItem(LAST_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

function toAppUser(user: { id: string; name?: string | null; email?: string | null; image?: string | null }): AppUser {
  return {
    id: user.id,
    displayName: user.name ?? null,
    primaryEmail: user.email ?? null,
    profileImageUrl: user.image ?? null,
    isDevFallback: false,
  };
}

export function useCurrentUserState(): CurrentUserState {
  if (!authEnabled) return { user: DEV_USER, isPending: false };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- authEnabled is constant for the app's lifetime
  return useSteadySession();
}

function useSteadySession(): CurrentUserState {
  const { data, isPending, error, refetch } = authClient.useSession();
  const status = (error as { status?: number } | null)?.status;
  const signedIn = !!(data && typeof data === "object" && (data as { user?: unknown }).user);
  // Anything other than a clean answer (network drop, timeout, 5xx, an HTML page while files
  // are being uploaded) is a hiccup: keep the visitor in and ask again shortly.
  const hiccup = (!!error && status !== 401) || (!error && !isPending && data != null && !signedIn);
  const tries = useRef(0);

  useEffect(() => {
    if (!hiccup) {
      tries.current = 0;
      return;
    }
    const wait = SESSION_RETRY_MS[Math.min(tries.current, SESSION_RETRY_MS.length - 1)];
    tries.current += 1;
    const timer = window.setTimeout(() => void refetch(), wait);
    const again = () => void refetch();
    window.addEventListener("online", again);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", again);
    };
  }, [hiccup, error, data, refetch]);

  if (signedIn) {
    const user = toAppUser((data as { user: { id: string } }).user);
    rememberUser(user);
    return { user, isPending: false };
  }
  if (hiccup || (isPending && !data)) {
    const known = readLastUser();
    // A known visitor stays in; an unknown one waits on the splash instead of the sign-in form.
    return known ? { user: known, isPending: false } : { user: null, isPending: true };
  }
  rememberUser(null);
  return { user: null, isPending: false };
}

/**
 * Convenience view of `useCurrentUserState().user` for display (e.g.
 * `user?.displayName ?? "Guest"`). NOTE: `null` means *loading OR signed out* —
 * for redirects/guards use `useCurrentUserState()` and check `isPending`.
 */
export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
