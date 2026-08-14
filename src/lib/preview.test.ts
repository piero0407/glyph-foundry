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
