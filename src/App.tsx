import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, GameState } from './game/simulation';
import { TitleScreen } from './components/TitleScreen';
import { GameHUD } from './components/GameHUD';
import { EventModal } from './components/EventModal';
import { SettingsModal } from './components/SettingsModal';
import { loadSettings, GameSettingsData } from './game/keybindings';
import { loadDisplaySettings, DisplaySettings } from './game/render/display';
import { RunStats } from './game/stats';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string | undefined;
const ONLINE_AVAILABLE = import.meta.env.VITE_STATIC_HOST !== 'true' || !!SERVER_URL;
const OFFLINE_MESSAGE = 'Online multiplayer is not available on this website yet — please play Solo.\nঅনলাইন মাল্টিপ্লেয়ার এই সাইটে এখনো চালু নেই — সোলো খেলুন।';

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
  const roomCodeRef = useRef<string>('');

  const updateRoomCode = (code: string) => {
    roomCodeRef.current = code;
    setRoomCode(code);
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
      return () => { engine.stop(); };
    }

    socket.on('room_created', ({ roomCode: createdCode, role }) => {
      updateRoomCode(createdCode);
      setNotice(`Room created: ${createdCode}. Waiting for friend...`);
      engine.setMode(role === 'vendor' ? 'online_vendor' : 'online_police');
      setView('playing');
    });

    socket.on('start_multiplayer', (room) => {
      if (room?.code) {
        updateRoomCode(room.code);
      }
      const me = room?.players?.find((p: any) => p.id === socket.id);
      if (me) {
        engine.setMode(me.role === 'vendor' ? 'online_vendor' : 'online_police');
      }
      setRunStats(null);
      setModalType(null);
      showToast('Match started! Both players connected.');
      setView('playing');
    });

    socket.on('opponent_update', (msg) => {
      engine.applyRemoteUpdate(msg);
    });

    socket.on('arrest_confirmed', () => {
      if (engine.state.mode === 'online_vendor') {
        engine.triggerCaught();
      } else if (engine.state.mode === 'online_police') {
        showToast('গ্রেপ্তার! · Vendor caught');
      }
    });

    socket.on('opponent_action', (msg) => {
      if (engine.state.mode !== 'online_police') return;
      if (msg?.type === 'bribe_paid') {
        engine.receiveOnlineBribe(msg.amount ?? 0);
      } else if (msg?.type === 'jailed') {
        engine.receiveOnlineVictory();
      }
    });

    socket.on('player_disconnected', () => {
      showToast('প্রতিপক্ষ চলে গেছে · Opponent left');
      setRunStats(null);
      setModalType(null);
      updateRoomCode('');
      setView('menu');
    });

    socket.on('error_message', (msg) => {
      showToast(String(msg));
    });

    return () => {
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
    engineRef.current.resumeAudio();
    engineRef.current.setMode(role);
    setView('playing');
    setNotice(role === 'vendor' ? 'Sell products, then escape police!' : 'Patrol streets and catch the vendor!');
  };

  const handleCreateRoom = (role: 'vendor' | 'police', name: string) => {
    if (!socketRef.current) {
      alert(OFFLINE_MESSAGE);
      return;
    }
    engineRef.current?.resumeAudio();
    socketRef.current.emit('create_room', { role, playerName: name });
  };

  const handleJoinRoom = (code: string, name: string) => {
    if (!socketRef.current) {
      alert(OFFLINE_MESSAGE);
      return;
    }
    if (!engineRef.current) return;
    engineRef.current.resumeAudio();
    updateRoomCode(code);
    socketRef.current.emit('join_room', { roomCode: code, playerName: name });
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
            if (!engineRef.current || !gameState) return;
            setRunStats(null);
            engineRef.current.setMode(gameState.mode);
            setModalType(null);
          }}
          onMainMenu={() => {
            setRunStats(null);
            setView('menu');
            setModalType(null);
            updateRoomCode('');
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
