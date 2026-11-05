export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  maxRenderHeight: number;
  shadows: boolean;
  shadowMapSize: number;   // per cascade (the sun has two)
  /** Redraw the shadow map every N frames (the sun barely moves, so 2–3 is invisible; people lag by <50 ms). */
  shadowEvery: number;
  leafShadows: boolean;
  /** Sprint 8D perf: 'none' = draw straight to the screen (no grade pass), 'grade' = grade only, 'full' = grade + bloom. */
  post: 'none' | 'grade' | 'full';
  /** Volumetric clouds in the sky (per-pixel noise on every sky pixel). */
  clouds: boolean;
  /** Sky-coloured aerial fog (one environment-map lookup per pixel); off = flat haze colour. */
  aerialFog: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low:    { maxRenderHeight: 540,  shadows: false, shadowMapSize: 512,  shadowEvery: 1,  leafShadows: false, post: 'none',  clouds: false, aerialFog: false },
  medium: { maxRenderHeight: 720,  shadows: true,  shadowMapSize: 1024, shadowEvery: 3, leafShadows: false, post: 'none',  clouds: true,  aerialFog: false },
  high:   { maxRenderHeight: 1080, shadows: true,  shadowMapSize: 2048, shadowEvery: 2, leafShadows: true,  post: 'full',  clouds: true,  aerialFog: true  },
  ultra:  { maxRenderHeight: 1440, shadows: true,  shadowMapSize: 2048, shadowEvery: 1, leafShadows: true,  post: 'full',  clouds: true,  aerialFog: true  }
};

/** Phones and tablets start on Low, computers on Medium (Sprint 8D renderer is heavier than the old one). */
export function defaultQuality(): QualityLevel {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(pointer: coarse)').matches) {
      return 'low';
    }
  }
  return 'medium';
}

export class AdaptiveResolution {
  scale = 1;
  private samples: number[] = [];
  private windowMs = 0;
  private elapsedSinceDropMs = 0;
  private highFpsDurationMs = 0;

  update(frameMs: number, targetFps: number): boolean {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || !Number.isFinite(targetFps) || targetFps <= 0) {
      return false;
    }

    const clampedMs = Math.min(250, Math.max(1, frameMs));
    this.samples.push(clampedMs);
    this.windowMs += clampedMs;
    this.elapsedSinceDropMs += clampedMs;

    // Maintain a ~1.5 s (1500 ms) rolling window of frame times
    while (this.windowMs > 1500 && this.samples.length > 1) {
      const removed = this.samples.shift()!;
      this.windowMs -= removed;
    }

    const avgFrameMs = this.windowMs / this.samples.length;
    const avgFps = 1000 / avgFrameMs;

    // Wait until we have ~1.5 s of samples before triggering a downward step
    if (avgFps < 0.9 * targetFps) {
      this.highFpsDurationMs = 0;
      if (this.elapsedSinceDropMs >= 1500 && this.scale > 0.6) {
        const next = Math.max(0.6, Math.round((this.scale - 0.1) * 100) / 100);
        if (next !== this.scale) {
          this.scale = next;
          this.elapsedSinceDropMs = 0;
          this.samples = [];
          this.windowMs = 0;
          return true;
        }
      }
      return false;
    }

    if (avgFps >= 0.98 * targetFps) {
      this.highFpsDurationMs += clampedMs;
      if (this.highFpsDurationMs >= 4000 && this.scale < 1) {
        const next = Math.min(1, Math.round((this.scale + 0.05) * 100) / 100);
        this.highFpsDurationMs = 0;
        if (next !== this.scale) {
          this.scale = next;
          this.elapsedSinceDropMs = 0;
          this.samples = [];
          this.windowMs = 0;
          return true;
        }
      }
    } else {
      this.highFpsDurationMs = 0;
    }

    return false;
  }
}
