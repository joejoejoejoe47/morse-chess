import { Component, Fragment, Suspense, useEffect, useState, type ReactNode } from "react";
import { forgetFailedLoad } from "@/lib/resilient-gltf";

/** Waits before each background re-try of a model that failed all of its loader retries. */
const RECOVER_MS = [3000, 8000, 15000, 30000, 60000];
const MAX_RECOVERIES = 40;

type Props = {
  /** Shown while the model is missing (a stand-in piece, or nothing). */
  fallback: ReactNode;
  children: ReactNode;
  /**
   * When given, the children get their own Suspense showing this while they load (and the stand-in
   * while a failed model is being fetched again), so a slow model only affects itself.
   */
  loading?: ReactNode;
  /** Extra clean-up when a load fails (the failed URL is already dropped from the caches). */
  onFail?: () => void;
};
type State = { failed: boolean; gen: number; recoveries: number };

/**
 * Catches a model that still failed after its retries and shows `fallback` in its place, so one
 * missing file never takes the page to the error screen. It then keeps trying in the background
 * (and straight away when the browser comes back online), and swaps the real model back in as
 * soon as it loads.
 */
export class LoadGuard extends Component<Props, State> {
  state: State = { failed: false, gen: 0, recoveries: 0 };
  private timer = 0;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[models] a model could not load; showing a stand-in and trying again", error);
    forgetFailedLoad(error);
    try {
      this.props.onFail?.();
    } catch {
      /* ignore */
    }
    this.schedule();
  }

  componentDidMount() {
    window.addEventListener("online", this.recover);
  }

  componentWillUnmount() {
    window.removeEventListener("online", this.recover);
    window.clearTimeout(this.timer);
  }

  private schedule() {
    window.clearTimeout(this.timer);
    if (this.state.recoveries >= MAX_RECOVERIES) return;
    const wait = RECOVER_MS[Math.min(this.state.recoveries, RECOVER_MS.length - 1)];
    this.timer = window.setTimeout(this.recover, wait);
  }

  private recover = () => {
    window.clearTimeout(this.timer);
    if (!this.state.failed) return;
    this.setState((s) => ({ failed: false, gen: s.gen + 1, recoveries: s.recoveries + 1 }));
  };

  render() {
    const { fallback, loading, children } = this.props;
    if (this.state.failed) return fallback;
    const wait = this.state.gen > 0 ? fallback : loading;
    return (
      <Fragment key={this.state.gen}>
        {loading !== undefined || this.state.gen > 0 ? <Suspense fallback={wait ?? null}>{children}</Suspense> : children}
      </Fragment>
    );
  }
}

/** Shows its children only after `ms`, so a quick load never flashes a stand-in. */
export function Later({ ms = 1500, children }: { ms?: number; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), ms);
    return () => window.clearTimeout(t);
  }, [ms]);
  return show ? <>{children}</> : null;
}

/**
 * A model with its own guard and Suspense: one slow or failed model only affects itself. While it
 * is still downloading after a moment, and while a failed one is retried, `fallback` stands in.
 */
export function ModelSlot({ fallback = null, standInWhileLoading = false, children }: { fallback?: ReactNode; standInWhileLoading?: boolean; children: ReactNode }) {
  return (
    <LoadGuard fallback={fallback} loading={standInWhileLoading && fallback ? <Later>{fallback}</Later> : null}>
      {children}
    </LoadGuard>
  );
}
