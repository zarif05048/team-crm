export const RESIZE_HANDLE_WIDTH = 10;

export function panelBounds(containerWidth: number, min: number, max: number, minRemaining: number) {
  return { min, max: Math.max(min, Math.min(max, Math.floor(containerWidth) - RESIZE_HANDLE_WIDTH - minRemaining)) };
}

export function clampPanelWidth(width: number, bounds: { min: number; max: number }, fallback: number) {
  const value = Number.isFinite(width) ? Math.round(width) : fallback;
  return Math.max(bounds.min, Math.min(bounds.max, value));
}

export function savedPanelWidth(value: string | null, fallback: number) {
  const width = Number(value);
  return value !== null && value.trim() !== "" && Number.isFinite(width) && width > 0 ? width : fallback;
}
