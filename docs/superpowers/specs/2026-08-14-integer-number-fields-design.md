# Integer number fields

## Scope

BMFont integer settings round arithmetic results when the user commits an edit with Enter or by leaving the field. The affected fields are glyph X, Y, width, height, X offset, Y offset, X advance, and font line height. Recognition confidence keeps decimal support.

## Implementation

Add an `integer` property to `NumberField`. When enabled, `commit` rounds the evaluated value before applying existing minimum and maximum bounds. Wheel and drag changes already use whole-number steps and need no separate behavior.

Set `integer` on the affected `NumberField` instances in `EditPanel`.

## Validation

Run the production build. Manually enter `20.5` in an integer field, commit it, and confirm the displayed and stored value becomes `21`.

No automated tests requested.
