import React, { useEffect, useRef } from 'react';
import {
  ShoppingCart,
  Shield,
  Star,
  Award,
  Package,
  Pause,
  ArrowUp,
  RefreshCw,
  Store,
  Sliders,
  Wrench,
  Volume2,
  VolumeX
} from 'lucide-react';
import { GameState } from '../game/simulation';
import { GameSettingsData, formatCode } from '../game/keybindings';

interface GameHUDProps {
  state: GameState;
  notice: string;
  onAction: (action: string) => void;
  onPause: () => void;
  onOpenSettings: () => void;
  settings: GameSettingsData;
  roomCode?: string;
  muted?: boolean;
  onToggleMute?: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  state,
  notice,
  onAction,
  onPause,
  onOpenSettings,
  settings,
  roomCode,
  muted = false,
  onToggleMute
}) => {
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isVendor = state.mode === 'vendor' || state.mode === 'online_vendor';

  // Memoized static minimap background rendering (only creates once)
  useEffect(() => {
    const size = 160;
    const bg = document.createElement('canvas');
    bg.width = size;
    bg.height = size;
    const cx = bg.getContext('2d');
    if (cx) {
      cx.fillStyle = '#d3c9a8';
      cx.fillRect(0, 0, size, size);
      cx.strokeStyle = '#67695f';
      cx.lineWidth = 7;
      const street = [-80, -40, 0, 40, 80];
      for (const v of street) {
        const t = ((v + 120) / 240) * size;
        cx.beginPath();
        cx.moveTo(t, 0);
        cx.lineTo(t, size);
        cx.stroke();
        cx.beginPath();
        cx.moveTo(0, t);
        cx.lineTo(size, t);
        cx.stroke();
      }
    }
    bgCanvasRef.current = bg;
  }, []);

  // Update blips on minimap efficiently
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas || !bgCanvasRef.current) return;
    const cx = canvas.getContext('2d');
    if (!cx) return;
    const size = 160;
    cx.drawImage(bgCanvasRef.current, 0, 0);

    // Compass circle
    cx.strokeStyle = '#c5a059';
    cx.lineWidth = 2;
    cx.strokeRect(1, 1, size - 2, size - 2);
  }, []);

  const stars = Math.min(5, Math.ceil(state.heat / 20));

  const sellKey = formatCode(settings.bindings.sell?.[0] || 'Space');
  const upgradeKey = formatCode(settings.bindings.upgrade?.[0] || 'KeyU');
  const restockKey = formatCode(settings.bindings.restock?.[0] || 'KeyR');
  const stallKey = formatCode(settings.bindings.placeStall?.[0] || 'KeyB');
  const repairKey = formatCode(settings.bindings.repair?.[0] || 'KeyF');

  const damage = state.damage || 0;
  const repairCost = state.repairCost || 0;

  // Damage bar color (green < 40, amber < 75, red otherwise)
  let damageBarColor = 'bg-emerald-500';
  let damageTextColor = 'text-emerald-400';
  if (damage >= 75) {
    damageBarColor = 'bg-rose-500';
    damageTextColor = 'text-rose-400';
  } else if (damage >= 40) {
    damageBarColor = 'bg-amber-500';
    damageTextColor = 'text-amber-400';
  }

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 font-['Poppins','Hind_Siliguri',sans-serif]">
      {/* Top Header Bar */}
      <div className="w-full flex items-start justify-between gap-4">
        {/* Status stats card */}
        <div className="bg-black/60 backdrop-blur-md border border-teal-600/40 rounded-2xl p-3 shadow-xl flex items-center gap-4 text-white pointer-events-auto">
          {/* Role badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-teal-900/60 border border-teal-600/40 text-amber-300 font-bold text-xs tracking-wider">
            {isVendor ? <ShoppingCart className="w-4 h-4 text-amber-400" /> : <Shield className="w-4 h-4 text-blue-400" />}
            <span>{isVendor ? 'VENDOR · ঠেলা' : 'POLICE · পুলিশ'}</span>
            {roomCode && (
              <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-300 ml-1">
                Room: {roomCode}
              </span>
            )}
          </div>

          <div className="h-8 w-px bg-teal-800/60" />

          {/* Wallet / Cash */}
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">{isVendor ? 'Wallet / ওয়ালেট' : 'Duty Cash'}</span>
            <span className="text-base font-extrabold text-amber-400 font-mono">
              ৳{isVendor ? state.cash : state.policeCash}
            </span>
          </div>

          <div className="h-8 w-px bg-teal-800/60" />

          {/* Level / Rank */}
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">{isVendor ? 'Cart Level' : 'Rank'}</span>
            <span className="text-base font-extrabold text-teal-300">
              {isVendor ? String(state.level).padStart(2, '0') : ['', 'CONST.', 'ASI', 'SI', 'INSP.'][state.rank]}
            </span>
          </div>

          <div className="h-8 w-px bg-teal-800/60" />

          {/* Stock / Integrity */}
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">{isVendor ? 'Stock' : 'Integrity'}</span>
            <span className="text-base font-extrabold text-white">
              {isVendor ? `${state.stock}/${state.cap}` : `${state.integrity}%`}
            </span>
          </div>

          <div className="h-8 w-px bg-teal-800/60" />

          {/* Damage / Condition Bar */}
          <div className="flex flex-col min-w-[110px]">
            <div className="flex justify-between items-center text-[10px] uppercase tracking-wider mb-1">
              <span className="text-gray-400">{isVendor ? 'Damage' : 'Damage'}</span>
              <span className={`font-mono font-bold ${damageTextColor}`}>
                {damage >= 100 ? 'BROKEN' : `${damage}%`}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-900/90 rounded-full overflow-hidden border border-teal-800/40">
              <div
                className={`h-full transition-all duration-300 rounded-full ${damageBarColor}`}
                style={{ width: `${Math.min(100, Math.max(damage > 0 ? 8 : 0, damage))}%` }}
              />
            </div>
          </div>

          <div className="h-8 w-px bg-teal-800/60" />

          {/* Sales / Arrests */}
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">{isVendor ? 'Sales' : 'Arrests'}</span>
            <span className="text-base font-extrabold text-amber-300">
              {isVendor ? state.sales : state.arrests}
            </span>
          </div>
        </div>

        {/* Top Right: Ambient Soundscape, Heat stars, Mute, Settings & Pause */}
        <div className="flex items-center gap-2.5 pointer-events-auto">
          {state.ambientZone && (
            <div
              className="hidden lg:flex bg-black/60 backdrop-blur-md border border-teal-600/40 rounded-2xl px-3.5 py-2 shadow-xl items-center gap-2 text-xs text-teal-200"
              title="Location Ambient Soundscape"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  muted ? 'bg-gray-500' : 'bg-emerald-400 animate-pulse'
                }`}
              />
              <div className="flex flex-col leading-tight">
                <span className="font-semibold text-white text-[11px]">{state.ambientZone}</span>
                {state.ambientZoneBn && (
                  <span className="text-[10px] text-teal-300/90">{state.ambientZoneBn}</span>
                )}
              </div>
            </div>
          )}

          {isVendor && (
            <div className="bg-black/60 backdrop-blur-md border border-amber-500/40 rounded-2xl px-4 py-2.5 shadow-xl flex items-center gap-1.5 text-amber-400 text-sm font-bold">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span>Wanted:</span>
              <span className="font-mono tracking-widest">
                {'★'.repeat(stars)}
                {'☆'.repeat(5 - stars)}
              </span>
            </div>
          )}

          {onToggleMute && (
            <button
              onClick={onToggleMute}
              className="p-3 rounded-2xl bg-black/60 backdrop-blur-md border border-teal-600/40 hover:bg-teal-900/60 text-gray-200 hover:text-white shadow-xl transition"
              title={muted ? 'Unmute Dhaka Soundscape' : 'Mute Dhaka Soundscape'}
            >
              {muted ? (
                <VolumeX className="w-5 h-5 text-rose-400" />
              ) : (
                <Volume2 className="w-5 h-5 text-amber-300" />
              )}
            </button>
          )}

          <button
            onClick={onOpenSettings}
            className="p-3 rounded-2xl bg-black/60 backdrop-blur-md border border-teal-600/40 hover:bg-teal-900/60 text-gray-200 hover:text-white shadow-xl transition"
            title="Open Settings"
          >
            <Sliders className="w-5 h-5 text-amber-300" />
          </button>

          <button
            onClick={onPause}
            className="p-3 rounded-2xl bg-black/60 backdrop-blur-md border border-teal-600/40 hover:bg-teal-900/60 text-white shadow-xl transition"
            title="Pause Game"
          >
            <Pause className="w-5 h-5 text-amber-300" />
          </button>
        </div>
      </div>

      {/* Center Notice Popup */}
      {notice && (
        <div className="self-center bg-teal-950/95 border border-teal-500/60 rounded-2xl px-6 py-2.5 shadow-2xl backdrop-blur-md text-amber-300 font-bold text-sm tracking-wide text-center animate-bounce">
          {notice}
        </div>
      )}

      {/* Bottom HUD Bar & Controls */}
      <div className="w-full flex items-end justify-between gap-4">
        {/* Minimap */}
        <div className="bg-black/60 backdrop-blur-md border border-teal-600/40 rounded-2xl p-2 shadow-xl pointer-events-auto overflow-hidden">
          <canvas ref={minimapRef} width={160} height={160} className="rounded-xl w-32 h-32 md:w-36 md:h-36" />
          <div className="text-[10px] text-center text-gray-400 mt-1 uppercase font-semibold">Gulistan Map</div>
        </div>

        {/* Action Buttons with active binding labels */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {isVendor ? (
            <>
              <button
                onClick={() => onAction('sell')}
                className="px-4 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-gray-950 font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
              >
                <Package className="w-4 h-4" />
                <span>Sell [{sellKey}]</span>
              </button>
              <button
                onClick={() => onAction('upgrade')}
                className="px-4 py-3 rounded-2xl bg-teal-800/80 hover:bg-teal-700 border border-teal-600/60 text-amber-300 font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
              >
                <ArrowUp className="w-4 h-4" />
                <span>Upgrade (৳{130 + state.level * 85}) [{upgradeKey}]</span>
              </button>
              <button
                onClick={() => onAction('restock')}
                className="px-4 py-3 rounded-2xl bg-teal-800/80 hover:bg-teal-700 border border-teal-600/60 text-teal-200 font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Restock [{restockKey}]</span>
              </button>
              {state.level >= 10 && (
                <button
                  onClick={() => onAction('placeStall')}
                  className="px-4 py-3 rounded-2xl bg-red-800/80 hover:bg-red-700 border border-red-600/60 text-white font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
                >
                  <Store className="w-4 h-4" />
                  <span>Big Stall [{stallKey}]</span>
                </button>
              )}
              <button
                onClick={() => onAction('repair')}
                disabled={damage <= 0}
                className={`px-4 py-3 rounded-2xl font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95 ${
                  damage > 0
                    ? 'bg-amber-600 hover:bg-amber-500 text-gray-950 border border-amber-400 shadow-amber-500/20 animate-pulse cursor-pointer'
                    : 'bg-teal-950/50 border border-teal-800/30 text-gray-500 cursor-not-allowed opacity-50'
                }`}
                title={damage > 0 ? `Repair damage for ৳${repairCost}` : 'No repair needed'}
              >
                <Wrench className="w-4 h-4" />
                <span>Repair ৳{repairCost} [{repairKey}]</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onAction('arrest')}
                className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
              >
                <Shield className="w-4 h-4" />
                <span>Attempt Arrest [{sellKey}]</span>
              </button>
              <button
                onClick={() => onAction('repair')}
                disabled={damage <= 0}
                className={`px-4 py-3 rounded-2xl font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95 ${
                  damage > 0
                    ? 'bg-amber-600 hover:bg-amber-500 text-gray-950 border border-amber-400 shadow-amber-500/20 animate-pulse cursor-pointer'
                    : 'bg-teal-950/50 border border-teal-800/30 text-gray-500 cursor-not-allowed opacity-50'
                }`}
                title={damage > 0 ? `Repair damage for ৳${repairCost}` : 'No repair needed'}
              >
                <Wrench className="w-4 h-4" />
                <span>Repair ৳{repairCost} [{repairKey}]</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
