import { useCallback, useEffect, useRef, useState } from "react";
import { createTemplateRecognizer, type GlyphRecognition, type Recognizer } from "../lib/recognizer";
import { runRecognition } from "../lib/runRecognition";
import type { AtlasImage, Glyph } from "../types";

export type RecognitionState = {
  phase: "idle" | "loading" | "running" | "error";
  progress: number;
  message: string;
};

type Props = {
  atlas: AtlasImage | null;
  glyphs: Glyph[];
  candidateCharset: string;
  alphaThreshold: number;
  recognitionThreshold: number;
  onResults: (results: GlyphRecognition[], minimumConfidence: number) => void;
};

const IDLE_STATE: RecognitionState = { phase: "idle", progress: 0, message: "" };

export function useRecognition({
  atlas,
  glyphs,
  candidateCharset,
  alphaThreshold,
  recognitionThreshold,
  onResults,
}: Props) {
  const [state, setState] = useState<RecognitionState>(IDLE_STATE);
  const recognizerRef = useRef<Recognizer | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    controllerRef.current?.abort();
    runRef.current += 1;
    setState(IDLE_STATE);
  }, [atlas]);

  useEffect(() => () => {
    runRef.current += 1;
    controllerRef.current?.abort();
    void recognizerRef.current?.dispose();
  }, []);

  const recognize = useCallback(async () => {
    if (!atlas || !glyphs.length) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const runId = ++runRef.current;
    const minimumConfidence = recognitionThreshold / 100;
    setState({ phase: "loading", progress: 0, message: "Loading offline OCR" });

    try {
      if (!recognizerRef.current) {
        const { createTesseractRecognizer } = await import("../lib/tesseractRecognition");
        recognizerRef.current = createTesseractRecognizer();
      }
      const run = await runRecognition(
        {
          image: atlas.pixels,
          glyphs,
          candidateCharset,
          alphaThreshold,
          minimumConfidence,
        },
        recognizerRef.current,
        createTemplateRecognizer(),
        controller.signal,
        (progress, message) => {
          if (runId !== runRef.current) return;
          setState({ phase: "running", progress, message });
        },
      );
      if (controller.signal.aborted || runId !== runRef.current) return;

      onResults(run.results, minimumConfidence);
      setState(run.fallbackUsed ? {
        phase: "error",
        progress: 1,
        message: `Offline OCR failed; template fallback used. ${run.primaryError}`,
      } : { phase: "idle", progress: 1, message: "Offline OCR complete" });
    } catch (error) {
      if (controller.signal.aborted || runId !== runRef.current) return;
      setState({
        phase: "error",
        progress: 1,
        message: error instanceof Error ? error.message : "Recognition failed",
      });
    }
  }, [alphaThreshold, atlas, candidateCharset, glyphs, onResults, recognitionThreshold]);

  return { state, recognize };
}
