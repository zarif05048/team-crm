"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { clampPanelWidth, panelBounds, savedPanelWidth } from "@/lib/panel-size";

export function ResizableSplit({
  id, label, defaultWidth, minWidth, maxWidth, minRemaining, left, children,
  className, leftClassName, rightClassName,
}: {
  id: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  minRemaining: number;
  left: ReactNode;
  children: ReactNode;
  className?: string;
  leftClassName?: string;
  rightClassName?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const separator = useRef<HTMLDivElement>(null);
  const requested = useRef(defaultWidth);
  const current = useRef(defaultWidth);
  const loadedKey = useRef("");
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(null);
  const [width, setWidth] = useState(defaultWidth);
  const [bounds, setBounds] = useState({ min: minWidth, max: maxWidth });
  const [dragging, setDragging] = useState(false);
  const storageKey = `hijraa-crm-panel-${id}`;
  const leftId = `pane-${id}`;

  const displayWidth = useCallback((value: number) => {
    const limits = panelBounds(root.current?.clientWidth ?? 0, minWidth, maxWidth, minRemaining);
    const next = clampPanelWidth(value, limits, defaultWidth);
    current.current = next;
    setBounds(limits);
    setWidth(next);
  }, [defaultWidth, minWidth, maxWidth, minRemaining]);

  const persist = useCallback(() => {
    try { localStorage.setItem(storageKey, String(current.current)); } catch { /* resizing still works without storage */ }
  }, [storageKey]);

  const changeWidth = useCallback((value: number, save = false) => {
    requested.current = value;
    displayWidth(value);
    if (save) persist();
  }, [displayWidth, persist]);

  useEffect(() => {
    if (loadedKey.current !== storageKey) {
      let saved: string | null = null;
      try { saved = localStorage.getItem(storageKey); } catch { /* session-only layout */ }
      requested.current = savedPanelWidth(saved, defaultWidth);
      loadedKey.current = storageKey;
    }
    const fit = () => displayWidth(requested.current);
    fit();
    // Outer navigation resizing changes the inbox's available space too.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    if (root.current) observer?.observe(root.current);
    window.addEventListener("resize", fit);
    return () => { observer?.disconnect(); window.removeEventListener("resize", fit); };
  }, [storageKey, defaultWidth, displayWidth]);

  useEffect(() => () => {
    if (drag.current) {
      drag.current = null;
      document.documentElement.classList.remove("crm-resizing");
    }
  }, []);

  const finish = () => {
    if (!drag.current) return;
    drag.current = null;
    requested.current = current.current;
    setDragging(false);
    document.documentElement.classList.remove("crm-resizing");
    persist();
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.focus();
    drag.current = { pointer: event.pointerId, x: event.clientX, width: current.current };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    document.documentElement.classList.add("crm-resizing");
  };

  return (
    <div ref={root} className={cn("resizable-split flex h-full min-h-0 min-w-0", className)}
      style={{ "--pane-width": `${width}px` } as CSSProperties}>
      <div id={leftId} className={cn("resizable-pane min-h-0 min-w-0 shrink-0", leftClassName)}>{left}</div>
      <div ref={separator} role="separator" aria-orientation="vertical" aria-label={label}
        aria-controls={leftId} aria-valuemin={bounds.min} aria-valuemax={bounds.max} aria-valuenow={width}
        aria-valuetext={`${width} pixels`} tabIndex={0}
        title="Drag to resize · Double-click to reset · Arrow keys to adjust"
        className={cn("panel-resizer relative hidden shrink-0 items-center justify-center lg:flex", dragging && "is-dragging")}
        onPointerDown={startDrag}
        onPointerMove={event => {
          const active = drag.current;
          if (active && active.pointer === event.pointerId) changeWidth(active.width + event.clientX - active.x);
        }}
        onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
        onDoubleClick={() => changeWidth(defaultWidth, true)}
        onKeyDown={event => {
          if (event.key === "Escape" && drag.current) {
            const active = drag.current;
            changeWidth(active.width);
            drag.current = null;
            setDragging(false);
            document.documentElement.classList.remove("crm-resizing");
            separator.current?.releasePointerCapture(active.pointer);
            event.preventDefault();
            return;
          }
          const step = event.shiftKey ? 40 : 10;
          const target = event.key === "ArrowLeft" ? width - step : event.key === "ArrowRight" ? width + step
            : event.key === "Home" ? bounds.min : event.key === "End" ? bounds.max
            : event.key === "Enter" ? defaultWidth : null;
          if (target !== null) { event.preventDefault(); changeWidth(target, true); }
        }}>
        <span className="panel-resizer-grip" aria-hidden="true" />
      </div>
      <div className={cn("resizable-detail flex min-h-0 min-w-0 flex-1", rightClassName)}>{children}</div>
    </div>
  );
}
