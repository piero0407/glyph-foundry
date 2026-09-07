import { useState, type PointerEvent, type RefObject } from "react";
import {
  Crosshair,
  Eye,
  Focus,
  ImagePlus,
  Maximize2,
  MousePointer2,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Tag,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { AtlasImage, Glyph } from "../types";

export type Pixel = { x: number; y: number; rgba: number[] };

type Props = {
  atlas: AtlasImage | null;
  glyphs: Glyph[];
  selectedId: number | null;
  zoom: number;
  dragging: boolean;
  pixel: Pixel | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  onFiles: (files: File[]) => void;
  onNew: () => void;
  onAdd: () => void;
  onZoom: (zoom: number) => void;
  onInspect: (event: PointerEvent<HTMLDivElement>) => void;
  onLeave: () => void;
  onDrag: (event: PointerEvent, glyph: Glyph, mode: "move" | "resize") => void;
  onSampleAtlas?: () => void;
};

export function AtlasView({
  atlas,
  glyphs,
  selectedId,
  zoom,
  dragging,
  pixel,
  scrollRef,
  stageRef,
  onFiles,
  onNew,
  onAdd,
  onZoom,
  onInspect,
  onLeave,
  onDrag,
  onSampleAtlas,
}: Props) {
  const [showLabels, setShowLabels] = useState(true);
  const [canvasBg, setCanvasBg] = useState<"dark" | "black" | "light">("dark");
  const mapped = glyphs.filter((glyph) => glyph.char).length;
  const reviewCount = glyphs.filter(
    (glyph) =>
      glyph.groupingStatus === "ambiguous" ||
      (glyph.recognitionStatus && glyph.recognitionStatus !== "matched"),
  ).length;

  const hexColor = pixel
    ? `#${pixel.rgba.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`
    : null;

  return (
    <section
      className={`canvas-viewport ${dragging ? "is-dragging" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {/* FLOATING TOP TOOLBAR */}
      <div className="canvas-header">
        <div className="canvas-header-left">
          <div className="tool-badge">
            <MousePointer2 size={13} />
            <span>Select &amp; Drag</span>
          </div>

          <button
            className="btn btn--subtle btn--sm"
            disabled={!atlas}
            onClick={onAdd}
            title="Add a new cell"
          >
            <Plus size={14} /> Add Cell
          </button>
        </div>

        <div className="canvas-header-right">
          {/* View options */}
          <div className="view-toggle-group">
            <button
              className={`icon-btn icon-btn--sm ${showLabels ? "is-active" : ""}`}
              onClick={() => setShowLabels(!showLabels)}
              title={showLabels ? "Hide Box Labels" : "Show Box Labels"}
            >
              <Tag size={14} />
            </button>
            <button
              className={`icon-btn icon-btn--sm ${canvasBg === "dark" ? "is-active" : ""}`}
              onClick={() => setCanvasBg(canvasBg === "dark" ? "black" : canvasBg === "black" ? "light" : "dark")}
              title={`Canvas Background: ${canvasBg}`}
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="zoom-bar">
            <button
              className="icon-btn icon-btn--sm"
              aria-label="Zoom out"
              disabled={zoom <= 1}
              onClick={() => onZoom(Math.max(1, zoom - 1))}
            >
              <ZoomOut size={14} />
            </button>

            <span className="zoom-value">{zoom * 100}%</span>

            <button
              className="icon-btn icon-btn--sm"
              aria-label="Zoom in"
              disabled={zoom >= 16}
              onClick={() => onZoom(Math.min(16, zoom + 1))}
            >
              <ZoomIn size={14} />
            </button>

            <button
              className="btn btn--subtle btn--xs"
              onClick={() => onZoom(1)}
              title="Reset Zoom to 100%"
            >
              1:1
            </button>
          </div>
        </div>
      </div>

      {/* CANVAS SCROLL WORKSPACE */}
      <div ref={scrollRef} className={`canvas-canvas-container bg-checkered--${canvasBg}`}>
        {!atlas ? (
          <div className="canvas-empty-state">
            <div className="empty-state-card">
              <div className="empty-state-glow" />
              <div className="empty-icon-box">
                <ImagePlus size={36} />
              </div>
              <h4>No Sprite Sheet Loaded</h4>
              <p>Drag and drop a PNG or WebP font texture here to start slicing.</p>

              <div className="empty-state-buttons">
                <button className="btn btn--primary" onClick={onNew}>
                  <ImagePlus size={15} /> Open Sprite Sheet
                </button>
                {onSampleAtlas && (
                  <button className="btn btn--outline" onClick={onSampleAtlas}>
                    <Sparkles size={15} className="text-accent" /> Try Sample Font
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div
            className="atlas-stage"
            ref={stageRef}
            style={{ width: atlas.width * zoom, height: atlas.height * zoom }}
            onPointerMove={onInspect}
            onPointerLeave={onLeave}
          >
            <img
              src={atlas.image.src}
              alt={`Bitmap atlas ${atlas.name}`}
              draggable={false}
              style={{ width: atlas.width * zoom, height: atlas.height * zoom }}
            />

            {glyphs.map((glyph) => {
              const isSelected = selectedId === glyph.id;
              const needsReview =
                glyph.groupingStatus === "ambiguous" ||
                (glyph.recognitionStatus && glyph.recognitionStatus !== "matched");

              return (
                <div
                  key={glyph.id}
                  className={`glyph-rect ${isSelected ? "is-selected" : ""} ${needsReview ? "needs-review" : ""}`}
                  style={{
                    left: glyph.x * zoom,
                    top: glyph.y * zoom,
                    width: glyph.width * zoom,
                    height: glyph.height * zoom,
                  }}
                  onPointerDown={(event) => onDrag(event, glyph, "move")}
                >
                  {/* Selected Offset Origin Marker */}
                  {isSelected && (
                    <span
                      aria-hidden="true"
                      className="glyph-offset-target"
                      style={{
                        left: -glyph.xoffset * zoom,
                        bottom: -glyph.yoffset * zoom,
                      }}
                      title={`Origin Offset (X: ${glyph.xoffset}, Y: ${glyph.yoffset})`}
                    />
                  )}

                  {/* Glyph Char/ID Label */}
                  {showLabels && (
                    <span className="glyph-label-pill">
                      {glyph.char || `#${glyph.id + 1}`}
                    </span>
                  )}

                  {/* Corner Resize Handle */}
                  <button
                    aria-label={`Resize glyph ${glyph.char || glyph.id + 1}`}
                    className="glyph-resize-corner"
                    onPointerDown={(event) => onDrag(event, glyph, "resize")}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* BOTTOM STATUS FOOTER */}
      <footer className="canvas-footer-bar">
        <div className="status-stats-group">
          <span className="status-badge">
            <strong>{glyphs.length}</strong> Glyphs
          </span>
          <span className="status-badge status-badge--success">
            <strong>{mapped}</strong> Mapped
          </span>
          {reviewCount > 0 && (
            <span className="status-badge status-badge--warning">
              <strong>{reviewCount}</strong> Needs Review
            </span>
          )}
        </div>

        <div className="status-pixel-inspector">
          {pixel ? (
            <div className="pixel-readout">
              <span
                className="color-chip"
                style={{ backgroundColor: `rgba(${pixel.rgba.join(",")})` }}
              />
              <span className="pixel-coord">X <strong>{pixel.x}</strong>, Y <strong>{pixel.y}</strong></span>
              <span className="pixel-rgba">{hexColor} (A: {Math.round((pixel.rgba[3] / 255) * 100)}%)</span>
            </div>
          ) : (
            <span className="pixel-hint">
              <Crosshair size={12} /> Hover sprite to inspect pixels
            </span>
          )}
        </div>
      </footer>
    </section>
  );
}
