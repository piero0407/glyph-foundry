import { useEffect, useMemo, useRef } from "react";
import { layoutBitmapText } from "../lib/preview";
import type { AtlasImage, Glyph } from "../types";

type Props = {
  atlas: AtlasImage | null;
  glyphs: Glyph[];
  lineHeight: number;
  text: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
};

export function Preview({ atlas, glyphs, lineHeight, text, zoom, onZoomChange }: Props) {
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
      if (glyph.width > 0 && glyph.height > 0) {
        context.drawImage(atlas.image, glyph.x, glyph.y, glyph.width, glyph.height, x, y, glyph.width, glyph.height);
      }
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
