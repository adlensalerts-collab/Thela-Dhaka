import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, GameState } from './game/simulation';
import { TitleScreen } from './components/TitleScreen';
import { GameHUD } from './components/GameHUD';
import { EventModal } from './components/EventModal';
import { io, Socket } from 'socket.io-client';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [view, setView] = useState<'menu' | 'playing'>('menu');
  const [modalType, setModalType] = useState<'bribe' | 'arrest_decision' | 'paused' | 'over' | 'victory' | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [notice, setNotice] = useState('Welcome to Thela Dhaka · ঢাকার ঠেলা');
  const [muted, setMuted] = useState(false);
  const [roomCode, setRoomCode] = useState<string>('');

  useEffect(() => {
    if (!containerRef.current) return;
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
        }
      }
    );
    engineRef.current = engine;
    engine.start();

    // Socket.io connection for online multiplayer
    const socket = io();
    socketRef.current = socket;

    socket.on('room_created', ({ roomCode, role }) => {
      setRoomCode(roomCode);
      setNotice(`Room created: ${roomCode}. Waiting for friend...`);
      engine.setMode(role === 'vendor' ? 'online_vendor' : 'online_police');
      setView('playing');
    });

    socket.on('start_multiplayer', (room) => {
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

  const handleStartSolo = (role: 'vendor' | 'police') => {
    if (!engineRef.current) return;
    engineRef.current.setMode(role);
    setView('playing');
    setNotice(role === 'vendor' ? 'Sell products, then escape police!' : 'Patrol streets and catch the vendor!');
  };

  const handleCreateRoom = (role: 'vendor' | 'police', name: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('create_room', { role, playerName: name });
  };

  const handleJoinRoom = (code: string, name: string) => {
    if (!socketRef.current || !engineRef.current) return;
    setRoomCode(code);
    socketRef.current.emit('join_room', { roomCode: code, playerName: name });
    engineRef.current.setMode('online_police'); // Joined player takes opposing role
    setView('playing');
  };

  const handleAction = (actionKey: string) => {
    if (!engineRef.current) return;
    engineRef.current.handleAction(actionKey);
  };

  const handleToggleMute = () => {
    if (!engineRef.current) return;
    engineRef.current.muted = !muted;
    setMuted(!muted);
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
        />
      )}

      {/* HUD View */}
      {view === 'playing' && gameState && (
        <GameHUD
          state={gameState}
          notice={notice}
          onAction={handleAction}
          onPause={() => setModalType('paused')}
          roomCode={roomCode}
        />
      )}

      {/* Modals */}
      <EventModal
        type={modalType}
        state={gameState}
        onPayBribe={() => {
          if (!engineRef.current || !gameState) return;
          const cost = 90 + gameState.level * 45;
          if (gameState.cash < cost) {
            setModalType('over');
            return;
          }
          gameState.cash -= cost;
          gameState.heat = 0;
          gameState.cooldown = 10;
          gameState.sale = null;
          engineRef.current.officer.position.set(engineRef.current.human.position.x + 26, 0, engineRef.current.human.position.z - 22);
          setModalType(null);
          setNotice('Released on bribe. Watch out for cooling countdown.');
        }}
        onGoToJail={() => setModalType('over')}
        onRecordArrest={() => {
          if (!engineRef.current || !gameState) return;
          gameState.arrests++;
          gameState.integrity = Math.min(100, gameState.integrity + 2);
          engineRef.current.npcVendor.position.set(-36, 0, 36);
          gameState.rank = Math.min(4, 1 + Math.floor(gameState.arrests / 2));
          setModalType(null);
          setNotice('Lawful arrest recorded. Promotion progress updated.');
        }}
        onTakeIllicit={() => {
          if (!engineRef.current || !gameState) return;
          gameState.policeCash += 150;
          gameState.integrity = Math.max(0, gameState.integrity - 20);
          engineRef.current.npcVendor.position.set(-36, 0, 36);
          setModalType(null);
          setNotice('Illicit payment received. Integrity decreased.');
        }}
        onResume={() => setModalType(null)}
        onRestart={() => {
          if (!engineRef.current || !gameState) return;
          engineRef.current.setMode(gameState.mode);
          setModalType(null);
        }}
        onMainMenu={() => {
          setView('menu');
          setModalType(null);
          setRoomCode('');
        }}
      />
    </div>
  );
}
