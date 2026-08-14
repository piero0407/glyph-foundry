import { describe, expect, it } from "vitest";
import { layoutBitmapText } from "./preview";
import type { Glyph } from "../types";

const glyph = (patch: Partial<Glyph> = {}): Glyph => ({
  id: 0,
  char: "A",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  xoffset: 0,
  yoffset: 0,
  xadvance: 10,
  ...patch,
});

describe("layoutBitmapText", () => {
  it("positions glyphs from BMFont offsets and advances the pen by xadvance", () => {
    const first = glyph({ id: 0, char: "A", xoffset: -2, yoffset: 3, xadvance: 7 });
    const second = glyph({ id: 1, char: "B", xoffset: 4, yoffset: -1, xadvance: 12 });
    const layout = layoutBitmapText([first, second], 16, "AB");
    const [a, b] = layout.placements;

    expect(b.x - a.x).toBe(7 + second.xoffset - first.xoffset);
    expect(b.y - a.y).toBe(second.yoffset - first.yoffset);
  });

  it("resets the horizontal pen and advances by lineHeight after a newline", () => {
    const layout = layoutBitmapText([glyph()], 18, "AA\nA");
    const [first, , third] = layout.placements;

    expect(third.x).toBe(first.x);
    expect(third.y - first.y).toBe(18);
    expect(layout.lineTops[1] - layout.lineTops[0]).toBe(18);
  });

  it("advances by the deterministic fallback width for an unknown character", () => {
    const layout = layoutBitmapText([glyph()], 15, "A?A");
    const [first, second] = layout.placements;

    expect(second.x - first.x).toBe(10 + 8);
  });

  it("matches non-BMP glyphs as single Unicode code points", () => {
    const emoji = glyph({ char: "😀", xadvance: 13 });
    const layout = layoutBitmapText([emoji], 16, "😀😀");

    expect(layout.placements).toHaveLength(2);
    expect(layout.placements[1].x - layout.placements[0].x).toBe(13);
  });

  it("expands below line height for tall glyphs", () => {
    const layout = layoutBitmapText([glyph({ height: 48 })], 16, "A");
    const placement = layout.placements[0];

    expect(placement.y + placement.glyph.height).toBeLessThan(layout.height);
    expect(layout.height).toBeGreaterThan(16);
  });

  it("keeps negative and positive glyph overhang inside canvas", () => {
    const layout = layoutBitmapText([glyph({ width: 32, height: 30, xoffset: -18, yoffset: -12, xadvance: 8 })], 16, "A");
    const placement = layout.placements[0];

    expect(placement.x).toBeGreaterThanOrEqual(0);
    expect(placement.y).toBeGreaterThanOrEqual(0);
    expect(placement.x + placement.glyph.width).toBeLessThanOrEqual(layout.width);
    expect(placement.y + placement.glyph.height).toBeLessThanOrEqual(layout.height);
  });
});
