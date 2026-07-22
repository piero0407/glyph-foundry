import type { ParsedFnt } from "./fnt";
import type { ProjectDocument } from "./projectStore";
import { createCharacterMap } from "./glyphs";
import type { DetectionSettings, GridSettings, PaneSizes } from "../types";

export const DEFAULT_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?-+*/:;()[]{}<>@#$%&_=\\\"'`~|^";
export const DEFAULT_PREVIEW_TEXT = "The quick brown fox\n0123456789";

export const DEFAULT_SETTINGS: DetectionSettings = {
  alphaThreshold: 16,
  padding: 1,
  minArea: 2,
  advanceAdjustment: 0,
};

export const DEFAULT_GRID: GridSettings = {
  width: 16,
  height: 16,
  offsetX: 0,
  offsetY: 0,
  gapX: 0,
  gapY: 0,
};

export const DEFAULT_PANES: PaneSizes = { left: 280, right: 288, preview: 220 };

export type WorkState = Pick<ProjectDocument,
  | "zoom"
  | "settings"
  | "grid"
  | "candidateCharset"
  | "characterMap"
  | "recognitionThreshold"
  | "fontName"
  | "lineHeight"
  | "previewText"
  | "previewZoom"
  | "paneSizes"
>;

export function defaultWork(fontName = "Pixel Font", lineHeight = 16): WorkState {
  return {
    zoom: 1,
    settings: { ...DEFAULT_SETTINGS },
    grid: { ...DEFAULT_GRID },
    candidateCharset: DEFAULT_CHARSET,
    characterMap: DEFAULT_CHARSET,
    recognitionThreshold: 99,
    fontName,
    lineHeight,
    previewText: DEFAULT_PREVIEW_TEXT,
    previewZoom: 1,
    paneSizes: { ...DEFAULT_PANES },
  };
}

export function workFrom(project: ProjectDocument): WorkState {
  return {
    zoom: project.zoom,
    settings: project.settings,
    grid: project.grid,
    candidateCharset: project.candidateCharset,
    characterMap: project.characterMap,
    recognitionThreshold: project.recognitionThreshold,
    fontName: project.fontName,
    lineHeight: project.lineHeight,
    previewText: project.previewText,
    previewZoom: project.previewZoom,
    paneSizes: project.paneSizes,
  };
}

export function patchWork(state: WorkState, patch: Partial<WorkState>): WorkState {
  return { ...state, ...patch };
}

type NewProject = {
  id: string;
  now: number;
  atlas: ProjectDocument["atlas"];
};

export function projectFromImage(input: NewProject & { height: number }): ProjectDocument {
  const name = input.atlas.name.replace(/\.[^.]+$/, "");
  return {
    schemaVersion: 1,
    id: input.id,
    name,
    createdAt: input.now,
    updatedAt: input.now,
    atlas: input.atlas,
    glyphs: [],
    selectedId: null,
    ...defaultWork(name, Math.min(32, input.height)),
  };
}

export function projectFromFnt(input: NewProject & { parsed: ParsedFnt }): ProjectDocument {
  const work = defaultWork(input.parsed.fontName, input.parsed.lineHeight);
  return {
    schemaVersion: 1,
    id: input.id,
    name: input.parsed.fontName,
    createdAt: input.now,
    updatedAt: input.now,
    atlas: input.atlas,
    glyphs: input.parsed.glyphs,
    selectedId: input.parsed.glyphs[0]?.id ?? null,
    ...work,
    characterMap: createCharacterMap(input.parsed.glyphs),
  };
}

export function updateProject(
  project: Pick<ProjectDocument, "id" | "createdAt" | "atlas">,
  name: string,
  glyphs: ProjectDocument["glyphs"],
  selectedId: number | null,
  work: WorkState,
  now: number,
): ProjectDocument {
  return {
    schemaVersion: 1,
    id: project.id,
    name,
    createdAt: project.createdAt,
    updatedAt: now,
    atlas: project.atlas,
    glyphs,
    selectedId,
    ...work,
  };
}
