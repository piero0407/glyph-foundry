import { Grid3X3, ScanLine, Upload } from "lucide-react";
import type { DetectionSettings, GridSettings } from "../types";
import { NumberField } from "./NumberField";

type Props = {
  hasAtlas: boolean;
  settings: DetectionSettings;
  grid: GridSettings;
  onSettings: (settings: DetectionSettings) => void;
  onGridChange: (grid: GridSettings) => void;
  onNew: () => void;
  onImport: () => void;
  onDetect: () => void;
  onBuildGrid: () => void;
};

export function AtlasPanel({ hasAtlas, settings, grid, onSettings, onGridChange, onNew, onImport, onDetect, onBuildGrid }: Props) {
  return (
    <aside className="sidebar left-panel" aria-label="Atlas controls">
      <section>
        <div className="section-title"><span>01</span><h2>Source atlas</h2></div>
        <button className="upload-card" onClick={onNew}>
          <Upload size={22} />
          <strong>New project from image</strong>
          <small>PNG or WebP · saved locally</small>
        </button>
        <button className="button button--wide" onClick={onImport}><Upload size={16} /> Import .fnt + image</button>
      </section>

      <section>
        <div className="section-title"><span>02</span><h2>Find glyphs</h2></div>
        <div className="mode-label"><ScanLine size={15} /> Connected pixels</div>
        <div className="field-grid">
          <NumberField label="Alpha ≥" value={settings.alphaThreshold} min={1} max={255} onChange={(alphaThreshold) => onSettings({ ...settings, alphaThreshold })} />
          <NumberField label="Padding" value={settings.padding} min={0} max={32} onChange={(padding) => onSettings({ ...settings, padding })} />
          <NumberField label="Min area" value={settings.minArea} min={1} onChange={(minArea) => onSettings({ ...settings, minArea })} />
          <NumberField label="Advance adjust" value={settings.advanceAdjustment} onChange={(advanceAdjustment) => onSettings({ ...settings, advanceAdjustment })} />
        </div>
        <button className="button button--wide" disabled={!hasAtlas} onClick={onDetect}><ScanLine size={16} /> Detect shapes</button>

        <div className="divider"><span>OR USE GRID</span></div>
        <div className="mode-label"><Grid3X3 size={15} /> Fixed cells</div>
        <div className="field-grid">
          <NumberField label="Cell W" value={grid.width} min={1} onChange={(width) => onGridChange({ ...grid, width })} />
          <NumberField label="Cell H" value={grid.height} min={1} onChange={(height) => onGridChange({ ...grid, height })} />
          <NumberField label="Offset X" value={grid.offsetX} min={0} onChange={(offsetX) => onGridChange({ ...grid, offsetX })} />
          <NumberField label="Offset Y" value={grid.offsetY} min={0} onChange={(offsetY) => onGridChange({ ...grid, offsetY })} />
          <NumberField label="Gap X" value={grid.gapX} min={0} onChange={(gapX) => onGridChange({ ...grid, gapX })} />
          <NumberField label="Gap Y" value={grid.gapY} min={0} onChange={(gapY) => onGridChange({ ...grid, gapY })} />
        </div>
        <button className="button button--wide" disabled={!hasAtlas} onClick={onBuildGrid}><Grid3X3 size={16} /> Build grid</button>
      </section>
    </aside>
  );
}
