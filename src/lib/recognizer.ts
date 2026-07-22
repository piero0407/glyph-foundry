import type { Glyph } from "../types";
import { recognizeCharacters } from "./recognition";

export type RecognitionProvider = "template-v1" | "tesseract-v7";
export type RecognitionStatus = "matched" | "ambiguous" | "empty" | "error";

export type GlyphRecognition = {
  glyphId: number;
  char: string | null;
  confidence: number | null;
  rawConfidence?: number;
  provider: RecognitionProvider;
  status: RecognitionStatus;
  error?: string;
};

export type RecognitionRequest = {
  image: ImageData;
  glyphs: Glyph[];
  candidateCharset: string;
  alphaThreshold: number;
  minimumConfidence: number;
};

export interface Recognizer {
  recognize(
    request: RecognitionRequest,
    signal: AbortSignal,
    onProgress: (progress: number, status: string) => void,
  ): Promise<GlyphRecognition[]>;
  dispose(): Promise<void>;
}

export function uniqueCandidates(characters: string): string[] {
  return [...new Set(Array.from(characters).filter((char) => !/\s/u.test(char) && char !== "�"))];
}

export function applyRecognitionResults(
  glyphs: Glyph[],
  results: GlyphRecognition[],
  minimumConfidence: number,
): Glyph[] {
  const byGlyph = new Map(results.map((result) => [result.glyphId, result]));
  const accepted = results.filter((result) =>
    result.status === "matched"
    && result.char
    && result.confidence !== null
    && result.confidence >= minimumConfidence,
  );
  const counts = new Map<string, number>();
  for (const result of accepted) counts.set(result.char!, (counts.get(result.char!) ?? 0) + 1);

  return glyphs.map((glyph) => {
    if (glyph.char && glyph.mappingSource === "manual") return glyph;
    const result = byGlyph.get(glyph.id);
    if (!result) return glyph;
    const collision = result.char ? (counts.get(result.char) ?? 0) > 1 : false;
    const matched = result.status === "matched"
      && result.char
      && result.confidence !== null
      && result.confidence >= minimumConfidence
      && !collision;
    return {
      ...glyph,
      char: matched ? result.char! : "",
      mappingSource: matched ? "recognized" : undefined,
      matchConfidence: result.confidence ?? undefined,
      matchProvider: result.provider,
      recognitionStatus: matched ? "matched" : collision ? "ambiguous" : result.status === "matched" ? "ambiguous" : result.status,
      recognitionError: result.error,
    };
  });
}

export function createTemplateRecognizer(): Recognizer {
  return {
    async recognize(request, signal, onProgress) {
      if (signal.aborted) throw new DOMException("Recognition cancelled", "AbortError");
      onProgress(0, "Matching local templates");
      const glyphs = recognizeCharacters(
        request.image,
        request.glyphs,
        request.candidateCharset,
        request.alphaThreshold,
        request.minimumConfidence,
      );
      onProgress(1, "Template matching complete");
      return glyphs.map((glyph): GlyphRecognition => ({
        glyphId: glyph.id,
        char: glyph.char || null,
        confidence: glyph.matchConfidence ?? null,
        provider: "template-v1",
        status: glyph.char ? "matched" : "empty",
      }));
    },
    async dispose() {},
  };
}
