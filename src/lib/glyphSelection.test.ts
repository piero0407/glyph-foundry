import { describe, expect, it } from "vitest";
import { commitActiveGlyphEditBeforeSelection } from "./glyphSelection";

describe("glyph selection", () => {
  it("commits the active glyph property before selecting another glyph", () => {
    const events: string[] = [];
    const activeEdit = {
      matches: (selector: string) => selector === "[data-glyph-history]",
      blur: () => events.push("commit old glyph"),
    };

    commitActiveGlyphEditBeforeSelection(activeEdit, () => events.push("select new glyph"));

    expect(events).toEqual(["commit old glyph", "select new glyph"]);
  });
});
