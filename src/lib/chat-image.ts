const IMAGE_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const CHAT_IMAGE_MAX = 160_000;

export function cleanChatImage(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const image = String(raw);
  if (image.length > CHAT_IMAGE_MAX || !IMAGE_RE.test(image)) {
    throw new Error("That image is too big, or it is not a picture.");
  }
  return image;
}

export function isChatImage(src: string | null | undefined): src is string {
  return typeof src === "string" && src.length <= CHAT_IMAGE_MAX && IMAGE_RE.test(src);
}

export function shrinkChatImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Drop a picture."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const cap = 480;
      const scale = Math.min(1, cap / Math.max(img.width, img.height, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) {
        reject(new Error("Could not read that picture."));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let quality = 0.72;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > CHAT_IMAGE_MAX && quality > 0.4) {
        quality -= 0.08;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      if (!isChatImage(data)) {
        reject(new Error("That picture is still too big."));
        return;
      }
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that picture."));
    };
    img.src = url;
  });
}
