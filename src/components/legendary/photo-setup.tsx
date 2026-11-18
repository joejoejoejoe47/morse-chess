/**
 * First Legendary login (t337): take a selfie in a gold circle, or drop a picture into it, then
 * Go (save) or Skip (wear the first letter of your email). Also reused from Settings → Photo.
 * The camera is only asked for on this screen and is switched off as soon as it closes.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Camera, Check, ImageUp, RotateCcw, X } from "lucide-react";
import { setLegendaryPhoto, skipLegendaryPhoto } from "@/lib/server/legendary";
import { playSfx } from "@/lib/legendary/sfx";
import { CrownMark, LetterDisc, setMyPhotoCache } from "@/components/legendary/bits";
import { cn } from "@/lib/utils";

type Step = "camera" | "shot" | "drop" | "dropped" | "denied";

/** Centre-crop to a 512px square JPEG before upload (the server re-encodes to 256px again). */
async function squareJpeg(src: CanvasImageSource, w: number, h: number, mirror = false): Promise<string> {
  const side = Math.min(w, h);
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d");
  if (!g) throw new Error("no canvas");
  if (mirror) {
    g.translate(512, 0);
    g.scale(-1, 1);
  }
  g.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 512, 512);
  return c.toDataURL("image/jpeg", 0.9);
}

function loadImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      reject(new Error("Use a JPG, PNG or WebP picture."));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error("That picture is too big (12 MB max)."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try {
        resolve(await squareJpeg(img, img.naturalWidth, img.naturalHeight));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That picture could not be read."));
    };
    img.src = url;
  });
}

