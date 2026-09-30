import type { WebGLRenderer } from "three";

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
