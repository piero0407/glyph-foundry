// Generates a crisp sample 8-bit pixel font atlas for immediate testing
export async function createSampleAtlas(): Promise<{ file: File; name: string }> {
  const canvas = document.createElement("canvas");
  const width = 256;
  const height = 128;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas context unavailable");

  // Transparent background
  ctx.clearRect(0, 0, width, height);

  // Use a crisp monospaced pixel font rendering
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px monospace";
  ctx.textBaseline = "top";

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?.:,;+-*/=";
  const cols = 16;
  const cellW = 16;
  const cellH = 16;

  for (let i = 0; i < chars.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW + 3;
    const y = row * cellH + 1;
    ctx.fillText(chars[i], x, y);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))), "image/png");
  });

  const file = new File([blob], "retro-pixel-16.png", { type: "image/png" });
  return { file, name: "retro-pixel-16.png" };
}
