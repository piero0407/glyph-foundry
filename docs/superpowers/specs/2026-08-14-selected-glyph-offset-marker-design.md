# Selected Glyph Offset Marker

## Goal

Show a small dot on the selected atlas cell at its bitmap-font offset coordinate.

## Behavior

- Render the dot only for the selected glyph.
- Place it relative to the cell's top-left corner at `(xoffset, yoffset)`.
- Scale both coordinates with the current atlas zoom.
- Negative offsets place the dot outside the matching top or left cell edge.
- Zero and positive offsets keep the dot on or inside the matching edge.
- Keep the dot non-interactive so existing move and resize gestures remain unchanged.

## Implementation Shape

`AtlasView` renders the marker inside the selected `.glyph-box`. Inline `left` and `top` values derive from the selected glyph offsets and zoom. A dedicated CSS class draws a small, high-contrast circular marker with pointer events disabled. Existing selected-box stacking keeps the marker visible over unselected cells.

## Validation

- Verify positive, zero, negative, and mixed-axis offsets at multiple zoom levels.
- Verify changing offset fields moves the dot immediately.
- Verify cell move, resize, and selection interactions remain unchanged.
- Run the existing test suite and production build.
