import { useEffect, useMemo, useRef, useState } from "react";
import {
  Baseline,
  ChevronDown,
  Layers,
  Palette,
  Sparkles,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { layoutBitmapText } from "../lib/preview";
import type { AtlasImage, Glyph } from "../types";

type Props = {
  atlas: AtlasImage | null;
  glyphs: Glyph[];
  lineHeight: number;
  text: string;
  zoom: number;
  onTextChange?: (text: string) => void;
  onZoomChange: (zoom: number) => void;
};

const PRESETS = [
  { label: "Pangram", text: "The quick brown fox jumps over the lazy dog\n0123456789" },
  { label: "Alphabet", text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz" },
  { label: "RPG UI", text: "HERO: Level 42  HP: 980/980  MP: 320/320\n\"Let us venture forth into the dungeon!\"" },
  { label: "Symbols", text: "Score: +1,250 [100%] (Ready!) * # $ &" },
];

const PREVIEW_BG_COLORS = [
  { id: "dark", label: "Dark", bg: "#0d1017", textCol: "#ffffff" },
  { id: "black", label: "Black", bg: "#000000", textCol: "#ffffff" },
  { id: "navy", label: "Navy", bg: "#0f172a", textCol: "#ffffff" },
  { id: "light", label: "Light", bg: "#f1f5f9", textCol: "#0f172a" },
];

export function Preview({
  atlas,
  glyphs,
  lineHeight,
  text,
  zoom,
  onTextChange,
  onZoomChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [bgStyle, setBgStyle] = useState(PREVIEW_BG_COLORS[0]);

  const preview = useMemo(() => layoutBitmapText(glyphs, lineHeight, text), [glyphs, lineHeight, text]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !atlas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = bgStyle.bg;
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (showGuides) {
      preview.lineTops.forEach((lineTop) => {
        const baseline = lineTop + preview.lineHeight;

        // Line top guide
        context.setLineDash([2, 2]);
        context.strokeStyle = "rgba(99, 102, 241, 0.45)"; // Indigo
        context.beginPath();
        context.moveTo(0, lineTop + 0.5);
        context.lineTo(canvas.width, lineTop + 0.5);
        context.stroke();

        // Baseline guide
        context.setLineDash([]);
        context.strokeStyle = "rgba(244, 63, 94, 0.55)"; // Rose
        context.beginPath();
        context.moveTo(0, baseline - 0.5);
        context.lineTo(canvas.width, baseline - 0.5);
        context.stroke();
      });
    }

    for (const { glyph, x, y } of preview.placements) {
      if (glyph.width > 0 && glyph.height > 0) {
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
    }
  }, [atlas, bgStyle, preview, showGuides]);

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

  return (
    <div className="preview-container">
      {/* PREVIEW TOOLBAR */}
      <div className="preview-sub-toolbar">
        <div className="preview-presets">
          <span className="text-xs text-muted">Presets:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="preset-chip"
              onClick={() => onTextChange?.(p.text)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="preview-toolbar-controls">
          {/* Guide toggle */}
          <button
            className={`btn btn--subtle btn--xs ${showGuides ? "is-active" : ""}`}
            onClick={() => setShowGuides(!showGuides)}
            title="Toggle Baseline & Line Top Guides"
          >
            <Baseline size={13} /> {showGuides ? "Guides On" : "Guides Off"}
          </button>

          {/* BG Color pills */}
          <div className="bg-picker">
            {PREVIEW_BG_COLORS.map((col) => (
              <button
                key={col.id}
                className={`bg-chip ${bgStyle.id === col.id ? "is-selected" : ""}`}
                style={{ backgroundColor: col.bg }}
                onClick={() => setBgStyle(col)}
                title={`Preview background: ${col.label}`}
              />
            ))}
          </div>

          {/* Zoom controls */}
          <div className="zoom-bar zoom-bar--sm">
            <button
              className="icon-btn icon-btn--xs"
              aria-label="Zoom preview out"
              disabled={zoom <= 1}
              onClick={() => onZoomChange(Math.max(1, zoom - 1))}
            >
              <ZoomOut size={13} />
            </button>
            <span className="zoom-value">{zoom}×</span>
            <button
              className="icon-btn icon-btn--xs"
              aria-label="Zoom preview in"
              disabled={zoom >= 8}
              onClick={() => onZoomChange(Math.min(8, zoom + 1))}
            >
              <ZoomIn size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* CANVAS VIEW */}
      <div ref={scrollRef} className="preview-canvas-wrap">
        {!atlas ? (
          <div className="preview-placeholder">
            <Type size={24} className="text-muted" />
            <span>Load a sprite sheet to render live bitmap font preview</span>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="preview-canvas"
            width={preview.width}
            height={preview.height}
            style={{ width: preview.width * zoom, height: preview.height * zoom }}
            aria-label={`Live bitmap preview at ${zoom} times zoom: ${text}`}
            role="img"
          />
        )}
      </div>
    </div>
  );
}
