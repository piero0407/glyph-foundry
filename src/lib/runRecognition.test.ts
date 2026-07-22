import { describe, expect, it, vi } from "vitest";
import { runRecognition } from "./runRecognition";
import type { RecognitionRequest, Recognizer } from "./recognizer";

const request = { image: {} as ImageData, glyphs: [], candidateCharset: "AB", alphaThreshold: 1, minimumConfidence: 0.9 } satisfies RecognitionRequest;
const result = [{ glyphId: 1, char: "A", confidence: 1, provider: "template-v1", status: "matched" }] as const;

function recognizer(run: Recognizer["recognize"]): Recognizer {
  return { recognize: run, dispose: async () => {} };
}

describe("runRecognition", () => {
  it("returns the primary result", async () => {
    const primary = recognizer(async () => [...result]);
    const fallback = recognizer(vi.fn());
    await expect(runRecognition(request, primary, fallback, new AbortController().signal, vi.fn())).resolves.toMatchObject({ fallbackUsed: false });
    expect(fallback.recognize).not.toHaveBeenCalled();
  });

  it("uses fallback once after a primary failure", async () => {
    const primary = recognizer(async () => { throw new Error("worker failed"); });
    const fallback = recognizer(async () => [...result]);
    await expect(runRecognition(request, primary, fallback, new AbortController().signal, vi.fn())).resolves.toMatchObject({
      fallbackUsed: true,
      primaryError: "worker failed",
    });
  });

  it("does not use fallback after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const primary = recognizer(async () => { throw new DOMException("cancelled", "AbortError"); });
    const fallback = recognizer(vi.fn());
    await expect(runRecognition(request, primary, fallback, controller.signal, vi.fn())).rejects.toMatchObject({ name: "AbortError" });
    expect(fallback.recognize).not.toHaveBeenCalled();
  });
});
