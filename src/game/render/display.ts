import { QualityLevel, defaultQuality, QUALITY_PRESETS } from './quality';

/**
 * Display & graphics settings (brightness, quality preset, FPS limit, FPS counter),
 * stored separately from key bindings so the two settings files never overwrite each other.
 */
export interface DisplaySettings {
  brightness: number; // 1 = default exposure; 0.5 (darker) .. 1.6 (brighter)
  quality: QualityLevel;
  fpsLimit: 60 | 120 | 0; // 0 = display max
  showFps: boolean;
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  brightness: 1,
  quality: defaultQuality(),
  fpsLimit: 0,
  showFps: false
};
export const BRIGHTNESS_MIN = 0.5;
export const BRIGHTNESS_MAX = 1.6;
const KEY = 'thela_display_v1';

function isValidQuality(q: unknown): q is QualityLevel {
  return typeof q === 'string' && q in QUALITY_PRESETS;
}

function isValidFpsLimit(f: unknown): f is 60 | 120 | 0 {
  return f === 60 || f === 120 || f === 0;
}

export function loadDisplaySettings(): DisplaySettings {
  const fallback: DisplaySettings = {
    ...DEFAULT_DISPLAY,
    quality: defaultQuality()
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw);
    const b = Number(p.brightness);
    return {
      brightness: Number.isFinite(b)
        ? Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, b))
        : fallback.brightness,
      quality: isValidQuality(p.quality) ? p.quality : fallback.quality,
      fpsLimit: isValidFpsLimit(p.fpsLimit) ? p.fpsLimit : fallback.fpsLimit,
      showFps: typeof p.showFps === 'boolean' ? p.showFps : fallback.showFps
    };
  } catch {
    return fallback;
  }
}

export function saveDisplaySettings(s: Partial<DisplaySettings>): void {
  try {
    const merged: DisplaySettings = {
      ...loadDisplaySettings(),
      ...s
    };
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* storage unavailable (private mode) — keep the in-memory value */
  }
}

