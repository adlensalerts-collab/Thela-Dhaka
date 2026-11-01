/**
 * Sprint 4 — display settings (brightness), stored separately from key bindings so the
 * two settings files can never overwrite each other.
 */
export interface DisplaySettings {
  brightness: number; // 1 = default exposure; 0.5 (darker) .. 1.6 (brighter)
}

export const DEFAULT_DISPLAY: DisplaySettings = { brightness: 1 };
export const BRIGHTNESS_MIN = 0.5;
export const BRIGHTNESS_MAX = 1.6;
const KEY = 'thela_display_v1';

export function loadDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_DISPLAY };
    const p = JSON.parse(raw);
    const b = Number(p.brightness);
    return {
      brightness: Number.isFinite(b) ? Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, b)) : DEFAULT_DISPLAY.brightness
    };
  } catch {
    return { ...DEFAULT_DISPLAY };
  }
}

export function saveDisplaySettings(s: DisplaySettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode) — keep the in-memory value */
  }
}
