import { describe, expect, it } from "vitest";
import { findDuplicateCharacters, parseFnt, serializeFnt } from "./fnt";

describe("serializeFnt", () => {
  it("writes mapped glyphs using Unicode code points", () => {
    const serialized = serializeFnt("Test Font", "atlas.png", 128, 64, 18, [
      { id: 0, char: "A", x: 1, y: 2, width: 7, height: 9, xoffset: -1, yoffset: 1, xadvance: 8 },
      { id: 1, char: "", x: 10, y: 2, width: 7, height: 9, xoffset: 0, yoffset: 0, xadvance: 8 },
    ]);
    expect(serialized).toContain('info face="Test Font"');
    expect(serialized).toContain("common lineHeight=18 base=18 scaleW=128 scaleH=64 pages=1 packed=0");
    expect(serialized).toContain('page id=0 file="atlas.png"');
    expect(serialized).toContain("chars count=1");
    expect(serialized).toContain("char id=65 x=1 y=2 width=7 height=9 xoffset=-1 yoffset=1 xadvance=8 page=0 chnl=15");
  });

  it("rejects duplicate Unicode character records", () => {
    expect(() => serializeFnt("Test Font", "atlas.png", 128, 64, 18, [
      { id: 0, char: "A", x: 1, y: 2, width: 7, height: 9, xoffset: 0, yoffset: 0, xadvance: 8 },
      { id: 1, char: "A", x: 10, y: 2, width: 7, height: 9, xoffset: 0, yoffset: 0, xadvance: 8 },
    ])).toThrow("Duplicate BMFont characters: A");
    expect(findDuplicateCharacters([
      { id: 0, char: "A", x: 0, y: 0, width: 8, height: 8, xoffset: 0, yoffset: 0, xadvance: 8 },
      { id: 1, char: "A", x: 8, y: 0, width: 8, height: 8, xoffset: 0, yoffset: 0, xadvance: 8 },
    ])).toEqual(["A"]);
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

  it("rejects multi-page and handles duplicate-character files by unmapping duplicates", () => {
    const header = ['info face="Test"', "common lineHeight=8 scaleW=16 scaleH=16 pages=1", 'page id=0 file="a.png"'];
    expect(() => parseFnt(header.map((line) => line.replace("pages=1", "pages=2")).join("\n"))).toThrow("single-page");
    const parsed = parseFnt([...header,
      "char id=65 x=0 y=0 width=8 height=8 xoffset=0 yoffset=0 xadvance=8",
      "char id=65 x=8 y=0 width=8 height=8 xoffset=0 yoffset=0 xadvance=8",
    ].join("\n"));
    expect(parsed.glyphs[0].char).toBe("A");
    expect(parsed.glyphs[1].char).toBe("");
  });
});
