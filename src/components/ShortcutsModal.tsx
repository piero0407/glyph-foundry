import { Command, Keyboard, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ShortcutsModal({ open, onClose }: Props) {
  if (!open) return null;

  const shortcuts = [
    { category: "Canvas Navigation", items: [
      { keys: ["Ctrl", "Wheel"], desc: "Zoom atlas canvas in / out" },
      { keys: ["Drag Box"], desc: "Reposition selected glyph" },
      { keys: ["Corner Handle"], desc: "Resize selected glyph bounding box" },
      { keys: ["Hover"], desc: "Inspect pixel RGBA color and coordinates" },
    ]},
    { category: "Editing & History", items: [
      { keys: ["Ctrl", "Z"], desc: "Undo last glyph modification" },
      { keys: ["Ctrl", "Y"], desc: "Redo last glyph modification" },
      { keys: ["Ctrl", "Shift", "Z"], desc: "Redo alternate shortcut" },
      { keys: ["Tab"], desc: "Focus next input / metric field" },
    ]},
    { category: "Numeric Fields & Scrubbing", items: [
      { keys: ["Horizontal Drag"], desc: "Scrub and continuously adjust any metric" },
      { keys: ["Scroll Wheel"], desc: "Nudge value by ±1 when focused" },
      { keys: ["↑", "↓"], desc: "Step value up / down" },
      { keys: ["Math Expr"], desc: "Evaluates expressions like 16+4 or 64/2 on Enter" },
    ]},
    { category: "Live Preview", items: [
      { keys: ["Ctrl", "Wheel"], desc: "Zoom preview canvas in / out (1× - 8×)" },
    ]},
  ];

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-modal-title">
        <div className="modal-header">
          <div className="modal-header-title">
            <Keyboard size={18} className="text-accent" />
            <h3 id="shortcuts-modal-title">Keyboard & Gesture Shortcuts</h3>
          </div>
          <button className="icon-btn" aria-label="Close shortcuts" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body shortcuts-grid">
          {shortcuts.map((sec) => (
            <div key={sec.category} className="shortcuts-section">
              <h4 className="shortcuts-section-title">{sec.category}</h4>
              <div className="shortcuts-list">
                {sec.items.map((item, idx) => (
                  <div key={idx} className="shortcut-row">
                    <span className="shortcut-desc">{item.desc}</span>
                    <span className="shortcut-keys">
                      {item.keys.map((k, i) => (
                        <kbd key={i}>{k}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <span className="text-muted text-xs">Press Esc or click outside to close</span>
          <button className="btn btn--primary btn--sm" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
