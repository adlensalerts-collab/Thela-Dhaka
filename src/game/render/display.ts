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
  fpsLimit: 60, // locked to 60 by default: steadier and cooler than chasing 120 Hz
  showFps: false
};
export const BRIGHTNESS_MIN = 0.5;
export const BRIGHTNESS_MAX = 1.6;
const KEY = 'thela_display_v1';
/** Bumped with the Sprint 8D WebGPU renderer: quality saved before it is reset once to the new default. */
const QUALITY_EPOCH = 3; // 3: also resets the saved FPS limit to the 60 lock

function isValidQuality(q: unknown): q is QualityLevel {
  return typeof q === 'string' && q in QUALITY_PRESETS;
}

function isValidFpsLimit(f: unknown): f is 60 | 120 | 0 {
  return f === 60 || f === 120 || f === 0;
}

let memoryDisplaySettings: DisplaySettings | null = null;

export function loadDisplaySettings(): DisplaySettings {
  const fallback: DisplaySettings = memoryDisplaySettings
    ? { ...memoryDisplaySettings }
    : {
        ...DEFAULT_DISPLAY,
        quality: defaultQuality()
      };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      memoryDisplaySettings = { ...fallback };
      return fallback;
    }
    const p = JSON.parse(raw);
    const b = Number(p.brightness);
    const loaded: DisplaySettings = {
      brightness: Number.isFinite(b)
        ? Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, b))
        : fallback.brightness,
      quality: p.qualityEpoch === QUALITY_EPOCH && isValidQuality(p.quality) ? p.quality : fallback.quality,
      fpsLimit: p.qualityEpoch === QUALITY_EPOCH && isValidFpsLimit(p.fpsLimit) ? p.fpsLimit : fallback.fpsLimit,
      showFps: typeof p.showFps === 'boolean' ? p.showFps : fallback.showFps
    };
    memoryDisplaySettings = { ...loaded };
    return loaded;
  } catch {
    return fallback;
  }
}

export function saveDisplaySettings(s: Partial<DisplaySettings>): DisplaySettings {
  const current = loadDisplaySettings();
  const b = s.brightness !== undefined ? Number(s.brightness) : current.brightness;
  const merged: DisplaySettings = {
    brightness: Number.isFinite(b)
      ? Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, b))
      : current.brightness,
    quality: s.quality !== undefined && isValidQuality(s.quality) ? s.quality : current.quality,
    fpsLimit: s.fpsLimit !== undefined && isValidFpsLimit(s.fpsLimit) ? s.fpsLimit : current.fpsLimit,
    showFps: typeof s.showFps === 'boolean' ? s.showFps : current.showFps
  };
  memoryDisplaySettings = { ...merged };
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...merged, qualityEpoch: QUALITY_EPOCH }));
  } catch {
    /* storage unavailable (private mode) — keep the in-memory value */
  }
  return merged;
}

