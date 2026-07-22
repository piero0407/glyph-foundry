import type { GlyphRecognition, RecognitionRequest, Recognizer } from "./recognizer";

export type RecognitionRun = {
  results: GlyphRecognition[];
  fallbackUsed: boolean;
  primaryError?: string;
};

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof DOMException && error.name === "AbortError");
}

export async function runRecognition(
  request: RecognitionRequest,
  primary: Recognizer,
  fallback: Recognizer,
  signal: AbortSignal,
  onProgress: (progress: number, message: string) => void,
): Promise<RecognitionRun> {
  try {
    return {
      results: await primary.recognize(request, signal, onProgress),
      fallbackUsed: false,
    };
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    const primaryError = error instanceof Error ? error.message : "Unknown error";
    onProgress(0, "Using template fallback");
    return {
      results: await fallback.recognize(request, signal, onProgress),
      fallbackUsed: true,
      primaryError,
    };
  }
}
