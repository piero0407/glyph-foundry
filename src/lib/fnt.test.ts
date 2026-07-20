import { describe, expect, it } from "vitest";
import { serializeFnt } from "./fnt";

describe("serializeFnt", () => {
  it("writes mapped glyphs using Unicode code points", () => {
    const output = serializeFnt("Test", "atlas.png", 128, 64, 16, [
      { id: 0, char: "A", x: 1, y: 2, width: 7, height: 9, xoffset: 0, yoffset: 1, xadvance: 8 },
      { id: 1, char: "", x: 10, y: 2, width: 7, height: 9, xoffset: 0, yoffset: 1, xadvance: 8 },
    ]);
    expect(output).toContain("chars count=1");
    expect(output).toContain("char id=65 x=1 y=2 width=7 height=9");
  });
});
