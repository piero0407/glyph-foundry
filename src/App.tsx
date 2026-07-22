import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { assignCharacters, createCharacterMap, detectGlyphsWithMetrics, makeGridGlyphs } from "./lib/glyphs";
import { findDuplicateCharacters, parseFnt, serializeFnt } from "./lib/fnt";
import { createGlyphHistory, glyphHistoryReducer } from "./lib/glyphHistory";
import { applyRecognitionResults, createTemplateRecognizer, type Recognizer } from "./lib/recognizer";
import { runRecognition } from "./lib/runRecognition";
import { decodeAtlas, isAtlasFile } from "./lib/atlas";
import { SaveQueue } from "./lib/saveQueue";
import { download, downloadText } from "./lib/download";
import {
  projectStore,
  summarizeProject,
  type ProjectDocument,
  type ProjectSummary,
} from "./lib/projectStore";
import {
  defaultWork,
  patchWork,
  projectFromFnt,
  projectFromImage,
  updateProject,
  workFrom,
} from "./lib/project";
import type { AtlasImage, Glyph } from "./types";
import { Preview } from "./components/Preview";
import { Projects } from "./components/Projects";
import { AtlasPanel } from "./components/AtlasPanel";
import { AtlasView, type Pixel } from "./components/AtlasView";
import { EditPanel } from "./components/EditPanel";
import { PANE_LIMITS, usePanes } from "./hooks/usePanes";
import { useHistoryKeys } from "./hooks/useHistoryKeys";

const CONFIRM_DESTRUCTIVE_SHAPE_DETECTION = true;

