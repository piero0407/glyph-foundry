import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  HelpCircle,
  Type,
} from "lucide-react";
import { commitActiveGlyphEditBeforeSelection } from "./lib/glyphSelection";
import { download, downloadText } from "./lib/download";
import { serializeFnt } from "./lib/fnt";
import type { Glyph } from "./types";
import { Preview } from "./components/Preview";
import { Projects } from "./components/Projects";
import { AtlasPanel } from "./components/AtlasPanel";
import { AtlasView, type Pixel } from "./components/AtlasView";
import { EditPanel } from "./components/EditPanel";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { PANE_LIMITS, usePanes } from "./hooks/usePanes";
import { useGlyphEditor } from "./hooks/useGlyphEditor";
import { useProjectSession } from "./hooks/useProjectSession";
import { useRecognition } from "./hooks/useRecognition";

const CONFIRM_DESTRUCTIVE_SHAPE_DETECTION = true;

function App() {
  const editor = useGlyphEditor();
  const session = useProjectSession({
    current: {
      glyphs: editor.glyphs,
      selectedId: editor.selectedId,
      work: editor.work,
    },
    onProjectLoaded: editor.resetFromProject,
    onWorkspaceCleared: editor.clearWorkspace,
  });
  const recognition = useRecognition({
    atlas: session.atlas,
    glyphs: editor.glyphs,
    candidateCharset: editor.work.candidateCharset,
    alphaThreshold: editor.work.settings.alphaThreshold,
    recognitionThreshold: editor.work.recognitionThreshold,
    onResults: editor.applyRecognition,
  });

  const {
    glyphs,
    selectedId,
    selected,
    work,
    setWork,
    duplicateCharacters,
    mappedCount,
    reviewGlyphs,
    updateGlyph,
    deleteGlyph,
    selectGlyph,
    beginTransaction,
    endTransaction,
    applyCharacterMap,
    selectNextReviewGlyph,
  } = editor;
  const {
    atlas,
    atlasBlob,
    projects,
    activeProjectId,
    activeProjectName,
    saveState,
    storageMessage,
  } = session;
  const {
    zoom,
    settings,
    grid,
    fontName,
    lineHeight,
    previewText,
    previewZoom,
    paneSizes,
  } = work;
  const recognitionState = recognition.state;
  const [pixel, setPixel] = useState<Pixel | null>(null);
  const [dragging, setDragging] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const glyphCharacterInputRef = useRef<HTMLInputElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: number;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    glyph: Glyph;
  } | null>(null);
  const setPaneSizes = useCallback((value: typeof paneSizes) => setWork({ paneSizes: value }), [setWork]);
  const panes = usePanes(workspaceRef, paneSizes, setPaneSizes);

  const fntPreview = useMemo(
    () => atlas && !duplicateCharacters.length
      ? serializeFnt(fontName, atlas.name, atlas.width, atlas.height, lineHeight, glyphs)
      : "",
    [atlas, duplicateCharacters.length, fontName, lineHeight, glyphs],
  );

  const atlasInfo = useMemo(
    () => atlas ? { name: atlas.name, width: atlas.width, height: atlas.height, glyphCount: glyphs.length } : null,
    [atlas, glyphs.length],
  );

  const detectShapes = useCallback(() => {
    if (!atlas) return;
    if (CONFIRM_DESTRUCTIVE_SHAPE_DETECTION && !window.confirm(
      "Detecting shapes replaces every current cell and discards manual cell edits. Continue?",
    )) return;
    editor.detectShapes(atlas);
  }, [atlas, editor.detectShapes]);

  const applyGrid = useCallback(() => {
    if (atlas) editor.applyGrid(atlas);
  }, [atlas, editor.applyGrid]);

  const addCell = useCallback(() => {
    if (atlas) editor.addCell(atlas);
  }, [atlas, editor.addCell]);

  const deleteSelectedGlyph = useCallback(() => {
    if (selected) deleteGlyph(selected.id);
  }, [deleteGlyph, selected]);

  const recognizeSymbols = useCallback(() => {
    void recognition.recognize();
  }, [recognition.recognize]);

  const startProjectFromImage = useCallback(async (file: File) => {
    if (await session.startProjectFromImage(file)) setProjectsOpen(false);
  }, [session.startProjectFromImage]);

  const importFntAndAtlas = useCallback(async (files: File[]) => {
    if (await session.importFntAndAtlas(files)) setProjectsOpen(false);
  }, [session.importFntAndAtlas]);

  const openStoredProject = useCallback(async (id: string) => {
    if (await session.openStoredProject(id)) setProjectsOpen(false);
  }, [session.openStoredProject]);

  const duplicateStoredProject = useCallback(async (project: (typeof projects)[number]) => {
    if (await session.duplicateStoredProject(project)) setProjectsOpen(false);
  }, [session.duplicateStoredProject]);

  const renameStoredProject = useCallback((project: (typeof projects)[number]) => {
    void session.renameStoredProject(project);
  }, [session.renameStoredProject]);

  const removeStoredProject = useCallback((project: (typeof projects)[number]) => {
    void session.removeStoredProject(project);
  }, [session.removeStoredProject]);

  const loadSampleProject = useCallback(async () => {
    if (await session.loadSampleProject()) setProjectsOpen(false);
  }, [session.loadSampleProject]);

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
  }, [setWork, zoom]);

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
      endTransaction();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [atlas, dragging, endTransaction, updateGlyph, zoom]);

  const startDrag = (event: React.PointerEvent, glyph: Glyph, mode: "move" | "resize") => {
    event.preventDefault();
    event.stopPropagation();
    if (selectedId !== glyph.id) {
      commitActiveGlyphEditBeforeSelection(
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
        () => selectGlyph(glyph.id),
      );
      requestAnimationFrame(() => {
        glyphCharacterInputRef.current?.focus();
        glyphCharacterInputRef.current?.select();
      });
      return;
    }
    beginTransaction();
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

  const exportFnt = () => {
    if (!atlas) return;
    const fileName = fontName.trim().replace(/\s+/g, "-").toLowerCase() || "font";
    downloadText(fntPreview, fileName + ".fnt");
  };

  const exportAtlas = () => {
    if (!atlas || !atlasBlob) return;
    download(atlasBlob, atlas.name);
  };


  return (
    <div className="app-shell">
      {/* TOPBAR */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <div className="brand-icon">
              <Type size={16} />
            </div>
            <div className="brand-text">
              <strong>GLYPH FOUNDRY</strong>
              <small>Bitmap Font Studio</small>
            </div>
          </div>

          {atlas ? (
            <div
              className="active-project-pill"
              onClick={() => setProjectsOpen(true)}
              title="Click to manage projects"
            >
              <span className="active-project-name">{activeProjectName || fontName}</span>
              <span className="active-project-dim">{atlas.name} · {atlas.width}×{atlas.height}</span>
            </div>
          ) : (
            <div className="badge badge--neutral">No project open</div>
          )}
        </div>

        <div className="topbar-right">
          {/* Save status */}
          <div
            className={`save-status-pill ${saveState === "saved" ? "is-saved" : saveState === "saving" ? "is-saving" : saveState === "error" ? "is-error" : ""}`}
            title={storageMessage || `Status: ${saveState}`}
          >
            <span className="save-dot" />
            <span>{saveState === "error" ? "Error" : saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Idle"}</span>
          </div>

          <button
            className="icon-btn"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={() => setShortcutsOpen(true)}
          >
            <HelpCircle size={16} />
          </button>

          <button className="btn btn--subtle" onClick={() => setProjectsOpen(true)}>
            <FolderOpen size={15} /> Projects
          </button>

          <button
            className="btn btn--primary"
            disabled={!atlas || mappedCount === 0 || duplicateCharacters.length > 0}
            onClick={exportFnt}
            title={duplicateCharacters.length > 0 ? "Resolve duplicate characters first" : "Export BMFont .fnt file"}
          >
            <Download size={15} /> Export .fnt
          </button>
        </div>
      </header>

      {/* Hidden file inputs */}
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
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        accept=".png,.webp,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void startProjectFromImage(file);
        }}
      />

      {/* Projects Dialog */}
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

      {/* Shortcuts Guide Modal */}
      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {/* MAIN WORKSPACE */}
      <main
        ref={workspaceRef}
        className={`workspace ${panes.active ? `is-resizing-${panes.active}` : ""}`}
        style={{
          "--left-panel-width": `${paneSizes.left}px`,
          "--right-panel-width": `${paneSizes.right}px`,
          "--preview-panel-height": `${paneSizes.preview}px`,
        } as React.CSSProperties}
      >
        {/* LEFT PANEL */}
        <AtlasPanel
          hasAtlas={Boolean(atlas)}
          settings={settings}
          grid={grid}
          atlasInfo={atlasInfo}
          onSettings={(value) => setWork({ settings: value })}
          onGridChange={(value) => setWork({ grid: value })}
          onNew={() => fileInput.current?.click()}
          onImport={() => importInput.current?.click()}
          onSampleAtlas={loadSampleProject}
          onDetect={detectShapes}
          onBuildGrid={applyGrid}
        />

        {/* LEFT SPLITTER */}
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

        {/* CENTER VIEWPORT */}
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
          onSampleAtlas={loadSampleProject}
        />

        {/* RIGHT SPLITTER */}
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

        {/* RIGHT PANEL */}
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
          onApplyMap={applyCharacterMap}
          onGlyph={(patch) => { if (selected) updateGlyph(selected.id, patch); }}
          onDelete={deleteSelectedGlyph}
          onNext={selectNextReviewGlyph}
          onEditStart={beginTransaction}
          onEditEnd={endTransaction}
          onExportFnt={exportFnt}
          onExportAtlas={exportAtlas}
        />

        {/* PREVIEW SPLITTER */}
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

        {/* LIVE PREVIEW PANEL */}
        <section className="live-preview-panel" aria-labelledby="preview-title">
          <div className="live-preview-header">
            <div className="section-title">
              <Type size={14} className="text-accent" />
              <h3 id="preview-title">Live Bitmap Preview</h3>
            </div>
            <div className="preview-header-meta">
              <div className="guide-legend" aria-label="Line guide legend">
                <span className="guide-legend-item guide-legend-item--top">Line top</span>
                <span className="guide-legend-item guide-legend-item--baseline">Baseline</span>
              </div>
            </div>
          </div>

          <label className="field preview-text-field">
            <span>Test Text</span>
            <textarea
              value={previewText}
              onChange={(event) => setWork({ previewText: event.target.value })}
              rows={2}
              spellCheck={false}
              placeholder="Type preview text..."
            />
          </label>

          <Preview
            atlas={atlas}
            glyphs={glyphs}
            lineHeight={lineHeight}
            text={previewText}
            zoom={previewZoom}
            onTextChange={(val) => setWork({ previewText: val })}
            onZoomChange={(value) => setWork({ previewZoom: value })}
          />
        </section>
      </main>
    </div>
  );
}

export default App;
