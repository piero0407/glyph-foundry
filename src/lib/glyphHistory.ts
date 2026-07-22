import type { Glyph } from "../types";

export type GlyphSnapshot = {
  glyphs: Glyph[];
  selectedId: number | null;
};

export type GlyphHistory = {
  past: GlyphSnapshot[];
  present: GlyphSnapshot;
  future: GlyphSnapshot[];
  transactionStart: GlyphSnapshot | null;
};

export type GlyphHistoryAction =
  | { type: "reset"; glyphs?: Glyph[]; selectedId?: number | null }
  | { type: "replace"; glyphs: Glyph[]; selectedId?: number | null }
  | { type: "select"; selectedId: number | null }
  | { type: "update"; id: number; patch: Partial<Glyph> }
  | { type: "delete"; id: number }
  | { type: "beginTransaction" }
  | { type: "endTransaction" }
  | { type: "undo" }
  | { type: "redo" };

const HISTORY_LIMIT = 100;

export function createGlyphHistory(glyphs: Glyph[] = [], selectedId: number | null = null): GlyphHistory {
  return {
    past: [],
    present: { glyphs, selectedId },
    future: [],
    transactionStart: null,
  };
}

function commit(history: GlyphHistory, present: GlyphSnapshot): GlyphHistory {
  if (present.glyphs === history.present.glyphs && present.selectedId === history.present.selectedId) return history;
  if (history.transactionStart) return { ...history, present };

  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
    transactionStart: null,
  };
}

export function glyphHistoryReducer(history: GlyphHistory, action: GlyphHistoryAction): GlyphHistory {
  switch (action.type) {
    case "reset":
      return createGlyphHistory(action.glyphs, action.selectedId);
    case "replace":
      return commit(history, {
        glyphs: action.glyphs,
        selectedId: action.selectedId === undefined ? history.present.selectedId : action.selectedId,
      });
    case "select":
      return { ...history, present: { ...history.present, selectedId: action.selectedId } };
    case "update": {
      const glyphs = history.present.glyphs.map((glyph) => glyph.id === action.id ? {
        ...glyph,
        ...action.patch,
        ...(action.patch.char !== undefined ? {
          mappingSource: "manual" as const,
          matchConfidence: undefined,
          matchProvider: undefined,
          recognitionStatus: undefined,
          recognitionError: undefined,
        } : {}),
      } : glyph);
      return commit(history, { ...history.present, glyphs });
    }
    case "delete":
      return commit(history, {
        glyphs: history.present.glyphs.filter((glyph) => glyph.id !== action.id),
        selectedId: history.present.selectedId === action.id ? null : history.present.selectedId,
      });
    case "beginTransaction":
      return history.transactionStart ? history : { ...history, transactionStart: history.present };
    case "endTransaction": {
      const start = history.transactionStart;
      if (!start) return history;
      if (start.glyphs === history.present.glyphs && start.selectedId === history.present.selectedId) {
        return { ...history, transactionStart: null };
      }
      return {
        ...history,
        past: [...history.past, start].slice(-HISTORY_LIMIT),
        future: [],
        transactionStart: null,
      };
    }
    case "undo": {
      if (!history.past.length) return history;
      const present = history.past[history.past.length - 1];
      return {
        past: history.past.slice(0, -1),
        present,
        future: [history.present, ...history.future],
        transactionStart: null,
      };
    }
    case "redo": {
      if (!history.future.length) return history;
      const [present, ...future] = history.future;
      return {
        past: [...history.past, history.present].slice(-HISTORY_LIMIT),
        present,
        future,
        transactionStart: null,
      };
    }
  }
}
