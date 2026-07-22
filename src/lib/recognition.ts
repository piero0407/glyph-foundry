import type { Glyph } from "../types";
import { UNRECOGNIZED_CHARACTER } from "./glyphs";

export type GlyphMask = {
  width: number;
  height: number;
  data: Uint8Array;
};

export type CharacterTemplate = {
  char: string;
  mask: GlyphMask;
};

const NORMALIZED_SIZE = 24;

export function extractForegroundMask(imageData: ImageData, glyph: Glyph, alphaThreshold: number): GlyphMask | null {
  const { data, width: imageWidth } = imageData;
  const samples: Array<{ x: number; y: number; alpha: number; luminance: number }> = [];
  let darkest = 255;
  let brightest = 0;
  let strongestAlpha = 0;

  for (let y = 0; y < glyph.height; y += 1) {
    for (let x = 0; x < glyph.width; x += 1) {
      const offset = ((glyph.y + y) * imageWidth + glyph.x + x) * 4;
      const alpha = data[offset + 3];
      if (alpha < alphaThreshold) continue;
      const luminance = data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
      samples.push({ x, y, alpha, luminance });
      darkest = Math.min(darkest, luminance);
      brightest = Math.max(brightest, luminance);
      strongestAlpha = Math.max(strongestAlpha, alpha);
    }
  }

  if (!samples.length) return null;
  const luminanceFloor = brightest - darkest >= 32
    ? darkest + (brightest - darkest) * 0.4
    : darkest;
  const alphaFloor = Math.max(alphaThreshold, strongestAlpha * 0.5);
  const foreground = samples.filter(({ alpha, luminance }) => alpha >= alphaFloor && luminance >= luminanceFloor);
  const points = foreground.length ? foreground : samples;
  let minX = glyph.width;
  let minY = glyph.height;
  let maxX = 0;
  let maxY = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const mask = new Uint8Array(width * height);
  for (const point of points) mask[(point.y - minY) * width + point.x - minX] = 1;
  return { width, height, data: mask };
}

export function normalizeMask(mask: GlyphMask, size = NORMALIZED_SIZE): GlyphMask {
  const data = new Uint8Array(size * size);
  const scale = Math.min((size - 4) / mask.width, (size - 4) / mask.height);
  const targetWidth = Math.max(1, Math.round(mask.width * scale));
  const targetHeight = Math.max(1, Math.round(mask.height * scale));
  const offsetX = Math.floor((size - targetWidth) / 2);
  const offsetY = Math.floor((size - targetHeight) / 2);

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(mask.width - 1, Math.floor((x + 0.5) * mask.width / targetWidth));
      const sourceY = Math.min(mask.height - 1, Math.floor((y + 0.5) * mask.height / targetHeight));
      data[(offsetY + y) * size + offsetX + x] = mask.data[sourceY * mask.width + sourceX];
    }
  }
  return { width: size, height: size, data };
}

function dilate(mask: GlyphMask): Uint8Array {
  const result = new Uint8Array(mask.data.length);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.data[y * mask.width + x]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX >= 0 && nextY >= 0 && nextX < mask.width && nextY < mask.height) {
            result[nextY * mask.width + nextX] = 1;
          }
        }
      }
    }
  }
  return result;
}

export function maskSimilarity(left: GlyphMask, right: GlyphMask): number {
  if (left.width !== right.width || left.height !== right.height) return 0;
  const leftWide = dilate(left);
  const rightWide = dilate(right);
  let leftHits = 0;
  let rightHits = 0;
  let leftCount = 0;
  let rightCount = 0;
  for (let index = 0; index < left.data.length; index += 1) {
    if (left.data[index]) {
      leftCount += 1;
      if (rightWide[index]) leftHits += 1;
    }
    if (right.data[index]) {
      rightCount += 1;
      if (leftWide[index]) rightHits += 1;
    }
  }
  if (!leftCount || !rightCount) return 0;
  return (leftHits / leftCount + rightHits / rightCount) / 2;
}

export function matchGlyphMasks(
  glyphs: Glyph[],
  masks: Array<GlyphMask | null>,
  templates: CharacterTemplate[],
  minimumConfidence = 0.62,
): Glyph[] {
  const byCharacter = new Map<string, GlyphMask[]>();
  for (const template of templates) {
    const masksForCharacter = byCharacter.get(template.char) ?? [];
    masksForCharacter.push(template.mask);
    byCharacter.set(template.char, masksForCharacter);
  }

  const proposals = glyphs.flatMap((glyph, index) => {
    const mask = masks[index];
    if (!mask) return [];
    const scores = [...byCharacter].map(([char, characterMasks]) => ({
      char,
      score: Math.max(...characterMasks.map((template) => maskSimilarity(mask, template))),
    })).sort((a, b) => b.score - a.score);
    if (!scores.length) return [];
    const best = scores[0];
    const runnerUp = scores[1]?.score ?? 0;
    const separation = Math.min(1, Math.max(0, (best.score - runnerUp) / 0.18));
    const confidence = best.score * 0.72 + separation * 0.28;
    return [{ glyphId: glyph.id, char: best.char, confidence, separation }];
  }).sort((a, b) => b.confidence - a.confidence);

  const matches = new Map<number, { char: string; confidence: number }>();
  const usedCharacters = new Set<string>();
  for (const proposal of proposals) {
    if (proposal.confidence < minimumConfidence || proposal.separation < 0.12 || usedCharacters.has(proposal.char)) continue;
    matches.set(proposal.glyphId, { char: proposal.char, confidence: proposal.confidence });
    usedCharacters.add(proposal.char);
  }

  return glyphs.map((glyph) => {
    const match = matches.get(glyph.id);
    return match ? { ...glyph, char: match.char, matchConfidence: match.confidence } : { ...glyph, char: "", matchConfidence: undefined };
  });
}

function canvasMask(canvas: HTMLCanvasElement): GlyphMask | null {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return extractForegroundMask(pixels, {
    id: 0, char: "", x: 0, y: 0, width: canvas.width, height: canvas.height,
    xoffset: 0, yoffset: 0, xadvance: canvas.width,
  }, 16);
}

export function recognizeCharacters(
  imageData: ImageData,
  glyphs: Glyph[],
  characters: string,
  alphaThreshold: number,
  minimumConfidence = 0.62,
): Glyph[] {
  const candidates = [...new Set(Array.from(characters).filter((char) =>
    !/\s/u.test(char) && char !== UNRECOGNIZED_CHARACTER,
  ))];
  const fonts = ["monospace", "Arial", "Georgia", "Times New Roman", "Courier New"];
  const templates: CharacterTemplate[] = [];
  for (const char of candidates) {
    for (const font of fonts) {
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 48;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.font = `36px ${font}`;
      context.fillStyle = "white";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(char, 24, 24);
      const mask = canvasMask(canvas);
      if (mask) templates.push({ char, mask: normalizeMask(mask) });
    }
  }
  const masks = glyphs.map((glyph) => {
    const mask = extractForegroundMask(imageData, glyph, alphaThreshold);
    return mask ? normalizeMask(mask) : null;
  });
  return matchGlyphMasks(glyphs, masks, templates, minimumConfidence);
}
