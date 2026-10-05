import type { WebGLRenderer } from "three";

if (typeof window !== "undefined") {
  const host = console as Console & { __morseClock?: boolean };
  if (!host.__morseClock) {
    const orig = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      const msg = args[0];
      if (typeof msg === "string" && msg.includes("THREE.Clock")) return;
      orig(...args);
    };
    host.__morseClock = true;
  }
}

/** Stop Three from printing "Context Lost" when a canvas is disposed, and restore a live one. */
export function keepWebGL(gl: WebGLRenderer) {
  const canvas = gl.domElement;
  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.setTimeout(() => {
        if (!canvas.isConnected) return;
        try {
          gl.forceContextRestore();
        } catch {
          /* renderer already disposed */
        }
      }, 60);
    },
    true,
  );
}
