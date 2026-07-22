import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Copy,
  Download,
  FolderOpen,
  Grid3X3,
  ImagePlus,
  Pencil,
  MousePointer2,
  Plus,
  ScanLine,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { assignCharacters, createCharacterMap, detectGlyphsWithMetrics, makeGridGlyphs } from "./lib/glyphs";
import { findDuplicateCharacters, parseFnt, serializeFnt } from "./lib/fnt";
import { layoutBitmapText } from "./lib/preview";
import { createGlyphHistory, glyphHistoryReducer } from "./lib/glyphHistory";
import { adjustBoundedValue, evaluateArithmeticExpression, horizontalDragSteps } from "./lib/arithmetic";
import { applyRecognitionResults, createTemplateRecognizer, type Recognizer } from "./lib/recognizer";
import { decodeAtlas, isAtlasFile } from "./lib/atlas";
import {
  deleteProject,
  getProject,
  listProjects,
  putProject,
  summarizeProject,
  type ProjectDocument,
  type ProjectSummary,
} from "./lib/projectStore";
import type { AtlasImage, DetectionSettings, Glyph, GridSettings, PaneSizes } from "./types";

const DEFAULT_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?-+*/:;()[]{}<>@#$%&_=\\\"'`~|^";
const CONFIRM_DESTRUCTIVE_SHAPE_DETECTION = true;
const DEFAULT_SETTINGS: DetectionSettings = { alphaThreshold: 16, padding: 1, minArea: 2, advanceAdjustment: 0 };
const DEFAULT_GRID: GridSettings = { width: 16, height: 16, offsetX: 0, offsetY: 0, gapX: 0, gapY: 0 };
const DEFAULT_PANE_SIZES: PaneSizes = { left: 280, right: 288, preview: 220 };
const DEFAULT_PREVIEW_TEXT = "The quick brown fox\n0123456789";

type NumberFieldProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  historyManaged?: boolean;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
};

type BitmapPreviewProps = {
  atlas: AtlasImage | null;
  glyphs: Glyph[];
  lineHeight: number;
  text: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
};

type PaneResizeMode = "left" | "right" | "preview";

const PANE_LIMITS = {
  left: 220,
  right: 240,
  preview: 160,
  canvas: 380,
  upperWorkspace: 280,
  splitter: 6,
};

