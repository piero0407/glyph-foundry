import { describe, expect, it } from "vitest";
import { assignCharacters, createCharacterMap, detectGlyphs, detectGlyphsWithMetrics } from "./glyphs";

function imageData(width: number, height: number, alphas: number[]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  alphas.forEach((alpha, index) => {
    data[index * 4 + 3] = alpha;
  });
  return { width, height, data } as ImageData;
}

function rgbaImageData(width: number, height: number, pixels: number[][]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((pixel, index) => data.set(pixel, index * 4));
  return { width, height, data } as ImageData;
}

describe("detectGlyphs", () => {
  it("keeps translucent shadow extent while centering on foreground", () => {
    const pixels = imageData(5, 1, [0, 0, 255, 64, 0]);
    const settings = { alphaThreshold: 16, padding: 0, minArea: 1, advanceAdjustment: 0 };

    expect(detectGlyphs(pixels, settings)[0]).toMatchObject({
      x: 1,
      width: 3,
      xoffset: -1,
      xadvance: 1,
    });
  });

  it("includes an opaque dark shadow without shifting foreground center", () => {
    const pixels = rgbaImageData(6, 2, [
      [0, 0, 0, 0], [0, 0, 0, 0], [255, 220, 80, 255], [255, 220, 80, 255], [0, 0, 0, 255], [0, 0, 0, 0],
      [0, 0, 0, 0], [0, 0, 0, 0], [255, 220, 80, 255], [255, 220, 80, 255], [0, 0, 0, 255], [0, 0, 0, 0],
    ]);
    const settings = { alphaThreshold: 16, padding: 0, minArea: 1, advanceAdjustment: 0 };

    expect(detectGlyphs(pixels, settings)[0]).toMatchObject({
      x: 1,
      width: 4,
      xoffset: -1,
      xadvance: 2,
    });
  });

  it("maps uneven glyph boxes left-to-right within each visual row", () => {
    const alphas = Array(8 * 8).fill(0);
    for (const [x, y] of [
      [1, 2], [1, 3],
      [5, 1], [5, 2], [5, 3], [5, 4],
      [1, 6], [2, 6],
      [5, 6], [5, 7],
    ]) alphas[y * 8 + x] = 255;
    const pixels = imageData(8, 8, alphas);
    const settings = { alphaThreshold: 16, padding: 0, minArea: 1, advanceAdjustment: 0 };

    expect(detectGlyphs(pixels, settings).map(({ x, y }) => [x, y])).toEqual([
      [1, 2], [5, 1],
      [1, 6], [5, 6],
    ]);
  });

  it("centers detected symbols in a shared preview cell", () => {
    const alphas = Array(7 * 3).fill(0);
    alphas[1 * 7] = 255;
    for (const [x, y] of [
      [4, 0], [5, 0], [6, 0],
      [4, 1], [5, 1], [6, 1],
      [4, 2], [5, 2], [6, 2],
    ]) alphas[y * 7 + x] = 255;
    const pixels = imageData(7, 3, alphas);
    const settings = { alphaThreshold: 16, padding: 0, minArea: 1, advanceAdjustment: 0 };

    expect(detectGlyphs(pixels, settings).map(({ xoffset, yoffset, xadvance }) => ({
      xoffset,
      yoffset,
      xadvance,
    }))).toEqual([
      { xoffset: 1, yoffset: 2, xadvance: 3 },
      { xoffset: 0, yoffset: 0, xadvance: 3 },
    ]);
  });

  it("aligns foreground bases without letting a shadow change yoffset", () => {
    const pixels = rgbaImageData(5, 3, [
      [255, 255, 255, 255], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [255, 255, 255, 255],
      [0, 0, 0, 255], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [255, 255, 255, 255],
      [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0],
    ]);
    const settings = { alphaThreshold: 16, padding: 0, minArea: 1, advanceAdjustment: 0 };

    expect(detectGlyphs(pixels, settings).map(({ yoffset, xadvance }) => ({
      yoffset,
      xadvance,
    }))).toEqual([
      { yoffset: 1, xadvance: 1 },
      { yoffset: 0, xadvance: 1 },
    ]);
  });

  it("uses foreground height for line height without counting shadow", () => {
    const pixels = rgbaImageData(1, 3, [
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ]);
    const settings = { alphaThreshold: 16, padding: 0, minArea: 1, advanceAdjustment: 0 };

    const detection = detectGlyphsWithMetrics(pixels, settings);

    expect(detection.glyphs[0]).toMatchObject({ height: 3 });
    expect(detection.lineHeight).toBe(1);
  });

  it("increases every detected symbol advance", () => {
    const pixels = imageData(3, 1, [255, 0, 255]);
    const settings = { alphaThreshold: 16, padding: 0, minArea: 1, advanceAdjustment: 6 };

    expect(detectGlyphs(pixels, settings).map(({ xoffset, xadvance }) => ({
      xoffset,
      xadvance,
    }))).toEqual([
      { xoffset: 3, xadvance: 7 },
      { xoffset: 3, xadvance: 7 },
    ]);
  });

  it("reduces detected advance below foreground width", () => {
    const pixels = imageData(3, 1, [255, 255, 255]);
    const settings = { alphaThreshold: 16, padding: 0, minArea: 1, advanceAdjustment: -2 };

    expect(detectGlyphs(pixels, settings)[0]).toMatchObject({
      xoffset: -1,
      xadvance: 1,
    });
  });

  it("groups a detached exclamation dot with its stem", () => {
    const alphas = Array(3 * 6).fill(0);
    for (const [x, y] of [[1, 0], [1, 1], [1, 2], [1, 5]]) alphas[y * 3 + x] = 255;
    const settings = { alphaThreshold: 16, padding: 0, minArea: 1, advanceAdjustment: 0 };

    const result = detectGlyphs(imageData(3, 6, alphas), settings);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ x: 1, y: 0, width: 1, height: 6, groupingStatus: "certain" });
  });

  it("groups equal-sign strokes without joining neighboring glyphs", () => {
    const alphas = Array(12 * 4).fill(0);
    for (const [x, y] of [
      [0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2],
      [8, 0], [8, 1], [8, 2], [10, 0], [10, 1], [10, 2],
    ]) alphas[y * 12 + x] = 255;
    const settings = { alphaThreshold: 16, padding: 0, minArea: 1, advanceAdjustment: 0 };

    const result = detectGlyphs(imageData(12, 4, alphas), settings);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ x: 0, y: 0, width: 3, height: 3 });
    expect(result.slice(1).map(({ x }) => x)).toEqual([8, 10]);
  });

  it("marks close diagonal components ambiguous instead of merging them", () => {
    const alphas = Array(4 * 4).fill(0);
    alphas[0] = 255;
    alphas[2 * 4 + 2] = 255;
    const settings = { alphaThreshold: 16, padding: 0, minArea: 1, advanceAdjustment: 0 };

    const result = detectGlyphs(imageData(4, 4, alphas), settings);
    expect(result).toHaveLength(2);
    expect(result.every(({ groupingStatus }) => groupingStatus === "ambiguous")).toBe(true);
  });
});

describe("character map", () => {
  const glyph = (id: number, char = "") => ({
    id, char, x: 0, y: 0, width: 1, height: 1, xoffset: 0, yoffset: 0, xadvance: 1,
  });

  it("preserves unrecognized slots with a visible placeholder", () => {
    expect(createCharacterMap([glyph(0, "+"), glyph(1), glyph(2, "!")])).toBe("+�!");
  });

  it("keeps placeholder slots unmapped when applying edits", () => {
    expect(assignCharacters([glyph(0), glyph(1), glyph(2)], "+�!").map(({ char }) => char)).toEqual(["+", "", "!"]);
  });
});
