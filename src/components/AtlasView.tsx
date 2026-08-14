import type { PointerEvent, RefObject } from "react";
import { ImagePlus, MousePointer2, Plus, ZoomIn, ZoomOut } from "lucide-react";
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
};

export function AtlasView({ atlas, glyphs, selectedId, zoom, dragging, pixel, scrollRef, stageRef, onFiles, onNew, onAdd, onZoom, onInspect, onLeave, onDrag }: Props) {
  const mapped = glyphs.filter((glyph) => glyph.char).length;
  return (
    <section
      className={`canvas-panel ${dragging ? "is-dragging" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); onFiles(Array.from(event.dataTransfer.files)); }}
    >
      <div className="canvas-toolbar">
        <div className="tool-status"><MousePointer2 size={15} /> Drag boxes · resize from corner</div>
        <div className="canvas-toolbar-actions">
          <button className="button button--toolbar" disabled={!atlas} onClick={onAdd}><Plus size={16} /> Add cell</button>
          <div className="zoom-controls">
            <button aria-label="Zoom out" onClick={() => onZoom(Math.max(1, zoom - 1))}><ZoomOut size={17} /></button>
            <span>{zoom * 100}%</span>
            <button aria-label="Zoom in" onClick={() => onZoom(Math.min(16, zoom + 1))}><ZoomIn size={17} /></button>
          </div>
        </div>
      </div>
      <div ref={scrollRef} className="canvas-scroll">
        {!atlas ? (
          <button className="empty-state" onClick={onNew}>
            <span className="empty-icon"><ImagePlus size={32} /></span>
            <strong>Drop your sprite sheet here</strong>
            <small>PNG or WebP · processed in your browser</small>
          </button>
        ) : (
          <div
            className="atlas-stage"
            ref={stageRef}
            style={{ width: atlas.width * zoom, height: atlas.height * zoom }}
            onPointerMove={onInspect}
            onPointerLeave={onLeave}
          >
            <img src={atlas.image.src} alt={`Bitmap atlas ${atlas.name}`} draggable={false} style={{ width: atlas.width * zoom, height: atlas.height * zoom }} />
            {glyphs.map((glyph) => (
              <div
                key={glyph.id}
                className={`glyph-box ${selectedId === glyph.id ? "is-selected" : ""} ${glyph.groupingStatus === "ambiguous" || (glyph.recognitionStatus && glyph.recognitionStatus !== "matched") ? "needs-review" : ""}`}
                style={{ left: glyph.x * zoom, top: glyph.y * zoom, width: glyph.width * zoom, height: glyph.height * zoom }}
                onPointerDown={(event) => onDrag(event, glyph, "move")}
              >
                {selectedId === glyph.id && (
                  <span
                    aria-hidden="true"
                    className="glyph-offset-marker"
                    style={{ left: -glyph.xoffset * zoom, bottom: -glyph.yoffset * zoom }}
                  />
                )}
                <span className="glyph-tag">{glyph.char || glyph.id + 1}</span>
                <button aria-label={`Resize glyph ${glyph.char || glyph.id + 1}`} className="resize-handle" onPointerDown={(event) => onDrag(event, glyph, "resize")} />
              </div>
            ))}
          </div>
        )}
      </div>
      <footer className="canvas-footer">
        <span>{glyphs.length} BOXES · {mapped} MAPPED</span>
        <span>{pixel ? `X ${pixel.x}  Y ${pixel.y}  ·  RGBA ${pixel.rgba.join(", ")}` : "HOVER IMAGE TO INSPECT PIXEL"}</span>
      </footer>
    </section>
  );
}
