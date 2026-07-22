import { useEffect, useRef, useState } from "react";
import { adjustBoundedValue, evaluateArithmeticExpression, horizontalDragSteps } from "../lib/arithmetic";

type Props = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  historyManaged?: boolean;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
};

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  historyManaged = false,
  onInteractionStart,
  onInteractionEnd,
}: Props) {
  const [draft, setDraft] = useState(String(value));
  const [scrubbing, setScrubbing] = useState(false);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const wheelEndTimerRef = useRef<number | null>(null);
  const interactionActiveRef = useRef(false);
  const interactionCallbacksRef = useRef({ onInteractionStart, onInteractionEnd });
  const dragRef = useRef<{ pointerId: number; startX: number; startValue: number; steps: number; active: boolean } | null>(null);

  interactionCallbacksRef.current = { onInteractionStart, onInteractionEnd };

  useEffect(() => {
    const nextDraft = String(value);
    valueRef.current = value;
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, [value]);

  useEffect(() => () => {
    if (wheelEndTimerRef.current !== null) window.clearTimeout(wheelEndTimerRef.current);
    if (interactionActiveRef.current) interactionCallbacksRef.current.onInteractionEnd?.();
  }, []);

  const startInteraction = () => {
    if (interactionActiveRef.current) return;
    interactionActiveRef.current = true;
    interactionCallbacksRef.current.onInteractionStart?.();
  };

  const endInteraction = () => {
    if (!interactionActiveRef.current) return;
    interactionActiveRef.current = false;
    interactionCallbacksRef.current.onInteractionEnd?.();
  };

  const stepValue = (delta: number) => {
    const parsed = evaluateArithmeticExpression(draftRef.current);
    const next = adjustBoundedValue(parsed ?? valueRef.current, delta, min, max);
    if (next === valueRef.current && draftRef.current === String(next)) return;
    draftRef.current = String(next);
    valueRef.current = next;
    setDraft(String(next));
    onChange(next);
  };

  const collapseSelection = (input: HTMLInputElement) => {
    const caret = input.value.length;
    input.setSelectionRange(caret, caret);
    window.getSelection()?.removeAllRanges();
  };

  const commit = (expression: string) => {
    const result = evaluateArithmeticExpression(expression);
    if (result === null) {
      setDraft(String(value));
      return;
    }
    const bounded = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, result));
    draftRef.current = String(bounded);
    valueRef.current = bounded;
    setDraft(String(bounded));
    if (bounded !== value) onChange(bounded);
  };

  return (
    <label className="field field--number">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        value={draft}
        className={scrubbing ? "is-scrubbing" : undefined}
        title="Enter math, scroll while focused, or drag horizontally"
        data-glyph-history={historyManaged || undefined}
        onChange={(event) => { draftRef.current = event.target.value; setDraft(event.target.value); }}
        onBlur={(event) => commit(event.currentTarget.value)}
        onWheel={(event) => {
          if (document.activeElement !== event.currentTarget || event.deltaY === 0) return;
          event.preventDefault();
          startInteraction();
          stepValue(event.deltaY < 0 ? 1 : -1);
          if (wheelEndTimerRef.current !== null) window.clearTimeout(wheelEndTimerRef.current);
          wheelEndTimerRef.current = window.setTimeout(() => { wheelEndTimerRef.current = null; endInteraction(); }, 150);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const startValue = evaluateArithmeticExpression(draftRef.current) ?? valueRef.current;
          dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startValue, steps: 0, active: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const steps = horizontalDragSteps(event.clientX - drag.startX);
          if (steps === drag.steps) return;
          event.preventDefault();
          if (!drag.active) { drag.active = true; setScrubbing(true); startInteraction(); }
          collapseSelection(event.currentTarget);
          drag.steps = steps;
          const next = adjustBoundedValue(drag.startValue, steps, min, max);
          const previous = valueRef.current;
          draftRef.current = String(next);
          valueRef.current = next;
          setDraft(String(next));
          if (next !== previous) onChange(next);
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          if (drag.active) { event.preventDefault(); collapseSelection(event.currentTarget); }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          dragRef.current = null;
          if (drag.active) { setScrubbing(false); endInteraction(); }
        }}
        onPointerCancel={() => {
          const wasActive = dragRef.current?.active;
          dragRef.current = null;
          if (wasActive) { setScrubbing(false); endInteraction(); }
        }}
        onSelect={(event) => { if (dragRef.current?.active) collapseSelection(event.currentTarget); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            startInteraction();
            stepValue(event.key === "ArrowUp" ? 1 : -1);
            endInteraction();
          }
          if (event.key === "Enter") commit(event.currentTarget.value);
          if (event.key === "Escape") setDraft(String(value));
        }}
      />
    </label>
  );
}
