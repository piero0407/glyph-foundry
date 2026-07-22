import { useEffect, type Dispatch } from "react";
import type { GlyphHistoryAction } from "../lib/glyphHistory";

export function useHistoryKeys(dispatch: Dispatch<GlyphHistoryAction>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const undo = key === "z" && !event.shiftKey;
      const redo = key === "y" || (key === "z" && event.shiftKey);
      if (!undo && !redo) return;
      const target = event.target as HTMLElement | null;
      const editable = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || Boolean(target?.isContentEditable);
      if (editable && !target?.closest("[data-glyph-history='true']")) return;
      event.preventDefault();
      dispatch({ type: undo ? "undo" : "redo" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);
}
