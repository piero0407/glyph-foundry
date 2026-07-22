import { describe, expect, it } from "vitest";
import { defaultWork, patchWork, projectFromFnt, projectFromImage, updateProject, workFrom } from "./project";

const atlas = { name: "font.png", type: "image/png", blob: new Blob() };

describe("project model", () => {
  it("creates an image project from shared defaults", () => {
    const project = projectFromImage({ id: "one", now: 10, atlas, height: 20 });
    expect(project).toMatchObject({ id: "one", name: "font", lineHeight: 20, glyphs: [], selectedId: null });
    expect(workFrom(project)).toEqual(defaultWork("font", 20));
  });

  it("creates an imported project and keeps its mapping", () => {
    const glyph = { id: 0, char: "A", x: 0, y: 0, width: 8, height: 8, xoffset: 0, yoffset: 0, xadvance: 8 };
    const project = projectFromFnt({
      id: "two",
      now: 20,
      atlas,
      parsed: { fontName: "Imported", imageName: "font.png", imageWidth: 8, imageHeight: 8, lineHeight: 9, glyphs: [glyph] },
    });
    expect(project).toMatchObject({ name: "Imported", characterMap: "A", glyphs: [glyph], selectedId: 0 });
  });

  it("updates a project without changing its identity", () => {
    const original = projectFromImage({ id: "one", now: 10, atlas, height: 20 });
    const work = patchWork(workFrom(original), { fontName: "Changed", zoom: 4 });
    const next = updateProject(original, "Changed", [], null, work, 30);
    expect(next).toMatchObject({ id: "one", createdAt: 10, updatedAt: 30, fontName: "Changed", zoom: 4 });
  });
});
