import React, { useState } from 'react';
import { ShoppingCart, Shield, Users, Play, Volume2, VolumeX, Sparkles, HelpCircle, Sliders } from 'lucide-react';
import { GameSettingsData, formatCode } from '../game/keybindings';

interface TitleScreenProps {
  onStartSolo: (role: 'vendor' | 'police') => void;
  onCreateRoom: (role: 'vendor' | 'police', name: string) => void;
  onJoinRoom: (roomCode: string, name: string) => void;
  muted: boolean;
  onToggleMute: () => void;
  onOpenSettings: () => void;
  settings?: GameSettingsData;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStartSolo,
  onCreateRoom,
  onJoinRoom,
  muted,
  onToggleMute,
  onOpenSettings,
  settings
}) => {
  const [role, setRole] = useState<'vendor' | 'police'>('vendor');
  const [mode, setMode] = useState<'solo' | 'online'>('solo');
  const [playerName, setPlayerName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const interactLabel = formatCode(settings?.bindings?.sell?.[0] || 'Space');

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-between p-6 bg-gradient-to-b from-[#122826]/90 via-[#0d1b1a]/95 to-[#091211] text-white overflow-y-auto">
      {/* Top bar */}
      <div className="w-full max-w-5xl flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-bold text-gray-900 shadow-lg text-xl">
            ৳
          </div>
          <div>
            <h2 className="font-bold text-amber-400 tracking-wider text-sm uppercase">Original 3D Game</h2>
            <p className="text-xs text-gray-300">Gulistan & New Market District</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-800/60 hover:bg-teal-700/80 border border-teal-600/40 text-xs font-medium transition"
          >
            <HelpCircle className="w-4 h-4 text-amber-300" />
            <span>How to Play</span>
          </button>
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-800/60 hover:bg-teal-700/80 border border-teal-600/40 text-xs font-medium text-amber-300 transition"
            title="Configure Controls & Camera"
          >
            <Sliders className="w-4 h-4 text-amber-300" />
            <span>Settings</span>
          </button>
          <button
            onClick={onToggleMute}
            className="p-2 rounded-lg bg-teal-800/60 hover:bg-teal-700/80 border border-teal-600/40 text-amber-300 transition"
            title={muted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Hero Center */}
      <div className="w-full max-w-4xl flex flex-col items-center text-center my-auto py-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold mb-4 tracking-wider uppercase">
          <Sparkles className="w-3.5 h-3.5" />
          ঢাকার ঠেলা · Street Survival & Pursuit
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-3 bg-gradient-to-r from-amber-200 via-amber-400 to-teal-300 bg-clip-text text-transparent drop-shadow-md font-['Hind_Siliguri',sans-serif]">
          THELA DHAKA
        </h1>
        <p className="text-lg md:text-xl text-gray-300 max-w-xl mb-8 font-['Hind_Siliguri',sans-serif]">
          ঝাঁঝালো রোদ, ব্যস্ত অলিগলি, ঠেলাগাড়ি আর পুলিশের ধাওয়া — ঢাকার রাজপথে টিকে থাকার লড়াই।
        </p>

        {/* Role & Mode Selectors */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 text-left">
          {/* Role Choice */}
          <div className="bg-teal-950/60 border border-teal-700/40 rounded-2xl p-5 backdrop-blur-md shadow-xl">
            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span> Select Role / চরিত্র
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRole('vendor')}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border transition ${
                  role === 'vendor'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-lg shadow-amber-500/10'
                    : 'bg-teal-900/30 border-teal-700/40 text-gray-300 hover:bg-teal-900/60'
                }`}
              >
                <ShoppingCart className="w-8 h-8 mb-2 text-amber-400" />
                <span className="font-bold text-sm">Thela Vendor</span>
                <span className="text-[10px] text-gray-400">ঠেলাগাড়িওয়ালা</span>
              </button>
              <button
                onClick={() => setRole('police')}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border transition ${
                  role === 'police'
                    ? 'bg-blue-500/20 border-blue-400 text-blue-300 shadow-lg shadow-blue-500/10'
                    : 'bg-teal-900/30 border-teal-700/40 text-gray-300 hover:bg-teal-900/60'
                }`}
              >
                <Shield className="w-8 h-8 mb-2 text-blue-400" />
                <span className="font-bold text-sm">Police Patrol</span>
                <span className="text-[10px] text-gray-400">পুলিশ কনস্টেবল</span>
              </button>
            </div>
          </div>

          {/* Mode Choice */}
          <div className="bg-teal-950/60 border border-teal-700/40 rounded-2xl p-5 backdrop-blur-md shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span> Game Mode / মোড
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => setMode('solo')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition ${
                    mode === 'solo'
                      ? 'bg-teal-600/30 border-teal-400 text-teal-200'
                      : 'bg-teal-900/30 border-teal-700/40 text-gray-300 hover:bg-teal-900/60'
                  }`}
                >
                  <Play className="w-4 h-4 text-amber-300" />
                  Solo vs AI
                </button>
                <button
                  onClick={() => setMode('online')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition ${
                    mode === 'online'
                      ? 'bg-teal-600/30 border-teal-400 text-teal-200'
                      : 'bg-teal-900/30 border-teal-700/40 text-gray-300 hover:bg-teal-900/60'
                  }`}
                >
                  <Users className="w-4 h-4 text-amber-300" />
                  1v1 Online
                </button>
              </div>

              {mode === 'online' && (
                <div className="space-y-2 pt-1 border-t border-teal-800/60">
                  <input
                    type="text"
                    placeholder="Enter Room Code"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-lg bg-black/40 border border-teal-600/50 text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}
            </div>

            <input
              type="text"
              placeholder="Your Name / খেলোয়াড়ের নাম"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-teal-600/50 text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-amber-400 mt-3"
            />
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={() => {
            if (mode === 'solo') {
              onStartSolo(role);
            } else {
              if (roomCodeInput.trim().length > 0) {
                onJoinRoom(roomCodeInput.trim(), playerName);
              } else {
                onCreateRoom(role, playerName);
              }
            }
          }}
          className="w-full max-w-md py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-gray-950 font-bold text-lg shadow-xl shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition flex items-center justify-center gap-3"
        >
          <Play className="w-6 h-6 fill-gray-950" />
          <span>{mode === 'solo' ? 'START GAME / খেলা শুরু করুন' : roomCodeInput ? 'JOIN ROOM / রুমে যোগ দিন' : 'CREATE 1V1 ROOM / রুম তৈরি করুন'}</span>
        </button>
      </div>

      {/* Footer controls hint with updated keys */}
      <div className="text-xs text-gray-400 text-center pb-2 flex flex-wrap items-center justify-center gap-3">
        <span>↑ / W Forward</span>
        <span>·</span>
        <span>↓ / S Reverse</span>
        <span>·</span>
        <span>← / A / → / D Steer</span>
        <span>·</span>
        <span>{interactLabel} Sell / Arrest</span>
        <span>·</span>
        <span>Hold Shift Sprint</span>
        <span>·</span>
        <span>Drag Mouse to Look</span>
        <span>·</span>
        <span>Scroll Zoom</span>
        <span>·</span>
        <span>U Upgrade</span>
        <span>·</span>
        <span>R Restock</span>
        <span>·</span>
        <span>C View</span>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#162927] border border-teal-600/50 rounded-2xl p-6 max-w-lg w-full shadow-2xl text-left space-y-4">
            <h3 className="text-lg font-bold text-amber-400">How to Play Thela Dhaka</h3>
            <div className="text-xs text-gray-300 space-y-2">
              <p>
                <strong>Vehicle Controls:</strong> Steer left/right (<code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">A / D / ← / →</code>) to rotate your heading. Drive forward (<code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">W / ↑</code>) or reverse backward (<code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">S / ↓</code>) with authentic cart handling. Hold <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">Shift</code> to sprint.
              </p>
              <p>
                <strong>As Vendor (ঠেলাগাড়িওয়ালা):</strong> Park near wandering pedestrians on the sidewalk, press{' '}
                <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">{interactLabel}</code> to start a sale. Earn Taka, upgrade your cart (U), restock items (R), and avoid police pursuit when heat rises!
              </p>
              <p>
                <strong>As Police (পুলিশ কনস্টেবল):</strong> Patrol the streets, chase the vendor, and press{' '}
                <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">{interactLabel}</code> at close range to arrest or negotiate.
              </p>
              <p>
                <strong>Drag Camera:</strong> Click and drag anywhere on screen to look around freely in 360°. Release to let the camera smoothly align behind your cart after 1.2s. Scroll mouse wheel to zoom in/out, or press <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">C</code> to cycle camera presets.
              </p>
              <p>
                <strong>Rebindable Keys:</strong> Rebind any key, adjust mouse sensitivity, and toggle inverted look in Settings.
              </p>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white font-semibold text-xs transition"
            >
              Got It / বুঝেছি
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
