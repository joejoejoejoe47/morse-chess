const KEY = "morse-club-session";
const OAUTH_KEY = "morse-oauth-pending";
const SPLASH_KEY = "morse-enter-splash";

export function markEnterSplash() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SPLASH_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeEnterSplash() {
  if (typeof window === "undefined") return false;
  try {
    const pending = window.sessionStorage.getItem(SPLASH_KEY) === "1";
    if (pending) window.sessionStorage.removeItem(SPLASH_KEY);
    return pending;
  } catch {
    return false;
  }
}

export function markClubSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "1");
    window.localStorage.removeItem(OAUTH_KEY);
    markEnterSplash();
    window.dispatchEvent(new Event("morse-club"));
  } catch {
    /* ignore */
  }
}

export function markOauthPending() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OAUTH_KEY, "1");
    markEnterSplash();
  } catch {
    /* ignore */
  }
}

export function consumeOauthPending() {
  if (typeof window === "undefined") return false;
  try {
    const pending = window.localStorage.getItem(OAUTH_KEY) === "1";
    if (pending) window.localStorage.removeItem(OAUTH_KEY);
    return pending;
  } catch {
    return false;
  }
}

export function clearClubSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("morse-club"));
  } catch {
    /* ignore */
  }
}

export function hasClubSession() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function subscribeClubSession(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("morse-club", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("morse-club", onChange);
  };
}
