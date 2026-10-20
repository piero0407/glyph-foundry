import { useCallback, useMemo, useReducer } from "react";
import { assignCharacters, createCharacterMap, detectGlyphsWithMetrics, makeGridGlyphs } from "../lib/glyphs";
import { findDuplicateCharacters } from "../lib/fnt";
import { createGlyphHistory, glyphHistoryReducer } from "../lib/glyphHistory";
import { applyRecognitionResults, type GlyphRecognition } from "../lib/recognizer";
import { defaultWork, patchWork, workFrom, type WorkState } from "../lib/project";
import type { ProjectDocument } from "../lib/projectStore";
import type { AtlasImage, Glyph } from "../types";
import { useHistoryKeys } from "./useHistoryKeys";

export function useGlyphEditor() {
  const [glyphHistory, dispatchGlyphHistory] = useReducer(
    glyphHistoryReducer,
    undefined,
    () => createGlyphHistory(),
  );
  useHistoryKeys(dispatchGlyphHistory);

  const { glyphs, selectedId } = glyphHistory.present;
  const [work, setWork] = useReducer(patchWork, undefined, defaultWork);
  const selected = glyphs.find((glyph) => glyph.id === selectedId) ?? null;
  const duplicateCharacters = useMemo(() => findDuplicateCharacters(glyphs), [glyphs]);
  const mappedCount = glyphs.filter((glyph) => glyph.char).length;
  const reviewGlyphs = useMemo(
    () => glyphs.filter((glyph) =>
      glyph.groupingStatus === "ambiguous"
      || (glyph.recognitionStatus && glyph.recognitionStatus !== "matched"),
    ),
    [glyphs],
  );

  const replaceGlyphs = useCallback((nextGlyphs: Glyph[], nextSelectedId?: number | null) => {
    dispatchGlyphHistory({
      type: "replace",
      glyphs: nextGlyphs,
      selectedId: nextSelectedId === undefined ? nextGlyphs[0]?.id ?? null : nextSelectedId,
    });
  }, []);

  const updateGlyph = useCallback((id: number, patch: Partial<Glyph>) => {
    dispatchGlyphHistory({ type: "update", id, patch });
  }, []);

  const deleteGlyph = useCallback((id: number) => {
    dispatchGlyphHistory({ type: "delete", id });
  }, []);

  const selectGlyph = useCallback((id: number | null) => {
    dispatchGlyphHistory({ type: "select", selectedId: id });
  }, []);

  const beginTransaction = useCallback(() => {
    dispatchGlyphHistory({ type: "beginTransaction" });
  }, []);

  const endTransaction = useCallback(() => {
    dispatchGlyphHistory({ type: "endTransaction" });
  }, []);

  const setWorkValue = useCallback((patch: Partial<WorkState>) => {
    setWork(patch);
  }, []);

  const resetFromProject = useCallback((project: ProjectDocument) => {
    dispatchGlyphHistory({ type: "reset", glyphs: project.glyphs, selectedId: project.selectedId });
    setWork(workFrom(project));
  }, []);

  const clearWorkspace = useCallback(() => {
    dispatchGlyphHistory({ type: "reset" });
    setWork(defaultWork());
  }, []);

  const detectShapes = useCallback((atlas: AtlasImage) => {
    const detection = detectGlyphsWithMetrics(atlas.pixels, work.settings);
    replaceGlyphs(assignCharacters(detection.glyphs, work.characterMap));
    if (detection.lineHeight > 0) setWork({ lineHeight: detection.lineHeight });
  }, [replaceGlyphs, work.characterMap, work.settings]);

  const applyGrid = useCallback((atlas: AtlasImage) => {
    const { width, height, offsetX, offsetY, gapX, gapY } = work.grid;
    const found = makeGridGlyphs(atlas.width, atlas.height, width, height, offsetX, offsetY, gapX, gapY);
    replaceGlyphs(assignCharacters(found, work.characterMap));
  }, [replaceGlyphs, work.characterMap, work.grid]);

  const addCell = useCallback((atlas: AtlasImage) => {
    const width = Math.min(work.grid.width, atlas.width);
    const height = Math.min(work.grid.height, atlas.height);
    const id = glyphs.reduce((highest, glyph) => Math.max(highest, glyph.id), -1) + 1;
    dispatchGlyphHistory({
      type: "add",
      glyph: {
        id,
        char: "",
        x: Math.min(work.grid.offsetX, atlas.width - width),
        y: Math.min(work.grid.offsetY, atlas.height - height),
        width,
        height,
        xoffset: 0,
        yoffset: 0,
        xadvance: width,
      },
    });
  }, [glyphs, work.grid]);

  const applyCharacterMap = useCallback(() => {
    replaceGlyphs(assignCharacters(glyphs, work.characterMap), selectedId);
  }, [glyphs, replaceGlyphs, selectedId, work.characterMap]);

  const applyRecognition = useCallback((results: GlyphRecognition[], minimumConfidence: number) => {
    const found = applyRecognitionResults(glyphs, results, minimumConfidence);
    setWork({ characterMap: createCharacterMap(found) });
    replaceGlyphs(found);
  }, [glyphs, replaceGlyphs]);

  const selectNextReviewGlyph = useCallback(() => {
    if (!reviewGlyphs.length) return;
    const currentIndex = reviewGlyphs.findIndex(({ id }) => id === selectedId);
    const next = reviewGlyphs[(currentIndex + 1) % reviewGlyphs.length];
    selectGlyph(next.id);
  }, [reviewGlyphs, selectGlyph, selectedId]);

  return {
    glyphs,
    selectedId,
    selected,
    work,
    setWork: setWorkValue,
    duplicateCharacters,
    mappedCount,
    reviewGlyphs,
    updateGlyph,
    deleteGlyph,
    selectGlyph,
    beginTransaction,
    endTransaction,
    resetFromProject,
    clearWorkspace,
    detectShapes,
    applyGrid,
    addCell,
    applyCharacterMap,
    applyRecognition,
    selectNextReviewGlyph,
  };
}
