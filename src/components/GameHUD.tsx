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
  VolumeX,
  Zap,
  Sun,
  CloudRain,
  CloudFog,
  Heart,
  Flame
} from 'lucide-react';
import { GameState } from '../game/simulation';
import { GameSettingsData, formatCode } from '../game/keybindings';
import { GARAGE_SITES } from '../game/world/garages';
import { AAROT_SITES } from '../game/world/aarots';
import { USE_REAL_MAP, REAL_MAP_ID } from '../game/simulation';
import { getDistrict } from '../game/map/districtData';
import { createDistrictMinimap } from '../game/map/minimap';
import { loadDisplaySettings } from '../game/render/display';

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
  // world (x, z) → minimap pixels; real map uses the district transform, grid map the old ±120 one
  const mapXZRef = useRef<(x: number, z: number) => [number, number]>((x, z) => [((x + 120) / 240) * 160, ((z + 120) / 240) * 160]);
  const isVendor = state.mode === 'vendor' || state.mode === 'online_vendor';

  // Memoized static minimap background rendering (only creates once)
  useEffect(() => {
    const size = 160;
    if (USE_REAL_MAP) {
      const mm = createDistrictMinimap(getDistrict(REAL_MAP_ID), size);
      bgCanvasRef.current = mm.canvas;
      mapXZRef.current = mm.toMap;
      return;
    }
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
      // Garage markers (amber square with "G") at each GARAGE_SITES position
      for (const site of GARAGE_SITES) {
        const gx = ((site.x + 120) / 240) * size;
        const gz = ((site.z + 120) / 240) * size;
        const boxSize = 13;
        cx.fillStyle = '#f59e0b';
        cx.fillRect(gx - boxSize / 2, gz - boxSize / 2, boxSize, boxSize);
        cx.strokeStyle = '#142e29';
        cx.lineWidth = 1.5;
        cx.strokeRect(gx - boxSize / 2, gz - boxSize / 2, boxSize, boxSize);
        cx.fillStyle = '#111827';
        cx.font = 'bold 9px sans-serif';
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';
        cx.fillText('G', gx, gz + 0.5);
      }
      // Aarot markers (green square with "A") at each AAROT_SITES position
      for (const site of AAROT_SITES) {
        const ax = ((site.x + 120) / 240) * size;
        const az = ((site.z + 120) / 240) * size;
        const boxSize = 13;
        cx.fillStyle = '#22c55e';
        cx.fillRect(ax - boxSize / 2, az - boxSize / 2, boxSize, boxSize);
        cx.strokeStyle = '#0f291c';
        cx.lineWidth = 1.5;
        cx.strokeRect(ax - boxSize / 2, az - boxSize / 2, boxSize, boxSize);
        cx.fillStyle = '#111827';
        cx.font = 'bold 9px sans-serif';
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';
        cx.fillText('A', ax, az + 0.5);
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
    const toMapXZ = mapXZRef.current;
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    cx.drawImage(bgCanvasRef.current, 0, 0);

    // Hostile / injured pedestrian blips (orange-red dots)
    if (isVendor && state.angryPeds && state.angryPeds.length > 0) {
      for (const ap of state.angryPeds) {
        const [amx, amy] = toMapXZ(ap.x, ap.z);
        const ax = clamp(amx, 5, size - 5);
        const ay = clamp(amy, 5, size - 5);
        cx.beginPath();
        cx.arc(ax, ay, 3.2, 0, Math.PI * 2);
        cx.fillStyle = '#f97316';
        cx.fill();
        cx.strokeStyle = '#7f1d1d';
        cx.lineWidth = 1;
        cx.stroke();
      }
    }

    // Police blip (vendor modes only): shown when alert or within 40 units of player
    if (isVendor) {
      const distToOfficer = Math.hypot(
        (state.officerX ?? 0) - (state.playerX ?? 0),
        (state.officerZ ?? 0) - (state.playerZ ?? 0)
      );
      if (state.alert || distToOfficer <= 40) {
        const blinkOn = !state.alert || Math.floor(Date.now() / 220) % 2 === 0;
        if (blinkOn) {
          const [omx, omy] = toMapXZ(state.officerX ?? 0, state.officerZ ?? 0);
          const ox = clamp(omx, 6, size - 6);
          const oy = clamp(omy, 6, size - 6);
          cx.beginPath();
          cx.arc(ox, oy, 4, 0, Math.PI * 2);
          cx.fillStyle = '#ef4444';
          cx.fill();
          cx.strokeStyle = '#ffffff';
          cx.lineWidth = 1.5;
          cx.stroke();
        }
      }
    }

    // Player blip: white-outlined amber arrow rotated by state.heading
    const [pmx, pmy] = toMapXZ(state.playerX ?? 0, state.playerZ ?? 0);
    const px = clamp(pmx, 8, size - 8);
    const py = clamp(pmy, 8, size - 8);
    cx.save();
    cx.translate(px, py);
    cx.rotate(state.heading || 0);
    cx.beginPath();
    cx.moveTo(0, -7);
    cx.lineTo(-5, 5);
    cx.lineTo(5, 5);
    cx.closePath();
    cx.fillStyle = '#f59e0b';
    cx.fill();
    cx.strokeStyle = '#ffffff';
    cx.lineWidth = 1.5;
    cx.stroke();
    cx.restore();

    // Frame border stroke on top
    cx.strokeStyle = '#c5a059';
    cx.lineWidth = 2;
    cx.strokeRect(1, 1, size - 2, size - 2);
  }, [state.playerX, state.playerZ, state.heading, state.officerX, state.officerZ, state.alert, state.angryPeds, isVendor]);

  const stars = Math.min(5, Math.ceil(state.heat / 20));

  const sellKey = formatCode(settings.bindings.sell?.[0] || 'Space');
  const upgradeKey = formatCode(settings.bindings.upgrade?.[0] || 'KeyU');
  const staminaKey = formatCode(settings.bindings.upgradeStamina?.[0] || 'KeyT');
  const restockKey = formatCode(settings.bindings.restock?.[0] || 'KeyR');
  const stallKey = formatCode(settings.bindings.placeStall?.[0] || 'KeyB');
  const repairKey = formatCode(settings.bindings.repair?.[0] || 'KeyF');

  const damage = state.damage || 0;
  const repairCost = state.repairCost || 0;
  const health = Math.round(state.health ?? 100);
  const rage = Math.round(state.rage ?? 0);
  const angryPedCount = state.angryPedCount ?? 0;
  const stamina = Math.round(state.stamina ?? 100);
  const staminaLevel = state.staminaLevel ?? (isVendor ? 1 : 3);
  const staminaUpgradeCost = state.staminaUpgradeCost === undefined ? 150 : state.staminaUpgradeCost;
  const exhausted = Boolean(state.exhausted);
  const showFps = state.showFps ?? loadDisplaySettings().showFps;
  const fps = state.fps ?? 60;
  const renderHeight = state.renderHeight ?? 1080;

  // Health bar color
  let healthBarColor = 'bg-emerald-500';
  let healthTextColor = 'text-emerald-400';
  if (health <= 30) {
    healthBarColor = 'bg-rose-500 animate-pulse';
    healthTextColor = 'text-rose-400 animate-pulse';
  } else if (health <= 60) {
    healthBarColor = 'bg-amber-500';
    healthTextColor = 'text-amber-400';
  }

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

  // Stamina bar color (sky-blue normally, amber below 35, flashing red while exhausted)
  let staminaBarColor = 'bg-sky-400';
  let staminaTextColor = 'text-sky-300';
  if (exhausted) {
    staminaBarColor = 'bg-rose-500 animate-pulse';
    staminaTextColor = 'text-rose-400 animate-pulse';
  } else if (stamina < 35) {
    staminaBarColor = 'bg-amber-400';
    staminaTextColor = 'text-amber-300';
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

          {isVendor && (
            <>
              <div className="h-8 w-px bg-teal-800/60" />

              {/* Vendor Life / Health Bar */}
              <div className="flex flex-col min-w-[100px]">
                <div className="flex justify-between items-center text-[10px] uppercase tracking-wider mb-1 gap-1.5">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Heart className="w-3 h-3 text-rose-400 fill-rose-400" />
                    LIFE · জীবন
                  </span>
                  <span className={`font-mono font-bold ${healthTextColor}`}>
                    {health}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-900/90 rounded-full overflow-hidden border border-teal-800/40">
                  <div
                    className={`h-full transition-all duration-200 rounded-full ${healthBarColor}`}
                    style={{ width: `${Math.min(100, Math.max(0, health))}%` }}
                  />
                </div>
              </div>
            </>
          )}

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

          {/* Stamina Bar */}
          <div className="flex flex-col min-w-[120px]">
            <div className="flex justify-between items-center text-[10px] uppercase tracking-wider mb-1 gap-2">
              <span className="text-gray-400">STAMINA · দম</span>
              <span className={`font-mono font-bold ${staminaTextColor}`}>
                {stamina}% · L{staminaLevel}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-900/90 rounded-full overflow-hidden border border-teal-800/40">
              <div
                className={`h-full transition-all duration-150 rounded-full ${staminaBarColor}`}
                style={{ width: `${Math.min(100, Math.max(0, stamina))}%` }}
              />
            </div>
            {exhausted ? (
              <span className="text-[10px] text-rose-400 font-bold animate-pulse mt-0.5 leading-none">
                হাঁপাচ্ছে · ধীর গতি
              </span>
            ) : stamina < 75 ? (
              <span className="text-[10px] text-amber-300 font-semibold mt-0.5 leading-none">
                গতি কমছে ({Math.round(50 + 0.5 * stamina)}%)
              </span>
            ) : null}
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

        {/* Top Right: Weather, Ambient Soundscape, Heat stars, Mute, Settings, Pause & FPS Counter */}
        <div className="flex flex-col items-end gap-1.5 pointer-events-auto">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onAction('cycleWeather')}
              className="bg-black/60 backdrop-blur-md border border-teal-600/40 hover:bg-teal-900/50 rounded-2xl px-3.5 py-2 shadow-xl flex items-center gap-2 text-xs text-teal-100 transition cursor-pointer"
              title="Dynamic Weather (Click to cycle Sunny / Rainy / Foggy)"
            >
              {state.weather === 'rainy' ? (
                <CloudRain className="w-4 h-4 text-sky-400" />
              ) : state.weather === 'foggy' ? (
                <CloudFog className="w-4 h-4 text-slate-300" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" />
              )}
              <div className="flex flex-col items-start leading-tight">
                <span className="font-semibold text-white text-[11px]">
                  {state.weatherLabel || 'Sunny · রোদেলা'}
                </span>
                <span className="text-[10px] text-teal-300/90 font-mono">
                  Grip {state.weatherTraction ?? 100}% · Vis {state.weatherVisibility ?? 100}%
                </span>
              </div>
            </button>

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

            {isVendor && (angryPedCount > 0 || rage > 0) && (
              <div
                className={`bg-black/60 backdrop-blur-md border rounded-2xl px-3.5 py-2 shadow-xl flex items-center gap-1.5 text-xs font-bold ${
                  angryPedCount > 0
                    ? 'border-rose-500/60 text-rose-400'
                    : 'border-orange-500/40 text-orange-300'
                }`}
                title="Crowd Rage & Angry Pedestrians Chasing You"
              >
                <Flame className="w-4 h-4 fill-orange-500 text-orange-400" />
                <span>জনরোষ: {rage}%</span>
                {angryPedCount > 0 && (
                  <span className="font-mono text-rose-300 ml-1">
                    · {angryPedCount} Chasing
                  </span>
                )}
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

          {showFps && (
            <div
              className={`px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-teal-700/40 font-mono text-[11px] font-bold tracking-tight shadow-lg pointer-events-none ${
                fps >= 55
                  ? 'text-emerald-400'
                  : fps >= 30
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {fps} FPS · {renderHeight}p
            </div>
          )}
        </div>
      </div>

      {/* Top-Centre Notice Popup */}
      {notice && (
        <div className="
          absolute top-[104px] left-1/2 -translate-x-1/2 max-w-[560px] w-max
          pointer-events-none bg-teal-950/95 border border-teal-500/60
          rounded-2xl px-6 py-2.5 shadow-2xl backdrop-blur-md
          text-amber-300 font-bold text-sm tracking-wide text-center
          transition-all duration-200 ease-out
        ">
          {notice}
        </div>
      )}

      {/* Bottom HUD Bar & Controls */}
      <div className="w-full flex items-end justify-between gap-4">
        {/* Minimap */}
        <div className="bg-black/60 backdrop-blur-md border border-teal-600/40 rounded-2xl p-2 shadow-xl pointer-events-auto overflow-hidden">
          <canvas ref={minimapRef} width={160} height={160} className="rounded-xl w-32 h-32 md:w-36 md:h-36" />
          <div className="text-[10px] text-center text-gray-400 mt-1 uppercase font-semibold">{USE_REAL_MAP ? getDistrict(REAL_MAP_ID).name : 'Gulistan'} Map</div>
          <div className="text-[8px] text-center text-gray-500 leading-tight">© OpenStreetMap contributors</div>
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
              {staminaLevel >= 5 || staminaUpgradeCost === null ? (
                <button
                  onClick={() => onAction('upgradeStamina')}
                  disabled
                  className="px-4 py-3 rounded-2xl bg-teal-950/50 border border-teal-800/30 text-gray-500 font-bold text-xs shadow-lg flex items-center gap-2 cursor-not-allowed opacity-60"
                >
                  <Zap className="w-4 h-4" />
                  <span>Stamina MAX</span>
                </button>
              ) : (
                <button
                  onClick={() => onAction('upgradeStamina')}
                  className="px-4 py-3 rounded-2xl bg-sky-900/80 hover:bg-sky-800 border border-sky-500/60 text-sky-200 font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
                >
                  <Zap className="w-4 h-4 text-sky-400" />
                  <span>Stamina ৳{staminaUpgradeCost} [{staminaKey}]</span>
                </button>
              )}
              {state.nearAarot ? (
                <button
                  onClick={() => onAction('restock')}
                  className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-gray-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition active:scale-95 animate-pulse cursor-pointer"
                  title="Restock inventory at wholesale aarot"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Restock [{restockKey}]</span>
                </button>
              ) : (
                <button
                  onClick={() => onAction('restock')}
                  className="px-4 py-3 rounded-2xl bg-teal-950/70 hover:bg-teal-900/80 border border-teal-700/50 text-gray-300 font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95 cursor-pointer"
                  title="Drive to nearest wholesale aarot to restock"
                >
                  <RefreshCw className="w-4 h-4 text-emerald-400/80" />
                  <span>আড়ত {state.aarotDistance ?? 0}m [{restockKey}]</span>
                </button>
              )}
              {state.level >= 10 && (
                <button
                  onClick={() => onAction('placeStall')}
                  className="px-4 py-3 rounded-2xl bg-red-800/80 hover:bg-red-700 border border-red-600/60 text-white font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
                >
                  <Store className="w-4 h-4" />
                  <span>Big Stall [{stallKey}]</span>
                </button>
              )}
              {state.nearGarage ? (
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
              ) : (
                <button
                  onClick={() => onAction('repair')}
                  className="px-4 py-3 rounded-2xl font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95 bg-teal-950/70 hover:bg-teal-900/80 border border-teal-700/50 text-gray-300 cursor-pointer"
                  title="Drive to nearest garage to repair"
                >
                  <Wrench className="w-4 h-4 text-amber-400/80" />
                  <span>গ্যারেজ {state.garageDistance ?? 0}m [{repairKey}]</span>
                </button>
              )}
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
              {state.nearGarage ? (
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
              ) : (
                <button
                  onClick={() => onAction('repair')}
                  className="px-4 py-3 rounded-2xl font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95 bg-teal-950/70 hover:bg-teal-900/80 border border-teal-700/50 text-gray-300 cursor-pointer"
                  title="Drive to nearest garage to repair"
                >
                  <Wrench className="w-4 h-4 text-amber-400/80" />
                  <span>গ্যারেজ {state.garageDistance ?? 0}m [{repairKey}]</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
