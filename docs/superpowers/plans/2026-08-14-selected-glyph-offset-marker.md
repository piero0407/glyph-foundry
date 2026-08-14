# Selected Glyph Offset Marker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw a small dot at the selected glyph cell's `(xoffset, yoffset)` coordinate.

**Architecture:** `AtlasView` conditionally renders one marker inside the selected glyph overlay, allowing the overlay's coordinate system and visible overflow to handle negative offsets naturally. Inline position values scale glyph offsets with atlas zoom; CSS owns the dot's fixed visual size and non-interactive presentation.

**Tech Stack:** React, TypeScript, CSS, Vitest, React DOM server rendering

## Global Constraints

- Render the marker only for the selected glyph.
- Position it at cell top-left plus `(xoffset, yoffset)`.
- Scale marker coordinates with atlas zoom.
- Keep marker interactions disabled so move and resize behavior is unchanged.
- Do not modify existing untracked files outside this feature.

---

### Task 1: Render and style the selected-glyph offset dot

**Files:**
- Create: `src/components/AtlasView.test.tsx`
- Modify: `src/components/AtlasView.tsx:58-72`
- Modify: `src/styles.css:312-325`

**Interfaces:**
- Consumes: `Glyph.xoffset`, `Glyph.yoffset`, `AtlasView`'s existing `selectedId` and `zoom` props.
- Produces: selected-only `.glyph-offset-marker` element whose `left` and `top` inline styles are zoom-scaled pixel coordinates.

- [ ] **Step 1: Write the failing server-render test**

Create `src/components/AtlasView.test.tsx`:

```tsx
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AtlasImage, Glyph } from "../types";
import { AtlasView } from "./AtlasView";

const glyph = (id: number, patch: Partial<Glyph> = {}): Glyph => ({
  id,
  char: String.fromCharCode(65 + id),
  x: id * 10,
  y: 0,
  width: 8,
  height: 8,
  xoffset: 0,
  yoffset: 0,
  xadvance: 8,
  ...patch,
});

const atlas = {
  name: "test.png",
  width: 32,
  height: 16,
  image: { src: "test.png" } as HTMLImageElement,
  pixels: {} as ImageData,
} satisfies AtlasImage;

describe("AtlasView offset marker", () => {
  it("renders one zoom-scaled marker for the selected glyph", () => {
    const markup = renderToStaticMarkup(
      <AtlasView
        atlas={atlas}
        glyphs={[glyph(0), glyph(1, { xoffset: -2, yoffset: 3 })]}
        selectedId={1}
        zoom={2}
        dragging={false}
        pixel={null}
        scrollRef={createRef<HTMLDivElement>()}
        stageRef={createRef<HTMLDivElement>()}
        onFiles={() => undefined}
        onNew={() => undefined}
        onAdd={() => undefined}
        onZoom={() => undefined}
        onInspect={() => undefined}
        onLeave={() => undefined}
        onDrag={() => undefined}
      />,
    );

    expect(markup.match(/class="glyph-offset-marker"/g)).toHaveLength(1);
    expect(markup).toContain('class="glyph-offset-marker" style="left:-4px;top:6px"');
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/components/AtlasView.test.tsx`

Expected: FAIL because markup contains no `.glyph-offset-marker`.

- [ ] **Step 3: Add the selected-only marker**

Inside each `.glyph-box` in `src/components/AtlasView.tsx`, before `.glyph-tag`, add:

```tsx
{selectedId === glyph.id && (
  <span
    aria-hidden="true"
    className="glyph-offset-marker"
    style={{ left: glyph.xoffset * zoom, top: glyph.yoffset * zoom }}
  />
)}
```

- [ ] **Step 4: Style the marker as a centered, non-interactive dot**

Add beside the glyph-box styles in `src/styles.css`:

```css
.glyph-offset-marker {
  position: absolute;
  width: 7px;
  height: 7px;
  border: 1px solid hsl(var(--bg));
  border-radius: 50%;
  background: hsl(var(--accent));
  box-shadow: 0 0 0 1px hsl(var(--accent) / .7);
  pointer-events: none;
  transform: translate(-50%, -50%);
}
```

- [ ] **Step 5: Run focused test**

Run: `npm test -- src/components/AtlasView.test.tsx`

Expected: PASS; exactly one marker uses `left:-4px;top:6px` at zoom 2.

- [ ] **Step 6: Run full validation**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: TypeScript and Vite production build succeed.

Manual check: select a glyph, edit both offsets through negative, zero, positive, and mixed values, and change zoom. Marker must follow each axis, leave only the top/left edge for negative coordinates, and never capture drag or resize input.

- [ ] **Step 7: Commit the feature**

```bash
git add src/components/AtlasView.tsx src/components/AtlasView.test.tsx src/styles.css
git commit -m "feat: show selected glyph offset marker"
```
