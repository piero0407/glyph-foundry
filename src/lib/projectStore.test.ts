import { describe, expect, it } from "vitest";
import { summarizeProject, summarizeValidProjects, validateProject, type ProjectDocument } from "./projectStore";

function project(): ProjectDocument {
  return {
    schemaVersion: 1,
    id: "project-1",
    name: "Test",
    createdAt: 10,
    updatedAt: 20,
    atlas: { name: "atlas.png", type: "image/png", blob: new Blob() },
    glyphs: [],
    selectedId: null,
    zoom: 1,
    settings: { alphaThreshold: 16, padding: 1, minArea: 2, advanceAdjustment: 0 },
    grid: { width: 8, height: 8, offsetX: 0, offsetY: 0, gapX: 0, gapY: 0 },
    candidateCharset: "ABC",
    characterMap: "ABC",
    recognitionThreshold: 99,
    fontName: "Test",
    lineHeight: 8,
    previewText: "ABC",
    previewZoom: 1,
    paneSizes: { left: 280, right: 288, preview: 220 },
  };
}

describe("project storage records", () => {
  it("validates and summarizes a project without carrying its atlas blob", () => {
    const value = project();
    expect(validateProject(value)).toBe(value);
    expect(summarizeProject(value)).toEqual({ id: "project-1", name: "Test", atlasName: "atlas.png", createdAt: 10, updatedAt: 20 });
  });

  it("lists valid records newest first and skips damaged ones", () => {
    const older = { ...project(), id: "older", updatedAt: 5 };
    const summaries = summarizeValidProjects([older, { ...project(), schemaVersion: 2 }, project()]);
    expect(summaries.map(({ id }) => id)).toEqual(["project-1", "older"]);
  });

  it("rejects unsupported and malformed records", () => {
    expect(() => validateProject({ ...project(), schemaVersion: 2 })).toThrow("unsupported version");
    expect(() => validateProject({ ...project(), atlas: null })).toThrow("atlas is invalid");
  });
});
