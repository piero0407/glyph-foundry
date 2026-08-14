# Pixi-Style Bitmap Preview Design

## Goal

Make the live preview follow the core layout behavior of PixiJS `BitmapText` without adding PixiJS as a dependency.

## Scope

The existing canvas renderer remains in place. The change covers BMFont character placement, multiline positioning, missing-character advance, pixel-perfect drawing, and layout tests. It does not add alignment, tinting, wrapping, kerning records, anchors, or other PixiJS display-object features that the editor does not currently expose.

## Architecture

`src/lib/preview.ts` remains the pure layout layer. It converts glyph metrics and preview text into canvas dimensions, guide positions, and glyph placements. `src/components/Preview.tsx` remains the drawing layer and copies the selected regions from the atlas to those positions.

This boundary keeps metric behavior independently testable and avoids coupling font layout to React or browser canvas APIs.

## Layout Behavior

- Iterate text by Unicode code point rather than UTF-16 code unit.
- Start each line from the same horizontal pen origin.
- Position known glyphs at `penX + xoffset` and `lineY + yoffset`.
- Advance the horizontal pen by `xadvance` after each known glyph.
- For an unknown character, draw nothing and advance by half the configured line height, rounded to the nearest integer with a minimum of one pixel. This preserves the editor's existing deterministic fallback.
- For a newline, reset the horizontal pen and advance vertically by `lineHeight`.
- Treat `lineHeight` as at least one pixel.
- Expand preview bounds so negative offsets and glyph overhangs remain visible, while retaining existing preview padding and minimum canvas dimensions.
- Keep top and baseline guides aligned with each logical line after bounds adjustment.

## Rendering Behavior

The React component continues to use a 2D canvas with image smoothing disabled. Each placement copies its glyph rectangle from the source atlas at native pixel size. UI zoom changes only the canvas CSS dimensions, preserving nearest-neighbor source pixels and existing zoom controls.

## Error Handling

- Missing atlas: show the existing empty-state message.
- Missing glyph: skip drawing and apply fallback advance.
- Duplicate character mappings: layout uses the last mapped glyph, matching the current `Map` construction; export validation remains responsible for rejecting duplicates.
- Invalid non-positive line height: clamp to one pixel for preview safety.

## Testing

Unit tests in `src/lib/preview.test.ts` will cover:

- BMFont offsets and `xadvance` pen movement.
- Multiline pen reset and `lineHeight` movement.
- Missing-character fallback advance.
- Unicode code-point iteration.
- Negative offsets and tall/overhanging glyph bounds.

Validation will run the targeted preview tests followed by the production build.

## Files

- `src/lib/preview.ts` — Pixi-style layout semantics.
- `src/lib/preview.test.ts` — metric and edge-case coverage.
- `src/components/Preview.tsx` — only changed if drawing needs adaptation to the refined layout contract.

