import React from 'react';
import { AlertTriangle, ShieldCheck, DollarSign, RefreshCw, Home, Sliders } from 'lucide-react';
import { GameState } from '../game/simulation';
import { RunStats } from '../game/stats';
import { StatsScreen } from './StatsScreen';

interface EventModalProps {
  type: 'bribe' | 'arrest_decision' | 'paused' | 'over' | 'victory' | null;
  state: GameState | null;
  stats?: RunStats | null;
  onPayBribe: () => void;
  onGoToJail: () => void;
  onRecordArrest: () => void;
  onTakeIllicit: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onOpenSettings?: () => void;
}

export const EventModal: React.FC<EventModalProps> = ({
  type,
  state,
  stats,
  onPayBribe,
  onGoToJail,
  onRecordArrest,
  onTakeIllicit,
  onResume,
  onRestart,
  onMainMenu,
  onOpenSettings
}) => {
  if (!type) return null;

  const bribeCost = state ? 90 + state.level * 45 : 150;

  if (type === 'over' || type === 'victory') {
    return (
      <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6">
        <StatsScreen
          stats={stats ?? null}
          onRestart={onRestart}
          onMainMenu={onMainMenu}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
      <div className="bg-[#152a28] border border-teal-500/50 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6">
        {type === 'bribe' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <span className="text-[10px] text-amber-400 uppercase tracking-widest font-bold">Fictional Satirical Event</span>
              <h2 className="text-2xl font-bold text-white mt-1">Caught by Police / পুলিশের মুখোমুখি</h2>
            </div>
            <p className="text-xs text-gray-300">
              The officer demands an unlawful in-game bribe of <strong className="text-amber-400 font-mono text-sm">৳{bribeCost}</strong> or you go to jail. (Virtual currency only).
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={onPayBribe}
                className="py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs shadow-lg transition"
              >
                Pay ৳{bribeCost} (Bribe)
              </button>
              <button
                onClick={onGoToJail}
                className="py-3 px-4 rounded-2xl bg-red-800/80 hover:bg-red-700 text-white font-bold text-xs shadow-lg transition"
              >
                Go to Jail (Run Over)
              </button>
            </div>
          </>
        )}

        {type === 'arrest_decision' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center mx-auto text-blue-400">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <span className="text-[10px] text-blue-400 uppercase tracking-widest font-bold">Constable Decision</span>
              <h2 className="text-2xl font-bold text-white mt-1">Vendor Apprehended / বিক্রেতা আটক</h2>
            </div>
            <p className="text-xs text-gray-300">
              Choose to record a lawful arrest for rank progression or take an illicit payment (reduces integrity).
            </p>
            <div className="grid grid-cols-1 gap-3 pt-2">
              <button
                onClick={onRecordArrest}
                className="py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                Record Lawful Arrest (+Progress)
              </button>
              <button
                onClick={onTakeIllicit}
                className="py-3 px-4 rounded-2xl bg-amber-700/80 hover:bg-amber-600 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2"
              >
                <DollarSign className="w-4 h-4" />
                Take Illicit ৳150 (No arrest credit)
              </button>
            </div>
          </>
        )}

        {type === 'paused' && (
          <>
            <h2 className="text-2xl font-bold text-amber-400">Game Paused</h2>
            <div className="space-y-3 pt-4">
              <button
                onClick={onResume}
                className="w-full py-3 rounded-2xl bg-teal-700 hover:bg-teal-600 text-white font-bold text-sm shadow-lg transition"
              >
                Resume Game
              </button>
              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="w-full py-3 rounded-2xl bg-teal-800/80 hover:bg-teal-700 border border-teal-600/50 text-amber-300 font-bold text-sm shadow-lg transition flex items-center justify-center gap-2"
                >
                  <Sliders className="w-4 h-4" />
                  Settings / সেটিংস
                </button>
              )}
              <button
                onClick={onRestart}
                className="w-full py-3 rounded-2xl bg-teal-900/60 hover:bg-teal-800 text-amber-300 font-bold text-sm shadow-lg transition flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Restart Run
              </button>
              <button
                onClick={onMainMenu}
                className="w-full py-3 rounded-2xl bg-red-950/60 hover:bg-red-900 text-red-300 font-bold text-sm shadow-lg transition flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                Main Menu
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
