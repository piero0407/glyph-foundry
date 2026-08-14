# Pixi-Style Bitmap Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing canvas preview explicitly follow the core BMFont pen-positioning behavior used by PixiJS `BitmapText`.

**Architecture:** Keep `src/lib/preview.ts` as a pure layout function and `src/components/Preview.tsx` as the canvas drawing adapter. Strengthen the layout contract through focused unit tests, then make only the minimum layout changes required by those tests.

**Tech Stack:** TypeScript, React, Canvas 2D, Vitest, Vite

## Global Constraints

- Do not add PixiJS or another rendering dependency.
- Keep the existing canvas, guide lines, zoom controls, padding, and minimum canvas size.
- Support BMFont `xoffset`, `yoffset`, `xadvance`, and `lineHeight` semantics.
- Iterate text by Unicode code point.
- Unknown characters use the existing fallback advance of half the safe line height, rounded with a one-pixel minimum.
- Do not add wrapping, alignment, tinting, anchors, or kerning-record support.
- Implement directly on the current `main` branch and preserve unrelated uncommitted work.

---

### Task 1: Lock Pixi-Style Pen Layout with Tests

**Files:**
- Modify: `src/lib/preview.test.ts`
- Modify if tests expose a mismatch: `src/lib/preview.ts`

**Interfaces:**
- Consumes: `layoutBitmapText(glyphs: Glyph[], lineHeight: number, text: string)`
- Produces: layout object with `width`, `height`, `lineTops`, `lineHeight`, and `placements: Array<{ glyph: Glyph; x: number; y: number }>`

- [ ] **Step 1: Add a failing pen-movement test**

Add a test using two mapped glyphs with distinct `xoffset`, `yoffset`, and `xadvance` values:

```ts
it("positions glyphs from BMFont offsets and advances the pen by xadvance", () => {
  const first = glyph({ id: 0, char: "A", xoffset: -2, yoffset: 3, xadvance: 7 });
  const second = glyph({ id: 1, char: "B", xoffset: 4, yoffset: -1, xadvance: 12 });
  const layout = layoutBitmapText([first, second], 16, "AB");
  const [a, b] = layout.placements;

  expect(b.x - a.x).toBe(7 + second.xoffset - first.xoffset);
  expect(b.y - a.y).toBe(second.yoffset - first.yoffset);
});
```

- [ ] **Step 2: Add a failing multiline test**

```ts
it("resets the horizontal pen and advances by lineHeight after a newline", () => {
  const layout = layoutBitmapText([glyph()], 18, "AA\nA");
  const [first, , third] = layout.placements;

  expect(third.x).toBe(first.x);
  expect(third.y - first.y).toBe(18);
  expect(layout.lineTops[1] - layout.lineTops[0]).toBe(18);
});
```

- [ ] **Step 3: Add missing-character and Unicode tests**

```ts
it("advances by the deterministic fallback width for an unknown character", () => {
  const layout = layoutBitmapText([glyph()], 15, "A?A");
  const [first, second] = layout.placements;

  expect(second.x - first.x).toBe(10 + 8);
});

it("matches non-BMP glyphs as single Unicode code points", () => {
  const emoji = glyph({ char: "😀", xadvance: 13 });
  const layout = layoutBitmapText([emoji], 16, "😀😀");

  expect(layout.placements).toHaveLength(2);
  expect(layout.placements[1].x - layout.placements[0].x).toBe(13);
});
```

- [ ] **Step 4: Run targeted tests and observe results**

Run: `npm test -- src/lib/preview.test.ts`

Expected: New tests either expose a layout mismatch or demonstrate that the existing implementation already satisfies the Pixi-style core contract.

- [ ] **Step 5: Make the minimum layout correction if required**

If a test fails because layout does not follow the contract, retain the pure-function structure and use explicit pen variables:

```ts
const fallbackAdvance = Math.max(1, Math.round(safeLineHeight / 2));

lines.forEach((line, lineIndex) => {
  let penX = 0;
  for (const character of Array.from(line)) {
    const glyph = glyphByCharacter.get(character);
    if (!glyph) {
      penX += fallbackAdvance;
      continue;
    }
    const x = penX + glyph.xoffset;
    const y = lineIndex * safeLineHeight + glyph.yoffset;
    rawPlacements.push({ glyph, x, y });
    penX += glyph.xadvance;
  }
  maxX = Math.max(maxX, penX);
});
```

Do not change `src/components/Preview.tsx` unless the refined layout return shape requires it; no return-shape change is planned.

- [ ] **Step 6: Run targeted tests**

Run: `npm test -- src/lib/preview.test.ts`

Expected: All preview tests pass.

- [ ] **Step 7: Commit the focused change**

```bash
git add src/lib/preview.ts src/lib/preview.test.ts
git commit -m "test: lock pixi-style bitmap preview layout"
```

---

### Task 2: Validate Application Integration

**Files:**
- Verify: `src/components/Preview.tsx`
- Verify: `src/App.tsx`

**Interfaces:**
- Consumes: Layout contract established in Task 1.
- Produces: Existing live preview rendered from atlas glyph rectangles with smoothing disabled and CSS-only integer zoom.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: All tests pass, including the expanded preview tests and unrelated project tests.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript compilation and Vite production build complete successfully.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff HEAD~1 -- src/lib/preview.ts src/lib/preview.test.ts src/components/Preview.tsx`

Expected: Only scoped preview-layout logic and tests changed. `src/components/Preview.tsx` remains unchanged unless required by the layout contract. Existing unrelated `src/App.tsx` work remains untouched.

