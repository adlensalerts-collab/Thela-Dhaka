import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, GameState } from './game/simulation';
import { TitleScreen } from './components/TitleScreen';
import { GameHUD } from './components/GameHUD';
import { EventModal } from './components/EventModal';
import { SettingsModal } from './components/SettingsModal';
import { loadSettings, GameSettingsData } from './game/keybindings';
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
  const [showSettings, setShowSettings] = useState(false);

  const [view, setView] = useState<'menu' | 'playing'>('menu');
  const [modalType, setModalType] = useState<'bribe' | 'arrest_decision' | 'paused' | 'over' | 'victory' | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [notice, setNotice] = useState('Welcome to Thela Dhaka · ঢাকার ঠেলা');
  const [muted, setMuted] = useState(false);
  const [roomCode, setRoomCode] = useState<string>('');

  useEffect(() => {
    if (!containerRef.current) return;
    const initialSettings = loadSettings();
    const engine = new GameEngine(
      containerRef.current,
      (state) => setGameState({ ...state }),
      (type, data) => {
        if (type === 'notify') {
          setNotice(data);
          setTimeout(() => setNotice(''), 4000);
        } else if (type === 'bribe_prompt') {
          setModalType('bribe');
        } else if (type === 'police_decision') {
          setModalType('arrest_decision');
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

    // Socket.io connection for online multiplayer
    const socket = ONLINE_AVAILABLE ? (SERVER_URL ? io(SERVER_URL) : io()) : null;
    socketRef.current = socket;
    if (!socket) {
      return () => { engine.stop(); };
    }

    socket.on('room_created', ({ roomCode, role }) => {
      setRoomCode(roomCode);
      setNotice(`Room created: ${roomCode}. Waiting for friend...`);
      engine.setMode(role === 'vendor' ? 'online_vendor' : 'online_police');
      setView('playing');
    });

    socket.on('start_multiplayer', () => {
      setNotice('Match started! Both players connected.');
      setView('playing');
    });

    socket.on('error_message', (msg) => {
      alert(msg);
    });

    return () => {
      engine.stop();
      socket.disconnect();
    };
  }, []);

  // Sync menu/modal open state with engine to ensure gameplay input is blocked
  useEffect(() => {
    const isMenuOpen = showSettings || modalType !== null || view === 'menu';
    engineRef.current?.setMenuOpen(isMenuOpen);
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
    setRoomCode(code);
    socketRef.current.emit('join_room', { roomCode: code, playerName: name });
    engineRef.current.setMode('online_police');
    setView('playing');
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

  const handlePause = () => {
    engineRef.current?.pauseGame();
    setModalType('paused');
  };

  const handleResume = () => {
    engineRef.current?.resumeAudio();
    engineRef.current?.resumeGame();
    setModalType(null);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none">
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

      {/* HUD View */}
      {view === 'playing' && gameState && (
        <GameHUD
          state={gameState}
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
          if (engineRef.current.payBribe()) {
            setModalType(null);
          }
        }}
        onGoToJail={() => {
          engineRef.current?.goToJail();
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
          setRoomCode('');
        }}
        onOpenSettings={handleOpenSettings}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onBindingsUpdated={handleUpdateSettings}
        onBrightnessChange={(v) => engineRef.current?.setBrightness(v)}
        onAmbientVolumeChange={(v) => engineRef.current?.setAmbientVolume(v)}
        onDisplayOptionsChange={(opts) => engineRef.current?.setDisplayOptions(opts)}
        displayHz={gameState?.displayHz ?? engineRef.current?.state.displayHz ?? 60}
      />
    </div>
  );
}