function App() {
  const [atlas, setAtlas] = useState<AtlasImage | null>(null);
  const [atlasBlob, setAtlasBlob] = useState<Blob | null>(null);
  const [glyphHistory, dispatchGlyphHistory] = useReducer(glyphHistoryReducer, undefined, () => createGlyphHistory());
  useHistoryKeys(dispatchGlyphHistory);
  const { glyphs, selectedId } = glyphHistory.present;
  const [work, setWork] = useReducer(patchWork, undefined, defaultWork);
  const {
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
  } = work;
  const [recognitionState, setRecognitionState] = useState<{
    phase: "idle" | "loading" | "running" | "error";
    progress: number;
    message: string;
  }>({ phase: "idle", progress: 0, message: "" });
  const [pixel, setPixel] = useState<Pixel | null>(null);
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
  const saveRevisionRef = useRef(0);
  const saveQueueRef = useRef<SaveQueue<ProjectDocument> | null>(null);
  if (!saveQueueRef.current) {
    saveQueueRef.current = new SaveQueue((project) => projectStore.put(project));
  }
  const dragRef = useRef<{
    id: number;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    glyph: Glyph;
  } | null>(null);
  const setPaneSizes = useCallback((value: typeof paneSizes) => setWork({ paneSizes: value }), []);
  const panes = usePanes(workspaceRef, paneSizes, setPaneSizes);

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
    setWork(workFrom(project));
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
      const project = projectFromImage({
        id: crypto.randomUUID(),
        now,
        atlas: { name: file.name, type: file.type || "application/octet-stream", blob: file },
        height: decoded.atlas.height,
      });
      await projectStore.put(project);
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
    return updateProject(
      {
        id: activeProjectId,
        createdAt: activeProjectCreatedAt || Date.now(),
        atlas: { name: atlas.name, type: atlasBlob.type || "application/octet-stream", blob: atlasBlob },
      },
      activeProjectName || fontName || "Untitled project",
      glyphs,
      selectedId,
      work,
      Date.now(),
    );
  }, [activeProjectCreatedAt, activeProjectId, activeProjectName, atlas, atlasBlob, fontName, glyphs, selectedId, work]);

  const saveCurrentProject = useCallback(async () => {
    const project = buildCurrentProject();
    if (!project) return true;
    const revision = ++saveRevisionRef.current;
    setSaveState("saving");
    try {
      const saved = await saveQueueRef.current!.save(project);
      setProjects((current) => [summarizeProject(saved), ...current.filter(({ id }) => id !== saved.id)]);
      if (revision === saveRevisionRef.current) {
        setSaveState("saved");
        setStorageMessage("");
      }
      if (!persistenceRequestedRef.current && navigator.storage?.persist) {
        persistenceRequestedRef.current = true;
        void navigator.storage.persist();
      }
      return true;
    } catch (error) {
      if (revision === saveRevisionRef.current) {
        setSaveState("error");
        setStorageMessage(error instanceof Error ? error.message : "Local save failed.");
      }
      return false;
    }
  }, [buildCurrentProject]);

  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;
    void (async () => {
      try {
        const storedProjects = await projectStore.list();
        setProjects(storedProjects);
        if (storedProjects[0]) {
          const project = await projectStore.get(storedProjects[0].id);
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
      setWork({ zoom: Math.max(1, Math.min(16, zoom + (event.deltaY < 0 ? 1 : -1))) });
    };
    scroll.addEventListener("wheel", handleWheel, { passive: false });
    return () => scroll.removeEventListener("wheel", handleWheel);
  }, [zoom]);

  const detectShapes = () => {
    if (!atlas) return;
    if (CONFIRM_DESTRUCTIVE_SHAPE_DETECTION && !window.confirm(
      "Detecting shapes replaces every current cell and discards manual cell edits. Continue?",
    )) return;
    const detection = detectGlyphsWithMetrics(atlas.pixels, settings);
    const found = assignCharacters(detection.glyphs, characterMap);
    dispatchGlyphHistory({ type: "replace", glyphs: found, selectedId: found[0]?.id ?? null });
    if (detection.lineHeight > 0) setWork({ lineHeight: detection.lineHeight });
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
      const run = await runRecognition(request, recognizerRef.current, createTemplateRecognizer(), controller.signal, (progress, message) => {
        if (runId !== recognitionRunRef.current) return;
        setRecognitionState({ phase: "running", progress, message });
      });
      if (controller.signal.aborted || runId !== recognitionRunRef.current) return;
      const found = applyRecognitionResults(glyphs, run.results, recognitionThreshold / 100);
      setWork({ characterMap: createCharacterMap(found) });
      dispatchGlyphHistory({ type: "replace", glyphs: found, selectedId: found[0]?.id ?? null });
      setRecognitionState(run.fallbackUsed ? {
        phase: "error",
        progress: 1,
        message: `Offline OCR failed; template fallback used. ${run.primaryError}`,
      } : { phase: "idle", progress: 1, message: "Offline OCR complete" });
    } catch (error) {
      if (controller.signal.aborted || runId !== recognitionRunRef.current) return;
      setRecognitionState({
        phase: "error",
        progress: 1,
        message: error instanceof Error ? error.message : "Recognition failed",
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
      const project = projectFromFnt({
        id: crypto.randomUUID(),
        now,
        atlas: { name: imageFile.name, type: imageFile.type || "application/octet-stream", blob: imageFile },
        parsed,
      });
      await projectStore.put(project);
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
      const project = await projectStore.get(id);
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
      const project = summary.id === activeProjectId ? buildCurrentProject() : await projectStore.get(summary.id);
      if (!project) throw new Error("Project no longer exists.");
      const renamed = { ...project, name, updatedAt: Date.now() };
      await projectStore.put(renamed);
      if (summary.id === activeProjectId) setActiveProjectName(name);
      setProjects((current) => [summarizeProject(renamed), ...current.filter(({ id }) => id !== renamed.id)]);
    } catch (error) {
      setSaveState("error");
      setStorageMessage(error instanceof Error ? error.message : "Could not rename project.");
    }
  };

  const duplicateStoredProject = async (summary: ProjectSummary) => {
    try {
      const source = summary.id === activeProjectId ? buildCurrentProject() : await projectStore.get(summary.id);
      if (!source) throw new Error("Project no longer exists.");
      const now = Date.now();
      const copy: ProjectDocument = { ...source, id: crypto.randomUUID(), name: `${source.name} copy`, createdAt: now, updatedAt: now };
      await projectStore.put(copy);
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
    setWork(defaultWork());
    setStorageReady(true);
    setSaveState("idle");
  };

  const removeStoredProject = async (summary: ProjectSummary) => {
    if (!window.confirm(`Delete local project "${summary.name}"? This cannot be undone.`)) return;
    try {
      await projectStore.delete(summary.id);
      const remaining = projects.filter(({ id }) => id !== summary.id);
      setProjects(remaining);
      if (summary.id === activeProjectId) {
        setStorageReady(false);
        if (remaining[0]) {
          const nextProject = await projectStore.get(remaining[0].id);
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
    downloadText(fntPreview, `${fontName.trim().replace(/\s+/g, "-").toLowerCase() || "font"}.fnt`);
  };

  const exportAtlas = () => {
    if (!atlas || !atlasBlob) return;
    download(atlasBlob, atlas.name);
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
      <input ref={fileInput} className="sr-only" type="file" accept=".png,.webp,image/png,image/webp" onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void startProjectFromImage(file);
      }} />

      <Projects
        open={projectsOpen}
        projects={projects}
        activeId={activeProjectId}
        error={saveState === "error" ? storageMessage : ""}
        onClose={() => setProjectsOpen(false)}
        onNew={() => fileInput.current?.click()}
        onImport={() => importInput.current?.click()}
        onOpen={(id) => void openStoredProject(id)}
        onRename={(project) => void renameStoredProject(project)}
        onCopy={(project) => void duplicateStoredProject(project)}
        onDelete={(project) => void removeStoredProject(project)}
      />

      <main
        ref={workspaceRef}
        className={`workspace ${panes.active ? `is-resizing-${panes.active}` : ""}`}
        style={{
          "--left-panel-width": `${paneSizes.left}px`,
          "--right-panel-width": `${paneSizes.right}px`,
          "--preview-panel-height": `${paneSizes.preview}px`,
        } as React.CSSProperties}
      >
        <AtlasPanel
          hasAtlas={Boolean(atlas)}
          settings={settings}
          grid={grid}
          onSettings={(value) => setWork({ settings: value })}
          onGridChange={(value) => setWork({ grid: value })}
          onNew={() => fileInput.current?.click()}
          onImport={() => importInput.current?.click()}
          onDetect={detectShapes}
          onBuildGrid={applyGrid}
        />

        <div
          className="pane-splitter pane-splitter--left"
          role="separator"
          aria-label="Resize atlas controls"
          aria-orientation="vertical"
          aria-valuemin={PANE_LIMITS.left}
          aria-valuemax={1000}
          aria-valuenow={Math.round(paneSizes.left)}
          tabIndex={0}
          onPointerDown={(event) => { event.preventDefault(); panes.start("left"); }}
          onKeyDown={(event) => panes.onKeyDown(event, "left")}
        />

        <AtlasView
          atlas={atlas}
          glyphs={glyphs}
          selectedId={selectedId}
          zoom={zoom}
          dragging={dragging}
          pixel={pixel}
          scrollRef={canvasScrollRef}
          stageRef={stageRef}
          onFiles={(files) => {
            if (files.some((file) => /\.fnt$/i.test(file.name))) void importFntAndAtlas(files);
            else if (files[0]) void startProjectFromImage(files[0]);
          }}
          onNew={() => fileInput.current?.click()}
          onAdd={addCell}
          onZoom={(value) => setWork({ zoom: value })}
          onInspect={inspectPixel}
          onLeave={() => setPixel(null)}
          onDrag={startDrag}
        />


        <div
          className="pane-splitter pane-splitter--right"
          role="separator"
          aria-label="Resize glyph and export settings"
          aria-orientation="vertical"
          aria-valuemin={PANE_LIMITS.right}
          aria-valuemax={1000}
          aria-valuenow={Math.round(paneSizes.right)}
          tabIndex={0}
          onPointerDown={(event) => { event.preventDefault(); panes.start("right"); }}
          onKeyDown={(event) => panes.onKeyDown(event, "right")}
        />

        <EditPanel
          atlas={atlas}
          hasBlob={Boolean(atlasBlob)}
          glyphs={glyphs}
          selected={selected}
          reviewCount={reviewGlyphs.length}
          mappedCount={mappedCount}
          duplicates={duplicateCharacters}
          work={work}
          status={recognitionState}
          inputRef={glyphCharacterInputRef}
          onWork={setWork}
          onRecognize={() => void recognizeSymbols()}
          onApplyMap={() => dispatchGlyphHistory({ type: "replace", glyphs: assignCharacters(glyphs, characterMap) })}
          onGlyph={(patch) => { if (selected) updateGlyph(selected.id, patch); }}
          onDelete={() => { if (selected) dispatchGlyphHistory({ type: "delete", id: selected.id }); }}
          onNext={selectNextReviewGlyph}
          onEditStart={() => dispatchGlyphHistory({ type: "beginTransaction" })}
          onEditEnd={() => dispatchGlyphHistory({ type: "endTransaction" })}
          onExportFnt={exportFnt}
          onExportAtlas={exportAtlas}
        />


        <div
          className="pane-splitter pane-splitter--preview"
          role="separator"
          aria-label="Resize live preview"
          aria-orientation="horizontal"
          aria-valuemin={PANE_LIMITS.preview}
          aria-valuemax={1000}
          aria-valuenow={Math.round(paneSizes.preview)}
          tabIndex={0}
          onPointerDown={(event) => { event.preventDefault(); panes.start("preview"); }}
          onKeyDown={(event) => panes.onKeyDown(event, "preview")}
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
                <button aria-label="Zoom preview out" disabled={previewZoom === 1} onClick={() => setWork({ previewZoom: Math.max(1, previewZoom - 1) })}><ZoomOut size={17} /></button>
                <span>{previewZoom}×</span>
                <button aria-label="Zoom preview in" disabled={previewZoom === 8} onClick={() => setWork({ previewZoom: Math.min(8, previewZoom + 1) })}><ZoomIn size={17} /></button>
              </div>
            </div>
          </div>
          <label className="field preview-text-field">
            <span>Preview text</span>
            <textarea value={previewText} onChange={(event) => setWork({ previewText: event.target.value })} rows={2} spellCheck={false} />
          </label>
          <Preview atlas={atlas} glyphs={glyphs} lineHeight={lineHeight} text={previewText} zoom={previewZoom} onZoomChange={(value) => setWork({ previewZoom: value })} />
        </section>
      </main>
    </div>
  );
}

export default App;
