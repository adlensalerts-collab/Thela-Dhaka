import React, { useEffect, useRef, useState } from 'react';
import {
  ShoppingCart,
  Shield,
  Star,
  Award,
  Package,
  Pause,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
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
  Flame,
  Camera,
  Gamepad2,
  Clock
} from 'lucide-react';
import { GameState } from '../game/simulation';
import { GameSettingsData, formatCode } from '../game/keybindings';
import { GARAGE_SITES } from '../game/world/garages';
import { AAROT_SITES } from '../game/world/aarots';
import { USE_REAL_MAP, REAL_MAP_ID } from '../game/simulation';
import { getDistrict } from '../game/map/districtData';
import { createDistrictMinimap } from '../game/map/minimap';
import { loadDisplaySettings } from '../game/render/display';

type HeldControlAction = 'forward' | 'backward' | 'turnLeft' | 'turnRight' | 'sprint';

interface GameHUDProps {
  state: GameState;
  notice: string;
  onAction: (action: string) => void;
  onHoldAction?: (action: HeldControlAction, held: boolean) => void;
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
  onHoldAction,
  onPause,
  onOpenSettings,
  settings,
  roomCode,
  muted = false,
  onToggleMute
}) => {
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dpadRef = useRef<HTMLDivElement>(null);
  const dpadPointerIdRef = useRef<number | null>(null);
  // world (x, z) → minimap pixels; real map uses the district transform, grid map the old ±120 one
  const mapXZRef = useRef<(x: number, z: number) => [number, number]>((x, z) => [((x + 120) / 240) * 160, ((z + 120) / 240) * 160]);
  const isVendor = state.mode === 'vendor' || state.mode === 'online_vendor';
  const isSoloVendor = state.mode === 'vendor';
  const dayNumber = state.dayNumber ?? 1;
  const dayClockText = state.dayClockText ?? '06:00';
  const dayProfit = state.dayProfit ?? -90;
  const dayTarget = Math.max(1, state.dayTarget ?? 600);
  const dayProgressPct = Math.min(100, Math.max(0, Math.round((Math.max(0, dayProfit) / dayTarget) * 100)));
  const dayTargetReached = dayProfit >= dayTarget;
  const activeDistrictId = state.districtId ?? state.campaign?.district ?? REAL_MAP_ID;

  const [showTouchControls, setShowTouchControls] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia?.('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      window.innerWidth < 1024
    );
  });
  const [heldUi, setHeldUi] = useState<Record<HeldControlAction, boolean>>({
    forward: false,
    backward: false,
    turnLeft: false,
    turnRight: false,
    sprint: false
  });
  const heldRef = useRef<Record<HeldControlAction, boolean>>({
    forward: false,
    backward: false,
    turnLeft: false,
    turnRight: false,
    sprint: false
  });

  const setControlHeld = (action: HeldControlAction, held: boolean) => {
    if (heldRef.current[action] === held) return;
    heldRef.current[action] = held;
    setHeldUi((prev) => (prev[action] === held ? prev : { ...prev, [action]: held }));
    onHoldAction?.(action, held);
  };

  const releaseAllDirectional = () => {
    setControlHeld('forward', false);
    setControlHeld('backward', false);
    setControlHeld('turnLeft', false);
    setControlHeld('turnRight', false);
  };

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1024 || window.matchMedia?.('(pointer: coarse)').matches) {
        setShowTouchControls(true);
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      (['forward', 'backward', 'turnLeft', 'turnRight', 'sprint'] as HeldControlAction[]).forEach(
        (act) => onHoldAction?.(act, false)
      );
    };
  }, []);

  const updateDpadFromPoint = (clientX: number, clientY: number) => {
    const el = dpadRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const deadzone = rect.width * 0.14;

    setControlHeld('forward', dy < -deadzone);
    setControlHeld('backward', dy > deadzone);
    setControlHeld('turnLeft', dx < -deadzone);
    setControlHeld('turnRight', dx > deadzone);
  };

  // Memoized static minimap background rendering (updates when district or role changes)
  useEffect(() => {
    const size = 160;
    if (USE_REAL_MAP) {
      const mm = createDistrictMinimap(getDistrict(activeDistrictId), size, isVendor ? 'vendor' : 'police');
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
  }, [isVendor, activeDistrictId]);

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
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-2 sm:p-3 md:p-4 font-['Poppins','Hind_Siliguri',sans-serif]">
      {/* Top Header Bar */}
      <div className="w-full flex flex-col xl:flex-row items-stretch xl:items-start justify-between gap-2 sm:gap-3">
        {/* Status stats card */}
        <div className="bg-black/65 backdrop-blur-md border border-teal-600/40 rounded-2xl px-2.5 py-2 sm:p-3 shadow-xl flex flex-wrap items-center gap-x-2.5 gap-y-1.5 sm:gap-4 text-white pointer-events-auto max-w-full">
          {/* Role badge */}
          <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-teal-900/60 border border-teal-600/40 text-amber-300 font-bold text-[11px] sm:text-xs tracking-wider">
            {isVendor ? <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" /> : <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />}
            <span>{isVendor ? 'VENDOR · ঠেলা' : 'POLICE · পুলিশ'}</span>
            {roomCode && (
              <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-300 ml-0.5">
                Room: {roomCode}
              </span>
            )}
          </div>

          <div className="hidden sm:block h-8 w-px bg-teal-800/60" />

          {isSoloVendor && (
            <>
              {/* Working Day & Clock */}
              <div className="flex flex-col">
                <span className="text-[9px] sm:text-[10px] text-teal-300 uppercase tracking-wider font-semibold whitespace-nowrap">
                  Day {String(dayNumber).padStart(2, '0')} · দিন {dayNumber}
                </span>
                <span className="text-sm sm:text-base font-extrabold text-white font-mono tabular-nums leading-tight flex items-center gap-1 whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{dayClockText}</span>
                  <span className="text-[10px] text-gray-400 font-normal">/22:00</span>
                </span>
              </div>

              <div className="hidden sm:block h-8 w-px bg-teal-800/60" />

              {/* Daily Net Profit & Target */}
              <div className="flex flex-col min-w-[128px] sm:min-w-[156px]">
                <div className="flex justify-between items-center text-[9px] sm:text-[10px] uppercase tracking-wider mb-0.5 gap-1.5 whitespace-nowrap">
                  <span className="text-gray-300 font-semibold">নিট লাভ · Profit</span>
                  <span
                    className={`font-mono tabular-nums font-extrabold ${
                      dayTargetReached
                        ? 'text-emerald-400'
                        : dayProfit >= 0
                        ? 'text-amber-300'
                        : 'text-rose-400'
                    }`}
                  >
                    {dayProfit >= 0 ? `৳${dayProfit}` : `-৳${Math.abs(dayProfit)}`} / ৳{dayTarget}
                  </span>
                </div>
                <div className="w-full h-1.5 sm:h-2 bg-gray-900/90 rounded-full overflow-hidden border border-teal-800/40">
                  <div
                    className={`h-full transition-all duration-200 rounded-full ${
                      dayTargetReached
                        ? 'bg-emerald-400'
                        : dayProfit >= 0
                        ? 'bg-amber-400'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${dayProgressPct}%` }}
                  />
                </div>
                <span className="text-[8.5px] sm:text-[9px] text-teal-200/80 leading-none mt-0.5 whitespace-nowrap">
                  ভাড়া+খাবার ৳৯০ সহ · incl. ৳90 rent/food
                </span>
              </div>

              <div className="hidden sm:block h-8 w-px bg-teal-800/60" />
            </>
          )}

          {/* Wallet / Cash */}
          <div className="flex flex-col">
            <span className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wider">{isVendor ? 'Wallet / ওয়ালেট' : 'Duty Cash'}</span>
            <span className="text-sm sm:text-base font-extrabold text-amber-400 font-mono leading-tight">
              ৳{isVendor ? state.cash : state.policeCash}
            </span>
          </div>

          <div className="hidden sm:block h-8 w-px bg-teal-800/60" />

          {/* Level / Rank */}
          <div className="flex flex-col">
            <span className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wider">{isVendor ? 'Cart Level' : 'Rank'}</span>
            <span className="text-sm sm:text-base font-extrabold text-teal-300 leading-tight">
              {isVendor ? String(state.level).padStart(2, '0') : ['', 'CONST.', 'ASI', 'SI', 'INSP.'][state.rank]}
            </span>
          </div>

          <div className="hidden sm:block h-8 w-px bg-teal-800/60" />

          {/* Stock / Integrity */}
          <div className="flex flex-col">
            <span className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wider">{isVendor ? 'Stock' : 'Integrity'}</span>
            <span className="text-sm sm:text-base font-extrabold text-white leading-tight">
              {isVendor ? `${state.stock}/${state.cap}` : `${state.integrity}%`}
            </span>
          </div>

          {isVendor && (
            <>
              <div className="hidden sm:block h-8 w-px bg-teal-800/60" />

              {/* Vendor Life / Health Bar */}
              <div className="flex flex-col min-w-[76px] sm:min-w-[100px]">
                <div className="flex justify-between items-center text-[9px] sm:text-[10px] uppercase tracking-wider mb-0.5 sm:mb-1 gap-1">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Heart className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-rose-400 fill-rose-400" />
                    LIFE
                  </span>
                  <span className={`font-mono font-bold ${healthTextColor}`}>
                    {health}%
                  </span>
                </div>
                <div className="w-full h-1.5 sm:h-2 bg-gray-900/90 rounded-full overflow-hidden border border-teal-800/40">
                  <div
                    className={`h-full transition-all duration-200 rounded-full ${healthBarColor}`}
                    style={{ width: `${Math.min(100, Math.max(0, health))}%` }}
                  />
                </div>
              </div>
            </>
          )}

          <div className="hidden sm:block h-8 w-px bg-teal-800/60" />

          {/* Damage / Condition Bar */}
          <div className="flex flex-col min-w-[82px] sm:min-w-[110px]">
            <div className="flex justify-between items-center text-[9px] sm:text-[10px] uppercase tracking-wider mb-0.5 sm:mb-1 gap-1">
              <span className="text-gray-400">Damage</span>
              <span className={`font-mono font-bold ${damageTextColor}`}>
                {damage >= 100 ? 'BROKEN' : `${damage}%`}
              </span>
            </div>
            <div className="w-full h-1.5 sm:h-2 bg-gray-900/90 rounded-full overflow-hidden border border-teal-800/40">
              <div
                className={`h-full transition-all duration-300 rounded-full ${damageBarColor}`}
                style={{ width: `${Math.min(100, Math.max(damage > 0 ? 8 : 0, damage))}%` }}
              />
            </div>
          </div>

          <div className="hidden sm:block h-8 w-px bg-teal-800/60" />

          {/* Stamina Bar */}
          <div className="flex flex-col min-w-[92px] sm:min-w-[120px]">
            <div className="flex justify-between items-center text-[9px] sm:text-[10px] uppercase tracking-wider mb-0.5 sm:mb-1 gap-1.5">
              <span className="text-gray-400">STAMINA</span>
              <span className={`font-mono font-bold ${staminaTextColor}`}>
                {stamina}% · L{staminaLevel}
              </span>
            </div>
            <div className="w-full h-1.5 sm:h-2 bg-gray-900/90 rounded-full overflow-hidden border border-teal-800/40">
              <div
                className={`h-full transition-all duration-150 rounded-full ${staminaBarColor}`}
                style={{ width: `${Math.min(100, Math.max(0, stamina))}%` }}
              />
            </div>
            {exhausted ? (
              <span className="text-[9px] sm:text-[10px] text-rose-400 font-bold animate-pulse mt-0.5 leading-none">
                হাঁপাচ্ছে · ধীর গতি
              </span>
            ) : stamina < 75 ? (
              <span className="text-[9px] sm:text-[10px] text-amber-300 font-semibold mt-0.5 leading-none">
                গতি কমছে ({Math.round(50 + 0.5 * stamina)}%)
              </span>
            ) : null}
          </div>

          <div className="hidden sm:block h-8 w-px bg-teal-800/60" />

          {/* Sales / Arrests */}
          <div className="flex flex-col">
            <span className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wider">{isVendor ? 'Sales' : 'Arrests'}</span>
            <span className="text-sm sm:text-base font-extrabold text-amber-300 leading-tight">
              {isVendor ? state.sales : state.arrests}
            </span>
          </div>
        </div>

        {/* Top Right: Weather, Ambient Soundscape, Heat stars, Touch Toggle, Mute, Settings, Pause & FPS Counter */}
        <div className="flex flex-col items-end gap-1.5 pointer-events-auto self-end xl:self-auto">
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <button
              onClick={() => onAction('cycleWeather')}
              className="bg-black/60 backdrop-blur-md border border-teal-600/40 hover:bg-teal-900/50 rounded-2xl px-2.5 py-1.5 sm:px-3.5 sm:py-2 shadow-xl flex items-center gap-1.5 sm:gap-2 text-xs text-teal-100 transition cursor-pointer"
              title="Dynamic Weather (Click to cycle Sunny / Rainy / Foggy)"
            >
              {state.weather === 'rainy' ? (
                <CloudRain className="w-4 h-4 text-sky-400 shrink-0" />
              ) : state.weather === 'foggy' ? (
                <CloudFog className="w-4 h-4 text-slate-300 shrink-0" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <div className="flex flex-col items-start leading-tight">
                <span className="font-semibold text-white text-[10px] sm:text-[11px]">
                  {state.weatherLabel || 'Sunny · রোদেলা'}
                </span>
                <span className="hidden sm:inline text-[10px] text-teal-300/90 font-mono">
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
                className={`bg-black/60 backdrop-blur-md border rounded-2xl px-2.5 py-1.5 sm:px-3.5 sm:py-2 shadow-xl flex items-center gap-1.5 text-[11px] sm:text-xs font-bold ${
                  angryPedCount > 0
                    ? 'border-rose-500/60 text-rose-400'
                    : 'border-orange-500/40 text-orange-300'
                }`}
                title="Crowd Rage & Angry Pedestrians Chasing You"
              >
                <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-orange-500 text-orange-400" />
                <span>জনরোষ: {rage}%</span>
                {angryPedCount > 0 && (
                  <span className="font-mono text-rose-300 ml-0.5">
                    · {angryPedCount}
                  </span>
                )}
              </div>
            )}

            {isVendor && (
              <div className="bg-black/60 backdrop-blur-md border border-amber-500/40 rounded-2xl px-2.5 py-1.5 sm:px-4 sm:py-2.5 shadow-xl flex items-center gap-1 sm:gap-1.5 text-amber-400 text-xs sm:text-sm font-bold">
                <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-amber-400 text-amber-400" />
                <span className="hidden sm:inline">Wanted:</span>
                <span className="font-mono tracking-widest">
                  {'★'.repeat(stars)}
                  {'☆'.repeat(5 - stars)}
                </span>
              </div>
            )}

            <button
              onClick={() => {
                setShowTouchControls((prev) => {
                  const next = !prev;
                  if (!next) {
                    releaseAllDirectional();
                    setControlHeld('sprint', false);
                  }
                  return next;
                });
              }}
              className={`p-2 sm:p-3 rounded-2xl backdrop-blur-md border shadow-xl transition cursor-pointer ${
                showTouchControls
                  ? 'bg-teal-800/80 border-amber-400/60 text-amber-300'
                  : 'bg-black/60 border-teal-600/40 hover:bg-teal-900/60 text-gray-200 hover:text-white'
              }`}
              title={showTouchControls ? 'Hide On-Screen Touch Controls' : 'Show On-Screen Touch Controls'}
              aria-label="Toggle Touch Controls"
            >
              <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {onToggleMute && (
              <button
                onClick={onToggleMute}
                className="p-2 sm:p-3 rounded-2xl bg-black/60 backdrop-blur-md border border-teal-600/40 hover:bg-teal-900/60 text-gray-200 hover:text-white shadow-xl transition"
                title={muted ? 'Unmute Dhaka Soundscape' : 'Mute Dhaka Soundscape'}
              >
                {muted ? (
                  <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
                )}
              </button>
            )}

            <button
              onClick={onOpenSettings}
              className="p-2 sm:p-3 rounded-2xl bg-black/60 backdrop-blur-md border border-teal-600/40 hover:bg-teal-900/60 text-gray-200 hover:text-white shadow-xl transition"
              title="Open Settings"
            >
              <Sliders className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
            </button>

            <button
              onClick={onPause}
              className="p-2 sm:p-3 rounded-2xl bg-black/60 backdrop-blur-md border border-teal-600/40 hover:bg-teal-900/60 text-white shadow-xl transition"
              title="Pause Game"
            >
              <Pause className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
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
        <div
          className="
            absolute top-[118px] sm:top-[104px] left-1/2 -translate-x-1/2 max-w-[calc(100vw-1.5rem)] sm:max-w-[560px] w-max
            pointer-events-none bg-teal-950/95 border border-teal-500/60
            rounded-2xl px-4 sm:px-6 py-2 sm:py-2.5 shadow-2xl backdrop-blur-md
            text-amber-300 font-bold text-xs sm:text-sm tracking-wide text-center
            transition-all duration-200 ease-out
          "
        >
          {notice}
        </div>
      )}

      {/* Hotspot indicator: stand still to draw customers */}
      {isVendor && state.hotspotName && (
        <div className="absolute bottom-[168px] sm:bottom-[92px] right-2 sm:right-4 pointer-events-none bg-black/65 backdrop-blur-md border border-orange-500/50 rounded-xl px-3 py-1.5 text-[11px] text-orange-200 font-semibold whitespace-nowrap max-w-[calc(100vw-1rem)] overflow-hidden">
          <div className="truncate">🔥 হট স্পট · {state.hotspotName}</div>
          <div className="text-[10px] text-orange-300/80 truncate">দাঁড়িয়ে থাকুন — ক্রেতা আসবে · Stand still to draw customers</div>
          <div className="mt-1 h-1 w-full bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-orange-400 transition-all" style={{ width: `${Math.round((state.hotspotDwell ?? 0) * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Mobile / Touch On-Screen Driving & Sprint Controls */}
      {showTouchControls && (
        <div
          data-testid="mobile-touch-controls"
          className="absolute bottom-[88px] sm:bottom-[96px] left-2 right-2 sm:left-4 sm:right-4 flex items-end justify-between pointer-events-none z-20"
        >
          {/* Left Thumb D-Pad / Slide Steering Pad */}
          <div
            ref={dpadRef}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              dpadPointerIdRef.current = e.pointerId;
              updateDpadFromPoint(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (dpadPointerIdRef.current === e.pointerId) {
                e.stopPropagation();
                updateDpadFromPoint(e.clientX, e.clientY);
              }
            }}
            onPointerUp={(e) => {
              if (dpadPointerIdRef.current === e.pointerId) {
                e.stopPropagation();
                dpadPointerIdRef.current = null;
                releaseAllDirectional();
              }
            }}
            onPointerCancel={(e) => {
              if (dpadPointerIdRef.current === e.pointerId) {
                dpadPointerIdRef.current = null;
                releaseAllDirectional();
              }
            }}
            className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-black/55 backdrop-blur-md border border-teal-500/40 shadow-2xl pointer-events-auto touch-none select-none flex items-center justify-center"
            aria-label="Touch Steering Pad"
          >
            {/* Up / Forward */}
            <button
              type="button"
              aria-label="Drive Forward"
              className={`absolute top-1.5 left-1/2 -translate-x-1/2 w-11 h-10 rounded-xl flex items-center justify-center border transition ${
                heldUi.forward
                  ? 'bg-amber-400 text-gray-950 border-amber-300 scale-95 shadow-lg'
                  : 'bg-teal-950/80 text-amber-300 border-teal-600/50'
              }`}
            >
              <ArrowUp className="w-5 h-5" />
            </button>
            {/* Down / Reverse */}
            <button
              type="button"
              aria-label="Reverse"
              className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 w-11 h-10 rounded-xl flex items-center justify-center border transition ${
                heldUi.backward
                  ? 'bg-amber-400 text-gray-950 border-amber-300 scale-95 shadow-lg'
                  : 'bg-teal-950/80 text-amber-300 border-teal-600/50'
              }`}
            >
              <ArrowDown className="w-5 h-5" />
            </button>
            {/* Left / Steer Left */}
            <button
              type="button"
              aria-label="Steer Left"
              className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-10 h-11 rounded-xl flex items-center justify-center border transition ${
                heldUi.turnLeft
                  ? 'bg-amber-400 text-gray-950 border-amber-300 scale-95 shadow-lg'
                  : 'bg-teal-950/80 text-amber-300 border-teal-600/50'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            {/* Right / Steer Right */}
            <button
              type="button"
              aria-label="Steer Right"
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-11 rounded-xl flex items-center justify-center border transition ${
                heldUi.turnRight
                  ? 'bg-amber-400 text-gray-950 border-amber-300 scale-95 shadow-lg'
                  : 'bg-teal-950/80 text-amber-300 border-teal-600/50'
              }`}
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            {/* Center hub */}
            <div className="w-6 h-6 rounded-full bg-teal-900/70 border border-teal-600/40 pointer-events-none" />
          </div>

          {/* Right Thumb Cluster: Camera View, Hold Sprint & Quick Sell/Arrest */}
          <div className="flex flex-col items-end gap-2 pointer-events-auto touch-none select-none">
            <button
              type="button"
              onClick={() => onAction('changeView')}
              className="px-3.5 py-2.5 rounded-2xl bg-black/65 backdrop-blur-md border border-teal-500/50 text-teal-200 font-bold text-xs shadow-xl flex items-center gap-1.5 active:scale-95 transition"
              aria-label="Change Camera View"
            >
              <Camera className="w-4 h-4 text-amber-300" />
              <span>View · ক্যামেরা</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setControlHeld('sprint', true);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  setControlHeld('sprint', false);
                }}
                onPointerCancel={() => setControlHeld('sprint', false)}
                className={`min-w-[68px] min-h-[54px] px-3.5 py-2.5 rounded-2xl border font-bold text-xs shadow-xl flex flex-col items-center justify-center gap-0.5 transition ${
                  heldUi.sprint
                    ? 'bg-amber-400 text-gray-950 border-amber-300 scale-95 shadow-amber-400/30'
                    : 'bg-teal-950/85 text-amber-300 border-teal-500/60'
                }`}
                aria-label="Hold to Sprint"
              >
                <Zap className="w-4 h-4" />
                <span>Sprint · দৌড়</span>
              </button>

              <button
                type="button"
                onClick={() => onAction(isVendor ? 'sell' : 'arrest')}
                className={`min-w-[74px] min-h-[54px] px-4 py-2.5 rounded-2xl font-extrabold text-xs shadow-xl flex flex-col items-center justify-center gap-0.5 active:scale-95 transition ${
                  isVendor
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-gray-950 border border-amber-300'
                    : 'bg-blue-600 text-white border border-blue-400'
                }`}
                aria-label={isVendor ? 'Sell Item' : 'Attempt Arrest'}
              >
                {isVendor ? <Package className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                <span>{isVendor ? 'Sell · বিক্রি' : 'Arrest · আটক'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom HUD Bar & Controls */}
      <div className="absolute bottom-2 sm:bottom-4 left-2 right-2 sm:left-4 sm:right-4 flex items-end justify-between gap-2 sm:gap-4">
        {/* Minimap */}
        <div className="bg-black/60 backdrop-blur-md border border-teal-600/40 rounded-2xl p-1.5 sm:p-2 shadow-xl pointer-events-auto overflow-hidden shrink-0">
          <canvas ref={minimapRef} width={160} height={160} className="rounded-xl w-16 h-16 sm:w-28 sm:h-28 md:w-36 md:h-36" />
          <div className="text-[9px] sm:text-[10px] text-center text-gray-400 mt-0.5 sm:mt-1 uppercase font-semibold truncate max-w-[4rem] sm:max-w-none">{USE_REAL_MAP ? getDistrict(activeDistrictId).name : 'Gulistan'} Map</div>
          <div className="hidden sm:block text-[8px] text-center text-gray-500 leading-tight">© OpenStreetMap contributors</div>
        </div>

        {/* Action Buttons with active binding labels (never wrap, fixed-width numbers) */}
        <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2 pointer-events-auto overflow-x-auto max-w-full py-0.5">
          {isVendor ? (
            <>
              <button
                onClick={() => onAction('sell')}
                className="whitespace-nowrap shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-gray-950 font-bold text-xs shadow-lg flex items-center gap-1.5 sm:gap-2 transition active:scale-95"
              >
                <Package className="w-4 h-4" />
                <span>Sell [{sellKey}]</span>
              </button>
              <button
                onClick={() => onAction('upgrade')}
                title={state.nearGarage ? 'Upgrade your cart' : 'Upgrades are done at a garage'}
                className={`whitespace-nowrap shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl border font-bold text-xs shadow-lg flex items-center gap-1.5 sm:gap-2 transition active:scale-95 ${state.nearGarage ? 'bg-teal-800/80 hover:bg-teal-700 border-teal-600/60 text-amber-300' : 'bg-teal-950/60 border-teal-800/40 text-gray-400'}`}
              >
                <ArrowUp className="w-4 h-4" />
                <span>Upgrade (৳{130 + state.level * 85}) [{upgradeKey}]</span>
              </button>
              {staminaLevel >= 5 || staminaUpgradeCost === null ? (
                <button
                  onClick={() => onAction('upgradeStamina')}
                  disabled
                  className="whitespace-nowrap shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-teal-950/50 border border-teal-800/30 text-gray-500 font-bold text-xs shadow-lg flex items-center gap-1.5 sm:gap-2 cursor-not-allowed opacity-60"
                >
                  <Zap className="w-4 h-4" />
                  <span>Stamina MAX</span>
                </button>
              ) : (
                <button
                  onClick={() => onAction('upgradeStamina')}
                  title={state.nearGarage ? 'Upgrade stamina' : 'Upgrades are done at a garage'}
                  className={`whitespace-nowrap shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl border font-bold text-xs shadow-lg flex items-center gap-1.5 sm:gap-2 transition active:scale-95 ${state.nearGarage ? 'bg-sky-900/80 hover:bg-sky-800 border-sky-500/60 text-sky-200' : 'bg-teal-950/60 border-teal-800/40 text-gray-400'}`}
                >
                  <Zap className="w-4 h-4 text-sky-400" />
                  <span>Stamina ৳<span className="tabular-nums">{staminaUpgradeCost}</span> [{staminaKey}]</span>
                </button>
              )}
              {state.nearAarot ? (
                <button
                  onClick={() => onAction('restock')}
                  className="whitespace-nowrap shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-gray-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 sm:gap-2 transition active:scale-95 animate-pulse cursor-pointer"
                  title="Restock inventory at wholesale aarot"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Restock [{restockKey}]</span>
                </button>
              ) : (
                <button
                  onClick={() => onAction('restock')}
                  className="whitespace-nowrap shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-teal-950/70 hover:bg-teal-900/80 border border-teal-700/50 text-gray-300 font-bold text-xs shadow-lg flex items-center gap-1.5 sm:gap-2 transition active:scale-95 cursor-pointer"
                  title="Drive to nearest wholesale aarot to restock"
                >
                  <RefreshCw className="w-4 h-4 text-emerald-400/80" />
                  <span>আড়ত <span className="tabular-nums inline-block min-w-[3ch] text-right">{state.aarotDistance ?? 0}</span>m [{restockKey}]</span>
                </button>
              )}
              {state.level >= 10 && (
                <button
                  onClick={() => onAction('placeStall')}
                  className="whitespace-nowrap shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-red-800/80 hover:bg-red-700 border border-red-600/60 text-white font-bold text-xs shadow-lg flex items-center gap-1.5 sm:gap-2 transition active:scale-95"
                >
                  <Store className="w-4 h-4" />
                  <span>Big Stall [{stallKey}]</span>
                </button>
              )}
              {state.nearGarage ? (
                <button
                  onClick={() => onAction('repair')}
                  disabled={damage <= 0}
                  className={`whitespace-nowrap shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl font-bold text-xs shadow-lg flex items-center gap-1.5 sm:gap-2 transition active:scale-95 ${
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
                  className="whitespace-nowrap shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl font-bold text-xs shadow-lg flex items-center gap-1.5 sm:gap-2 transition active:scale-95 bg-teal-950/70 hover:bg-teal-900/80 border border-teal-700/50 text-gray-300 cursor-pointer"
                  title="Drive to nearest garage to repair"
                >
                  <Wrench className="w-4 h-4 text-amber-400/80" />
                  <span>গ্যারেজ <span className="tabular-nums inline-block min-w-[3ch] text-right">{state.garageDistance ?? 0}</span>m [{repairKey}]</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => onAction('arrest')}
                className="whitespace-nowrap shrink-0 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg flex items-center gap-1.5 sm:gap-2 transition active:scale-95"
              >
                <Shield className="w-4 h-4" />
                <span>Attempt Arrest [{sellKey}]</span>
              </button>
              {state.nearGarage ? (
                <button
                  onClick={() => onAction('repair')}
                  disabled={damage <= 0}
                  className={`whitespace-nowrap shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl font-bold text-xs shadow-lg flex items-center gap-1.5 sm:gap-2 transition active:scale-95 ${
                    damage > 0
                      ? 'bg-amber-600 hover:bg-amber-500 text-gray-950 border border-amber-400 shadow-amber-500/20 animate-pulse cursor-pointer'
                      : 'bg-teal-950/50 border border-teal-800/30 text-gray-500 cursor-not-allowed opacity-50'
                  }`}
                  title={damage > 0 ? `Repair damage for ৳${repairCost}` : 'No repair needed'}
                >
                  <Wrench className="w-4 h-4" />
                  <span>Treatment / চিকিৎসা ৳{repairCost} [{repairKey}]</span>
                </button>
              ) : (
                <button
                  onClick={() => onAction('repair')}
                  className="whitespace-nowrap shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl font-bold text-xs shadow-lg flex items-center gap-1.5 sm:gap-2 transition active:scale-95 bg-teal-950/70 hover:bg-teal-900/80 border border-teal-700/50 text-gray-300 cursor-pointer"
                  title="Go to the nearest hospital for treatment"
                >
                  <Wrench className="w-4 h-4 text-amber-400/80" />
                  <span>হাসপাতাল <span className="tabular-nums inline-block min-w-[3ch] text-right">{state.garageDistance ?? 0}</span>m [{repairKey}]</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
