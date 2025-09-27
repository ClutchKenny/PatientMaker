// src/hooks/use-autosize-textarea.ts
"use client";

import React, { useLayoutEffect, useRef } from "react";

type TextAreaRef =
  | React.RefObject<HTMLTextAreaElement | null>
  | React.MutableRefObject<HTMLTextAreaElement | null>;

interface UseAutosizeTextAreaProps {
  /** Ref created with useRef<HTMLTextAreaElement | null>(null) */
  ref: TextAreaRef;
  /** Max pixel height for the textarea (content area). Default: very large */
  maxHeight?: number;
  /** TOTAL vertical border width in px (top + bottom). Default: 0 */
  borderWidth?: number;
  /** Values that should trigger re-measure. Default: [] */
  dependencies?: React.DependencyList;
}

export function useAutosizeTextArea({
  ref,
  maxHeight = Number.MAX_SAFE_INTEGER,
  borderWidth = 0,          // interpret as TOTAL (top + bottom)
  dependencies = [],
}: UseAutosizeTextAreaProps) {
  const originalHeight = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref?.current;
    if (!el) return;

    // Reset height to measure true scrollHeight after content changes
    el.style.removeProperty("height");

    // On first run, remember the initial natural height (minus borders)
    if (originalHeight.current === null) {
      originalHeight.current = el.scrollHeight;
    }

    // Clamp to [originalHeight, maxHeight]
    const clamped = Math.min(Math.max(el.scrollHeight, originalHeight.current), maxHeight);

    // Set height; add borders so the outer box visually matches
    el.style.height = `${clamped + borderWidth}px`;
    el.style.overflowY = clamped >= maxHeight ? "auto" : "hidden";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, maxHeight, borderWidth, ...dependencies]);
}
