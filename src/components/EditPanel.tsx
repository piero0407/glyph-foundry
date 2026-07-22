import type { RefObject } from "react";
import { Download, ScanLine, Trash2 } from "lucide-react";
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

export function EditPanel({ atlas, hasBlob, glyphs, selected, reviewCount, mappedCount, duplicates, work, status, inputRef, onWork, onRecognize, onApplyMap, onGlyph, onDelete, onNext, onEditStart, onEditEnd, onExportFnt, onExportAtlas }: Props) {
  const recognizing = status.phase === "loading" || status.phase === "running";
  return (
    <aside className="sidebar right-panel" aria-label="Glyph and export settings">
      <section>
        <div className="section-title"><span>03</span><h2>Character map</h2></div>
        <label className="field">
          <span>Recognition candidates</span>
          <textarea value={work.candidateCharset} onChange={(event) => onWork({ candidateCharset: event.target.value })} rows={3} spellCheck={false} />
        </label>
        <label className="field">
          <span>Characters, in reading order</span>
          <textarea value={work.characterMap} onChange={(event) => onWork({ characterMap: event.target.value })} rows={4} spellCheck={false} />
        </label>
        <NumberField label="Confidence ≥ %" value={work.recognitionThreshold} min={0} max={100} onChange={(value) => onWork({ recognitionThreshold: Math.max(0, Math.min(100, value)) })} />
        <button className="button button--wide" disabled={!atlas || !glyphs.length || recognizing} onClick={onRecognize}><ScanLine size={16} /> {recognizing ? `${Math.round(status.progress * 100)}%` : "Recognize symbols"}</button>
        <p className={`muted detection-note ${status.phase === "error" ? "is-error" : ""}`}>{status.message || "Offline OCR. Existing manual character edits stay untouched."}</p>
        <button className="button button--wide" disabled={!glyphs.length} onClick={onApplyMap}>Apply mapping</button>
      </section>

      <section className="glyph-editor">
        <div className="section-title"><span>04</span><h2>Selected glyph</h2></div>
        {selected ? (
          <>
            <div className="glyph-heading">
              <div className="char-input-wrap"><input ref={inputRef} aria-label="Glyph character" data-glyph-history="true" maxLength={2} value={selected.char} onChange={(event) => onGlyph({ char: Array.from(event.target.value)[0] ?? "" })} /></div>
              <div><strong>{selected.char ? `U+${selected.char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}` : "UNMAPPED"}</strong><small>Glyph #{selected.id + 1}{selected.matchConfidence !== undefined ? ` · ${selected.matchProvider === "tesseract-v7" ? "OCR" : "TEMPLATE"} ${Math.round(selected.matchConfidence * 100)}%` : ""}{selected.groupingStatus === "ambiguous" ? " · GROUP REVIEW" : ""}</small></div>
              <button className="icon-button danger" aria-label="Delete selected glyph" onClick={onDelete}><Trash2 size={17} /></button>
            </div>
            {reviewCount > 0 && <button className="button button--wide" onClick={onNext}>Next review ({reviewCount})</button>}
            {selected.recognitionError && <p className="muted detection-note is-error">{selected.recognitionError}</p>}
            <div className="field-grid">
              <NumberField historyManaged label="X" value={selected.x} min={0} max={atlas ? atlas.width - 1 : undefined} onChange={(x) => onGlyph({ x })} onInteractionStart={onEditStart} onInteractionEnd={onEditEnd} />
              <NumberField historyManaged label="Y" value={selected.y} min={0} max={atlas ? atlas.height - 1 : undefined} onChange={(y) => onGlyph({ y })} onInteractionStart={onEditStart} onInteractionEnd={onEditEnd} />
              <NumberField historyManaged label="Width" value={selected.width} min={1} onChange={(width) => onGlyph({ width })} onInteractionStart={onEditStart} onInteractionEnd={onEditEnd} />
              <NumberField historyManaged label="Height" value={selected.height} min={1} onChange={(height) => onGlyph({ height })} onInteractionStart={onEditStart} onInteractionEnd={onEditEnd} />
              <NumberField historyManaged label="X offset" value={selected.xoffset} onChange={(xoffset) => onGlyph({ xoffset })} onInteractionStart={onEditStart} onInteractionEnd={onEditEnd} />
              <NumberField historyManaged label="Y offset" value={selected.yoffset} onChange={(yoffset) => onGlyph({ yoffset })} onInteractionStart={onEditStart} onInteractionEnd={onEditEnd} />
              <NumberField historyManaged label="X advance" value={selected.xadvance} min={0} onChange={(xadvance) => onGlyph({ xadvance })} onInteractionStart={onEditStart} onInteractionEnd={onEditEnd} />
            </div>
          </>
        ) : <p className="muted">Select box on atlas to edit metrics.</p>}
      </section>

      <section>
        <div className="section-title"><span>05</span><h2>Font output</h2></div>
        <label className="field"><span>Font name</span><input value={work.fontName} onChange={(event) => onWork({ fontName: event.target.value })} /></label>
        <NumberField label="Line height" value={work.lineHeight} min={1} onChange={(lineHeight) => onWork({ lineHeight })} />
        <div className="export-summary"><span>BMFont text</span><strong>{mappedCount} characters</strong><small>{atlas?.name ?? "No texture"}</small></div>
        {duplicates.length > 0 && <p className="muted detection-note is-error">Duplicate characters block export: {duplicates.join(" ")}</p>}
        <button className="button button--primary button--wide" disabled={!atlas || mappedCount === 0 || duplicates.length > 0} onClick={onExportFnt}><Download size={16} /> Download .fnt</button>
        <button className="button button--wide" disabled={!hasBlob} onClick={onExportAtlas}><Download size={16} /> Download atlas</button>
      </section>
    </aside>
  );
}
