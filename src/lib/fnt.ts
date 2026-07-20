import type { Glyph } from "../types";

const safeName = (name: string) => name.replace(/["\r\n]/g, "");

export function serializeFnt(
  fontName: string,
  imageName: string,
  imageWidth: number,
  imageHeight: number,
  lineHeight: number,
  glyphs: Glyph[],
): string {
  const chars = glyphs.filter((glyph) => glyph.char);
  const lines = [
    `info face="${safeName(fontName)}" size=${lineHeight} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=0,0`,
    `common lineHeight=${lineHeight} base=${lineHeight} scaleW=${imageWidth} scaleH=${imageHeight} pages=1 packed=0`,
    `page id=0 file="${safeName(imageName)}"`,
    `chars count=${chars.length}`,
  ];
  for (const glyph of chars) {
    const id = glyph.char.codePointAt(0) ?? 0;
    lines.push(
      `char id=${id} x=${glyph.x} y=${glyph.y} width=${glyph.width} height=${glyph.height} xoffset=${glyph.xoffset} yoffset=${glyph.yoffset} xadvance=${glyph.xadvance} page=0 chnl=15`,
    );
  }
  return `${lines.join("\n")}\n`;
}
