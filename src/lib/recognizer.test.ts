import { describe, expect, it } from "vitest";
import type { Glyph } from "../types";
import { applyRecognitionResults, uniqueCandidates, type GlyphRecognition } from "./recognizer";

const glyph = (id: number, char = "", mappingSource?: Glyph["mappingSource"]): Glyph => ({
  id, char, mappingSource, x: 0, y: 0, width: 3, height: 3, xoffset: 0, yoffset: 0, xadvance: 3,
});

const result = (glyphId: number, char: string | null, confidence = 0.99): GlyphRecognition => ({
  glyphId,
  char,
  confidence,
  provider: "tesseract-v7",
  status: char ? "matched" : "empty",
});

describe("recognizer contract", () => {
  it("keeps candidate characters independent and unique", () => {
    expect(uniqueCandidates("AA B�!" )).toEqual(["A", "B", "!"]);
  });

  it("preserves manual mappings while replacing previous automatic mappings", () => {
    const mapped = applyRecognitionResults(
      [glyph(0, "A", "manual"), glyph(1, "B", "ordered")],
      [result(0, "C"), result(1, "D")],
      0.9,
    );
    expect(mapped.map(({ char }) => char)).toEqual(["A", "D"]);
    expect(mapped[1].matchProvider).toBe("tesseract-v7");
  });

  it("marks duplicate codepoint suggestions ambiguous", () => {
    const mapped = applyRecognitionResults(
      [glyph(0), glyph(1)],
      [result(0, "A"), result(1, "A")],
      0.9,
    );
    expect(mapped.map(({ char }) => char)).toEqual(["", ""]);
    expect(mapped.every(({ recognitionStatus }) => recognitionStatus === "ambiguous")).toBe(true);
  });

  it("does not accept a score below configured threshold", () => {
    const mapped = applyRecognitionResults([glyph(0)], [result(0, "A", 0.8)], 0.9);
    expect(mapped[0]).toMatchObject({ char: "", recognitionStatus: "ambiguous", matchConfidence: 0.8 });
  });
});
