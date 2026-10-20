import workerPath from "tesseract.js/dist/worker.min.js?url";
import corePath from "tesseract.js-core/tesseract-core-lstm.wasm.js?url";
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import type { Glyph } from "../types";
import { extractForegroundMask } from "./recognition";
import { uniqueCandidates, type GlyphRecognition, type RecognitionRequest, type Recognizer } from "./recognizer";

const TARGET_INK_SIZE = 64;
const BORDER = 12;

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Recognition cancelled", "AbortError");
}

/** Waits for a shared promise but stops waiting as soon as this caller cancels. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Recognition cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function glyphCanvas(imageData: ImageData, glyph: Glyph, alphaThreshold: number): HTMLCanvasElement | null {
  const mask = extractForegroundMask(imageData, glyph, alphaThreshold);
  if (!mask) return null;
  const scale = TARGET_INK_SIZE / Math.max(mask.width, mask.height);
  const width = Math.max(1, Math.round(mask.width * scale));
  const height = Math.max(1, Math.round(mask.height * scale));
  const source = document.createElement("canvas");
  source.width = mask.width;
  source.height = mask.height;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) return null;
  const pixels = sourceContext.createImageData(mask.width, mask.height);
  for (let index = 0; index < mask.data.length; index += 1) {
    const offset = index * 4;
    const value = mask.data[index] ? 0 : 255;
    pixels.data[offset] = value;
    pixels.data[offset + 1] = value;
    pixels.data[offset + 2] = value;
    pixels.data[offset + 3] = 255;
  }
  sourceContext.putImageData(pixels, 0, 0);

  const canvas = document.createElement("canvas");
  canvas.width = width + BORDER * 2;
  canvas.height = height + BORDER * 2;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(source, BORDER, BORDER, width, height);
  return canvas;
}

class TesseractRecognizer implements Recognizer {
  private workerPromise: Promise<Worker> | null = null;
  private progressListener: (progress: number, status: string) => void = () => {};

  private getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      let rejectInitialization: (reason: unknown) => void = () => {};
      const initializationFailure = new Promise<never>((_, reject) => {
        rejectInitialization = reject;
      });
      let timer: number | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("Offline OCR initialization timed out")), 30_000);
      });
      const languageRoot = new URL(`${import.meta.env.BASE_URL}ocr/lang`, window.location.origin).href;
      const initialization = createWorker(
        "eng",
        OEM.LSTM_ONLY,
        {
          workerPath,
          corePath,
          langPath: languageRoot,
          logger: ({ progress, status }) => this.progressListener(progress, status),
          errorHandler: (error) => rejectInitialization(error instanceof Error ? error : new Error(String(error))),
        },
        { load_system_dawg: "0", load_freq_dawg: "0" },
      );
      const workerPromise = Promise.race([initialization, initializationFailure, timeout])
        .finally(() => window.clearTimeout(timer));
      this.workerPromise = workerPromise;
      workerPromise.catch(() => {
        if (this.workerPromise === workerPromise) this.workerPromise = null;
        // A worker that finishes starting after a timeout or error is never used, so stop it.
        initialization.then((worker) => worker.terminate(), () => {});
      });
    }
    return this.workerPromise;
  }

  async recognize(
    request: RecognitionRequest,
    signal: AbortSignal,
    onProgress: (progress: number, status: string) => void,
  ): Promise<GlyphRecognition[]> {
    this.progressListener = (progress, status) => onProgress(progress * 0.15, status);
    const worker = await untilAborted(this.getWorker(), signal);
    const candidates = uniqueCandidates(request.candidateCharset);
    if (!candidates.length) return [];
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_CHAR,
      tessedit_char_whitelist: candidates.join(""),
      user_defined_dpi: "300",
    });

    const results: GlyphRecognition[] = [];
    for (let index = 0; index < request.glyphs.length; index += 1) {
      throwIfAborted(signal);
      const glyph = request.glyphs[index];
      const canvas = glyphCanvas(request.image, glyph, request.alphaThreshold);
      if (!canvas) {
        results.push({
          glyphId: glyph.id,
          char: null,
          confidence: null,
          provider: "tesseract-v7",
          status: "empty",
        });
        continue;
      }
      try {
        const { data } = await worker.recognize(canvas);
        throwIfAborted(signal);
        const char = Array.from(data.text.trim()).find((value) => candidates.includes(value)) ?? null;
        results.push({
          glyphId: glyph.id,
          char,
          confidence: char ? Math.max(0, Math.min(1, data.confidence / 100)) : null,
          rawConfidence: data.confidence,
          provider: "tesseract-v7",
          status: char ? "matched" : "empty",
        });
      } catch (error) {
        if (signal.aborted) throw error;
        results.push({
          glyphId: glyph.id,
          char: null,
          confidence: null,
          provider: "tesseract-v7",
          status: "error",
          error: error instanceof Error ? error.message : "OCR failed",
        });
      }
      onProgress(0.15 + (index + 1) / request.glyphs.length * 0.85, `Recognizing glyph ${index + 1}/${request.glyphs.length}`);
    }
    return results;
  }

  async dispose(): Promise<void> {
    const workerPromise = this.workerPromise;
    this.workerPromise = null;
    if (!workerPromise) return;
    try {
      const worker = await workerPromise;
      await worker.terminate();
    } catch {
      // Failed initialization leaves no live worker to terminate.
    }
  }
}

export function createTesseractRecognizer(): Recognizer {
  return new TesseractRecognizer();
}
