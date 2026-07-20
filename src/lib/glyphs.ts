import type { DetectionSettings, Glyph } from "../types";

export const UNRECOGNIZED_CHARACTER = "�";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function sortInReadingOrder(glyphs: Glyph[]): Glyph[] {
  if (glyphs.length < 2) return glyphs;

  const heights = glyphs.map((glyph) => glyph.height).sort((a, b) => a - b);
  const typicalHeight = heights[Math.floor(heights.length / 2)];
  const rowTolerance = Math.max(1, typicalHeight * 0.6);
  const rows: Array<{ centerY: number; glyphs: Glyph[] }> = [];

  const byVerticalCenter = [...glyphs].sort((a, b) =>
    (a.y + a.height / 2) - (b.y + b.height / 2) || a.x - b.x,
  );

  for (const glyph of byVerticalCenter) {
    const centerY = glyph.y + glyph.height / 2;
    const row = rows
      .filter((candidate) => Math.abs(candidate.centerY - centerY) <= rowTolerance)
      .sort((a, b) => Math.abs(a.centerY - centerY) - Math.abs(b.centerY - centerY))[0];

    if (row) {
      row.glyphs.push(glyph);
      row.centerY = row.glyphs.reduce(
        (sum, item) => sum + item.y + item.height / 2,
        0,
      ) / row.glyphs.length;
    } else {
      rows.push({ centerY, glyphs: [glyph] });
    }
  }

  return rows
    .sort((a, b) => a.centerY - b.centerY)
    .flatMap((row) => row.glyphs.sort((a, b) => a.x - b.x));
}

type DetectedGlyph = {
  glyph: Glyph;
  coreLeft: number;
  coreTop: number;
  coreWidth: number;
  coreHeight: number;
};

function applyDetectedGlyphMetrics(detected: DetectedGlyph[], advanceAdjustment: number): Glyph[] {
  if (!detected.length) return [];

  const automaticAdvance = Math.max(...detected.map(({ coreWidth }) => coreWidth));
  const cellWidth = Math.max(1, automaticAdvance + Math.round(advanceAdjustment));
  const cellHeight = Math.max(...detected.map(({ coreHeight }) => coreHeight));

  return detected.map(({ glyph, coreLeft, coreTop, coreWidth, coreHeight }) => ({
    ...glyph,
    xoffset: Math.floor((cellWidth - coreWidth) / 2) - coreLeft,
    yoffset: cellHeight - coreHeight - coreTop,
    xadvance: cellWidth,
  }));
}

