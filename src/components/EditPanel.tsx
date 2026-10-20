import { useState, type RefObject } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Info,
  Layers,
  ScanLine,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  Wand2,
} from "lucide-react";
import type { WorkState } from "../lib/project";
import type { AtlasImage, Glyph } from "../types";
import { NumberField } from "./NumberField";

type Status = { phase: "idle" | "loading" | "running" | "error"; progress: number; message: string };

type Props = {
  atlas: AtlasImage | null;
  hasBlob: boolean;
  glyphs: Glyph[];
  selected: Glyph | null;
  reviewCount: number;
  mappedCount: number;
  duplicates: string[];
  work: WorkState;
  status: Status;
  inputRef: RefObject<HTMLInputElement | null>;
  onWork: (patch: Partial<WorkState>) => void;
  onRecognize: () => void;
  onApplyMap: () => void;
  onGlyph: (patch: Partial<Glyph>) => void;
  onDelete: () => void;
  onNext: () => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  onExportFnt: () => void;
  onExportAtlas: () => void;
};

export function EditPanel({
  atlas,
  hasBlob,
  glyphs,
  selected,
  reviewCount,
  mappedCount,
  duplicates,
  work,
  status,
  inputRef,
  onWork,
  onRecognize,
  onApplyMap,
  onGlyph,
  onDelete,
  onNext,
  onEditStart,
  onEditEnd,
  onExportFnt,
  onExportAtlas,
}: Props) {
  const [activeTab, setActiveTab] = useState<"glyph" | "map" | "export">("glyph");
  const [showMetricGuide, setShowMetricGuide] = useState(false);

  const recognizing = status.phase === "loading" || status.phase === "running";

  const codePointHex = selected?.char
    ? `U+${selected.char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}`
    : null;

  const codePointDec = selected?.char
    ? selected.char.codePointAt(0)
    : null;

  const setCharsetPreset = (type: "ascii" | "alphanumeric" | "digits") => {
    let charset = "";
    if (type === "ascii") {
      charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?-+*/:;()[]{}<>@#$%&_=\\'\"`~|^";
    } else if (type === "alphanumeric") {
      charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    } else if (type === "digits") {
      charset = "0123456789+-*/=.,:;!?";
    }
    onWork({ characterMap: charset });
  };

  return (
    <aside className="panel right-panel" aria-label="Inspector and Export settings">
      {/* PANEL TABS */}
      <div className="panel-tabs-bar" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "glyph"}
          className={`panel-tab ${activeTab === "glyph" ? "is-active" : ""}`}
          onClick={() => setActiveTab("glyph")}
        >
          <Type size={14} /> Glyph
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "map"}
          className={`panel-tab ${activeTab === "map" ? "is-active" : ""}`}
          onClick={() => setActiveTab("map")}
        >
          <ScanLine size={14} /> Mapping
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "export"}
          className={`panel-tab ${activeTab === "export" ? "is-active" : ""}`}
          onClick={() => setActiveTab("export")}
        >
          <Download size={14} /> Export
        </button>
      </div>

      <div className="panel-tab-content">
        {/* TAB 1: GLYPH INSPECTOR */}
        {activeTab === "glyph" && (
          <div className="tab-pane">
            {selected ? (
              <>
                {/* Hero Character Card */}
                <div className="glyph-hero-card">
                  <div className="glyph-char-box">
                    <input
                      ref={inputRef}
                      aria-label="Glyph character"
                      data-glyph-history="true"
                      maxLength={2}
                      className="glyph-char-input"
                      value={selected.char}
                      placeholder="?"
                      onChange={(e) => onGlyph({ char: Array.from(e.target.value)[0] ?? "" })}
                    />
                    <span className="glyph-char-sub">Type char</span>
                  </div>

                  <div className="glyph-hero-meta">
                    <div className="glyph-hero-title">
                      <strong>{selected.char ? codePointHex : "Unmapped"}</strong>
                      <span className="glyph-id-badge">Box #{selected.id + 1}</span>
                    </div>

                    <div className="glyph-badges">
                      {codePointDec !== null && (
                        <span className="badge badge--neutral">Dec {codePointDec}</span>
                      )}
                      {selected.matchConfidence !== undefined && (
                        <span className="badge badge--accent">
                          {selected.matchProvider === "tesseract-v7" ? "OCR" : "Template"} {Math.round(selected.matchConfidence * 100)}%
                        </span>
                      )}
                      {selected.groupingStatus === "ambiguous" && (
                        <span className="badge badge--warning">Ambiguous</span>
                      )}
                    </div>
                  </div>

                  <button
                    className="icon-btn icon-btn--danger"
                    aria-label="Delete selected glyph"
                    title="Delete glyph"
                    onClick={onDelete}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Review callout if ambiguous */}
                {reviewCount > 0 && (
                  <div className="review-banner">
                    <div className="review-banner-text">
                      <AlertTriangle size={15} className="text-warning" />
                      <span><strong>{reviewCount}</strong> glyphs need review</span>
                    </div>
                    <button className="btn btn--subtle btn--xs" onClick={onNext}>
                      Next <ArrowRight size={12} />
                    </button>
                  </div>
                )}

                {selected.recognitionError && (
                  <div className="callout callout--error">
                    <span>{selected.recognitionError}</span>
                  </div>
                )}

                {/* Texture Box Metrics */}
                <div className="metrics-group">
                  <div className="metrics-group-title">
                    <span>Texture Crop</span>
                    <span className="text-muted text-xs">Atlas pixels</span>
                  </div>
                  <div className="field-grid">
                    <NumberField
                      historyManaged
                      integer
                      label="X"
                      value={selected.x}
                      min={0}
                      max={atlas ? atlas.width - 1 : undefined}
                      onChange={(x) => onGlyph({ x })}
                      onInteractionStart={onEditStart}
                      onInteractionEnd={onEditEnd}
                    />
                    <NumberField
                      historyManaged
                      integer
                      label="Y"
                      value={selected.y}
                      min={0}
                      max={atlas ? atlas.height - 1 : undefined}
                      onChange={(y) => onGlyph({ y })}
                      onInteractionStart={onEditStart}
                      onInteractionEnd={onEditEnd}
                    />
                    <NumberField
                      historyManaged
                      integer
                      label="Width"
                      value={selected.width}
                      min={1}
                      onChange={(width) => onGlyph({ width })}
                      onInteractionStart={onEditStart}
                      onInteractionEnd={onEditEnd}
                    />
                    <NumberField
                      historyManaged
                      integer
                      label="Height"
                      value={selected.height}
                      min={1}
                      onChange={(height) => onGlyph({ height })}
                      onInteractionStart={onEditStart}
                      onInteractionEnd={onEditEnd}
                    />
                  </div>
                </div>

                {/* Font Offset & Advance Metrics */}
                <div className="metrics-group">
                  <div className="metrics-group-title">
                    <span>Render Placement</span>
                    <button
                      className="metric-help-toggle"
                      onClick={() => setShowMetricGuide(!showMetricGuide)}
                      title="What do these metrics mean?"
                    >
                      <Info size={13} /> {showMetricGuide ? "Hide Guide" : "Explain"}
                    </button>
                  </div>

                  {showMetricGuide && (
                    <div className="metric-guide-card">
                      <div className="metric-guide-item">
                        <strong>X Offset:</strong> Horizontal shift from cursor position.
                      </div>
                      <div className="metric-guide-item">
                        <strong>Y Offset:</strong> Vertical shift from the line top.
                      </div>
                      <div className="metric-guide-item">
                        <strong>X Advance:</strong> Space before the next character begins.
                      </div>
                    </div>
                  )}

                  <div className="field-grid">
                    <NumberField
                      historyManaged
                      integer
                      label="X Offset"
                      value={selected.xoffset}
                      onChange={(xoffset) => onGlyph({ xoffset })}
                      onInteractionStart={onEditStart}
                      onInteractionEnd={onEditEnd}
                    />
                    <NumberField
                      historyManaged
                      integer
                      label="Y Offset"
                      value={selected.yoffset}
                      onChange={(yoffset) => onGlyph({ yoffset })}
                      onInteractionStart={onEditStart}
                      onInteractionEnd={onEditEnd}
                    />
                    <NumberField
                      historyManaged
                      integer
                      label="X Advance"
                      value={selected.xadvance}
                      min={0}
                      onChange={(xadvance) => onGlyph({ xadvance })}
                      onInteractionStart={onEditStart}
                      onInteractionEnd={onEditEnd}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="inspector-empty">
                <Type size={32} className="text-muted" />
                <h4>No Glyph Selected</h4>
                <p>Click on any box in the sprite sheet to inspect and edit its character and font metrics.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CHARACTER MAP & OCR */}
        {activeTab === "map" && (
          <div className="tab-pane">
            <div className="section-header">
              <div className="section-title">
                <ScanLine size={15} className="text-accent" />
                <h3>Reading Order Mapping</h3>
              </div>
            </div>

            <label className="field">
              <div className="field-label-row">
                <span>Character Sequence</span>
                <div className="preset-links">
                  <button onClick={() => setCharsetPreset("ascii")}>ASCII</button>
                  <button onClick={() => setCharsetPreset("alphanumeric")}>A-Z, 0-9</button>
                  <button onClick={() => setCharsetPreset("digits")}>Digits</button>
                </div>
              </div>
              <textarea
                value={work.characterMap}
                onChange={(e) => onWork({ characterMap: e.target.value })}
                rows={4}
                spellCheck={false}
                placeholder="Type characters in sprite sheet visual order..."
              />
            </label>

            <button
              className="btn btn--secondary btn--block mb-4"
              disabled={!glyphs.length}
              onClick={onApplyMap}
            >
              Assign Sequence to Glyphs
            </button>

            <div className="divider-line" />

            <div className="section-header mt-3">
              <div className="section-title">
                <Wand2 size={15} className="text-accent" />
                <h3>Offline OCR Recognition</h3>
              </div>
            </div>

            <label className="field">
              <span>Candidate Character Set</span>
              <textarea
                value={work.candidateCharset}
                onChange={(e) => onWork({ candidateCharset: e.target.value })}
                rows={2}
                spellCheck={false}
              />
            </label>

            <NumberField
              label="Confidence Cutoff %"
              value={work.recognitionThreshold}
              min={0}
              max={100}
              onChange={(value) => onWork({ recognitionThreshold: Math.max(0, Math.min(100, value)) })}
            />

            {recognizing && (
              <div className="ocr-progress-box">
                <div className="ocr-progress-bar">
                  <div
                    className="ocr-progress-fill"
                    style={{ width: `${Math.round(status.progress * 100)}%` }}
                  />
                </div>
                <span className="ocr-progress-text">
                  {status.message || `Processing... ${Math.round(status.progress * 100)}%`}
                </span>
              </div>
            )}

            {!recognizing && status.message && (
              <p className={`ocr-status-message ${status.phase === "error" ? "is-error" : ""}`}>
                {status.message}
              </p>
            )}

            <button
              className="btn btn--primary btn--block mt-2"
              disabled={!atlas || !glyphs.length || recognizing}
              onClick={onRecognize}
            >
              <ScanLine size={15} />
              {recognizing ? `Recognizing (${Math.round(status.progress * 100)}%)...` : "Run Offline OCR"}
            </button>
          </div>
        )}

        {/* TAB 3: EXPORT & METADATA */}
        {activeTab === "export" && (
          <div className="tab-pane">
            <div className="section-header">
              <div className="section-title">
                <Sliders size={15} className="text-accent" />
                <h3>Font Configuration</h3>
              </div>
            </div>

            <label className="field">
              <span>Font Face Name</span>
              <input
                value={work.fontName}
                onChange={(e) => onWork({ fontName: e.target.value })}
                placeholder="My Pixel Font"
              />
            </label>

            <NumberField
              integer
              label="Line Height (px)"
              value={work.lineHeight}
              min={1}
              onChange={(lineHeight) => onWork({ lineHeight })}
            />

            {/* BMFont Health Card */}
            <div className="export-health-card">
              <h4 className="health-card-title">BMFont Package Status</h4>
              <div className="health-list">
                <div className="health-row">
                  <span>Texture Image:</span>
                  <strong>{atlas ? atlas.name : "None loaded"}</strong>
                </div>
                <div className="health-row">
                  <span>Total Sliced Glyphs:</span>
                  <strong>{glyphs.length}</strong>
                </div>
                <div className="health-row">
                  <span>Mapped Characters:</span>
                  <strong className={mappedCount > 0 ? "text-success" : "text-warning"}>
                    {mappedCount}
                  </strong>
                </div>
                <div className="health-row">
                  <span>Duplicate Characters:</span>
                  <strong className={duplicates.length > 0 ? "text-danger" : "text-success"}>
                    {duplicates.length > 0 ? `${duplicates.length} duplicate(s)` : "None (valid)"}
                  </strong>
                </div>
              </div>

              {duplicates.length > 0 && (
                <div className="callout callout--error mt-2">
                  <AlertTriangle size={14} />
                  <span>Duplicates blocking export: {duplicates.join(" ")}</span>
                </div>
              )}
            </div>

            <div className="export-actions-group">
              <button
                className="btn btn--primary btn--block"
                disabled={!atlas || mappedCount === 0 || duplicates.length > 0}
                onClick={onExportFnt}
              >
                <Download size={15} /> Download BMFont (.fnt)
              </button>

              <button
                className="btn btn--outline btn--block"
                disabled={!hasBlob}
                onClick={onExportAtlas}
              >
                <Download size={15} /> Download Atlas Texture
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
