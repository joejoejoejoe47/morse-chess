import { useState } from "react";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { ROOM_SWATCHES, saveLookPrefs, useLookPrefs } from "@/lib/chess/look-prefs";
import { clearRoomModel, saveRoomModel } from "@/lib/chess/room-model";
import { cn } from "@/lib/utils";

async function fileToRoomImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image."));
      el.src = url;
    });
    const max = 1280;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare that image.");
    ctx.drawImage(img, 0, 0, w, h);
    let quality = 0.72;
    let data = canvas.toDataURL("image/jpeg", quality);
    while (data.length > 1_400_000 && quality > 0.4) {
      quality -= 0.12;
      data = canvas.toDataURL("image/jpeg", quality);
    }
    if (data.length > 1_500_000) throw new Error("That picture is too large.");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function BoardAdjustPanel({
  title = "Board look",
  enterLabel = "Enter",
  onEnter,
  onClose,
  allowBackground = true,
  showClubLight = true,
  buttonClass,
}: {
  title?: string;
  enterLabel?: string;
  onEnter: () => void;
  onClose?: () => void;
  allowBackground?: boolean;
  showClubLight?: boolean;
  buttonClass?: string;
}) {
  const prefs = useLookPrefs();
  const pickerValue = prefs.roomColor ?? "#0c0d0b";
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  return (
    <div className="pointer-events-auto w-full max-w-md rounded-xl border border-line bg-ink/92 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-mist">On this board</p>
          <h2 className="mt-1 font-display text-2xl text-ivory">{title}</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            className={cn(
              "rounded-full border border-line px-3 text-sm text-mist hover:border-line-strong hover:text-ivory",
              buttonClass,
            )}
            onClick={onClose}
          >
            Close
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-[13px] uppercase tracking-[0.14em] text-mist">Piece outline</p>
          <div className="mt-2 flex overflow-hidden rounded-full border border-line bg-panel">
            <button
              type="button"
              className={cn(
                "min-h-11 flex-1 px-4 text-sm font-medium",
                prefs.outline ? "bg-ivory text-ink" : "text-mist hover:text-ivory",
              )}
              onClick={() => saveLookPrefs({ outline: true })}
            >
              On
            </button>
            <button
              type="button"
              className={cn(
                "min-h-11 flex-1 px-4 text-sm font-medium",
                !prefs.outline ? "bg-ivory text-ink" : "text-mist hover:text-ivory",
              )}
              onClick={() => saveLookPrefs({ outline: false })}
            >
              Off
            </button>
          </div>
        </div>

        {allowBackground ? (
          <div>
            <p className="text-[13px] uppercase tracking-[0.14em] text-mist">Background</p>
            <p className="mt-1 text-[13px] text-mist">
              Set it here. It stays for your games, and you cannot change it once a game starts.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {ROOM_SWATCHES.map((swatch) => {
                const active =
                  prefs.roomScene === "color" &&
                  !prefs.roomImage &&
                  (swatch.value === null ? prefs.roomColor === null : prefs.roomColor === swatch.value);
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    title={swatch.label}
                    aria-label={swatch.label}
                    className={cn(
                      "size-11 rounded-full border",
                      active ? "border-gold-line ring-2 ring-gold-line/50" : "border-line",
                    )}
                    style={{
                      background:
                        swatch.value ??
                        "linear-gradient(135deg, #0c0d0b 50%, #f6f1e4 50%)",
                    }}
                    onClick={() => saveLookPrefs({ roomColor: swatch.value, roomImage: null, roomScene: "color" })}
                  />
                );
              })}
              <label className="relative grid size-11 place-items-center overflow-hidden rounded-full border border-line bg-panel">
                <span className="pointer-events-none text-[10px] uppercase tracking-[0.08em] text-mist">Pick</span>
                <input
                  type="color"
                  value={pickerValue}
                  aria-label="Pick a background color"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => saveLookPrefs({ roomColor: e.target.value, roomImage: null, roomScene: "color" })}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-panel px-4 text-sm font-medium text-ivory hover:border-line-strong">
                {uploading ? "Reading…" : "Upload image"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (!file.type.startsWith("image/")) {
                      setUploadError("Choose a picture file.");
                      return;
                    }
                    if (file.size > 12 * 1024 * 1024) {
                      setUploadError("Use a picture under 12 MB.");
                      return;
                    }
                    setUploading(true);
                    setUploadError(null);
                    void fileToRoomImage(file)
                      .then((roomImage) => {
                        const saved = saveLookPrefs({ roomImage, roomScene: "photo" });
                        if (saved.roomImage !== roomImage) {
                          setUploadError("That picture is too large to keep on this device.");
                        }
                      })
                      .catch((err: unknown) => {
                        setUploadError(err instanceof Error ? err.message : "Could not use that picture.");
                      })
                      .finally(() => setUploading(false));
                  }}
                />
              </label>
              {prefs.roomImage ? (
                <button
                  type="button"
                  className="min-h-11 rounded-full border border-line px-4 text-sm text-mist hover:border-line-strong hover:text-ivory"
                  onClick={() => {
                    setUploadError(null);
                    saveLookPrefs({
                      roomImage: null,
                      roomScene: prefs.roomScene === "photo" ? "color" : prefs.roomScene,
                    });
                  }}
                >
                  Remove photo
                </button>
              ) : null}
            </div>
            {prefs.roomImage ? (
              <div
                className="mt-3 h-16 w-full rounded-lg border border-line bg-cover bg-center"
                style={{ backgroundImage: `url("${prefs.roomImage}")` }}
                role="img"
                aria-label="Background preview"
              />
            ) : null}
            {uploadError ? <p className="mt-2 text-[13px] text-danger">{uploadError}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn(
                  "min-h-11 rounded-full border px-4 text-sm font-medium",
                  prefs.roomScene === "space" ? "border-gold-line bg-ivory text-ink" : "border-line bg-panel text-ivory",
                )}
                onClick={() => saveLookPrefs({ roomScene: "space" })}
              >
                Space
              </button>
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-panel px-4 text-sm font-medium text-ivory hover:border-line-strong">
                Upload 3D
                <input
                  type="file"
                  accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const name = file.name.toLowerCase();
                    if (!name.endsWith(".glb") && !name.endsWith(".gltf")) {
                      setUploadError("Upload a .glb or .gltf model.");
                      return;
                    }
                    if (file.size > 24 * 1024 * 1024) {
                      setUploadError("Use a 3D file under 24 MB.");
                      return;
                    }
                    setUploadError(null);
                    void file.arrayBuffer().then(async (data) => {
                      const head = new TextDecoder().decode(new Uint8Array(data.slice(0, 4)));
                      if (name.endsWith(".glb") && head !== "glTF") {
                        setUploadError("That file is not a glTF model.");
                        return;
                      }
                      await saveRoomModel(data, name.endsWith(".gltf") ? "room.gltf" : "room.glb");
                      saveLookPrefs({
                        roomScene: "model",
                        modelRev: prefs.modelRev + 1,
                      });
                    }).catch((err: unknown) => {
                      setUploadError(err instanceof Error ? err.message : "Could not use that model.");
                    });
                  }}
                />
              </label>
              {prefs.roomScene === "model" ? (
                <button
                  type="button"
                  className="min-h-11 rounded-full border border-line px-4 text-sm text-mist hover:border-line-strong hover:text-ivory"
                  onClick={() => {
                    setUploadError(null);
                    void clearRoomModel().finally(() => {
                      saveLookPrefs({ roomScene: "color", modelRev: prefs.modelRev + 1 });
                    });
                  }}
                >
                  Remove 3D
                </button>
              ) : null}
            </div>
            {prefs.roomScene === "space" ? (
              <p className="mt-2 text-[13px] text-mist">3D space sits behind the board. Turn the table to see it.</p>
            ) : null}
            {prefs.roomScene === "model" ? (
              <p className="mt-2 text-[13px] text-mist">Your model sits in the room behind the board.</p>
            ) : null}
          </div>
        ) : null}

        {showClubLight ? (
          <div>
            <p className="text-[13px] uppercase tracking-[0.14em] text-mist">Club light</p>
            <div className="mt-2">
              <ThemeToggle className={cn("rounded-full", buttonClass)} />
            </div>
          </div>
        ) : null}
      </div>

      <Button variant="solid" className={cn("mt-5 w-full rounded-full", buttonClass)} onClick={onEnter}>
        {enterLabel}
      </Button>
    </div>
  );
}