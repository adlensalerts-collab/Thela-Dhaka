import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, GameState } from './game/simulation';
import {
  TitleScreen,
  OnlineConnectionStatus,
  PendingRoomAction,
  WaitingRoomInfo
} from './components/TitleScreen';
import { GameHUD } from './components/GameHUD';
import { EventModal } from './components/EventModal';
import { SettingsModal } from './components/SettingsModal';
import { loadSettings, GameSettingsData } from './game/keybindings';
import { loadDisplaySettings, DisplaySettings } from './game/render/display';
import { RunStats } from './game/stats';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string | undefined;
const ONLINE_AVAILABLE = import.meta.env.VITE_STATIC_HOST !== 'true' || !!SERVER_URL;
const OFFLINE_MESSAGE =
  'Online multiplayer is not available on this host — please play Solo vs AI. · অনলাইন মাল্টিপ্লেয়ার এই সাইটে চালু নেই — সোলো খেলুন।';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [settings, setSettings] = useState<GameSettingsData>(() => loadSettings());
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => loadDisplaySettings());
  const [showSettings, setShowSettings] = useState(false);

  const [view, setView] = useState<'menu' | 'playing'>('menu');
  const [modalType, setModalType] = useState<'bribe' | 'arrest_decision' | 'paused' | 'over' | 'victory' | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [notice, setNotice] = useState('Welcome to Thela Dhaka · ঢাকার ঠেলা');
  const [muted, setMuted] = useState(false);
  const [roomCode, setRoomCode] = useState<string>('');
  const [rematchPending, setRematchPending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<OnlineConnectionStatus>(() =>
    ONLINE_AVAILABLE ? 'connecting' : 'unavailable'
  );
  const [pendingRoomAction, setPendingRoomAction] = useState<PendingRoomAction>(null);
  const [waitingRoom, setWaitingRoom] = useState<WaitingRoomInfo | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);

  const roomCodeRef = useRef<string>('');
  const opponentIdRef = useRef<string | null>(null);
  const roundRef = useRef<number>(1);
  const pendingRoomActionRef = useRef<PendingRoomAction>(null);
  const waitingRoomRef = useRef<WaitingRoomInfo | null>(null);

  const updateRoomCode = (code: string) => {
    roomCodeRef.current = code;
    setRoomCode(code);
  };

  const updatePendingRoomAction = (action: PendingRoomAction) => {
    pendingRoomActionRef.current = action;
    setPendingRoomAction(action);
  };

  const updateWaitingRoom = (info: WaitingRoomInfo | null) => {
    waitingRoomRef.current = info;
    setWaitingRoom(info);
  };

  const leaveCurrentRoom = (pauseAbandoned = true) => {
    const activeCode = roomCodeRef.current;
    if (activeCode && socketRef.current) {
      socketRef.current.emit('leave_room', { roomCode: activeCode });
    }
    opponentIdRef.current = null;
    roundRef.current = 1;
    setRematchPending(false);
    updatePendingRoomAction(null);
    updateWaitingRoom(null);
    updateRoomCode('');
    setRunStats(null);
    setModalType(null);
    if (pauseAbandoned) {
      engineRef.current?.pauseGame();
    }
  };

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const initialSettings = loadSettings();
    const engine = new GameEngine(
      containerRef.current,
      (state) => setGameState({ ...state }),
      (type, data) => {
        if (type === 'notify') {
          showToast(data);
        } else if (type === 'bribe_prompt') {
          setModalType('bribe');
        } else if (type === 'police_decision') {
          setModalType('arrest_decision');
        } else if (type === 'arrest_attempt') {
          if (socketRef.current && roomCodeRef.current) {
            if (engineRef.current) {
              const net = engineRef.current.getNetState();
              socketRef.current.emit('player_update', {
                roomCode: roomCodeRef.current,
                pos: { x: net.x, z: net.z },
                heading: net.heading,
                speed: net.speed,
                cash: net.cash,
                stock: net.stock,
                heat: net.heat,
                alert: net.alert
              });
            }
            socketRef.current.emit('player_action', {
              roomCode: roomCodeRef.current,
              type: 'arrest_attempt'
            });
          }
        } else if (type === 'pause') {
          engineRef.current?.pauseGame();
          setModalType('paused');
        } else if (type === 'game_over') {
          setRunStats(data ?? engineRef.current?.lastRunStats ?? null);
          setModalType('over');
        }
      },
      initialSettings.bindings,
      {
        mouseSensitivity: initialSettings.mouseSensitivity,
        invertY: initialSettings.invertY
      }
    );

    engineRef.current = engine;
    engine.start();
    engine.publishState(true);

    // Socket.io connection for online multiplayer
    const socket = ONLINE_AVAILABLE ? (SERVER_URL ? io(SERVER_URL) : io()) : null;
    socketRef.current = socket;
    if (!socket) {
      setConnectionStatus('unavailable');
      return () => {
        engine.stop();
      };
    }

    let disposed = false;
    if (socket.connected) {
      setConnectionStatus('connected');
    }

    const isOnlineMode = () => {
      const mode = engine.state?.mode;
      return mode === 'online_vendor' || mode === 'online_police';
    };

    const isCurrentSessionEvent = (msg?: { id?: string; roomCode?: string }) => {
      const activeCode = roomCodeRef.current;
      if (!activeCode || !isOnlineMode()) return false;
      if (msg?.roomCode && msg.roomCode !== activeCode) return false;
      if (msg?.id && opponentIdRef.current && msg.id !== opponentIdRef.current) return false;
      return true;
    };

    socket.on('connect', () => {
      if (disposed) return;
      setConnectionStatus('connected');
      setOnlineError(null);
    });

    socket.on('connect_error', () => {
      if (disposed) return;
      setConnectionStatus('unavailable');
      updatePendingRoomAction(null);
      updateWaitingRoom(null);
      setRematchPending(false);
      updateRoomCode('');
      engine.pauseGame();
    });

    socket.on('room_created', (data) => {
      const createdCode = typeof data?.roomCode === 'string' ? data.roomCode.trim().toUpperCase() : '';
      if (!createdCode) {
        updatePendingRoomAction(null);
        return;
      }
      const role: 'vendor' | 'police' = data?.role === 'vendor' ? 'vendor' : 'police';
      opponentIdRef.current = null;
      roundRef.current =
        typeof data?.round === 'number' && Number.isFinite(data.round) ? data.round : 1;
      setRematchPending(false);
      updatePendingRoomAction(null);
      setOnlineError(null);
      updateRoomCode(createdCode);
      updateWaitingRoom({ roomCode: createdCode, role });
      setRunStats(null);
      setModalType(null);
      // Keep gameplay strictly paused on the title screen waiting panel until start_multiplayer arrives
      engine.pauseGame();
      setView('menu');
      setNotice(`Room created: ${createdCode}. Waiting for opponent...`);
    });

    socket.on('start_multiplayer', (room) => {
      if (!room?.code || !Array.isArray(room?.players)) return;
      const me = room.players.find((p: any) => p.id === socket.id);
      if (!me) return;
      const opponent = room.players.find((p: any) => p.id !== socket.id);
      opponentIdRef.current = opponent?.id ?? null;
      const nextRound =
        typeof room.round === 'number' && Number.isFinite(room.round) ? room.round : 1;
      roundRef.current = nextRound;
      setRematchPending(false);
      updatePendingRoomAction(null);
      updateWaitingRoom(null);
      setOnlineError(null);
      updateRoomCode(room.code);
      engine.setMode(me.role === 'vendor' ? 'online_vendor' : 'online_police');
      setRunStats(null);
      setModalType(null);
      showToast(
        nextRound > 1
          ? 'Rematch started! · পুনরায় খেলা শুরু!'
          : 'Match started! Both players connected.'
      );
      setView('playing');
    });

    socket.on('rematch_requested', (msg) => {
      if (!msg || !isCurrentSessionEvent({ roomCode: msg.roomCode })) return;
      if (msg.requesterId && msg.requesterId !== socket.id) {
        showToast('প্রতিপক্ষ পুনরায় খেলতে চায় · Opponent requested a rematch');
      }
    });

    socket.on('opponent_update', (msg) => {
      if (!msg || !isCurrentSessionEvent(msg)) return;
      engine.applyRemoteUpdate(msg);
    });

    socket.on('arrest_confirmed', (msg) => {
      if (!isCurrentSessionEvent(msg)) return;
      if (engine.state.mode === 'online_vendor') {
        engine.triggerCaught();
      } else if (engine.state.mode === 'online_police') {
        showToast('গ্রেপ্তার! · Vendor caught');
      }
    });

    socket.on('opponent_action', (msg) => {
      if (!msg || !isCurrentSessionEvent(msg)) return;
      if (engine.state.mode !== 'online_police') return;
      if (msg.type === 'bribe_paid') {
        engine.receiveOnlineBribe(msg.amount ?? 0);
      } else if (msg.type === 'jailed') {
        engine.receiveOnlineVictory();
      }
    });

    socket.on('player_disconnected', (msg) => {
      if (!roomCodeRef.current) return;
      if (msg?.roomCode && msg.roomCode !== roomCodeRef.current) return;
      if (msg?.id && opponentIdRef.current && msg.id !== opponentIdRef.current) return;
      opponentIdRef.current = null;
      roundRef.current = 1;
      setRematchPending(false);
      updatePendingRoomAction(null);
      updateWaitingRoom(null);
      updateRoomCode('');
      setRunStats(null);
      setModalType(null);
      engine.pauseGame();
      setView('menu');
      showToast('প্রতিপক্ষ চলে গেছে · Opponent left');
    });

    socket.on('disconnect', () => {
      if (disposed) return;
      setConnectionStatus('unavailable');
      const hadOnlineContext =
        Boolean(roomCodeRef.current) ||
        Boolean(waitingRoomRef.current) ||
        Boolean(pendingRoomActionRef.current) ||
        isOnlineMode();
      opponentIdRef.current = null;
      roundRef.current = 1;
      setRematchPending(false);
      updatePendingRoomAction(null);
      updateWaitingRoom(null);
      updateRoomCode('');
      setRunStats(null);
      setModalType(null);
      engine.pauseGame();
      if (hadOnlineContext) {
        setView('menu');
        showToast('সংযোগ বিচ্ছিন্ন · Disconnected from server');
      }
    });

    socket.on('error_message', (msg) => {
      const errorText = String(msg || 'Multiplayer error');
      updatePendingRoomAction(null);
      setOnlineError(errorText);
      showToast(errorText);
    });

    return () => {
      disposed = true;
      engine.stop();
      socket.disconnect();
    };
  }, []);

  // Periodic 80 ms position & state sync while in an online mode and playing
  const currentMode = gameState?.mode;
  const currentStage = gameState?.stage;
  useEffect(() => {
    const isOnline = currentMode === 'online_vendor' || currentMode === 'online_police';
    if (view !== 'playing' || !isOnline || currentStage !== 'playing') return;
    const interval = window.setInterval(() => {
      const engine = engineRef.current;
      const socket = socketRef.current;
      const code = roomCodeRef.current;
      if (!engine || !socket || !code || engine.state.stage !== 'playing') return;
      const net = engine.getNetState();
      socket.emit('player_update', {
        roomCode: code,
        pos: { x: net.x, z: net.z },
        heading: net.heading,
        speed: net.speed,
        cash: net.cash,
        stock: net.stock,
        heat: net.heat,
        alert: net.alert
      });
    }, 80);
    return () => window.clearInterval(interval);
  }, [view, currentMode, currentStage]);

  // Sync menu/modal open state with engine to ensure gameplay input is blocked
  useEffect(() => {
    const isMenuOpen = showSettings || modalType !== null || view === 'menu';
    engineRef.current?.setMenuOpen(isMenuOpen);
    if (!isMenuOpen && view === 'playing') {
      engineRef.current?.renderer?.domElement?.focus();
    }
  }, [showSettings, modalType, view]);

  // Global Escape key handling for game pause and closing settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSettings) {
          setShowSettings(false);
        } else if (view === 'playing' && !modalType) {
          engineRef.current?.pauseGame();
          setModalType('paused');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, showSettings, modalType]);

  const handleStartSolo = (role: 'vendor' | 'police') => {
    if (!engineRef.current) return;
    setOnlineError(null);
    leaveCurrentRoom(false);
    engineRef.current.resumeAudio();
    engineRef.current.setMode(role);
    setView('playing');
    setNotice(role === 'vendor' ? 'Sell products, then escape police!' : 'Patrol streets and catch the vendor!');
  };

  const handleCreateRoom = (role: 'vendor' | 'police', name: string) => {
    if (pendingRoomActionRef.current || waitingRoomRef.current) return;
    if (!ONLINE_AVAILABLE || !socketRef.current || !socketRef.current.connected) {
      setConnectionStatus('unavailable');
      setOnlineError(OFFLINE_MESSAGE);
      showToast(OFFLINE_MESSAGE);
      return;
    }
    leaveCurrentRoom(true);
    setOnlineError(null);
    updatePendingRoomAction('creating');
    engineRef.current?.pauseGame();
    engineRef.current?.resumeAudio();
    socketRef.current.emit('create_room', { role, playerName: name });
  };

  const handleJoinRoom = (code: string, name: string) => {
    if (pendingRoomActionRef.current || waitingRoomRef.current) return;
    if (!ONLINE_AVAILABLE || !socketRef.current || !socketRef.current.connected) {
      setConnectionStatus('unavailable');
      setOnlineError(OFFLINE_MESSAGE);
      showToast(OFFLINE_MESSAGE);
      return;
    }
    if (!engineRef.current) return;
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      setOnlineError('Room not found. Check code.');
      showToast('Room not found. Check code.');
      return;
    }
    if (roomCodeRef.current && roomCodeRef.current !== normalizedCode) {
      leaveCurrentRoom(true);
      setView('menu');
    } else {
      setRematchPending(false);
      roundRef.current = 1;
      setRunStats(null);
      setModalType(null);
    }
    setOnlineError(null);
    updatePendingRoomAction('joining');
    engineRef.current.pauseGame();
    engineRef.current.resumeAudio();
    socketRef.current.emit('join_room', { roomCode: normalizedCode, playerName: name });
  };

  const handleCancelWaitingRoom = () => {
    setOnlineError(null);
    leaveCurrentRoom(true);
    setView('menu');
    showToast('Room cancelled · রুম বাতিল করা হয়েছে');
  };

  const handleAction = (actionKey: string) => {
    if (!engineRef.current) return;
    engineRef.current.resumeAudio();
    engineRef.current.handleAction(actionKey);
  };

  const handleToggleMute = () => {
    if (!engineRef.current) return;
    const nextMuted = !muted;
    if (!nextMuted) {
      engineRef.current.resumeAudio();
    }
    engineRef.current.setMuted(nextMuted);
    setMuted(nextMuted);
  };

  const handleOpenSettings = () => {
    setShowSettings(true);
  };

  const handleUpdateSettings = (newSettings: GameSettingsData) => {
    setSettings(newSettings);
    engineRef.current?.setBindings(newSettings.bindings, {
      mouseSensitivity: newSettings.mouseSensitivity,
      invertY: newSettings.invertY
    });
  };

  const handleBrightnessChange = (v: number) => {
    setDisplaySettings((prev) => ({ ...prev, brightness: v }));
    engineRef.current?.setBrightness(v);
  };

  const handleAmbientVolumeChange = (v: number) => {
    if (v > 0 && muted) {
      engineRef.current?.setMuted(false);
      setMuted(false);
    }
    engineRef.current?.setAmbientVolume(v);
  };

  const handleDisplayOptionsChange = (
    opts: Partial<Pick<DisplaySettings, 'quality' | 'fpsLimit' | 'showFps'>>
  ) => {
    setDisplaySettings((prev) => ({ ...prev, ...opts }));
    engineRef.current?.setDisplayOptions(opts);
  };

  const handlePause = () => {
    engineRef.current?.pauseGame();
    setModalType('paused');
  };

  const handleResume = () => {
    if (rematchPending) return;
    engineRef.current?.resumeAudio();
    engineRef.current?.resumeGame();
    setModalType(null);
  };

  const currentFps = gameState?.fps ?? engineRef.current?.currentFps ?? 60;
  const currentRenderHeight =
    gameState?.renderHeight ?? engineRef.current?.state?.renderHeight ?? 1080;
  const currentDisplayHz =
    gameState?.displayHz ?? engineRef.current?.state?.displayHz ?? 60;
  const showFps = displaySettings.showFps || Boolean(gameState?.showFps);
  const uiBrightness = 0.25 + 0.75 * displaySettings.brightness;
  const isOnlineSession =
    currentMode === 'online_vendor' || currentMode === 'online_police';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none">
      {/* Game Viewport (Canvas + Views) with live brightness control */}
      <div
        className="relative w-full h-full"
        style={
          Math.abs(displaySettings.brightness - 1) > 0.01
            ? { filter: `brightness(${uiBrightness.toFixed(3)})` }
            : undefined
        }
      >
        {/* Three.js Canvas Container */}
        <div ref={containerRef} className="absolute inset-0 w-full h-full" />

        {/* Menu View */}
        {view === 'menu' && (
          <TitleScreen
            onStartSolo={handleStartSolo}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onCancelWaiting={handleCancelWaitingRoom}
            onClearOnlineError={() => setOnlineError(null)}
            connectionStatus={connectionStatus}
            pendingAction={pendingRoomAction}
            waitingRoom={waitingRoom}
            onlineError={onlineError}
            muted={muted}
            onToggleMute={handleToggleMute}
            onOpenSettings={handleOpenSettings}
            settings={settings}
          />
        )}

        {/* Menu FPS Counter when Show FPS is enabled on Title Screen */}
        {view === 'menu' && showFps && (
          <div
            className={`fixed bottom-4 right-4 z-30 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-teal-700/40 font-mono text-[11px] font-bold tracking-tight shadow-lg pointer-events-none ${
              currentFps >= 55
                ? 'text-emerald-400'
                : currentFps >= 30
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            {currentFps} FPS · {currentRenderHeight}p
          </div>
        )}

        {/* HUD View */}
        {view === 'playing' && gameState && (
          <GameHUD
            state={{
              ...gameState,
              showFps,
              fps: currentFps,
              renderHeight: currentRenderHeight,
              displayHz: currentDisplayHz
            }}
            notice={notice}
            onAction={handleAction}
            onPause={handlePause}
            onOpenSettings={handleOpenSettings}
            settings={settings}
            roomCode={roomCode}
            muted={muted}
            onToggleMute={handleToggleMute}
          />
        )}

        {/* Modals */}
        <EventModal
          type={modalType}
          state={gameState}
          stats={runStats ?? engineRef.current?.lastRunStats ?? null}
          isOnline={isOnlineSession}
          rematchPending={rematchPending}
          onPayBribe={() => {
            if (!engineRef.current) return;
            const isOnlineVendor = engineRef.current.state.mode === 'online_vendor';
            const cashBefore = engineRef.current.state.cash;
            const paid = engineRef.current.payBribe();
            const paidAmount = Math.max(0, cashBefore - engineRef.current.state.cash);
            if (paid) {
              if (isOnlineVendor && socketRef.current && roomCodeRef.current && paidAmount > 0) {
                socketRef.current.emit('player_action', {
                  roomCode: roomCodeRef.current,
                  type: 'bribe_paid',
                  amount: paidAmount
                });
              }
              setModalType(null);
            } else if (isOnlineVendor && socketRef.current && roomCodeRef.current) {
              socketRef.current.emit('player_action', {
                roomCode: roomCodeRef.current,
                type: 'jailed'
              });
            }
          }}
          onGoToJail={() => {
            if (!engineRef.current) return;
            const isOnlineVendor = engineRef.current.state.mode === 'online_vendor';
            engineRef.current.goToJail();
            if (isOnlineVendor && socketRef.current && roomCodeRef.current) {
              socketRef.current.emit('player_action', {
                roomCode: roomCodeRef.current,
                type: 'jailed'
              });
            }
          }}
          onRecordArrest={() => {
            if (!engineRef.current) return;
            engineRef.current.recordArrest();
            setModalType(null);
          }}
          onTakeIllicit={() => {
            if (!engineRef.current) return;
            engineRef.current.takeIllicit();
            setModalType(null);
          }}
          onResume={handleResume}
          onRestart={() => {
            const engine = engineRef.current;
            if (!engine) return;
            const mode = engine.state?.mode ?? gameState?.mode;
            if (!mode) return;
            const online = mode === 'online_vendor' || mode === 'online_police';
            if (online) {
              if (rematchPending) return;
              const activeCode = roomCodeRef.current;
              if (!socketRef.current || !activeCode) return;
              engine.pauseGame();
              setRematchPending(true);
              socketRef.current.emit('request_rematch', {
                roomCode: activeCode,
                round: roundRef.current
              });
              return;
            }
            setRematchPending(false);
            setRunStats(null);
            engine.setMode(mode);
            setModalType(null);
          }}
          onMainMenu={() => {
            leaveCurrentRoom(true);
            setView('menu');
          }}
          onOpenSettings={handleOpenSettings}
        />
      </div>

      {/* Settings Modal (kept outside brightness filter so controls remain clear) */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onBindingsUpdated={handleUpdateSettings}
        onBrightnessChange={handleBrightnessChange}
        onAmbientVolumeChange={handleAmbientVolumeChange}
        onDisplayOptionsChange={handleDisplayOptionsChange}
        displayHz={currentDisplayHz}
        currentFps={currentFps}
        renderHeight={currentRenderHeight}
      />
    </div>
  );
}
