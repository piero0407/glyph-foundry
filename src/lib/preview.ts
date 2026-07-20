import type { Glyph } from "../types";

export type GlyphPlacement = {
  glyph: Glyph;
  x: number;
  y: number;
};

export function layoutBitmapText(glyphs: Glyph[], lineHeight: number, text: string) {
  const paddingX = 12;
  const paddingY = 8;
  const safeLineHeight = Math.max(1, lineHeight);
  const glyphByCharacter = new Map(glyphs.filter((glyph) => glyph.char).map((glyph) => [glyph.char, glyph]));
  const lines = text.split("\n");
  const fallbackAdvance = Math.max(1, Math.round(safeLineHeight / 2));
  const rawPlacements: GlyphPlacement[] = [];
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = lines.length * safeLineHeight;

  lines.forEach((line, lineIndex) => {
    let cursorX = 0;
    for (const character of Array.from(line)) {
      const glyph = glyphByCharacter.get(character);
      if (!glyph) {
        cursorX += fallbackAdvance;
        continue;
      }
      const x = cursorX + glyph.xoffset;
      const y = lineIndex * safeLineHeight + glyph.yoffset;
      rawPlacements.push({ glyph, x, y });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + glyph.width);
      maxY = Math.max(maxY, y + glyph.height);
      cursorX += glyph.xadvance;
    }
    maxX = Math.max(maxX, cursorX);
  });

  const originX = paddingX - minX;
  const originY = paddingY - minY;
  return {
    width: Math.max(320, Math.ceil(maxX - minX) + paddingX * 2),
    height: Math.max(80, Math.ceil(maxY - minY) + paddingY * 2),
    lineTops: lines.map((_, index) => originY + index * safeLineHeight),
    lineHeight: safeLineHeight,
    placements: rawPlacements.map((placement) => ({
      ...placement,
      x: placement.x + originX,
      y: placement.y + originY,
    })),
  };
}
