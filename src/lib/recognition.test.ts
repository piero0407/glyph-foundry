import { describe, expect, it } from "vitest";
import type { Glyph } from "../types";
import { maskSimilarity, matchGlyphMasks, normalizeMask, type GlyphMask } from "./recognition";

const glyph = (id: number): Glyph => ({
  id, char: "", x: 0, y: 0, width: 3, height: 3, xoffset: 0, yoffset: 0, xadvance: 3,
});

const mask = (rows: string[]): GlyphMask => ({
  width: rows[0].length,
  height: rows.length,
  data: Uint8Array.from(rows.join("").replaceAll(".", "0").replaceAll("#", "1"), Number),
});

describe("character recognition", () => {
  it("normalizes masks without changing canvas size", () => {
    const normalized = normalizeMask(mask(["##", ".#"]));
    expect(normalized.width).toBe(24);
    expect(normalized.height).toBe(24);
    expect(normalized.data.some(Boolean)).toBe(true);
  });

  it("scores equal shapes above different shapes", () => {
    const plus = normalizeMask(mask([".#.", "###", ".#."]));
    const dash = normalizeMask(mask(["...", "###", "..."]));
    expect(maskSimilarity(plus, plus)).toBe(1);
    expect(maskSimilarity(plus, dash)).toBeLessThan(1);
  });

  it("assigns distinct confident matches", () => {
    const plus = normalizeMask(mask([".#.", "###", ".#."]));
    const slash = normalizeMask(mask(["..#", ".#.", "#.."]));
    const result = matchGlyphMasks(
      [glyph(0), glyph(1)],
      [plus, slash],
      [{ char: "+", mask: plus }, { char: "/", mask: slash }],
    );
    expect(result.map(({ char }) => char)).toEqual(["+", "/"]);
    expect(result.every(({ matchConfidence }) => matchConfidence === 1)).toBe(true);
  });

  it("leaves ambiguous shapes unmapped", () => {
    const shape = normalizeMask(mask(["###"]));
    const result = matchGlyphMasks(
      [glyph(0)],
      [shape],
      [{ char: "-", mask: shape }, { char: "_", mask: shape }],
    );
    expect(result[0].char).toBe("");
  });

  it("rejects matches below configured confidence", () => {
    const plus = normalizeMask(mask([".#.", "###", ".#."]));
    const incompletePlus = normalizeMask(mask([".#.", ".##", ".#."]));
    const result = matchGlyphMasks(
      [glyph(0)],
      [incompletePlus],
      [{ char: "+", mask: plus }],
      1,
    );
    expect(result[0].char).toBe("");
  });
});
