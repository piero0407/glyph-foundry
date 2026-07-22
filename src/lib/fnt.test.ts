import { describe, expect, it } from "vitest";
import { findDuplicateCharacters, parseFnt, serializeFnt } from "./fnt";

describe("serializeFnt", () => {
  it("writes mapped glyphs using Unicode code points", () => {
    const output = serializeFnt("Test", "atlas.png", 128, 64, 16, [
      { id: 0, char: "A", x: 1, y: 2, width: 7, height: 9, xoffset: 0, yoffset: 1, xadvance: 8 },
      { id: 1, char: "", x: 10, y: 2, width: 7, height: 9, xoffset: 0, yoffset: 1, xadvance: 8 },
    ]);
    expect(output).toContain("chars count=1");
    expect(output).toContain("char id=65 x=1 y=2 width=7 height=9");
  });

  it("rejects duplicate Unicode character records", () => {
    const glyphs = [0, 1].map((id) => ({
      id, char: "A", x: id * 8, y: 0, width: 8, height: 8, xoffset: 0, yoffset: 0, xadvance: 8,
    }));
    expect(findDuplicateCharacters(glyphs)).toEqual(["A"]);
    expect(() => serializeFnt("Font", "font.png", 32, 32, 8, glyphs)).toThrow("Duplicate BMFont characters: A");
  });
});

describe("parseFnt", () => {
  it("reads single-page Unicode BMFont text", () => {
    const parsed = parseFnt([
      'info face="Test Font" size=16',
      "common lineHeight=18 base=16 scaleW=128 scaleH=64 pages=1 packed=0",
      'page id=0 file="atlas.png"',
      "chars count=1",
      "char id=65 x=1 y=2 width=7 height=9 xoffset=-1 yoffset=1 xadvance=8 page=0 chnl=15",
    ].join("\n"));
    expect(parsed).toMatchObject({ fontName: "Test Font", imageName: "atlas.png", imageWidth: 128, imageHeight: 64, lineHeight: 18 });
    expect(parsed.glyphs[0]).toMatchObject({ char: "A", x: 1, y: 2, width: 7, height: 9, xoffset: -1, xadvance: 8 });
  });

  it("rejects multi-page and duplicate-character files", () => {
    const header = ['info face="Test"', "common lineHeight=8 scaleW=16 scaleH=16 pages=1", 'page id=0 file="a.png"'];
    expect(() => parseFnt(header.map((line) => line.replace("pages=1", "pages=2")).join("\n"))).toThrow("single-page");
    expect(() => parseFnt([...header,
      "char id=65 x=0 y=0 width=8 height=8 xoffset=0 yoffset=0 xadvance=8",
      "char id=65 x=8 y=0 width=8 height=8 xoffset=0 yoffset=0 xadvance=8",
    ].join("\n"))).toThrow("duplicate character");
  });
});
