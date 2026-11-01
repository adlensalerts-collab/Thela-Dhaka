import React, { useEffect, useRef } from 'react';
import { ShoppingCart, Shield, Star, Award, Package, Pause, ArrowUp, RefreshCw, Store } from 'lucide-react';
import { GameState } from '../game/simulation';

interface GameHUDProps {
  state: GameState;
  notice: string;
  onAction: (action: string) => void;
  onPause: () => void;
  roomCode?: string;
}

export const GameHUD: React.FC<GameHUDProps> = ({ state, notice, onAction, onPause, roomCode }) => {
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const isVendor = state.mode === 'vendor' || state.mode === 'online_vendor';

  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const cx = canvas.getContext('2d');
    if (!cx) return;
    const size = 160;
    cx.clearRect(0, 0, size, size);
    cx.fillStyle = '#d3c9a8';
    cx.fillRect(0, 0, size, size);
    cx.strokeStyle = '#67695f';
    cx.lineWidth = 8;
    const street = [-80, -40, 0, 40, 80];
    for (const v of street) {
      const t = (v + 120) / 240 * size;
      cx.beginPath();
      cx.moveTo(t, 0);
      cx.lineTo(t, size);
      cx.stroke();
      cx.beginPath();
      cx.moveTo(0, t);
      cx.lineTo(size, t);
      cx.stroke();
    }
  }, [state.time]);

  const stars = Math.min(5, Math.ceil(state.heat / 20));

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
            {roomCode && <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-300 ml-1">Room: {roomCode}</span>}
          </div>

          <div className="h-8 w-px bg-teal-800/60" />

          {/* Wallet / Cash */}
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">{isVendor ? 'Wallet / ওয়ালেট' : 'Duty Cash'}</span>
            <span className="text-base font-extrabold text-amber-400 font-mono">৳{isVendor ? state.cash : state.policeCash}</span>
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

          {/* Sales / Arrests */}
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">{isVendor ? 'Sales' : 'Arrests'}</span>
            <span className="text-base font-extrabold text-amber-300">
              {isVendor ? state.sales : state.arrests}
            </span>
          </div>
        </div>

        {/* Top Right: Pause button & Heat stars */}
        <div className="flex items-center gap-3 pointer-events-auto">
          {isVendor && (
            <div className="bg-black/60 backdrop-blur-md border border-amber-500/40 rounded-2xl px-4 py-2.5 shadow-xl flex items-center gap-1.5 text-amber-400 text-sm font-bold">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span>Wanted:</span>
              <span className="font-mono tracking-widest">{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>
            </div>
          )}

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
        <div className="self-center bg-teal-950/90 border border-teal-500/60 rounded-2xl px-6 py-2.5 shadow-2xl backdrop-blur-md text-amber-300 font-bold text-sm tracking-wide text-center animate-bounce">
          {notice}
        </div>
      )}

      {/* Bottom HUD Bar & Controls */}
      <div className="w-full flex items-end justify-between gap-4">
        {/* Minimap */}
        <div className="bg-black/60 backdrop-blur-md border border-teal-600/40 rounded-2xl p-2 shadow-xl pointer-events-auto overflow-hidden">
          <canvas ref={minimapRef} width={160} height={160} className="rounded-xl w-32 h-32 md:w-40 md:h-40" />
          <div className="text-[10px] text-center text-gray-400 mt-1 uppercase font-semibold">Gulistan Map</div>
        </div>

        {/* Action Buttons (Desktop & Mobile) */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {isVendor ? (
            <>
              <button
                onClick={() => onAction('e')}
                className="px-4 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-gray-950 font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
              >
                <Package className="w-4 h-4" />
                <span>Sell (E)</span>
              </button>
              <button
                onClick={() => onAction('u')}
                className="px-4 py-3 rounded-2xl bg-teal-800/80 hover:bg-teal-700 border border-teal-600/60 text-amber-300 font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
              >
                <ArrowUp className="w-4 h-4" />
                <span>Upgrade (৳{130 + state.level * 85}) (U)</span>
              </button>
              <button
                onClick={() => onAction('r')}
                className="px-4 py-3 rounded-2xl bg-teal-800/80 hover:bg-teal-700 border border-teal-600/60 text-teal-200 font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Restock (R)</span>
              </button>
              {state.level >= 10 && (
                <button
                  onClick={() => onAction('b')}
                  className="px-4 py-3 rounded-2xl bg-red-800/80 hover:bg-red-700 border border-red-600/60 text-white font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
                >
                  <Store className="w-4 h-4" />
                  <span>Big Stall (B)</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => onAction('e')}
                className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
              >
                <Shield className="w-4 h-4" />
                <span>Attempt Arrest (E)</span>
              </button>
              {state.arrests >= 5 && (
                <button
                  onClick={() => onAction('x')}
                  className="px-5 py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-gray-950 font-bold text-xs shadow-lg flex items-center gap-2 transition active:scale-95"
                >
                  <Award className="w-4 h-4" />
                  <span>Magistrate Op (X)</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
