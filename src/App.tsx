import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Grid3X3,
  ImagePlus,
  MousePointer2,
  ScanLine,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { assignCharacters, createCharacterMap, detectGlyphsWithMetrics, makeGridGlyphs } from "./lib/glyphs";
import { serializeFnt } from "./lib/fnt";
import { layoutBitmapText } from "./lib/preview";
import { recognizeCharacters } from "./lib/recognition";
import type { AtlasImage, DetectionSettings, Glyph } from "./types";

const DEFAULT_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?-+*/:;()[]{}<>@#$%&_=\\\"'`~|^";

type NumberFieldProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
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

function NumberField({ label, value, min, max, onChange }: NumberFieldProps) {
  return (
    <label className="field field--number">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function App() {
  const [atlas, setAtlas] = useState<AtlasImage | null>(null);
  const [glyphs, setGlyphs] = useState<Glyph[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [settings, setSettings] = useState<DetectionSettings>({
    alphaThreshold: 16,
    padding: 1,
    minArea: 2,
    advanceAdjustment: 0,
  });
  const [grid, setGrid] = useState({ width: 16, height: 16, offsetX: 0, offsetY: 0, gapX: 0, gapY: 0 });
  const [characters, setCharacters] = useState(DEFAULT_CHARSET);
  const [recognitionThreshold, setRecognitionThreshold] = useState(62);
  const [fontName, setFontName] = useState("Pixel Font");
  const [lineHeight, setLineHeight] = useState(16);
  const [previewText, setPreviewText] = useState("The quick brown fox\n0123456789");
  const [previewZoom, setPreviewZoom] = useState(1);
  const [paneSizes, setPaneSizes] = useState({ left: 280, right: 288, preview: 220 });
  const [resizingPane, setResizingPane] = useState<PaneResizeMode | null>(null);
  const [pixel, setPixel] = useState<{ x: number; y: number; rgba: number[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const atlasUrl = useRef<string | null>(null);
  const dragRef = useRef<{
    id: number;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    glyph: Glyph;
  } | null>(null);

  const selected = glyphs.find((glyph) => glyph.id === selectedId) ?? null;
  const fntPreview = useMemo(
    () => atlas ? serializeFnt(fontName, atlas.name, atlas.width, atlas.height, lineHeight, glyphs) : "",
    [atlas, fontName, lineHeight, glyphs],
  );

  const loadFile = useCallback((file: File) => {
    if (!/image\/(png|webp)/.test(file.type) && !/\.(png|webp)$/i.test(file.name)) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      if (atlasUrl.current) URL.revokeObjectURL(atlasUrl.current);
      atlasUrl.current = url;
      setAtlas({ name: file.name, width: canvas.width, height: canvas.height, image, pixels });
      setFontName(file.name.replace(/\.[^.]+$/, ""));
      setGlyphs([]);
      setSelectedId(null);
      setLineHeight(Math.min(32, canvas.height));
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  }, []);

  useEffect(() => () => {
    if (atlasUrl.current) URL.revokeObjectURL(atlasUrl.current);
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

  const detectShapes = () => {
    if (!atlas) return;
    const detection = detectGlyphsWithMetrics(atlas.pixels, settings);
    const found = assignCharacters(detection.glyphs, characters);
    setGlyphs(found);
    setSelectedId(found[0]?.id ?? null);
    if (detection.lineHeight > 0) setLineHeight(detection.lineHeight);
  };

  const recognizeSymbols = () => {
    if (!atlas || !glyphs.length) return;
    const found = recognizeCharacters(
      atlas.pixels,
      glyphs,
      characters,
      settings.alphaThreshold,
      recognitionThreshold / 100,
    );
    setCharacters(createCharacterMap(found));
    setGlyphs(found);
    setSelectedId(found[0]?.id ?? null);
  };

  const applyGrid = () => {
    if (!atlas) return;
    const found = assignCharacters(
      makeGridGlyphs(atlas.width, atlas.height, grid.width, grid.height, grid.offsetX, grid.offsetY, grid.gapX, grid.gapY),
      characters,
    );
    setGlyphs(found);
    setSelectedId(found[0]?.id ?? null);
  };

  const updateGlyph = (id: number, patch: Partial<Glyph>) => {
    setGlyphs((current) => current.map((glyph) => (glyph.id === id ? {
      ...glyph,
      ...patch,
      ...(patch.char !== undefined ? { matchConfidence: undefined } : {}),
    } : glyph)));
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
    setSelectedId(glyph.id);
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
    const url = URL.createObjectURL(new Blob([fntPreview], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fontName.trim().replace(/\s+/g, "-").toLowerCase() || "font"}.fnt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const mappedCount = glyphs.filter((glyph) => glyph.char).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <div><strong>GLYPH FOUNDRY</strong><small>BITMAP FONT WORKBENCH</small></div>
        </div>
        <div className="topbar-meta">
          {atlas ? <span>{atlas.name} · {atlas.width}×{atlas.height}px</span> : <span>NO ATLAS LOADED</span>}
          <button className="button button--primary" disabled={!atlas || mappedCount === 0} onClick={exportFnt}>
            <Download size={16} /> Export .fnt
          </button>
        </div>
      </header>

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
              <strong>Load PNG or WebP</strong>
              <small>Drop file anywhere or browse</small>
            </button>
            <input ref={fileInput} className="sr-only" type="file" accept=".png,.webp,image/png,image/webp" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
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
          onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) loadFile(file); }}
        >
          <div className="canvas-toolbar">
            <div className="tool-status"><MousePointer2 size={15} /> Drag boxes · resize from corner</div>
            <div className="zoom-controls">
              <button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(1, value - 1))}><ZoomOut size={17} /></button>
              <span>{zoom * 100}%</span>
              <button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(16, value + 1))}><ZoomIn size={17} /></button>
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
                    className={`glyph-box ${selectedId === glyph.id ? "is-selected" : ""}`}
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
              <span>Characters, in reading order</span>
              <textarea value={characters} onChange={(event) => setCharacters(event.target.value)} rows={4} spellCheck={false} />
            </label>
            <NumberField label="Confidence ≥ %" value={recognitionThreshold} min={0} max={100} onChange={(value) => setRecognitionThreshold(Math.max(0, Math.min(100, value)))} />
            <button className="button button--wide" disabled={!atlas || !glyphs.length} onClick={recognizeSymbols}><ScanLine size={16} /> Recognize symbols</button>
            <p className="muted detection-note">Rewrites map from existing boxes. Replace each � by hand, then apply mapping.</p>
            <button className="button button--wide" disabled={!glyphs.length} onClick={() => setGlyphs(assignCharacters(glyphs, characters))}>Apply mapping</button>
          </section>

          <section className="glyph-editor">
            <div className="section-title"><span>04</span><h2>Selected glyph</h2></div>
            {selected ? (
              <>
                <div className="glyph-heading">
                  <div className="char-input-wrap"><input aria-label="Glyph character" maxLength={2} value={selected.char} onChange={(e) => updateGlyph(selected.id, { char: Array.from(e.target.value)[0] ?? "" })} /></div>
                  <div><strong>{selected.char ? `U+${selected.char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}` : "UNMAPPED"}</strong><small>Glyph #{selected.id + 1}{selected.matchConfidence !== undefined ? ` · AUTO ${Math.round(selected.matchConfidence * 100)}%` : ""}</small></div>
                  <button className="icon-button danger" aria-label="Delete selected glyph" onClick={() => { setGlyphs((current) => current.filter((glyph) => glyph.id !== selected.id)); setSelectedId(null); }}><Trash2 size={17} /></button>
                </div>
                <div className="field-grid">
                  <NumberField label="X" value={selected.x} min={0} max={atlas ? atlas.width - 1 : undefined} onChange={(x) => updateGlyph(selected.id, { x })} />
                  <NumberField label="Y" value={selected.y} min={0} max={atlas ? atlas.height - 1 : undefined} onChange={(y) => updateGlyph(selected.id, { y })} />
                  <NumberField label="Width" value={selected.width} min={1} onChange={(width) => updateGlyph(selected.id, { width })} />
                  <NumberField label="Height" value={selected.height} min={1} onChange={(height) => updateGlyph(selected.id, { height })} />
                  <NumberField label="X offset" value={selected.xoffset} onChange={(xoffset) => updateGlyph(selected.id, { xoffset })} />
                  <NumberField label="Y offset" value={selected.yoffset} onChange={(yoffset) => updateGlyph(selected.id, { yoffset })} />
                  <NumberField label="X advance" value={selected.xadvance} min={0} onChange={(xadvance) => updateGlyph(selected.id, { xadvance })} />
                </div>
              </>
            ) : <p className="muted">Select box on atlas to edit metrics.</p>}
          </section>

          <section>
            <div className="section-title"><span>05</span><h2>Font output</h2></div>
            <label className="field"><span>Font name</span><input value={fontName} onChange={(event) => setFontName(event.target.value)} /></label>
            <NumberField label="Line height" value={lineHeight} min={1} onChange={setLineHeight} />
            <div className="export-summary"><span>BMFont text</span><strong>{mappedCount} characters</strong><small>{atlas?.name ?? "No texture"}</small></div>
            <button className="button button--primary button--wide" disabled={!atlas || mappedCount === 0} onClick={exportFnt}><Download size={16} /> Download .fnt</button>
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
