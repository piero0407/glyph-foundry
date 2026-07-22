import type { Glyph } from "../types";

export type ParsedFnt = {
  fontName: string;
  imageName: string;
  imageWidth: number;
  imageHeight: number;
  lineHeight: number;
  glyphs: Glyph[];
};

const safeName = (name: string) => name.replace(/["\r\n]/g, "");

export function findDuplicateCharacters(glyphs: Glyph[]): string[] {
  const counts = new Map<string, number>();
  for (const glyph of glyphs) {
    if (glyph.char) counts.set(glyph.char, (counts.get(glyph.char) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([char]) => char);
}

export function serializeFnt(
  fontName: string,
  imageName: string,
  imageWidth: number,
  imageHeight: number,
  lineHeight: number,
  glyphs: Glyph[],
): string {
  const duplicates = findDuplicateCharacters(glyphs);
  if (duplicates.length) throw new Error(`Duplicate BMFont characters: ${duplicates.join(" ")}`);
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

function parseFields(line: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const expression = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(line))) {
    const raw = match[2];
    fields[match[1]] = raw.startsWith('"') ? raw.slice(1, -1).replace(/\\"/g, '"') : raw;
  }
  return fields;
}

function integer(fields: Record<string, string>, name: string, context: string): number {
  const value = Number(fields[name]);
  if (!Number.isInteger(value)) throw new Error(`${context} has invalid ${name}.`);
  return value;
}

export function parseFnt(source: string): ParsedFnt {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const infoLine = lines.find((line) => line.startsWith("info "));
  const commonLine = lines.find((line) => line.startsWith("common "));
  const pageLines = lines.filter((line) => line.startsWith("page "));
  const charLines = lines.filter((line) => line.startsWith("char "));
  const charsLine = lines.find((line) => line.startsWith("chars "));
  if (!infoLine || !commonLine || pageLines.length !== 1) {
    throw new Error("BMFont text must contain info, common, and one page record.");
  }

  const info = parseFields(infoLine);
  const common = parseFields(commonLine);
  const page = parseFields(pageLines[0]);
  const pages = integer(common, "pages", "common record");
  if (pages !== 1 || integer(page, "id", "page record") !== 0 || !page.file) {
    throw new Error("Only single-page BMFont text files are supported.");
  }
  if (charsLine && integer(parseFields(charsLine), "count", "chars record") !== charLines.length) {
    throw new Error("BMFont character count does not match its char records.");
  }

  const imageWidth = integer(common, "scaleW", "common record");
  const imageHeight = integer(common, "scaleH", "common record");
  const lineHeight = integer(common, "lineHeight", "common record");
  if (imageWidth < 1 || imageHeight < 1 || lineHeight < 1) throw new Error("BMFont dimensions must be positive.");

  const seen = new Set<number>();
  const glyphs = charLines.map((line, index): Glyph => {
    const fields = parseFields(line);
    const codePoint = integer(fields, "id", `char record ${index + 1}`);
    if (codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      throw new Error(`char record ${index + 1} has invalid Unicode id.`);
    }
    if (seen.has(codePoint)) throw new Error(`BMFont contains duplicate character id ${codePoint}.`);
    seen.add(codePoint);
    const glyph = {
      id: index,
      char: String.fromCodePoint(codePoint),
      x: integer(fields, "x", `char record ${index + 1}`),
      y: integer(fields, "y", `char record ${index + 1}`),
      width: integer(fields, "width", `char record ${index + 1}`),
      height: integer(fields, "height", `char record ${index + 1}`),
      xoffset: integer(fields, "xoffset", `char record ${index + 1}`),
      yoffset: integer(fields, "yoffset", `char record ${index + 1}`),
      xadvance: integer(fields, "xadvance", `char record ${index + 1}`),
      mappingSource: "manual" as const,
    };
    if (glyph.x < 0 || glyph.y < 0 || glyph.width < 1 || glyph.height < 1) {
      throw new Error(`char record ${index + 1} has invalid bounds.`);
    }
    if (fields.page !== undefined && integer(fields, "page", `char record ${index + 1}`) !== 0) {
      throw new Error(`char record ${index + 1} references an unsupported page.`);
    }
    return glyph;
  });

  return {
    fontName: info.face || "Bitmap Font",
    imageName: page.file,
    imageWidth,
    imageHeight,
    lineHeight,
    glyphs,
  };
}
