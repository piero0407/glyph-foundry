import type { AtlasImage } from "../types";

export type DecodedAtlas = {
  atlas: AtlasImage;
  url: string;
};

export function isAtlasFile(file: File): boolean {
  return /image\/(png|webp)/.test(file.type) || /\.(png|webp)$/i.test(file.name);
}

export function decodeAtlas(blob: Blob, name: string): Promise<DecodedAtlas> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas pixel access is unavailable."));
        return;
      }
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ atlas: { name, width: canvas.width, height: canvas.height, image, pixels }, url });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not decode ${name}.`));
    };
    image.src = url;
  });
}