export function detectGlyphsWithMetrics(
  imageData: ImageData,
  settings: DetectionSettings,
): { glyphs: Glyph[]; lineHeight: number } {
  const { width, height, data } = imageData;
  const visited = new Uint8Array(width * height);
  const results: DetectedGlyph[] = [];
  const opaque = (index: number) => data[index * 4 + 3] >= settings.alphaThreshold;
  const luminance = (index: number) => {
    const offset = index * 4;
    return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
  };

  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || !opaque(start)) continue;

    const queue = [start];
    visited[start] = 1;
    let cursor = 0;

    while (cursor < queue.length) {
      const index = queue[cursor++];
      const x = index % width;
      const y = Math.floor(index / width);

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const next of neighbors) {
        if (next >= 0 && !visited[next] && opaque(next)) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }

    if (queue.length < settings.minArea) continue;
    let darkest = 255;
    let brightest = 0;
    let strongestAlpha = 0;
    for (const index of queue) {
      const value = luminance(index);
      darkest = Math.min(darkest, value);
      brightest = Math.max(brightest, value);
      strongestAlpha = Math.max(strongestAlpha, data[index * 4 + 3]);
    }
    const luminanceFloor = brightest - darkest >= 32
      ? darkest + (brightest - darkest) * 0.4
      : darkest;
    const alphaFloor = Math.max(settings.alphaThreshold, strongestAlpha * 0.5);
    const foreground = queue.filter((index) =>
      data[index * 4 + 3] >= alphaFloor && luminance(index) >= luminanceFloor,
    );
    const core = foreground.length ? foreground : queue;

    let fullMinX = width;
    let fullMinY = height;
    let fullMaxX = 0;
    let fullMaxY = 0;
    for (const index of queue) {
      const x = index % width;
      const y = Math.floor(index / width);
      fullMinX = Math.min(fullMinX, x);
      fullMinY = Math.min(fullMinY, y);
      fullMaxX = Math.max(fullMaxX, x);
      fullMaxY = Math.max(fullMaxY, y);
    }

    let coreMinX = width;
    let coreMinY = height;
    let coreMaxX = 0;
    let coreMaxY = 0;
    for (const index of core) {
      const x = index % width;
      const y = Math.floor(index / width);
      coreMinX = Math.min(coreMinX, x);
      coreMinY = Math.min(coreMinY, y);
      coreMaxX = Math.max(coreMaxX, x);
      coreMaxY = Math.max(coreMaxY, y);
    }

    const centerX = (coreMinX + coreMaxX + 1) / 2;
    const centerY = (coreMinY + coreMaxY + 1) / 2;
    const fullLeft = fullMinX - settings.padding;
    const fullTop = fullMinY - settings.padding;
    const fullRight = fullMaxX + settings.padding + 1;
    const fullBottom = fullMaxY + settings.padding + 1;
    const radiusX = Math.max(centerX - fullLeft, fullRight - centerX);
    const radiusY = Math.max(centerY - fullTop, fullBottom - centerY);
    const desiredLeft = Math.floor(centerX - radiusX);
    const desiredTop = Math.floor(centerY - radiusY);
    const desiredRight = Math.ceil(centerX + radiusX);
    const desiredBottom = Math.ceil(centerY + radiusY);
    const glyphWidth = Math.min(width, desiredRight - desiredLeft);
    const glyphHeight = Math.min(height, desiredBottom - desiredTop);
    const x = clamp(desiredLeft, 0, width - glyphWidth);
    const y = clamp(desiredTop, 0, height - glyphHeight);
    results.push({
      glyph: {
        id: results.length,
        char: "",
        x,
        y,
        width: glyphWidth,
        height: glyphHeight,
        xoffset: 0,
        yoffset: 0,
        xadvance: glyphWidth,
      },
      coreLeft: coreMinX - x,
      coreTop: coreMinY - y,
      coreWidth: coreMaxX - coreMinX + 1,
      coreHeight: coreMaxY - coreMinY + 1,
    });
  }

  return {
    glyphs: sortInReadingOrder(applyDetectedGlyphMetrics(results, settings.advanceAdjustment))
      .map((glyph, id) => ({ ...glyph, id })),
    lineHeight: results.length
      ? Math.max(...results.map(({ coreHeight }) => coreHeight))
      : 0,
  };
}

export function detectGlyphs(
  imageData: ImageData,
  settings: DetectionSettings,
): Glyph[] {
  return detectGlyphsWithMetrics(imageData, settings).glyphs;
}

export function assignCharacters(glyphs: Glyph[], characters: string): Glyph[] {
  return glyphs.map((glyph, index) => {
    const mappedCharacter = Array.from(characters)[index];
    const char = mappedCharacter === UNRECOGNIZED_CHARACTER ? "" : mappedCharacter ?? glyph.char;
    return { ...glyph, char, matchConfidence: undefined };
  });
}

export function createCharacterMap(glyphs: Glyph[]): string {
  return glyphs.map((glyph) => glyph.char || UNRECOGNIZED_CHARACTER).join("");
}

export function makeGridGlyphs(
  imageWidth: number,
  imageHeight: number,
  cellWidth: number,
  cellHeight: number,
  offsetX: number,
  offsetY: number,
  gapX: number,
  gapY: number,
): Glyph[] {
  const glyphs: Glyph[] = [];
  const stepX = Math.max(1, cellWidth + gapX);
  const stepY = Math.max(1, cellHeight + gapY);
  for (let y = offsetY; y + cellHeight <= imageHeight; y += stepY) {
    for (let x = offsetX; x + cellWidth <= imageWidth; x += stepX) {
      glyphs.push({
        id: glyphs.length,
        char: "",
        x,
        y,
        width: cellWidth,
        height: cellHeight,
        xoffset: 0,
        yoffset: 0,
        xadvance: cellWidth,
      });
    }
  }
  return glyphs;
}
