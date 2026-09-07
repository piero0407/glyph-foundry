import { useState } from "react";
import {
  FileCode,
  FolderUp,
  Grid3X3,
  Image,
  Layers,
  Play,
  ScanLine,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { DetectionSettings, GridSettings } from "../types";
import { NumberField } from "./NumberField";

type Props = {
  hasAtlas: boolean;
  settings: DetectionSettings;
  grid: GridSettings;
  atlasInfo?: { name: string; width: number; height: number; glyphCount: number } | null;
  onSettings: (settings: DetectionSettings) => void;
  onGridChange: (grid: GridSettings) => void;
  onNew: () => void;
  onImport: () => void;
  onSampleAtlas?: () => void;
  onDetect: () => void;
  onBuildGrid: () => void;
};

export function AtlasPanel({
  hasAtlas,
  settings,
  grid,
  atlasInfo,
  onSettings,
  onGridChange,
  onNew,
  onImport,
  onSampleAtlas,
  onDetect,
  onBuildGrid,
}: Props) {
  const [sliceMode, setSliceMode] = useState<"detect" | "grid">("detect");

  const setGridPreset = (size: number) => {
    onGridChange({
      ...grid,
      width: size,
      height: size,
      gapX: 0,
      gapY: 0,
    });
  };

  return (
    <aside className="panel left-panel" aria-label="Atlas and Slicing controls">
      {/* ATLAS SOURCE SECTION */}
      <section className="panel-section">
        <div className="section-header">
          <div className="section-title">
            <Image size={15} className="text-accent" />
            <h3>Source Texture</h3>
          </div>
        </div>

        {atlasInfo ? (
          <div className="atlas-card">
            <div className="atlas-card-info">
              <span className="atlas-card-name" title={atlasInfo.name}>{atlasInfo.name}</span>
              <span className="atlas-card-meta">
                {atlasInfo.width} × {atlasInfo.height} px · {atlasInfo.glyphCount} boxes
              </span>
            </div>
            <div className="atlas-card-actions">
              <button className="btn btn--subtle btn--sm" onClick={onNew} title="Change sprite sheet">
                <FolderUp size={13} /> Change
              </button>
              <button className="btn btn--subtle btn--sm" onClick={onImport} title="Import .fnt + image">
                <FileCode size={13} /> Import .fnt
              </button>
            </div>
          </div>
        ) : (
          <div className="source-drop-zone">
            <button className="upload-cta" onClick={onNew}>
              <div className="upload-cta-icon">
                <FolderUp size={22} />
              </div>
              <div className="upload-cta-text">
                <strong>Upload Sprite Sheet</strong>
                <span>PNG or WebP bitmap texture</span>
              </div>
            </button>

            <div className="source-secondary-actions">
              <button className="btn btn--outline btn--sm btn--block" onClick={onImport}>
                <FileCode size={14} /> Import BMFont (.fnt + PNG)
              </button>
              {onSampleAtlas && (
                <button className="btn btn--subtle btn--sm btn--block" onClick={onSampleAtlas}>
                  <Sparkles size={14} className="text-accent" /> Load Sample 8-Bit Font
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* GLYPH SLICER SECTION */}
      <section className="panel-section">
        <div className="section-header">
          <div className="section-title">
            <Layers size={15} className="text-accent" />
            <h3>Glyph Slicing</h3>
          </div>
        </div>

        {/* Mode switcher tabs */}
        <div className="segmented-control" role="tablist" aria-label="Slicing method">
          <button
            role="tab"
            aria-selected={sliceMode === "detect"}
            className={`segmented-btn ${sliceMode === "detect" ? "is-active" : ""}`}
            onClick={() => setSliceMode("detect")}
          >
            <ScanLine size={14} /> Auto-Detect
          </button>
          <button
            role="tab"
            aria-selected={sliceMode === "grid"}
            className={`segmented-btn ${sliceMode === "grid" ? "is-active" : ""}`}
            onClick={() => setSliceMode("grid")}
          >
            <Grid3X3 size={14} /> Fixed Grid
          </button>
        </div>

        {sliceMode === "detect" ? (
          <div className="slice-content">
            <p className="section-description">
              Scans connected opaque pixels to automatically isolate separate character bounds.
            </p>

            <div className="field-grid">
              <NumberField
                label="Alpha Cutoff"
                value={settings.alphaThreshold}
                min={1}
                max={255}
                onChange={(alphaThreshold) => onSettings({ ...settings, alphaThreshold })}
              />
              <NumberField
                label="Box Padding"
                value={settings.padding}
                min={0}
                max={32}
                onChange={(padding) => onSettings({ ...settings, padding })}
              />
              <NumberField
                label="Min Pixel Area"
                value={settings.minArea}
                min={1}
                onChange={(minArea) => onSettings({ ...settings, minArea })}
              />
              <NumberField
                label="Advance Delta"
                value={settings.advanceAdjustment}
                onChange={(advanceAdjustment) => onSettings({ ...settings, advanceAdjustment })}
              />
            </div>

            <button
              className="btn btn--primary btn--block mt-3"
              disabled={!hasAtlas}
              onClick={onDetect}
            >
              <Wand2 size={15} /> Detect All Shapes
            </button>
          </div>
        ) : (
          <div className="slice-content">
            <div className="grid-presets">
              <span className="text-xs text-muted">Quick Size:</span>
              {[8, 16, 24, 32].map((sz) => (
                <button
                  key={sz}
                  className={`preset-chip ${grid.width === sz && grid.height === sz ? "is-active" : ""}`}
                  onClick={() => setGridPreset(sz)}
                >
                  {sz}×{sz}
                </button>
              ))}
            </div>

            <div className="field-grid">
              <NumberField
                label="Cell Width"
                value={grid.width}
                min={1}
                onChange={(width) => onGridChange({ ...grid, width })}
              />
              <NumberField
                label="Cell Height"
                value={grid.height}
                min={1}
                onChange={(height) => onGridChange({ ...grid, height })}
              />
              <NumberField
                label="Offset X"
                value={grid.offsetX}
                min={0}
                onChange={(offsetX) => onGridChange({ ...grid, offsetX })}
              />
              <NumberField
                label="Offset Y"
                value={grid.offsetY}
                min={0}
                onChange={(offsetY) => onGridChange({ ...grid, offsetY })}
              />
              <NumberField
                label="Gap X"
                value={grid.gapX}
                min={0}
                onChange={(gapX) => onGridChange({ ...grid, gapX })}
              />
              <NumberField
                label="Gap Y"
                value={grid.gapY}
                min={0}
                onChange={(gapY) => onGridChange({ ...grid, gapY })}
              />
            </div>

            <button
              className="btn btn--primary btn--block mt-3"
              disabled={!hasAtlas}
              onClick={onBuildGrid}
            >
              <Grid3X3 size={15} /> Generate Grid Cells
            </button>
          </div>
        )}
      </section>
    </aside>
  );
}