export function PhotoSetup({ letter, first = true, onDone }: { letter: string; first?: boolean; onDone: () => void }) {
  const [step, setStep] = useState<Step>("camera");
  const [shot, setShot] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    if (step !== "camera") {
      stopCamera();
      return;
    }
    let live = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
        if (!live) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
      } catch {
        if (live) setStep("denied");
      }
    })();
    return () => {
      live = false;
    };
  }, [step, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  async function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    playSfx("tap");
    setShot(await squareJpeg(v, v.videoWidth, v.videoHeight, true));
    setConfirmed(false);
    setStep("shot");
  }

  async function takeFile(file: File | undefined | null) {
    if (!file) return;
    setError(null);
    try {
      setShot(await loadImage(file));
      setConfirmed(true);
      setStep("dropped");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That picture could not be read.");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setHover(false);
    void takeFile(e.dataTransfer.files?.[0]);
  }

  async function go() {
    if (!shot) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await setLegendaryPhoto({ data: { image: shot } });
      setMyPhotoCache(saved);
      playSfx("coin");
      stopCamera();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the picture.");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    setError(null);
    try {
      const saved = await skipLegendaryPhoto();
      setMyPhotoCache(saved);
      stopCamera();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not skip right now.");
    } finally {
      setBusy(false);
    }
  }

  const canGo = !!shot && (step === "dropped" || (step === "shot" && confirmed));

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#07030d]/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Profile photo" data-photo-setup={step}>
      <div className="mcl-panel relative w-full max-w-[26rem] rounded-2xl px-6 pb-6 pt-8 text-center">
        <CrownMark className="absolute -top-5 left-1/2 h-9 w-11 -translate-x-1/2" />
        {!first ? (
          <button type="button" aria-label="Close" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-[#e9d9b0] hover:bg-white/10" onClick={() => { stopCamera(); onDone(); }}>
            <X className="size-5" />
          </button>
        ) : null}
        <p className="font-[Cinzel] text-[11px] font-bold uppercase tracking-[0.3em] text-[#b58cff]">{first ? "Welcome to Legendary" : "Profile photo"}</p>
        <h2 className="mcl-title mt-1 text-2xl">{step === "drop" || step === "dropped" ? "Drop your picture" : step === "denied" ? "No camera? No problem" : "Strike a pose"}</h2>

        <div
          className={cn(
            "relative mx-auto mt-5 grid size-56 place-items-center overflow-hidden rounded-full border-[3px] border-[#e8c25a] bg-[radial-gradient(circle,#2a1446_0%,#120822_70%)] shadow-[0_0_0_6px_rgba(163,77,255,0.25),0_0_40px_rgba(232,194,90,0.35)] sm:size-64",
            hover && "border-[#b58cff] shadow-[0_0_0_8px_rgba(181,140,255,0.4),0_0_50px_rgba(181,140,255,0.5)]",
          )}
          data-photo-circle
          onDragOver={(e) => {
            e.preventDefault();
            setHover(true);
            if (step !== "drop" && step !== "dropped") setStep("drop");
          }}
          onDragLeave={() => setHover(false)}
          onDrop={onDrop}
        >
          {step === "camera" ? <video ref={video} className="size-full -scale-x-100 object-cover" muted playsInline autoPlay data-camera-preview /> : null}
          {(step === "shot" || step === "dropped") && shot ? <img src={shot} alt="Your photo" className="size-full object-cover" data-photo-shot /> : null}
          {step === "drop" ? (
            <button type="button" className="flex size-full flex-col items-center justify-center gap-2 text-[#e9d9b0]" onClick={() => fileInput.current?.click()} data-drop-zone>
              <ImageUp className="size-10 text-[#e8c25a]" />
              <span className="font-[Cinzel] text-sm font-bold tracking-[0.08em]">Drop an image here</span>
              <span className="text-xs text-[#b9a9d6]">or tap to choose one</span>
            </button>
          ) : null}
          {step === "denied" ? <LetterDisc letter={letter} className="size-full text-[6rem]" /> : null}
          {step === "shot" && confirmed ? (
            <span className="absolute bottom-3 right-6 grid size-11 place-items-center rounded-full bg-[#2fbf71] text-white shadow-lg ring-2 ring-white/70"><Check className="size-6" /></span>
          ) : null}
        </div>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void takeFile(e.target.files?.[0])} />

        <div className="mt-5 flex min-h-12 items-center justify-center gap-3">
          {step === "camera" ? (
            <button type="button" className="mcl-round-btn" onClick={() => void capture()} aria-label="Take picture" data-capture>
              <Camera className="size-6" />
            </button>
          ) : null}
          {step === "shot" ? (
            <>
              <button type="button" className="mcl-round-btn !bg-[#1d1230]" onClick={() => { setShot(null); setConfirmed(false); setStep("camera"); }} aria-label="Retake" data-retake>
                <RotateCcw className="size-5" />
              </button>
              <button type="button" className={cn("mcl-round-btn", confirmed && "!bg-[linear-gradient(180deg,#4fe08f,#1f9a55)]")} onClick={() => { playSfx("tap"); setConfirmed(true); }} aria-label="Use this picture" data-confirm>
                <Check className="size-6" />
              </button>
            </>
          ) : null}
          {step === "dropped" ? (
            <button type="button" className="mcl-chip-btn" onClick={() => fileInput.current?.click()}>Choose another</button>
          ) : null}
          {step === "camera" || step === "shot" || step === "denied" ? (
            <button type="button" className="mcl-chip-btn" onClick={() => setStep("drop")} data-drop-image>
              <ImageUp className="size-4" /> Drop image
            </button>
          ) : null}
          {step === "drop" || step === "dropped" ? (
            <button type="button" className="mcl-chip-btn" onClick={() => { setShot(null); setStep("camera"); }}>
              <Camera className="size-4" /> Use camera
            </button>
          ) : null}
        </div>
        {step === "denied" ? <p className="mt-2 text-xs text-[#b9a9d6]">The camera is off or blocked. Drop a picture instead, or skip and wear your letter.</p> : null}
        {error ? <p className="mt-2 text-sm text-[#ff8a8a]" data-photo-error>{error}</p> : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" className="mcl-btn mcl-btn-ghost" disabled={busy} onClick={() => void skip()} data-photo-skip>
            Skip
          </button>
          <button type="button" className="mcl-btn mcl-btn-gold" disabled={!canGo || busy} onClick={() => void go()} data-photo-go>
            {busy ? "Saving…" : "Go"}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-[#8f80ad]">Skip puts the letter <b className="text-[#f2d27a]">{letter}</b> in your circle. You can change it later in Settings.</p>
      </div>
    </div>
  );
}
