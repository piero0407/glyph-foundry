type ActiveGlyphEdit = {
  matches: (selector: string) => boolean;
  blur: () => void;
};

export function commitActiveGlyphEditBeforeSelection(
  activeElement: ActiveGlyphEdit | null,
  select: () => void,
) {
  if (activeElement?.matches("[data-glyph-history]")) activeElement.blur();
  select();
}
