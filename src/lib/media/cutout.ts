type SegCtor = new (opts: { locateFile: (f: string) => string }) => {
  setOptions: (o: { modelSelection: number; selfieMode?: boolean }) => void;
  onResults: (cb: (r: { image: CanvasImageSource; segmentationMask: CanvasImageSource }) => void) => void;
  send: (o: { image: HTMLVideoElement }) => Promise<void>;
  close?: () => void;
};

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load camera cutout."));
    document.head.appendChild(s);
  });
}

export async function pipePersonCutout(src: MediaStream): Promise<{ stream: MediaStream; stop: () => void }> {
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.srcObject = src;
  await video.play().catch(() => undefined);

  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return { stream: src, stop: () => undefined };
  const draw = ctx;
  draw.imageSmoothingEnabled = true;
  draw.imageSmoothingQuality = "high";

  const mask = document.createElement("canvas");
  mask.width = canvas.width;
  mask.height = canvas.height;
  const maskDraw = mask.getContext("2d");
  if (!maskDraw) return { stream: src, stop: () => undefined };

  let running = true;
  let seg: InstanceType<SegCtor> | null = null;

  try {
    await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js");
    const Ctor = (window as unknown as { SelfieSegmentation?: SegCtor }).SelfieSegmentation;
    if (Ctor) {
      seg = new Ctor({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
      });
      seg.setOptions({ modelSelection: 1, selfieMode: false });
      seg.onResults((r) => {
        if (!running) return;
        const w = canvas.width;
        const h = canvas.height;
        maskDraw.clearRect(0, 0, w, h);
        maskDraw.filter = "contrast(180%) brightness(108%) blur(2px)";
        maskDraw.drawImage(r.segmentationMask, 0, 0, w, h);
        maskDraw.filter = "none";

        draw.fillStyle = "#00FF00";
        draw.fillRect(0, 0, w, h);
        draw.save();
        draw.drawImage(mask, 0, 0);
        draw.globalCompositeOperation = "source-in";
        const zoom = 1.62;
        const dw = w * zoom;
        const dh = h * zoom;
        draw.drawImage(r.image, (w - dw) / 2, h * 0.04 - (dh - h) * 0.22, dw, dh);
        draw.restore();
        draw.globalCompositeOperation = "source-over";
      });
    }
  } catch {
    seg = null;
  }

  async function tick() {
    if (!running) return;
    if (video.readyState >= 2) {
      if (seg) {
        await seg.send({ image: video }).catch(() => undefined);
      } else {
        draw.fillStyle = "#00FF00";
        draw.fillRect(0, 0, canvas.width, canvas.height);
        const vw = video.videoWidth || 720;
        const vh = video.videoHeight || 1000;
        const scale = Math.max(canvas.width / vw, canvas.height / vh) * 1.5;
        const dw = vw * scale;
        const dh = vh * scale;
        draw.drawImage(video, (canvas.width - dw) / 2, canvas.height * 0.06 - (dh - canvas.height) * 0.2, dw, dh);
      }
    }
    if (running) requestAnimationFrame(() => void tick());
  }
  void tick();

  const out = canvas.captureStream(24);
  src.getAudioTracks().forEach((t) => out.addTrack(t));
  return {
    stream: out,
    stop: () => {
      running = false;
      try {
        seg?.close?.();
      } catch {
        /* ignore */
      }
      video.srcObject = null;
    },
  };
}