function BitmapPreview({ atlas, glyphs, lineHeight, text, zoom, onZoomChange }: BitmapPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const preview = useMemo(() => layoutBitmapText(glyphs, lineHeight, text), [glyphs, lineHeight, text]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !atlas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#11110e";
    context.fillRect(0, 0, canvas.width, canvas.height);

    preview.lineTops.forEach((lineTop) => {
      const baseline = lineTop + preview.lineHeight;

      context.setLineDash([2, 2]);
      context.strokeStyle = "rgba(67, 216, 223, .45)";
      context.beginPath();
      context.moveTo(0, lineTop + 0.5);
      context.lineTo(canvas.width, lineTop + 0.5);
      context.stroke();

      context.setLineDash([]);
      context.strokeStyle = "rgba(249, 218, 42, .65)";
      context.beginPath();
      context.moveTo(0, baseline - 0.5);
      context.lineTo(canvas.width, baseline - 0.5);
      context.stroke();

    });

    for (const { glyph, x, y } of preview.placements) {
      context.drawImage(
        atlas.image,
        glyph.x,
        glyph.y,
        glyph.width,
        glyph.height,
        x,
        y,
        glyph.width,
        glyph.height,
      );
    }
  }, [atlas, preview]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      onZoomChange(Math.max(1, Math.min(8, zoom + (event.deltaY < 0 ? 1 : -1))));
    };
    scroll.addEventListener("wheel", handleWheel, { passive: false });
    return () => scroll.removeEventListener("wheel", handleWheel);
  }, [onZoomChange, zoom]);

  if (!atlas) return <p className="muted">Load atlas to render preview.</p>;

  return (
    <div ref={scrollRef} className="bitmap-preview-scroll">
      <canvas
        ref={canvasRef}
        className="bitmap-preview-canvas"
        width={preview.width}
        height={preview.height}
        style={{ width: preview.width * zoom, height: preview.height * zoom }}
        aria-label={`Live bitmap preview at ${zoom} times zoom: ${text}`}
        role="img"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  historyManaged = false,
  onInteractionStart,
  onInteractionEnd,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const [scrubbing, setScrubbing] = useState(false);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const wheelEndTimerRef = useRef<number | null>(null);
  const interactionActiveRef = useRef(false);
  const interactionCallbacksRef = useRef({ onInteractionStart, onInteractionEnd });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startValue: number;
    steps: number;
    active: boolean;
  } | null>(null);

  interactionCallbacksRef.current = { onInteractionStart, onInteractionEnd };

  useEffect(() => {
    const nextDraft = String(value);
    valueRef.current = value;
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, [value]);

  useEffect(() => () => {
    if (wheelEndTimerRef.current !== null) window.clearTimeout(wheelEndTimerRef.current);
    if (interactionActiveRef.current) interactionCallbacksRef.current.onInteractionEnd?.();
  }, []);

  const startInteraction = () => {
    if (interactionActiveRef.current) return;
    interactionActiveRef.current = true;
    interactionCallbacksRef.current.onInteractionStart?.();
  };

  const endInteraction = () => {
    if (!interactionActiveRef.current) return;
    interactionActiveRef.current = false;
    interactionCallbacksRef.current.onInteractionEnd?.();
  };

  const stepValue = (delta: number) => {
    const parsed = evaluateArithmeticExpression(draftRef.current);
    const current = parsed ?? valueRef.current;
    const next = adjustBoundedValue(current, delta, min, max);
    if (next === valueRef.current && draftRef.current === String(next)) return;
    draftRef.current = String(next);
    valueRef.current = next;
    setDraft(String(next));
    onChange(next);
  };

  const collapseSelection = (input: HTMLInputElement) => {
    const caret = input.value.length;
    input.setSelectionRange(caret, caret);
    window.getSelection()?.removeAllRanges();
  };

  const commit = (expression: string) => {
    const result = evaluateArithmeticExpression(expression);
    if (result === null) {
      setDraft(String(value));
      return;
    }

    const bounded = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, result));
    draftRef.current = String(bounded);
    valueRef.current = bounded;
    setDraft(String(bounded));
    if (bounded !== value) onChange(bounded);
  };

  return (
    <label className="field field--number">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        value={draft}
        className={scrubbing ? "is-scrubbing" : undefined}
        title="Enter math, scroll while focused, or drag horizontally"
        data-glyph-history={historyManaged || undefined}
        onChange={(event) => {
          draftRef.current = event.target.value;
          setDraft(event.target.value);
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
        onWheel={(event) => {
          if (document.activeElement !== event.currentTarget || event.deltaY === 0) return;
          event.preventDefault();
          startInteraction();
          stepValue(event.deltaY < 0 ? 1 : -1);
          if (wheelEndTimerRef.current !== null) window.clearTimeout(wheelEndTimerRef.current);
          wheelEndTimerRef.current = window.setTimeout(() => {
            wheelEndTimerRef.current = null;
            endInteraction();
          }, 150);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const startValue = evaluateArithmeticExpression(draftRef.current) ?? valueRef.current;
          dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startValue, steps: 0, active: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const steps = horizontalDragSteps(event.clientX - drag.startX);
          if (steps === drag.steps) return;
          event.preventDefault();
          if (!drag.active) {
            drag.active = true;
            setScrubbing(true);
            startInteraction();
          }
          collapseSelection(event.currentTarget);
          drag.steps = steps;
          const next = adjustBoundedValue(drag.startValue, steps, min, max);
          const previous = valueRef.current;
          const nextDraft = String(next);
          draftRef.current = nextDraft;
          valueRef.current = next;
          setDraft(nextDraft);
          if (next !== previous) onChange(next);
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          if (drag.active) {
            event.preventDefault();
            collapseSelection(event.currentTarget);
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          dragRef.current = null;
          if (drag.active) {
            setScrubbing(false);
            endInteraction();
          }
        }}
        onPointerCancel={() => {
          const wasActive = dragRef.current?.active;
          dragRef.current = null;
          if (wasActive) {
            setScrubbing(false);
            endInteraction();
          }
        }}
        onSelect={(event) => {
          if (dragRef.current?.active) collapseSelection(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            startInteraction();
            stepValue(event.key === "ArrowUp" ? 1 : -1);
            endInteraction();
          }
          if (event.key === "Enter") commit(event.currentTarget.value);
          if (event.key === "Escape") setDraft(String(value));
        }}
      />
    </label>
  );
}

function App() {
  const [atlas, setAtlas] = useState<AtlasImage | null>(null);
  const [atlasBlob, setAtlasBlob] = useState<Blob | null>(null);
  const [glyphHistory, dispatchGlyphHistory] = useReducer(glyphHistoryReducer, undefined, () => createGlyphHistory());
  const { glyphs, selectedId } = glyphHistory.present;
  const [zoom, setZoom] = useState(1);
  const [settings, setSettings] = useState<DetectionSettings>(DEFAULT_SETTINGS);
  const [grid, setGrid] = useState<GridSettings>(DEFAULT_GRID);
  const [candidateCharset, setCandidateCharset] = useState(DEFAULT_CHARSET);
  const [characterMap, setCharacterMap] = useState(DEFAULT_CHARSET);
  const [recognitionThreshold, setRecognitionThreshold] = useState(99);
  const [recognitionState, setRecognitionState] = useState<{
    phase: "idle" | "loading" | "running" | "error";
    progress: number;
    message: string;
  }>({ phase: "idle", progress: 0, message: "" });
  const [fontName, setFontName] = useState("Pixel Font");
  const [lineHeight, setLineHeight] = useState(16);
  const [previewText, setPreviewText] = useState(DEFAULT_PREVIEW_TEXT);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [paneSizes, setPaneSizes] = useState<PaneSizes>(DEFAULT_PANE_SIZES);
  const [resizingPane, setResizingPane] = useState<PaneResizeMode | null>(null);
  const [pixel, setPixel] = useState<{ x: number; y: number; rgba: number[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState("");
  const [activeProjectCreatedAt, setActiveProjectCreatedAt] = useState(0);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [storageMessage, setStorageMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const glyphCharacterInputRef = useRef<HTMLInputElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const atlasUrl = useRef<string | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);
  const recognitionControllerRef = useRef<AbortController | null>(null);
  const recognitionRunRef = useRef(0);
  const bootStartedRef = useRef(false);
  const persistenceRequestedRef = useRef(false);
  const dragRef = useRef<{
    id: number;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    glyph: Glyph;
  } | null>(null);

  const selected = glyphs.find((glyph) => glyph.id === selectedId) ?? null;
  const duplicateCharacters = useMemo(() => findDuplicateCharacters(glyphs), [glyphs]);
  const fntPreview = useMemo(
    () => atlas && !duplicateCharacters.length
      ? serializeFnt(fontName, atlas.name, atlas.width, atlas.height, lineHeight, glyphs)
      : "",
    [atlas, duplicateCharacters.length, fontName, lineHeight, glyphs],
  );

  const applyAtlas = useCallback((nextAtlas: AtlasImage, url: string, blob: Blob) => {
    recognitionRunRef.current += 1;
    recognitionControllerRef.current?.abort();
    if (atlasUrl.current) URL.revokeObjectURL(atlasUrl.current);
    atlasUrl.current = url;
    setAtlas(nextAtlas);
    setAtlasBlob(blob);
  }, []);

  const applyProjectStateOnly = useCallback(async (project: ProjectDocument) => {
    setActiveProjectId(project.id);
    setActiveProjectName(project.name);
    setActiveProjectCreatedAt(project.createdAt);
    dispatchGlyphHistory({ type: "reset", glyphs: project.glyphs, selectedId: project.selectedId });
    setZoom(project.zoom);
    setSettings(project.settings);
    setGrid(project.grid);
    setCandidateCharset(project.candidateCharset);
    setCharacterMap(project.characterMap);
    setRecognitionThreshold(project.recognitionThreshold);
    setFontName(project.fontName);
    setLineHeight(project.lineHeight);
    setPreviewText(project.previewText);
    setPreviewZoom(project.previewZoom);
    setPaneSizes(project.paneSizes);
    setRecognitionState({ phase: "idle", progress: 0, message: "" });
    setSaveState("saved");
    setStorageMessage("");
    setStorageReady(true);
  }, []);

  const applyProject = useCallback(async (project: ProjectDocument) => {
    setStorageReady(false);
    const decoded = await decodeAtlas(project.atlas.blob, project.atlas.name);
    applyAtlas(decoded.atlas, decoded.url, project.atlas.blob);
    await applyProjectStateOnly(project);
  }, [applyAtlas, applyProjectStateOnly]);

  const createProjectFromImage = useCallback(async (file: File) => {
    if (!isAtlasFile(file)) return;
    setStorageReady(false);
    try {
      const decoded = await decodeAtlas(file, file.name);
      const now = Date.now();
      const project: ProjectDocument = {
        schemaVersion: 1,
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ""),
        createdAt: now,
        updatedAt: now,
        atlas: { name: file.name, type: file.type || "application/octet-stream", blob: file },
        glyphs: [],
        selectedId: null,
        zoom: 1,
        settings: { ...DEFAULT_SETTINGS },
        grid: { ...DEFAULT_GRID },
        candidateCharset: DEFAULT_CHARSET,
        characterMap: DEFAULT_CHARSET,
        recognitionThreshold: 99,
        fontName: file.name.replace(/\.[^.]+$/, ""),
        lineHeight: Math.min(32, decoded.atlas.height),
        previewText: DEFAULT_PREVIEW_TEXT,
        previewZoom: 1,
        paneSizes: { ...DEFAULT_PANE_SIZES },
      };
      await putProject(project);
      applyAtlas(decoded.atlas, decoded.url, file);
      await applyProjectStateOnly(project);
      setProjects((current) => [summarizeProject(project), ...current.filter(({ id }) => id !== project.id)]);
      setProjectsOpen(false);
    } catch (error) {
      setStorageReady(true);
      setStorageMessage(error instanceof Error ? error.message : "Could not create project.");
      setSaveState("error");
    }
  }, [applyAtlas, applyProjectStateOnly]);

  const buildCurrentProject = useCallback((): ProjectDocument | null => {
    if (!activeProjectId || !atlas || !atlasBlob) return null;
    return {
      schemaVersion: 1,
      id: activeProjectId,
      name: activeProjectName || fontName || "Untitled project",
      createdAt: activeProjectCreatedAt || Date.now(),
      updatedAt: Date.now(),
      atlas: { name: atlas.name, type: atlasBlob.type || "application/octet-stream", blob: atlasBlob },
      glyphs,
      selectedId,
      zoom,
      settings,
      grid,
      candidateCharset,
      characterMap,
      recognitionThreshold,
      fontName,
      lineHeight,
      previewText,
      previewZoom,
      paneSizes,
    };
  }, [activeProjectCreatedAt, activeProjectId, activeProjectName, atlas, atlasBlob, candidateCharset, characterMap, fontName, glyphs, grid, lineHeight, paneSizes, previewText, previewZoom, recognitionThreshold, selectedId, settings, zoom]);

  const saveCurrentProject = useCallback(async () => {
    const project = buildCurrentProject();
    if (!project) return true;
    setSaveState("saving");
    try {
      await putProject(project);
      setProjects((current) => [summarizeProject(project), ...current.filter(({ id }) => id !== project.id)]);
      setSaveState("saved");
      setStorageMessage("");
      if (!persistenceRequestedRef.current && navigator.storage?.persist) {
        persistenceRequestedRef.current = true;
        void navigator.storage.persist();
      }
      return true;
    } catch (error) {
      setSaveState("error");
      setStorageMessage(error instanceof Error ? error.message : "Local save failed.");
      return false;
    }
  }, [buildCurrentProject]);

  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;
    void (async () => {
      try {
        const storedProjects = await listProjects();
        setProjects(storedProjects);
        if (storedProjects[0]) {
          const project = await getProject(storedProjects[0].id);
          if (project) await applyProject(project);
        } else {
          setStorageReady(true);
        }
      } catch (error) {
        setStorageReady(true);
        setSaveState("error");
        setStorageMessage(error instanceof Error ? error.message : "Could not load local projects.");
      }
    })();
  }, [applyProject]);

  useEffect(() => {
    if (!storageReady || !activeProjectId || !atlasBlob) return;
    const timer = window.setTimeout(() => void saveCurrentProject(), 500);
    return () => window.clearTimeout(timer);
  }, [activeProjectId, atlasBlob, saveCurrentProject, storageReady]);

  useEffect(() => {
    const checkpoint = () => {
      if (document.visibilityState === "hidden" && storageReady) void saveCurrentProject();
    };
    document.addEventListener("visibilitychange", checkpoint);
    return () => document.removeEventListener("visibilitychange", checkpoint);
  }, [saveCurrentProject, storageReady]);

  useEffect(() => () => {
    if (atlasUrl.current) URL.revokeObjectURL(atlasUrl.current);
    recognitionRunRef.current += 1;
    recognitionControllerRef.current?.abort();
    void recognizerRef.current?.dispose();
  }, []);

  useEffect(() => {
    const scroll = canvasScrollRef.current;
    if (!scroll) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((value) => Math.max(1, Math.min(16, value + (event.deltaY < 0 ? 1 : -1))));
    };
    scroll.addEventListener("wheel", handleWheel, { passive: false });
    return () => scroll.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const isUndo = key === "z" && !event.shiftKey;
      const isRedo = key === "y" || (key === "z" && event.shiftKey);
      if (!isUndo && !isRedo) return;

      const target = event.target as HTMLElement | null;
      const isEditable = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || Boolean(target?.isContentEditable);
      if (isEditable && !target?.closest("[data-glyph-history='true']")) return;

      event.preventDefault();
      dispatchGlyphHistory({ type: isUndo ? "undo" : "redo" });
    };

    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, []);

  const detectShapes = () => {
    if (!atlas) return;
    if (CONFIRM_DESTRUCTIVE_SHAPE_DETECTION && !window.confirm(
      "Detecting shapes replaces every current cell and discards manual cell edits. Continue?",
    )) return;
    const detection = detectGlyphsWithMetrics(atlas.pixels, settings);
    const found = assignCharacters(detection.glyphs, characterMap);
    dispatchGlyphHistory({ type: "replace", glyphs: found, selectedId: found[0]?.id ?? null });
    if (detection.lineHeight > 0) setLineHeight(detection.lineHeight);
  };

  const recognizeSymbols = async () => {
    if (!atlas || !glyphs.length) return;
    recognitionControllerRef.current?.abort();
    const controller = new AbortController();
    recognitionControllerRef.current = controller;
    const runId = ++recognitionRunRef.current;
    const request = {
      image: atlas.pixels,
      glyphs,
      candidateCharset,
      alphaThreshold: settings.alphaThreshold,
      minimumConfidence: recognitionThreshold / 100,
    };
    setRecognitionState({ phase: "loading", progress: 0, message: "Loading offline OCR" });

    try {
      if (!recognizerRef.current) {
        const { createTesseractRecognizer } = await import("./lib/tesseractRecognition");
        recognizerRef.current = createTesseractRecognizer();
      }
      const results = await recognizerRef.current.recognize(request, controller.signal, (progress, message) => {
        if (runId !== recognitionRunRef.current) return;
        setRecognitionState({ phase: "running", progress, message });
      });
      if (controller.signal.aborted || runId !== recognitionRunRef.current) return;
      const found = applyRecognitionResults(glyphs, results, recognitionThreshold / 100);
      setCharacterMap(createCharacterMap(found));
      dispatchGlyphHistory({ type: "replace", glyphs: found, selectedId: found[0]?.id ?? null });
      setRecognitionState({ phase: "idle", progress: 1, message: "Offline OCR complete" });
    } catch (error) {
      if (controller.signal.aborted || runId !== recognitionRunRef.current) return;
      const fallback = createTemplateRecognizer();
      const results = await fallback.recognize(request, controller.signal, () => {});
      const found = applyRecognitionResults(glyphs, results, recognitionThreshold / 100);
      setCharacterMap(createCharacterMap(found));
      dispatchGlyphHistory({ type: "replace", glyphs: found, selectedId: found[0]?.id ?? null });
      setRecognitionState({
        phase: "error",
        progress: 1,
        message: `Offline OCR failed; template fallback used. ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  };

  const applyGrid = () => {
    if (!atlas) return;
    const found = assignCharacters(
      makeGridGlyphs(atlas.width, atlas.height, grid.width, grid.height, grid.offsetX, grid.offsetY, grid.gapX, grid.gapY),
      characterMap,
    );
    dispatchGlyphHistory({ type: "replace", glyphs: found, selectedId: found[0]?.id ?? null });
  };

  const updateGlyph = (id: number, patch: Partial<Glyph>) => {
    dispatchGlyphHistory({ type: "update", id, patch });
  };

  const addCell = () => {
    if (!atlas) return;
    const width = Math.min(grid.width, atlas.width);
    const height = Math.min(grid.height, atlas.height);
    const id = glyphs.reduce((highest, glyph) => Math.max(highest, glyph.id), -1) + 1;
    dispatchGlyphHistory({
      type: "add",
      glyph: {
        id,
        char: "",
        x: Math.min(grid.offsetX, atlas.width - width),
        y: Math.min(grid.offsetY, atlas.height - height),
        width,
        height,
        xoffset: 0,
        yoffset: 0,
        xadvance: width,
      },
    });
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const active = dragRef.current;
      if (!active || !atlas) return;
      const dx = Math.round((event.clientX - active.startX) / zoom);
      const dy = Math.round((event.clientY - active.startY) / zoom);
      if (active.mode === "move") {
        updateGlyph(active.id, {
          x: Math.max(0, Math.min(atlas.width - active.glyph.width, active.glyph.x + dx)),
          y: Math.max(0, Math.min(atlas.height - active.glyph.height, active.glyph.y + dy)),
        });
      } else {
        updateGlyph(active.id, {
          width: Math.max(1, Math.min(atlas.width - active.glyph.x, active.glyph.width + dx)),
          height: Math.max(1, Math.min(atlas.height - active.glyph.y, active.glyph.height + dy)),
        });
      }
    };
    const up = () => {
      dragRef.current = null;
      setDragging(false);
      dispatchGlyphHistory({ type: "endTransaction" });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [atlas, dragging, zoom]);

  useEffect(() => {
    if (!resizingPane) return;

    const move = (event: PointerEvent) => {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      const rect = workspace.getBoundingClientRect();

      setPaneSizes((current) => {
        if (resizingPane === "left") {
          const max = Math.max(PANE_LIMITS.left, rect.width - current.right - PANE_LIMITS.canvas - PANE_LIMITS.splitter * 2);
          return { ...current, left: Math.max(PANE_LIMITS.left, Math.min(max, event.clientX - rect.left)) };
        }
        if (resizingPane === "right") {
          const max = Math.max(PANE_LIMITS.right, rect.width - current.left - PANE_LIMITS.canvas - PANE_LIMITS.splitter * 2);
          return { ...current, right: Math.max(PANE_LIMITS.right, Math.min(max, rect.right - event.clientX)) };
        }
        const max = Math.max(PANE_LIMITS.preview, rect.height - PANE_LIMITS.upperWorkspace - PANE_LIMITS.splitter);
        return { ...current, preview: Math.max(PANE_LIMITS.preview, Math.min(max, rect.bottom - event.clientY)) };
      });
    };
    const up = () => setResizingPane(null);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [resizingPane]);

  const resizePaneByKeyboard = (event: React.KeyboardEvent, pane: PaneResizeMode) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const rect = workspace.getBoundingClientRect();
    let delta = 0;

    if (pane === "left" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      delta = event.key === "ArrowLeft" ? -16 : 16;
    } else if (pane === "right" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      delta = event.key === "ArrowLeft" ? 16 : -16;
    } else if (pane === "preview" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      delta = event.key === "ArrowUp" ? 16 : -16;
    } else {
      return;
    }

    event.preventDefault();
    setPaneSizes((current) => {
      if (pane === "left") {
        const max = Math.max(PANE_LIMITS.left, rect.width - current.right - PANE_LIMITS.canvas - PANE_LIMITS.splitter * 2);
        return { ...current, left: Math.max(PANE_LIMITS.left, Math.min(max, current.left + delta)) };
      }
      if (pane === "right") {
        const max = Math.max(PANE_LIMITS.right, rect.width - current.left - PANE_LIMITS.canvas - PANE_LIMITS.splitter * 2);
        return { ...current, right: Math.max(PANE_LIMITS.right, Math.min(max, current.right + delta)) };
      }
      const max = Math.max(PANE_LIMITS.preview, rect.height - PANE_LIMITS.upperWorkspace - PANE_LIMITS.splitter);
      return { ...current, preview: Math.max(PANE_LIMITS.preview, Math.min(max, current.preview + delta)) };
    });
  };

  const startDrag = (event: React.PointerEvent, glyph: Glyph, mode: "move" | "resize") => {
    event.preventDefault();
    event.stopPropagation();
    if (selectedId !== glyph.id) {
      dispatchGlyphHistory({ type: "select", selectedId: glyph.id });
      requestAnimationFrame(() => {
        glyphCharacterInputRef.current?.focus();
        glyphCharacterInputRef.current?.select();
      });
      return;
    }
    dispatchGlyphHistory({ type: "beginTransaction" });
    dragRef.current = { id: glyph.id, mode, startX: event.clientX, startY: event.clientY, glyph };
    setDragging(true);
  };

  const inspectPixel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!atlas || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / zoom);
    const y = Math.floor((event.clientY - rect.top) / zoom);
    if (x < 0 || y < 0 || x >= atlas.width || y >= atlas.height) return;
    const index = (y * atlas.width + x) * 4;
    setPixel({ x, y, rgba: Array.from(atlas.pixels.data.slice(index, index + 4)) });
  };

  const startProjectFromImage = async (file: File) => {
    if (storageReady && activeProjectId) {
      const saved = await saveCurrentProject();
      if (!saved && !window.confirm("Latest changes could not be saved. Create a new project anyway?")) return;
    }
    await createProjectFromImage(file);
  };

  const importFntAndAtlas = async (files: File[]) => {
    const fntFile = files.find((file) => /\.fnt$/i.test(file.name));
    const imageFile = files.find(isAtlasFile);
    if (!fntFile || !imageFile) {
      setStorageMessage("Choose one .fnt file and one PNG or WebP atlas.");
      setSaveState("error");
      return;
    }
    if (storageReady && activeProjectId) {
      const saved = await saveCurrentProject();
      if (!saved && !window.confirm("Latest changes could not be saved. Import a new project anyway?")) return;
    }
    setStorageReady(false);
    try {
      const parsed = parseFnt(await fntFile.text());
      const expectedImageName = parsed.imageName.split(/[\\/]/).pop()?.toLowerCase();
      if (expectedImageName !== imageFile.name.toLowerCase()) {
        throw new Error(`BMFont expects ${parsed.imageName}, but ${imageFile.name} was selected.`);
      }
      const decoded = await decodeAtlas(imageFile, imageFile.name);
      if (decoded.atlas.width !== parsed.imageWidth || decoded.atlas.height !== parsed.imageHeight) {
        URL.revokeObjectURL(decoded.url);
        throw new Error(`Atlas is ${decoded.atlas.width}×${decoded.atlas.height}; BMFont expects ${parsed.imageWidth}×${parsed.imageHeight}.`);
      }
      const invalidGlyph = parsed.glyphs.find((glyph) => glyph.x + glyph.width > decoded.atlas.width || glyph.y + glyph.height > decoded.atlas.height);
      if (invalidGlyph) {
        URL.revokeObjectURL(decoded.url);
        throw new Error(`Character ${invalidGlyph.char} extends outside the atlas.`);
      }
      const now = Date.now();
      const project: ProjectDocument = {
        schemaVersion: 1,
        id: crypto.randomUUID(),
        name: parsed.fontName,
        createdAt: now,
        updatedAt: now,
        atlas: { name: imageFile.name, type: imageFile.type || "application/octet-stream", blob: imageFile },
        glyphs: parsed.glyphs,
        selectedId: parsed.glyphs[0]?.id ?? null,
        zoom: 1,
        settings: { ...DEFAULT_SETTINGS },
        grid: { ...DEFAULT_GRID },
        candidateCharset: DEFAULT_CHARSET,
        characterMap: createCharacterMap(parsed.glyphs),
        recognitionThreshold: 99,
        fontName: parsed.fontName,
        lineHeight: parsed.lineHeight,
        previewText: DEFAULT_PREVIEW_TEXT,
        previewZoom: 1,
        paneSizes: { ...DEFAULT_PANE_SIZES },
      };
      await putProject(project);
      applyAtlas(decoded.atlas, decoded.url, imageFile);
      await applyProjectStateOnly(project);
      setProjects((current) => [summarizeProject(project), ...current.filter(({ id }) => id !== project.id)]);
      setProjectsOpen(false);
    } catch (error) {
      setStorageReady(true);
      setStorageMessage(error instanceof Error ? error.message : "Could not import BMFont project.");
      setSaveState("error");
    }
  };

  const openStoredProject = async (id: string) => {
    if (id === activeProjectId) {
      setProjectsOpen(false);
      return;
    }
    try {
      if (storageReady && activeProjectId) {
        const saved = await saveCurrentProject();
        if (!saved && !window.confirm("Latest changes could not be saved. Switch projects anyway?")) return;
      }
      const project = await getProject(id);
      if (!project) throw new Error("Project no longer exists.");
      await applyProject(project);
      setProjectsOpen(false);
    } catch (error) {
      setStorageReady(true);
      setSaveState("error");
      setStorageMessage(error instanceof Error ? error.message : "Could not open project.");
    }
  };

  const renameStoredProject = async (summary: ProjectSummary) => {
    const name = window.prompt("Project name", summary.name)?.trim();
    if (!name || name === summary.name) return;
    try {
      const project = summary.id === activeProjectId ? buildCurrentProject() : await getProject(summary.id);
      if (!project) throw new Error("Project no longer exists.");
      const renamed = { ...project, name, updatedAt: Date.now() };
      await putProject(renamed);
      if (summary.id === activeProjectId) setActiveProjectName(name);
      setProjects((current) => [summarizeProject(renamed), ...current.filter(({ id }) => id !== renamed.id)]);
    } catch (error) {
      setSaveState("error");
      setStorageMessage(error instanceof Error ? error.message : "Could not rename project.");
    }
  };

  const duplicateStoredProject = async (summary: ProjectSummary) => {
    try {
      const source = summary.id === activeProjectId ? buildCurrentProject() : await getProject(summary.id);
      if (!source) throw new Error("Project no longer exists.");
      const now = Date.now();
      const copy: ProjectDocument = { ...source, id: crypto.randomUUID(), name: `${source.name} copy`, createdAt: now, updatedAt: now };
      await putProject(copy);
      setProjects((current) => [summarizeProject(copy), ...current]);
      await applyProject(copy);
      setProjectsOpen(false);
    } catch (error) {
      setSaveState("error");
      setStorageMessage(error instanceof Error ? error.message : "Could not duplicate project.");
    }
  };

  const clearWorkspace = () => {
    if (atlasUrl.current) URL.revokeObjectURL(atlasUrl.current);
    atlasUrl.current = null;
    setAtlas(null);
    setAtlasBlob(null);
    setActiveProjectId(null);
    setActiveProjectName("");
    setActiveProjectCreatedAt(0);
    dispatchGlyphHistory({ type: "reset" });
    setZoom(1);
    setSettings({ ...DEFAULT_SETTINGS });
    setGrid({ ...DEFAULT_GRID });
    setCandidateCharset(DEFAULT_CHARSET);
    setCharacterMap(DEFAULT_CHARSET);
    setRecognitionThreshold(99);
    setFontName("Pixel Font");
    setLineHeight(16);
    setPreviewText(DEFAULT_PREVIEW_TEXT);
    setPreviewZoom(1);
    setPaneSizes({ ...DEFAULT_PANE_SIZES });
    setStorageReady(true);
    setSaveState("idle");
  };

  const removeStoredProject = async (summary: ProjectSummary) => {
    if (!window.confirm(`Delete local project "${summary.name}"? This cannot be undone.`)) return;
    try {
      await deleteProject(summary.id);
      const remaining = projects.filter(({ id }) => id !== summary.id);
      setProjects(remaining);
      if (summary.id === activeProjectId) {
        setStorageReady(false);
        if (remaining[0]) {
          const nextProject = await getProject(remaining[0].id);
          if (nextProject) await applyProject(nextProject);
          else clearWorkspace();
        } else clearWorkspace();
      }
    } catch (error) {
      setSaveState("error");
      setStorageMessage(error instanceof Error ? error.message : "Could not delete project.");
    }
  };

  const exportFnt = () => {
    if (!atlas) return;
    const url = URL.createObjectURL(new Blob([fntPreview], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fontName.trim().replace(/\s+/g, "-").toLowerCase() || "font"}.fnt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportAtlas = () => {
    if (!atlas || !atlasBlob) return;
    const url = URL.createObjectURL(atlasBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = atlas.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const mappedCount = glyphs.filter((glyph) => glyph.char).length;
  const reviewGlyphs = glyphs.filter((glyph) =>
    glyph.groupingStatus === "ambiguous"
    || (glyph.recognitionStatus && glyph.recognitionStatus !== "matched"),
  );
  const selectNextReviewGlyph = () => {
    if (!reviewGlyphs.length) return;
    const currentIndex = reviewGlyphs.findIndex(({ id }) => id === selectedId);
    const next = reviewGlyphs[(currentIndex + 1) % reviewGlyphs.length];
    dispatchGlyphHistory({ type: "select", selectedId: next.id });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <div><strong>GLYPH FOUNDRY</strong><small>BITMAP FONT WORKBENCH</small></div>
        </div>
        <div className="topbar-meta">
          <span className={`save-state save-state--${saveState}`}>{saveState === "error" ? storageMessage || "SAVE ERROR" : saveState.toUpperCase()}</span>
          {atlas ? <span>{activeProjectName} · {atlas.name} · {atlas.width}×{atlas.height}px</span> : <span>NO PROJECT OPEN</span>}
          <button className="button" onClick={() => setProjectsOpen(true)}><FolderOpen size={16} /> Projects</button>
          <button className="button button--primary" disabled={!atlas || mappedCount === 0 || duplicateCharacters.length > 0} onClick={exportFnt}>
            <Download size={16} /> Export .fnt
          </button>
        </div>
      </header>

      <input
        ref={importInput}
        className="sr-only"
        type="file"
        multiple
        accept=".fnt,.png,.webp,text/plain,image/png,image/webp"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void importFntAndAtlas(files);
        }}
      />

      {projectsOpen && (
        <div className="project-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProjectsOpen(false); }}>
          <section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="projects-title">
            <div className="project-dialog-header">
              <div><span className="eyebrow">LOCAL WORKSPACE</span><h2 id="projects-title">Projects</h2></div>
              <button className="icon-button" aria-label="Close projects" onClick={() => setProjectsOpen(false)}>×</button>
            </div>
            <div className="project-actions">
              <button className="button button--primary" onClick={() => fileInput.current?.click()}><Plus size={16} /> New from image</button>
              <button className="button" onClick={() => importInput.current?.click()}><Upload size={16} /> Import .fnt + image</button>
            </div>
            {storageMessage && saveState === "error" && <p className="project-error">{storageMessage}</p>}
            <div className="project-list">
              {projects.length === 0 ? <p className="project-empty">No local projects yet.</p> : projects.map((project) => (
                <article className={`project-row ${project.id === activeProjectId ? "is-active" : ""}`} key={project.id}>
                  <button className="project-open" onClick={() => void openStoredProject(project.id)}>
                    <strong>{project.name}</strong>
                    <small>{project.atlasName} · {new Date(project.updatedAt).toLocaleString()}</small>
                  </button>
                  <div className="project-row-actions">
                    <button className="icon-button" aria-label={`Rename ${project.name}`} title="Rename" onClick={() => void renameStoredProject(project)}><Pencil size={15} /></button>
                    <button className="icon-button" aria-label={`Duplicate ${project.name}`} title="Duplicate" onClick={() => void duplicateStoredProject(project)}><Copy size={15} /></button>
                    <button className="icon-button danger" aria-label={`Delete ${project.name}`} title="Delete" onClick={() => void removeStoredProject(project)}><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      <main
        ref={workspaceRef}
        className={`workspace ${resizingPane ? `is-resizing-${resizingPane}` : ""}`}
        style={{
          "--left-panel-width": `${paneSizes.left}px`,
          "--right-panel-width": `${paneSizes.right}px`,
          "--preview-panel-height": `${paneSizes.preview}px`,
        } as React.CSSProperties}
      >
        <aside className="sidebar left-panel" aria-label="Atlas controls">
          <section>
            <div className="section-title"><span>01</span><h2>Source atlas</h2></div>
            <button className="upload-card" onClick={() => fileInput.current?.click()}>
              <Upload size={22} />
              <strong>New project from image</strong>
              <small>PNG or WebP · saved locally</small>
            </button>
            <input ref={fileInput} className="sr-only" type="file" accept=".png,.webp,image/png,image/webp" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void startProjectFromImage(file);
            }} />
            <button className="button button--wide" onClick={() => importInput.current?.click()}><Upload size={16} /> Import .fnt + image</button>
          </section>

          <section>
            <div className="section-title"><span>02</span><h2>Find glyphs</h2></div>
            <div className="mode-label"><ScanLine size={15} /> Connected pixels</div>
            <div className="field-grid">
              <NumberField label="Alpha ≥" value={settings.alphaThreshold} min={1} max={255} onChange={(alphaThreshold) => setSettings({ ...settings, alphaThreshold })} />
              <NumberField label="Padding" value={settings.padding} min={0} max={32} onChange={(padding) => setSettings({ ...settings, padding })} />
              <NumberField label="Min area" value={settings.minArea} min={1} onChange={(minArea) => setSettings({ ...settings, minArea })} />
              <NumberField label="Advance adjust" value={settings.advanceAdjustment} onChange={(advanceAdjustment) => setSettings({ ...settings, advanceAdjustment })} />
            </div>
            <button className="button button--wide" disabled={!atlas} onClick={detectShapes}><ScanLine size={16} /> Detect shapes</button>

            <div className="divider"><span>OR USE GRID</span></div>
            <div className="mode-label"><Grid3X3 size={15} /> Fixed cells</div>
            <div className="field-grid">
              <NumberField label="Cell W" value={grid.width} min={1} onChange={(width) => setGrid({ ...grid, width })} />
              <NumberField label="Cell H" value={grid.height} min={1} onChange={(height) => setGrid({ ...grid, height })} />
              <NumberField label="Offset X" value={grid.offsetX} min={0} onChange={(offsetX) => setGrid({ ...grid, offsetX })} />
              <NumberField label="Offset Y" value={grid.offsetY} min={0} onChange={(offsetY) => setGrid({ ...grid, offsetY })} />
              <NumberField label="Gap X" value={grid.gapX} min={0} onChange={(gapX) => setGrid({ ...grid, gapX })} />
              <NumberField label="Gap Y" value={grid.gapY} min={0} onChange={(gapY) => setGrid({ ...grid, gapY })} />
            </div>
            <button className="button button--wide" disabled={!atlas} onClick={applyGrid}><Grid3X3 size={16} /> Build grid</button>
          </section>
        </aside>

        <div
          className="pane-splitter pane-splitter--left"
          role="separator"
          aria-label="Resize atlas controls"
          aria-orientation="vertical"
          aria-valuemin={PANE_LIMITS.left}
          aria-valuemax={1000}
          aria-valuenow={Math.round(paneSizes.left)}
          tabIndex={0}
          onPointerDown={(event) => { event.preventDefault(); setResizingPane("left"); }}
          onKeyDown={(event) => resizePaneByKeyboard(event, "left")}
        />

        <section
          className={`canvas-panel ${dragging ? "is-dragging" : ""}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const files = Array.from(event.dataTransfer.files);
            if (files.some((file) => /\.fnt$/i.test(file.name))) void importFntAndAtlas(files);
            else if (files[0]) void startProjectFromImage(files[0]);
          }}
        >
          <div className="canvas-toolbar">
            <div className="tool-status"><MousePointer2 size={15} /> Drag boxes · resize from corner</div>
            <div className="canvas-toolbar-actions">
              <button className="button button--toolbar" disabled={!atlas} onClick={addCell}><Plus size={16} /> Add cell</button>
              <div className="zoom-controls">
                <button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(1, value - 1))}><ZoomOut size={17} /></button>
                <span>{zoom * 100}%</span>
                <button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(16, value + 1))}><ZoomIn size={17} /></button>
              </div>
            </div>
          </div>
          <div ref={canvasScrollRef} className="canvas-scroll">
            {!atlas ? (
              <button className="empty-state" onClick={() => fileInput.current?.click()}>
                <span className="empty-icon"><ImagePlus size={32} /></span>
                <strong>Drop your sprite sheet here</strong>
                <small>PNG or WebP · processed in your browser</small>
              </button>
            ) : (
              <div
                className="atlas-stage"
                ref={stageRef}
                style={{ width: atlas.width * zoom, height: atlas.height * zoom }}
                onPointerMove={inspectPixel}
                onPointerLeave={() => setPixel(null)}
              >
                <img src={atlas.image.src} alt={`Bitmap atlas ${atlas.name}`} draggable={false} style={{ width: atlas.width * zoom, height: atlas.height * zoom }} />
                {glyphs.map((glyph) => (
                  <div
                    key={glyph.id}
                    className={`glyph-box ${selectedId === glyph.id ? "is-selected" : ""} ${glyph.groupingStatus === "ambiguous" || (glyph.recognitionStatus && glyph.recognitionStatus !== "matched") ? "needs-review" : ""}`}
                    style={{ left: glyph.x * zoom, top: glyph.y * zoom, width: glyph.width * zoom, height: glyph.height * zoom }}
                    onPointerDown={(event) => startDrag(event, glyph, "move")}
                  >
                    <span className="glyph-tag">{glyph.char || glyph.id + 1}</span>
                    <button aria-label={`Resize glyph ${glyph.char || glyph.id + 1}`} className="resize-handle" onPointerDown={(event) => startDrag(event, glyph, "resize")} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <footer className="canvas-footer">
            <span>{glyphs.length} BOXES · {mappedCount} MAPPED</span>
            <span>{pixel ? `X ${pixel.x}  Y ${pixel.y}  ·  RGBA ${pixel.rgba.join(", ")}` : "HOVER IMAGE TO INSPECT PIXEL"}</span>
          </footer>
        </section>


        <div
          className="pane-splitter pane-splitter--right"
          role="separator"
          aria-label="Resize glyph and export settings"
          aria-orientation="vertical"
          aria-valuemin={PANE_LIMITS.right}
          aria-valuemax={1000}
          aria-valuenow={Math.round(paneSizes.right)}
          tabIndex={0}
          onPointerDown={(event) => { event.preventDefault(); setResizingPane("right"); }}
          onKeyDown={(event) => resizePaneByKeyboard(event, "right")}
        />

        <aside className="sidebar right-panel" aria-label="Glyph and export settings">
          <section>
            <div className="section-title"><span>03</span><h2>Character map</h2></div>
            <label className="field">
              <span>Recognition candidates</span>
              <textarea value={candidateCharset} onChange={(event) => setCandidateCharset(event.target.value)} rows={3} spellCheck={false} />
            </label>
            <label className="field">
              <span>Characters, in reading order</span>
              <textarea value={characterMap} onChange={(event) => setCharacterMap(event.target.value)} rows={4} spellCheck={false} />
            </label>
            <NumberField label="Confidence ≥ %" value={recognitionThreshold} min={0} max={100} onChange={(value) => setRecognitionThreshold(Math.max(0, Math.min(100, value)))} />
            <button className="button button--wide" disabled={!atlas || !glyphs.length || recognitionState.phase === "loading" || recognitionState.phase === "running"} onClick={() => void recognizeSymbols()}><ScanLine size={16} /> {recognitionState.phase === "loading" || recognitionState.phase === "running" ? `${Math.round(recognitionState.progress * 100)}%` : "Recognize symbols"}</button>
            <p className={`muted detection-note ${recognitionState.phase === "error" ? "is-error" : ""}`}>{recognitionState.message || "Offline OCR. Existing manual character edits stay untouched."}</p>
            <button className="button button--wide" disabled={!glyphs.length} onClick={() => dispatchGlyphHistory({ type: "replace", glyphs: assignCharacters(glyphs, characterMap) })}>Apply mapping</button>
          </section>

          <section className="glyph-editor">
            <div className="section-title"><span>04</span><h2>Selected glyph</h2></div>
            {selected ? (
              <>
                <div className="glyph-heading">
                  <div className="char-input-wrap"><input ref={glyphCharacterInputRef} aria-label="Glyph character" data-glyph-history="true" maxLength={2} value={selected.char} onChange={(e) => updateGlyph(selected.id, { char: Array.from(e.target.value)[0] ?? "" })} /></div>
                  <div><strong>{selected.char ? `U+${selected.char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}` : "UNMAPPED"}</strong><small>Glyph #{selected.id + 1}{selected.matchConfidence !== undefined ? ` · ${selected.matchProvider === "tesseract-v7" ? "OCR" : "TEMPLATE"} ${Math.round(selected.matchConfidence * 100)}%` : ""}{selected.groupingStatus === "ambiguous" ? " · GROUP REVIEW" : ""}</small></div>
                  <button className="icon-button danger" aria-label="Delete selected glyph" onClick={() => dispatchGlyphHistory({ type: "delete", id: selected.id })}><Trash2 size={17} /></button>
                </div>
                {reviewGlyphs.length > 0 && <button className="button button--wide" onClick={selectNextReviewGlyph}>Next review ({reviewGlyphs.length})</button>}
                {selected.recognitionError && <p className="muted detection-note is-error">{selected.recognitionError}</p>}
                <div className="field-grid">
                  <NumberField historyManaged label="X" value={selected.x} min={0} max={atlas ? atlas.width - 1 : undefined} onChange={(x) => updateGlyph(selected.id, { x })} onInteractionStart={() => dispatchGlyphHistory({ type: "beginTransaction" })} onInteractionEnd={() => dispatchGlyphHistory({ type: "endTransaction" })} />
                  <NumberField historyManaged label="Y" value={selected.y} min={0} max={atlas ? atlas.height - 1 : undefined} onChange={(y) => updateGlyph(selected.id, { y })} onInteractionStart={() => dispatchGlyphHistory({ type: "beginTransaction" })} onInteractionEnd={() => dispatchGlyphHistory({ type: "endTransaction" })} />
                  <NumberField historyManaged label="Width" value={selected.width} min={1} onChange={(width) => updateGlyph(selected.id, { width })} onInteractionStart={() => dispatchGlyphHistory({ type: "beginTransaction" })} onInteractionEnd={() => dispatchGlyphHistory({ type: "endTransaction" })} />
                  <NumberField historyManaged label="Height" value={selected.height} min={1} onChange={(height) => updateGlyph(selected.id, { height })} onInteractionStart={() => dispatchGlyphHistory({ type: "beginTransaction" })} onInteractionEnd={() => dispatchGlyphHistory({ type: "endTransaction" })} />
                  <NumberField historyManaged label="X offset" value={selected.xoffset} onChange={(xoffset) => updateGlyph(selected.id, { xoffset })} onInteractionStart={() => dispatchGlyphHistory({ type: "beginTransaction" })} onInteractionEnd={() => dispatchGlyphHistory({ type: "endTransaction" })} />
                  <NumberField historyManaged label="Y offset" value={selected.yoffset} onChange={(yoffset) => updateGlyph(selected.id, { yoffset })} onInteractionStart={() => dispatchGlyphHistory({ type: "beginTransaction" })} onInteractionEnd={() => dispatchGlyphHistory({ type: "endTransaction" })} />
                  <NumberField historyManaged label="X advance" value={selected.xadvance} min={0} onChange={(xadvance) => updateGlyph(selected.id, { xadvance })} onInteractionStart={() => dispatchGlyphHistory({ type: "beginTransaction" })} onInteractionEnd={() => dispatchGlyphHistory({ type: "endTransaction" })} />
                </div>
              </>
            ) : <p className="muted">Select box on atlas to edit metrics.</p>}
          </section>

          <section>
            <div className="section-title"><span>05</span><h2>Font output</h2></div>
            <label className="field"><span>Font name</span><input value={fontName} onChange={(event) => setFontName(event.target.value)} /></label>
            <NumberField label="Line height" value={lineHeight} min={1} onChange={setLineHeight} />
            <div className="export-summary"><span>BMFont text</span><strong>{mappedCount} characters</strong><small>{atlas?.name ?? "No texture"}</small></div>
            {duplicateCharacters.length > 0 && <p className="muted detection-note is-error">Duplicate characters block export: {duplicateCharacters.join(" ")}</p>}
            <button className="button button--primary button--wide" disabled={!atlas || mappedCount === 0 || duplicateCharacters.length > 0} onClick={exportFnt}><Download size={16} /> Download .fnt</button>
            <button className="button button--wide" disabled={!atlasBlob} onClick={exportAtlas}><Download size={16} /> Download atlas</button>
          </section>

        </aside>


        <div
          className="pane-splitter pane-splitter--preview"
          role="separator"
          aria-label="Resize live preview"
          aria-orientation="horizontal"
          aria-valuemin={PANE_LIMITS.preview}
          aria-valuemax={1000}
          aria-valuenow={Math.round(paneSizes.preview)}
          tabIndex={0}
          onPointerDown={(event) => { event.preventDefault(); setResizingPane("preview"); }}
          onKeyDown={(event) => resizePaneByKeyboard(event, "preview")}
        />

        <section className="live-preview-panel" aria-labelledby="preview-title">
          <div className="live-preview-header">
            <div className="section-title"><span>06</span><h2 id="preview-title">Live preview</h2></div>
            <div className="preview-header-tools">
              <div className="guide-legend" aria-label="Line guide legend">
                <span className="guide-legend-item guide-legend-item--top">Line top</span>
                <span className="guide-legend-item guide-legend-item--baseline">Baseline</span>
              </div>
              <div className="zoom-controls preview-zoom-controls" aria-label="Preview zoom controls">
                <button aria-label="Zoom preview out" disabled={previewZoom === 1} onClick={() => setPreviewZoom((value) => Math.max(1, value - 1))}><ZoomOut size={17} /></button>
                <span>{previewZoom}×</span>
                <button aria-label="Zoom preview in" disabled={previewZoom === 8} onClick={() => setPreviewZoom((value) => Math.min(8, value + 1))}><ZoomIn size={17} /></button>
              </div>
            </div>
          </div>
          <label className="field preview-text-field">
            <span>Preview text</span>
            <textarea value={previewText} onChange={(event) => setPreviewText(event.target.value)} rows={2} spellCheck={false} />
          </label>
          <BitmapPreview atlas={atlas} glyphs={glyphs} lineHeight={lineHeight} text={previewText} zoom={previewZoom} onZoomChange={setPreviewZoom} />
        </section>
      </main>
    </div>
  );
}

export default App;
