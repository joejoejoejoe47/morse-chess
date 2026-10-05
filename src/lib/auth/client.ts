import { createAuthClient } from "better-auth/react";
import { BASE } from "@/lib/base";

/**
 * Auth client for the PHP backend. It speaks the same wire format the original
 * Better Auth endpoints used (`/api/auth/get-session`, `/sign-up/email`,
 * `/sign-in/email`, `/sign-out`), so the React hooks work unchanged. The session
 * is an HttpOnly cookie set by PHP.
 */
export const authClient = createAuthClient({
  baseURL: (typeof window !== "undefined" ? window.location.origin : "") + BASE,
});

export const authEnabled = true;

/** Outside identity providers are not used on this host; sign-in is club name + password. */
export const GROK_PROVIDERS: { providerId: string; idp: string; label: string }[] = [];

export function getBearerToken(): string | null {
  return null;
}

export function clearPreviewBearer(): void {
  /* cookie sessions only */
}

export async function signIn(): Promise<void> {
  throw new Error("Sign in with your club name and password.");
}

/** End the session, then go to `redirectTo` (inside the app's mount point). */
export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed");
  window.location.href = BASE + redirectTo;
}
