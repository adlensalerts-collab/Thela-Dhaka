import React from 'react';
import { BRIGHTNESS_MIN, BRIGHTNESS_MAX, DEFAULT_DISPLAY } from '../game/render/display';

/**
 * Sprint 4 — Brightness slider for SettingsModal. Styled like the mouse sensitivity row.
 * The parent applies the value live (engine.lighting.setBrightness) and saves it.
 */
interface BrightnessControlProps {
  value: number;
  onChange: (value: number) => void;
}

export const BrightnessControl: React.FC<BrightnessControlProps> = ({ value, onChange }) => {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-2 pt-2 border-t border-teal-900/50">
      <div className="flex items-center justify-between">
        <div className="text-xs">
          <span className="font-semibold text-white">Brightness</span>
          <span className="ml-2 text-teal-300/80 font-['Hind_Siliguri']">উজ্জ্বলতা</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-amber-300">{pct}%</span>
          {Math.abs(value - DEFAULT_DISPLAY.brightness) > 0.001 && (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_DISPLAY.brightness)}
              className="text-[10px] px-2 py-0.5 rounded-md border border-teal-700/60 text-teal-200 hover:bg-teal-800/40"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-gray-500" aria-hidden>🌙</span>
        <input
          type="range"
          min={BRIGHTNESS_MIN}
          max={BRIGHTNESS_MAX}
          step={0.05}
          value={value}
          aria-label="Brightness"
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-amber-400 cursor-pointer h-2 rounded-lg bg-teal-950 border border-teal-700/50"
        />
        <span className="text-[11px] text-gray-500" aria-hidden>☀️</span>
      </div>
    </div>
  );
};
