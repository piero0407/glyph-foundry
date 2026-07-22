import { describe, expect, it } from "vitest";
import { createGlyphHistory, glyphHistoryReducer } from "./glyphHistory";
import type { Glyph } from "../types";

const glyph = (patch: Partial<Glyph> = {}): Glyph => ({
  id: 0,
  char: "A",
  x: 1,
  y: 2,
  width: 3,
  height: 4,
  xoffset: 0,
  yoffset: 0,
  xadvance: 3,
  ...patch,
});

describe("glyph history", () => {
  it("undoes and redoes one property edit", () => {
    let history = createGlyphHistory([glyph()], 0);
    history = glyphHistoryReducer(history, { type: "update", id: 0, patch: { width: 8 } });
    history = glyphHistoryReducer(history, { type: "undo" });
    expect(history.present.glyphs[0].width).toBe(3);

    history = glyphHistoryReducer(history, { type: "redo" });
    expect(history.present.glyphs[0].width).toBe(8);
  });

  it("groups repeated drag updates into one step", () => {
    let history = createGlyphHistory([glyph()], 0);
    history = glyphHistoryReducer(history, { type: "beginTransaction" });
    history = glyphHistoryReducer(history, { type: "update", id: 0, patch: { x: 4 } });
    history = glyphHistoryReducer(history, { type: "update", id: 0, patch: { x: 9 } });
    history = glyphHistoryReducer(history, { type: "endTransaction" });

    expect(history.past).toHaveLength(1);
    history = glyphHistoryReducer(history, { type: "undo" });
    expect(history.present.glyphs[0].x).toBe(1);
  });

  it("clears redo history after a new edit", () => {
    let history = createGlyphHistory([glyph()], 0);
    history = glyphHistoryReducer(history, { type: "update", id: 0, patch: { x: 4 } });
    history = glyphHistoryReducer(history, { type: "undo" });
    history = glyphHistoryReducer(history, { type: "update", id: 0, patch: { y: 7 } });

    expect(glyphHistoryReducer(history, { type: "redo" })).toBe(history);
  });

  it("restores a deleted glyph and its selection", () => {
    let history = createGlyphHistory([glyph()], 0);
    history = glyphHistoryReducer(history, { type: "delete", id: 0 });
    expect(history.present).toEqual({ glyphs: [], selectedId: null });

    history = glyphHistoryReducer(history, { type: "undo" });
    expect(history.present.glyphs).toHaveLength(1);
    expect(history.present.selectedId).toBe(0);
  });

  it("marks direct character edits manual and clears OCR metadata", () => {
    const automatic = glyph({
      mappingSource: "recognized",
      matchProvider: "tesseract-v7",
      matchConfidence: 0.99,
      recognitionStatus: "matched",
    });
    const history = glyphHistoryReducer(createGlyphHistory([automatic], 0), {
      type: "update",
      id: 0,
      patch: { char: "B" },
    });

    expect(history.present.glyphs[0]).toMatchObject({ char: "B", mappingSource: "manual" });
    expect(history.present.glyphs[0].matchProvider).toBeUndefined();
    expect(history.present.glyphs[0].matchConfidence).toBeUndefined();
  });
});
