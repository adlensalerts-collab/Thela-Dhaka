import React, { useEffect, useState } from 'react';
import {
  ShoppingCart,
  Shield,
  Users,
  Play,
  Volume2,
  VolumeX,
  Sparkles,
  HelpCircle,
  Sliders,
  Copy,
  Check,
  XCircle,
  Loader2,
  Wifi,
  WifiOff,
  AlertCircle,
  PlusCircle,
  LogIn
} from 'lucide-react';
import { GameSettingsData, formatCode } from '../game/keybindings';

export type OnlineConnectionStatus = 'connected' | 'connecting' | 'unavailable';
export type PendingRoomAction = 'creating' | 'joining' | null;

export interface WaitingRoomInfo {
  roomCode: string;
  role: 'vendor' | 'police';
}

interface TitleScreenProps {
  onStartSolo: (role: 'vendor' | 'police') => void;
  onCreateRoom: (role: 'vendor' | 'police', name: string) => void;
  onJoinRoom: (roomCode: string, name: string) => void;
  onCancelWaiting?: () => void;
  onClearOnlineError?: () => void;
  connectionStatus?: OnlineConnectionStatus;
  pendingAction?: PendingRoomAction;
  waitingRoom?: WaitingRoomInfo | null;
  onlineError?: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onOpenSettings: () => void;
  settings?: GameSettingsData;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStartSolo,
  onCreateRoom,
  onJoinRoom,
  onCancelWaiting,
  onClearOnlineError,
  connectionStatus = 'connected',
  pendingAction = null,
  waitingRoom = null,
  onlineError = null,
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (waitingRoom) {
      setMode('online');
      setCopied(false);
    }
  }, [waitingRoom]);

  const formatBindingPair = (codes?: string[], fallback = '—') => {
    if (!codes || codes.length === 0) return fallback;
    return codes.map((c) => formatCode(c)).join(' / ');
  };

  const forwardLabel = formatBindingPair(settings?.bindings?.forward, '↑ / W');
  const backwardLabel = formatBindingPair(settings?.bindings?.backward, '↓ / S');
  const leftLabel = formatBindingPair(settings?.bindings?.turnLeft, '← / A');
  const rightLabel = formatBindingPair(settings?.bindings?.turnRight, '→ / D');
  const interactLabel = formatCode(settings?.bindings?.sell?.[0] || 'Space');
  const sprintLabel = formatCode(settings?.bindings?.sprint?.[0] || 'ShiftLeft');
  const upgradeLabel = formatCode(settings?.bindings?.upgrade?.[0] || 'KeyU');
  const restockLabel = formatCode(settings?.bindings?.restock?.[0] || 'KeyR');
  const viewLabel = formatCode(settings?.bindings?.changeView?.[0] || 'KeyC');

  const trimmedRoomCode = roomCodeInput.trim().toUpperCase();
  const isOnlineConnected = connectionStatus === 'connected';
  const isBusy = pendingAction !== null || waitingRoom !== null;
  const canCreateRoom = isOnlineConnected && !isBusy;
  const canJoinRoom = isOnlineConnected && !isBusy && trimmedRoomCode.length > 0;

  const handleCopyRoomCode = async () => {
    if (!waitingRoom?.roomCode) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(waitingRoom.roomCode);
      } else {
        const tempInput = document.createElement('input');
        tempInput.value = waitingRoom.roomCode;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-between p-4 sm:p-6 bg-gradient-to-b from-[#122826]/75 via-[#0d1b1a]/80 to-[#091211]/85 text-white overflow-y-auto select-none">
      {/* Top bar */}
      <div className="w-full max-w-5xl flex items-center justify-between py-2 sm:py-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-bold text-gray-900 shadow-lg text-xl">
            ৳
          </div>
          <div>
            <h2 className="font-bold text-amber-400 tracking-wider text-sm uppercase">Original 3D Game</h2>
            <p className="text-xs text-gray-300">Gulistan & New Market District</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-2.5">
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
      <div className="w-full max-w-4xl flex flex-col items-center text-center my-auto py-4 sm:py-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold mb-3 tracking-wider uppercase">
          <Sparkles className="w-3.5 h-3.5" />
          ঢাকার ঠেলা · Street Survival & Pursuit
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight mb-2 sm:mb-3 bg-gradient-to-r from-amber-200 via-amber-400 to-teal-300 bg-clip-text text-transparent drop-shadow-md font-['Hind_Siliguri',sans-serif]">
          THELA DHAKA
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-gray-300 max-w-xl mb-6 font-['Hind_Siliguri',sans-serif]">
          ঝাঁঝালো রোদ, ব্যস্ত অলিগলি, ঠেলাগাড়ি আর পুলিশের ধাওয়া — ঢাকার রাজপথে টিকে থাকার লড়াই।
        </p>

        {/* Role & Mode Selectors */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-5 mb-6 text-left">
          {/* Role Choice */}
          <div className="bg-teal-950/60 border border-teal-700/40 rounded-2xl p-5 backdrop-blur-md shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span> Select Role / চরিত্র
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setRole('vendor')}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border transition ${
                    role === 'vendor'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-lg shadow-amber-500/10'
                      : 'bg-teal-900/30 border-teal-700/40 text-gray-300 hover:bg-teal-900/60'
                  } ${isBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <ShoppingCart className="w-8 h-8 mb-2 text-amber-400" />
                  <span className="font-bold text-sm">Thela Vendor</span>
                  <span className="text-[10px] text-gray-400">ঠেলাগাড়িওয়ালা</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setRole('police')}
                  className={`flex flex-col items-center justify-center p-4 rounded-xl border transition ${
                    role === 'police'
                      ? 'bg-blue-500/20 border-blue-400 text-blue-300 shadow-lg shadow-blue-500/10'
                      : 'bg-teal-900/30 border-teal-700/40 text-gray-300 hover:bg-teal-900/60'
                  } ${isBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <Shield className="w-8 h-8 mb-2 text-blue-400" />
                  <span className="font-bold text-sm">Police Patrol</span>
                  <span className="text-[10px] text-gray-400">পুলিশ কনস্টেবল</span>
                </button>
              </div>
            </div>

            {mode === 'online' && (
              <p className="text-[11px] text-teal-200/80 mt-3 leading-relaxed">
                Creating a room uses your selected role above. Joining a friend&apos;s room automatically assigns the opposite role.
              </p>
            )}
          </div>

          {/* Mode Choice */}
          <div className="bg-teal-950/60 border border-teal-700/40 rounded-2xl p-5 backdrop-blur-md shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span> Game Mode / মোড
                </h3>

                {mode === 'online' && (
                  <span
                    data-testid="online-connection-status"
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                      connectionStatus === 'connected'
                        ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                        : connectionStatus === 'connecting'
                        ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                        : 'bg-rose-500/15 border-rose-400/40 text-rose-300'
                    }`}
                  >
                    {connectionStatus === 'connected' ? (
                      <>
                        <Wifi className="w-3 h-3" />
                        <span>Server Connected</span>
                      </>
                    ) : connectionStatus === 'connecting' ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Connecting...</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-3 h-3" />
                        <span>Server Unavailable</span>
                      </>
                    )}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    if (waitingRoom && onCancelWaiting) {
                      onCancelWaiting();
                    }
                    onClearOnlineError?.();
                    setMode('solo');
                  }}
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
                  type="button"
                  onClick={() => {
                    onClearOnlineError?.();
                    setMode('online');
                  }}
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
            </div>

            <div>
              <label className="block text-[11px] text-gray-300 font-medium mb-1">
                Player Name / খেলোয়াড়ের নাম
              </label>
              <input
                type="text"
                disabled={isBusy}
                placeholder="Your Name / খেলোয়াড়ের নাম"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-teal-600/50 text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-amber-400 disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        {/* Action Panel: Solo Start OR Explicit Online Lobby Controls */}
        {mode === 'solo' ? (
          <button
            type="button"
            onClick={() => onStartSolo(role)}
            className="w-full max-w-md py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-gray-950 font-bold text-lg shadow-xl shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition flex items-center justify-center gap-3"
          >
            <Play className="w-6 h-6 fill-gray-950" />
            <span>START GAME / খেলা শুরু করুন</span>
          </button>
        ) : (
          <div className="w-full bg-teal-950/75 border border-teal-700/50 rounded-2xl p-5 backdrop-blur-md shadow-2xl text-left space-y-4">
            {/* Unavailable server banner */}
            {connectionStatus === 'unavailable' && (
              <div
                role="alert"
                data-testid="online-unavailable-banner"
                className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs"
              >
                <WifiOff className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-rose-100">
                    Online multiplayer is currently unavailable · অনলাইন মাল্টিপ্লেয়ার এখন চালু নেই
                  </p>
                  <p className="text-rose-200/90 leading-relaxed">
                    Cannot connect to the live match server on this host. Please switch to{' '}
                    <button
                      type="button"
                      onClick={() => setMode('solo')}
                      className="underline font-semibold text-amber-300 hover:text-amber-200"
                    >
                      Solo vs AI
                    </button>{' '}
                    to play immediately.
                  </p>
                </div>
              </div>
            )}

            {/* Error banner (invalid room code, full room, etc.) */}
            {onlineError && connectionStatus !== 'unavailable' && (
              <div
                role="alert"
                data-testid="online-error-banner"
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-950/70 border border-amber-500/50 text-amber-200 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-medium">{onlineError}</span>
                </div>
                {onClearOnlineError && (
                  <button
                    type="button"
                    onClick={onClearOnlineError}
                    className="text-[11px] text-amber-300/80 hover:text-amber-200 underline shrink-0"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            )}

            {/* Waiting Room Panel (shown after room_created until start_multiplayer or Cancel) */}
            {waitingRoom ? (
              <div
                data-testid="waiting-room-panel"
                className="p-4 sm:p-5 rounded-xl bg-black/45 border border-amber-400/50 space-y-4 text-center"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-semibold">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Waiting for opponent · প্রতিপক্ষের অপেক্ষায়...</span>
                </div>

                <div>
                  <p className="text-xs text-gray-300 uppercase tracking-wider font-semibold mb-1.5">
                    Room Key (Share with your opponent)
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <div
                      data-testid="waiting-room-code"
                      className="px-6 py-3 rounded-xl bg-teal-950/90 border-2 border-amber-400/70 font-mono text-3xl sm:text-4xl font-extrabold tracking-[0.25em] text-amber-300 select-all shadow-inner"
                    >
                      {waitingRoom.roomCode}
                    </div>
                    <button
                      type="button"
                      data-testid="copy-room-code-btn"
                      onClick={handleCopyRoomCode}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs shadow-lg transition"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-gray-200">
                  <span className="px-3 py-1.5 rounded-lg bg-teal-900/60 border border-teal-700/50">
                    Host Role:{' '}
                    <strong className="text-amber-300">
                      {waitingRoom.role === 'vendor'
                        ? 'Thela Vendor (ঠেলাগাড়িওয়ালা)'
                        : 'Police Patrol (পুলিশ কনস্টেবল)'}
                    </strong>
                  </span>
                  <span className="px-3 py-1.5 rounded-lg bg-teal-900/60 border border-teal-700/50 text-gray-300">
                    Gameplay paused until opponent joins
                  </span>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    data-testid="cancel-waiting-btn"
                    onClick={() => onCancelWaiting?.()}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 border border-rose-400/40 text-white font-semibold text-xs transition"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Cancel / রুম বাতিল করুন</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Separate Create Room and Join Room Controls */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Create Room Box */}
                <div className="p-4 rounded-xl bg-black/35 border border-teal-700/40 flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                      Host a New Match · নতুন রুম
                    </h4>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      Create a new 1v1 room as{' '}
                      <span className="font-semibold text-amber-300">
                        {role === 'vendor' ? 'Thela Vendor' : 'Police Patrol'}
                      </span>{' '}
                      and get a room key to share.
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="create-room-btn"
                    disabled={!canCreateRoom}
                    onClick={() => onCreateRoom(role, playerName)}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-gray-950 font-bold text-sm shadow-lg shadow-amber-500/15 hover:brightness-105 active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {pendingAction === 'creating' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating Room...</span>
                      </>
                    ) : (
                      <>
                        <PlusCircle className="w-4 h-4" />
                        <span>Create Room / রুম তৈরি করুন</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Join Room Box */}
                <div className="p-4 rounded-xl bg-black/35 border border-teal-700/40 flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider mb-1">
                      Join Existing Room · রুমে যোগ দিন
                    </h4>
                    <input
                      type="text"
                      data-testid="join-room-code-input"
                      disabled={isBusy || connectionStatus === 'unavailable'}
                      placeholder="Enter Room Code (e.g. AB12C)"
                      value={roomCodeInput}
                      onChange={(e) => {
                        if (onlineError && onClearOnlineError) {
                          onClearOnlineError();
                        }
                        setRoomCodeInput(e.target.value.toUpperCase());
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canJoinRoom) {
                          onJoinRoom(trimmedRoomCode, playerName);
                        }
                      }}
                      className="w-full px-3 py-2.5 rounded-lg bg-black/50 border border-teal-600/60 text-white font-mono text-sm tracking-widest uppercase placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-500 focus:outline-none focus:border-amber-400 disabled:opacity-50"
                    />
                  </div>
                  <button
                    type="button"
                    data-testid="join-room-btn"
                    disabled={!canJoinRoom}
                    onClick={() => {
                      if (canJoinRoom) {
                        onJoinRoom(trimmedRoomCode, playerName);
                      }
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm shadow-lg shadow-teal-600/20 active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {pendingAction === 'joining' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Joining Room...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        <span>Join Room / রুমে যোগ দিন</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer controls hint with updated keys */}
      <div className="text-xs text-gray-400 text-center pb-2 flex flex-wrap items-center justify-center gap-3">
        <span>{forwardLabel} Forward</span>
        <span>·</span>
        <span>{backwardLabel} Reverse</span>
        <span>·</span>
        <span>
          {leftLabel} / {rightLabel} Steer
        </span>
        <span>·</span>
        <span>{interactLabel} Sell / Arrest</span>
        <span>·</span>
        <span>Hold {sprintLabel} Sprint</span>
        <span>·</span>
        <span>Drag Mouse to Look</span>
        <span>·</span>
        <span>Scroll Zoom</span>
        <span>·</span>
        <span>{upgradeLabel} Upgrade</span>
        <span>·</span>
        <span>{restockLabel} Restock</span>
        <span>·</span>
        <span>{viewLabel} View</span>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#162927] border border-teal-600/50 rounded-2xl p-6 max-w-lg w-full shadow-2xl text-left space-y-4">
            <h3 className="text-lg font-bold text-amber-400">How to Play Thela Dhaka</h3>
            <div className="text-xs text-gray-300 space-y-2">
              <p>
                <strong>Vehicle Controls:</strong> Steer left/right (
                <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">
                  {leftLabel} / {rightLabel}
                </code>
                ) to rotate your heading. Drive forward (
                <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">{forwardLabel}</code>)
                or reverse backward (
                <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">{backwardLabel}</code>)
                with authentic cart handling. Hold{' '}
                <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">{sprintLabel}</code> to
                sprint.
              </p>
              <p>
                <strong>As Vendor (ঠেলাগাড়িওয়ালা):</strong> Park near wandering pedestrians on the
                sidewalk, press{' '}
                <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">{interactLabel}</code>{' '}
                to start a sale. Earn Taka, upgrade your cart ({upgradeLabel}), restock items (
                {restockLabel}), and avoid police pursuit when heat rises!
              </p>
              <p>
                <strong>As Police (পুলিশ কনস্টেবল):</strong> Patrol the streets, chase the vendor, and
                press{' '}
                <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">{interactLabel}</code>{' '}
                at close range to arrest or negotiate.
              </p>
              <p>
                <strong>Drag Camera:</strong> Click and drag anywhere on screen to look around freely in
                360°. Release to let the camera smoothly align behind your cart after 1.2s. Scroll mouse
                wheel to zoom in/out, or press{' '}
                <code className="bg-black/50 px-1.5 py-0.5 rounded text-amber-300">{viewLabel}</code> to
                cycle camera presets.
              </p>
              <p>
                <strong>Rebindable Keys:</strong> Rebind any key, adjust mouse sensitivity, and toggle
                inverted look in Settings.
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
      <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-white/50 pointer-events-none">
        Map data © OpenStreetMap contributors (ODbL)
      </div>
    </div>
  );
};

