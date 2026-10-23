import { Component, type ReactNode } from "react";

/**
 * Catches a model that still failed after its retries and shows `fallback` in its place, so one
 * missing file never takes the whole page to the error screen. `onFail` can drop the cached
 * failure so the next mount tries again.
 */
export class LoadGuard extends Component<{ fallback: ReactNode; children: ReactNode; onFail?: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[models] a model could not load; showing a stand-in", error);
    try {
      this.props.onFail?.();
    } catch {
      /* ignore */
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
