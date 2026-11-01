import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Sliders, Check } from 'lucide-react';
import {
  ActionName,
  KeyBindings,
  ACTION_METADATA,
  formatCode,
  loadSettings,
  saveBindings,
  resetBindings,
  assignKey,
  GameSettingsData
} from '../game/keybindings';
import { BrightnessControl } from './BrightnessControl';
import {
  loadDisplaySettings,
  saveDisplaySettings,
  DEFAULT_DISPLAY,
  DisplaySettings
} from '../game/render/display';
import { QualityLevel, defaultQuality } from '../game/render/quality';
import { loadAmbientVolume, saveAmbientVolume } from '../game/audio/ambient';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBindingsUpdated: (settings: GameSettingsData) => void;
  onBrightnessChange?: (v: number) => void;
  onAmbientVolumeChange?: (v: number) => void;
  onDisplayOptionsChange?: (opts: Partial<Pick<DisplaySettings, 'quality' | 'fpsLimit' | 'showFps'>>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onBindingsUpdated,
  onBrightnessChange,
  onAmbientVolumeChange,
  onDisplayOptionsChange
}) => {
  const [settings, setSettings] = useState<GameSettingsData>(() => loadSettings());
  const [display, setDisplay] = useState<DisplaySettings>(() => loadDisplaySettings());
  const [ambientVolume, setAmbientVolume] = useState(() => loadAmbientVolume());
  const [rebinding, setRebinding] = useState<{ action: ActionName; slot: number } | null>(null);
  const [saveToast, setSaveToast] = useState(false);

  const recommendedQuality = defaultQuality();

  useEffect(() => {
    if (isOpen) {
      const current = loadSettings();
      setSettings(current);
      setDisplay(loadDisplaySettings());
      setAmbientVolume(loadAmbientVolume());
      setRebinding(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!rebinding) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels rebinding
      if (e.code === 'Escape') {
        setRebinding(null);
        return;
      }

      // Assign the new code, automatically removing it from any other action
      const updatedBindings = assignKey(settings.bindings, rebinding.action, rebinding.slot, e.code);
      const newSettings: GameSettingsData = {
        ...settings,
        bindings: updatedBindings
      };

      setSettings(newSettings);
      saveBindings(updatedBindings, {
        mouseSensitivity: newSettings.mouseSensitivity,
        invertY: newSettings.invertY
      });
      onBindingsUpdated(newSettings);
      setRebinding(null);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [rebinding, settings, onBindingsUpdated]);

  if (!isOpen) return null;

  const handleReset = () => {
    resetBindings();
    const fresh = loadSettings();
    setSettings(fresh);
    onBindingsUpdated(fresh);

    const defDisplay: DisplaySettings = {
      ...DEFAULT_DISPLAY,
      quality: defaultQuality()
    };
    setDisplay(defDisplay);
    saveDisplaySettings(defDisplay);
    onBrightnessChange?.(defDisplay.brightness);
    onDisplayOptionsChange?.({
      quality: defDisplay.quality,
      fpsLimit: defDisplay.fpsLimit,
      showFps: defDisplay.showFps
    });
    setRebinding(null);
  };

  const updateDisplayOption = (patch: Partial<DisplaySettings>) => {
    const next: DisplaySettings = { ...display, ...patch };
    setDisplay(next);
    saveDisplaySettings(next);
    onDisplayOptionsChange?.({
      quality: next.quality,
      fpsLimit: next.fpsLimit,
      showFps: next.showFps
    });
  };

  const handleSensitivityChange = (val: number) => {
    const updated: GameSettingsData = { ...settings, mouseSensitivity: val };
    setSettings(updated);
    saveBindings(updated.bindings, { mouseSensitivity: val, invertY: updated.invertY });
    onBindingsUpdated(updated);
  };

  const handleInvertYToggle = () => {
    const updated: GameSettingsData = { ...settings, invertY: !settings.invertY };
    setSettings(updated);
    saveBindings(updated.bindings, { mouseSensitivity: updated.mouseSensitivity, invertY: updated.invertY });
    onBindingsUpdated(updated);
  };

  const handleDone = () => {
    setSaveToast(true);
    setTimeout(() => {
      setSaveToast(false);
      onClose();
    }, 200);
  };

  const actionsList = Object.keys(ACTION_METADATA) as ActionName[];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-[#122826] border border-teal-600/50 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-['Poppins','Hind_Siliguri',sans-serif]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-teal-800/60 bg-teal-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Controls & Camera Settings</h2>
              <p className="text-xs text-teal-300">কন্ট্রোল ও ক্যামেরা সেটিংস</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-teal-900/40 hover:bg-teal-800/60 border border-teal-700/40 text-gray-300 hover:text-white transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {rebinding && (
            <div className="p-3.5 rounded-xl bg-amber-950/70 border border-amber-500/60 text-amber-200 text-xs flex items-center justify-between animate-pulse">
              <span>
                Press any key on your keyboard for{' '}
                <strong className="text-amber-300">
                  {ACTION_METADATA[rebinding.action]?.label} ({rebinding.slot === 0 ? 'Primary' : 'Alternative'})
                </strong>
                ...
              </span>
              <span className="text-[11px] bg-black/40 px-2 py-0.5 rounded text-gray-300">
                Press Esc to cancel
              </span>
            </div>
          )}

          {/* Display & Audio Settings */}
          <div className="p-4 rounded-2xl bg-black/30 border border-teal-800/50 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Display & Soundscape (ডিসপ্লে ও পরিবেশের শব্দ)
            </h3>
            <BrightnessControl
              value={display.brightness}
              onChange={(v) => {
                const next = { ...display, brightness: v };
                setDisplay(next);
                saveDisplaySettings({ brightness: v });
                onBrightnessChange?.(v);
              }}
            />

            <div className="space-y-2.5 pt-3 border-t border-teal-900/50">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-white">Dhaka Ambient Soundscape</span>
                  <span className="text-gray-400 ml-1.5">(যানজট ও বাজারের শব্দ)</span>
                </div>
                <span className="font-mono text-amber-400 font-bold px-2 py-0.5 rounded bg-black/40 border border-teal-700/40">
                  {Math.round(ambientVolume * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-gray-500 font-mono">0%</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={ambientVolume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setAmbientVolume(val);
                    saveAmbientVolume(val);
                    onAmbientVolumeChange?.(val);
                  }}
                  className="flex-1 accent-amber-400 cursor-pointer h-2 rounded-lg bg-teal-950 border border-teal-700/50"
                />
                <span className="text-[11px] text-gray-500 font-mono">100%</span>
              </div>
            </div>
          </div>

          {/* Graphics (গ্রাফিক্স) Settings */}
          <div className="p-4 rounded-2xl bg-black/30 border border-teal-800/50 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Graphics (গ্রাফিক্স)
            </h3>

            {/* Quality Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-white">Quality Preset</span>
                  <span className="text-gray-400 ml-1.5">(গ্রাফিক্স মান)</span>
                </div>
                <span className="text-[11px] text-teal-300 font-mono">
                  {display.quality === 'low'
                    ? '720p · Fast'
                    : display.quality === 'medium'
                    ? '900p · Balanced'
                    : display.quality === 'high'
                    ? '1080p · Sharp'
                    : '1440p · Max'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(['low', 'medium', 'high', 'ultra'] as QualityLevel[]).map((lvl) => {
                  const isSelected = display.quality === lvl;
                  const isRecommended = recommendedQuality === lvl;
                  const label = lvl.charAt(0).toUpperCase() + lvl.slice(1);
                  return (
                    <button
                      key={lvl}
                      onClick={() => updateDisplayOption({ quality: lvl })}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 ${
                        isSelected
                          ? 'bg-amber-500 text-gray-950 border-amber-300 shadow-lg'
                          : 'bg-teal-950/80 hover:bg-teal-900 border-teal-700/50 text-gray-200'
                      }`}
                    >
                      <span>{label}</span>
                      {isRecommended && (
                        <span
                          className={`text-[9px] font-semibold uppercase tracking-tight ${
                            isSelected ? 'text-gray-900' : 'text-amber-400'
                          }`}
                        >
                          Recommended
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FPS Limit */}
            <div className="space-y-2 pt-3 border-t border-teal-900/50">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-white">FPS Limit</span>
                  <span className="text-gray-400 ml-1.5">(ফ্রেম রেট সীমা)</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 60, label: '60 FPS' },
                    { value: 120, label: '120 FPS' },
                    { value: 0, label: 'Max' }
                  ] as const
                ).map((opt) => {
                  const isSelected = display.fpsLimit === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => updateDisplayOption({ fpsLimit: opt.value })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold font-mono transition ${
                        isSelected
                          ? 'bg-amber-500 text-gray-950 border-amber-300 shadow-lg'
                          : 'bg-teal-950/80 hover:bg-teal-900 border-teal-700/50 text-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Show FPS Counter Toggle */}
            <div className="flex items-center justify-between pt-3 border-t border-teal-900/50">
              <div className="text-xs">
                <span className="font-semibold text-white">Show FPS Counter</span>
                <p className="text-[11px] text-gray-400">Display live FPS and render resolution in HUD</p>
              </div>
              <button
                onClick={() => updateDisplayOption({ showFps: !display.showFps })}
                className={`w-12 h-7 flex items-center rounded-full p-1 transition duration-200 border border-teal-600/50 ${
                  display.showFps ? 'bg-amber-500 justify-end' : 'bg-teal-950 justify-start'
                }`}
              >
                <div className="bg-white w-5 h-5 rounded-full shadow-md" />
              </button>
            </div>
          </div>

          {/* Mouse & Camera Settings */}
          <div className="p-4 rounded-2xl bg-black/30 border border-teal-800/50 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Mouse Camera (Drag on Canvas)
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-white">Mouse Sensitivity</span>
                  <span className="text-gray-400 ml-1.5">(মাউস সেনসিটিভিটি)</span>
                </div>
                <span className="font-mono text-amber-400 font-bold px-2 py-0.5 rounded bg-black/40 border border-teal-700/40">
                  {settings.mouseSensitivity.toFixed(2)}×
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-gray-500 font-mono">0.5×</span>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={settings.mouseSensitivity}
                  onChange={(e) => handleSensitivityChange(parseFloat(e.target.value))}
                  className="flex-1 accent-amber-400 cursor-pointer h-2 rounded-lg bg-teal-950 border border-teal-700/50"
                />
                <span className="text-[11px] text-gray-500 font-mono">2.0×</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-teal-900/50">
              <div className="text-xs">
                <span className="font-semibold text-white">Invert Y (Vertical Drag)</span>
                <p className="text-[11px] text-gray-400">Invert up/down camera dragging</p>
              </div>
              <button
                onClick={handleInvertYToggle}
                className={`w-12 h-7 flex items-center rounded-full p-1 transition duration-200 border border-teal-600/50 ${
                  settings.invertY ? 'bg-amber-500 justify-end' : 'bg-teal-950 justify-start'
                }`}
              >
                <div className="bg-white w-5 h-5 rounded-full shadow-md" />
              </button>
            </div>
          </div>

          {/* Action Keybindings */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Key Bindings (Vehicle Tank Controls)
            </h3>

            <div className="grid grid-cols-12 text-[10px] uppercase font-bold text-teal-400 tracking-wider px-3 pb-1 border-b border-teal-800/40">
              <span className="col-span-6">Action</span>
              <span className="col-span-3 text-center">Primary Key</span>
              <span className="col-span-3 text-center">Alternative</span>
            </div>

            {actionsList.map((action) => {
              const meta = ACTION_METADATA[action];
              const keys = settings.bindings[action] || [];
              const key0 = keys[0];
              const key1 = keys[1];

              const isRebinding0 = rebinding?.action === action && rebinding?.slot === 0;
              const isRebinding1 = rebinding?.action === action && rebinding?.slot === 1;

              return (
                <div
                  key={action}
                  className="grid grid-cols-12 items-center px-3 py-2 rounded-xl bg-black/25 hover:bg-black/40 border border-teal-800/30 transition text-xs"
                >
                  <div className="col-span-6 pr-2">
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <span>{meta.label}</span>
                      <span className="text-[11px] text-teal-400 font-normal">({meta.bnLabel})</span>
                    </div>
                  </div>

                  {/* Slot 0 */}
                  <div className="col-span-3 flex justify-center px-1">
                    <button
                      onClick={() => setRebinding({ action, slot: 0 })}
                      className={`w-full py-1.5 px-2 rounded-lg font-mono font-bold text-center text-xs transition border ${
                        isRebinding0
                          ? 'bg-amber-500 text-gray-950 border-amber-300 ring-2 ring-amber-400 animate-pulse'
                          : 'bg-teal-950/80 hover:bg-teal-900 border-teal-600/50 text-amber-300'
                      }`}
                    >
                      {isRebinding0 ? 'Press key…' : formatCode(key0)}
                    </button>
                  </div>

                  {/* Slot 1 */}
                  <div className="col-span-3 flex justify-center px-1">
                    <button
                      onClick={() => setRebinding({ action, slot: 1 })}
                      className={`w-full py-1.5 px-2 rounded-lg font-mono font-bold text-center text-xs transition border ${
                        isRebinding1
                          ? 'bg-amber-500 text-gray-950 border-amber-300 ring-2 ring-amber-400 animate-pulse'
                          : key1
                          ? 'bg-teal-950/80 hover:bg-teal-900 border-teal-600/50 text-teal-200'
                          : 'bg-black/40 hover:bg-teal-950 border-dashed border-teal-800/60 text-gray-500'
                      }`}
                    >
                      {isRebinding1 ? 'Press key…' : key1 ? formatCode(key1) : '+ Add'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-teal-800/60 bg-teal-950/60 flex items-center justify-between gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-900/40 hover:bg-teal-800/60 border border-teal-700/40 text-gray-300 hover:text-white text-xs font-semibold transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to defaults</span>
          </button>

          <button
            onClick={handleDone}
            className="flex items-center gap-1.5 px-6 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-gray-950 text-xs font-bold shadow-lg transition active:scale-95"
          >
            {saveToast ? (
              <>
                <Check className="w-4 h-4" />
                <span>Saved!</span>
              </>
            ) : (
              <span>Done</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
