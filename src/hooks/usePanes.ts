import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";
import type { PaneSizes } from "../types";

export type Pane = "left" | "right" | "preview";

export const PANE_LIMITS = {
  left: 220,
  right: 240,
  preview: 160,
  canvas: 380,
  upperWorkspace: 280,
  splitter: 6,
};

function resize(pane: Pane, sizes: PaneSizes, rect: DOMRect, value: number, relative: boolean): PaneSizes {
  if (pane === "left") {
    const max = Math.max(PANE_LIMITS.left, rect.width - sizes.right - PANE_LIMITS.canvas - PANE_LIMITS.splitter * 2);
    const next = relative ? sizes.left + value : value - rect.left;
    return { ...sizes, left: Math.max(PANE_LIMITS.left, Math.min(max, next)) };
  }
  if (pane === "right") {
    const max = Math.max(PANE_LIMITS.right, rect.width - sizes.left - PANE_LIMITS.canvas - PANE_LIMITS.splitter * 2);
    const next = relative ? sizes.right + value : rect.right - value;
    return { ...sizes, right: Math.max(PANE_LIMITS.right, Math.min(max, next)) };
  }
  const max = Math.max(PANE_LIMITS.preview, rect.height - PANE_LIMITS.upperWorkspace - PANE_LIMITS.splitter);
  const next = relative ? sizes.preview + value : rect.bottom - value;
  return { ...sizes, preview: Math.max(PANE_LIMITS.preview, Math.min(max, next)) };
}

export function usePanes(workspaceRef: RefObject<HTMLElement | null>, sizes: PaneSizes, onChange: (sizes: PaneSizes) => void) {
  const [active, setActive] = useState<Pane | null>(null);

  useEffect(() => {
    if (!active) return;
    const move = (event: PointerEvent) => {
      const workspace = workspaceRef.current;
      if (workspace) onChange(resize(active, sizes, workspace.getBoundingClientRect(), active === "preview" ? event.clientY : event.clientX, false));
    };
    const up = () => setActive(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [active, onChange, sizes, workspaceRef]);

  const onKeyDown = (event: KeyboardEvent, pane: Pane) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    let delta = 0;
    if (pane === "left" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) delta = event.key === "ArrowLeft" ? -16 : 16;
    else if (pane === "right" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) delta = event.key === "ArrowLeft" ? 16 : -16;
    else if (pane === "preview" && (event.key === "ArrowUp" || event.key === "ArrowDown")) delta = event.key === "ArrowUp" ? 16 : -16;
    else return;
    event.preventDefault();
    onChange(resize(pane, sizes, workspace.getBoundingClientRect(), delta, true));
  };

  return { active, start: setActive, onKeyDown };
}
