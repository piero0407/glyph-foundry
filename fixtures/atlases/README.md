# Atlas recognition fixtures

Add each representative atlas beside a JSON file with the same base name:

```json
{
  "image": "example.png",
  "alphaThreshold": 16,
  "candidateCharset": "ABC123!?",
  "glyphs": [
    { "char": "A", "x": 0, "y": 0, "width": 8, "height": 8 }
  ]
}
```

`glyphs` must follow visual reading order and contain the exact expected crop for each character. Use `char: ""` only when a detected crop is intentionally unmapped. Keep duplicate non-empty characters out of one fixture because BMFont output requires unique Unicode IDs.

Useful coverage: tiny glyphs, disconnected punctuation, transparent backgrounds, shadows, tight spacing, and both grid and free-layout atlases.
