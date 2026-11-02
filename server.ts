import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  app.use(express.json());

  interface RoomPlayer {
    id: string;
    role: 'vendor' | 'police';
    name: string;
    pos: { x: number; z: number };
    hasValidPos: boolean;
    heading: number;
    cash: number;
    stock: number;
    heat: number;
  }

  interface RoomState {
    code: string;
    players: RoomPlayer[];
    state: 'waiting' | 'playing';
  }

  // In-memory 1v1 rooms and single active room per socket
  const rooms = new Map<string, RoomState>();
  const activeRoomBySocket = new Map<string, string>();

  const cleanupSocketRoom = (socketId: string, explicitRoomCode?: string) => {
    const trackedCode = activeRoomBySocket.get(socketId);
    const codesToClose = new Set<string>();

    if (explicitRoomCode !== undefined) {
      const normalizedCode =
        typeof explicitRoomCode === 'string' ? explicitRoomCode.trim().toUpperCase() : '';
      if (!normalizedCode || !trackedCode || normalizedCode !== trackedCode) {
        return;
      }
      codesToClose.add(trackedCode);
    } else {
      if (trackedCode) codesToClose.add(trackedCode);
      for (const [code, room] of rooms.entries()) {
        if (room.players.some((p) => p.id === socketId)) {
          codesToClose.add(code);
        }
      }
    }

    for (const code of codesToClose) {
      const room = rooms.get(code);
      if (!room) {
        if (activeRoomBySocket.get(socketId) === code) {
          activeRoomBySocket.delete(socketId);
        }
        continue;
      }
      if (!room.players.some((p) => p.id === socketId)) {
        continue;
      }

      for (const participant of room.players) {
        if (activeRoomBySocket.get(participant.id) === code) {
          activeRoomBySocket.delete(participant.id);
        }
        if (participant.id !== socketId) {
          io.to(participant.id).emit('player_disconnected', {
            id: socketId,
            roomCode: code
          });
        }
      }

      io.in(code).socketsLeave(code);
      rooms.delete(code);
    }
  };

  io.on('connection', (socket) => {
    socket.on('create_room', (data) => {
      const payload = data && typeof data === 'object' ? data : {};
      const assignedRole: 'vendor' | 'police' = payload.role === 'vendor' ? 'vendor' : 'police';
      const playerName =
        typeof payload.playerName === 'string' && payload.playerName.trim()
          ? payload.playerName.trim().slice(0, 40)
          : 'Vendor Master';

      cleanupSocketRoom(socket.id);

      let roomCode = '';
      do {
        roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      } while (rooms.has(roomCode));

      rooms.set(roomCode, {
        code: roomCode,
        players: [
          {
            id: socket.id,
            role: assignedRole,
            name: playerName,
            pos: { x: 0, z: assignedRole === 'vendor' ? 7 : -23 },
            hasValidPos: false,
            heading: 0,
            cash: 250,
            stock: 10,
            heat: 0
          }
        ],
        state: 'waiting'
      });
      activeRoomBySocket.set(socket.id, roomCode);
      socket.join(roomCode);
      socket.emit('room_created', { roomCode, role: assignedRole });
    });

    socket.on('join_room', (data) => {
      if (!data || typeof data !== 'object') {
        socket.emit('error_message', 'Room not found. Check code.');
        return;
      }
      const normalizedCode =
        typeof data.roomCode === 'string' ? data.roomCode.trim().toUpperCase() : '';
      if (!normalizedCode) {
        socket.emit('error_message', 'Room not found. Check code.');
        return;
      }
      const room = rooms.get(normalizedCode);
      if (!room) {
        socket.emit('error_message', 'Room not found. Check code.');
        return;
      }
      if (
        room.players.some((p) => p.id === socket.id) ||
        activeRoomBySocket.get(socket.id) === normalizedCode
      ) {
        socket.emit('error_message', 'Already in this room.');
        return;
      }
      if (room.players.length >= 2 || room.state !== 'waiting') {
        socket.emit('error_message', 'Room is full (1v1 limit).');
        return;
      }

      if (activeRoomBySocket.has(socket.id)) {
        cleanupSocketRoom(socket.id);
      }

      const existingRole = room.players[0].role;
      const assignedRole: 'vendor' | 'police' = existingRole === 'vendor' ? 'police' : 'vendor';
      const playerName =
        typeof data.playerName === 'string' && data.playerName.trim()
          ? data.playerName.trim().slice(0, 40)
          : assignedRole === 'vendor'
          ? 'Dhaka Vendor'
          : 'Constable';

      room.players.push({
        id: socket.id,
        role: assignedRole,
        name: playerName,
        pos: { x: 0, z: assignedRole === 'vendor' ? 7 : -23 },
        hasValidPos: false,
        heading: 0,
        cash: 250,
        stock: 10,
        heat: 0
      });
      room.state = 'playing';
      activeRoomBySocket.set(socket.id, normalizedCode);
      socket.join(normalizedCode);
      io.to(normalizedCode).emit('start_multiplayer', room);
    });

    socket.on('leave_room', (data) => {
      if (!data || typeof data !== 'object' || typeof data.roomCode !== 'string') {
        return;
      }
      const requestedCode = data.roomCode.trim().toUpperCase();
      const activeCode = activeRoomBySocket.get(socket.id);
      if (!requestedCode || !activeCode || requestedCode !== activeCode) {
        return;
      }
      cleanupSocketRoom(socket.id, requestedCode);
    });

    socket.on('player_action', (data) => {
      if (!data || typeof data !== 'object') return;
      const { roomCode, type, amount, payload } = data;
      if (typeof type !== 'string' || !type) return;

      const activeCode = activeRoomBySocket.get(socket.id);
      const normalizedCode =
        typeof roomCode === 'string' ? roomCode.trim().toUpperCase() : '';
      if (!activeCode || !normalizedCode || activeCode !== normalizedCode) return;

      const room = rooms.get(activeCode);
      if (!room) return;
      const sender = room.players.find((p) => p.id === socket.id);
      if (!sender) return;

      if (type === 'arrest_attempt') {
        if (room.players.length !== 2 || sender.role !== 'police') {
          socket.emit('error_message', 'Too far to arrest');
          return;
        }
        const other = room.players.find((p) => p.id !== socket.id);
        if (
          !other ||
          !sender.hasValidPos ||
          !other.hasValidPos ||
          !sender.pos ||
          !other.pos ||
          !Number.isFinite(sender.pos.x) ||
          !Number.isFinite(sender.pos.z) ||
          !Number.isFinite(other.pos.x) ||
          !Number.isFinite(other.pos.z)
        ) {
          socket.emit('error_message', 'Too far to arrest');
          return;
        }
        const dist = Math.hypot(sender.pos.x - other.pos.x, sender.pos.z - other.pos.z);
        if (dist <= 2.6) {
          io.to(activeCode).emit('arrest_confirmed', { roomCode: activeCode });
        } else {
          socket.emit('error_message', 'Too far to arrest');
        }
        return;
      }

      if (amount !== undefined && !Number.isFinite(amount)) return;

      socket.to(activeCode).emit('opponent_action', {
        id: socket.id,
        roomCode: activeCode,
        type,
        amount,
        payload
      });
    });

    socket.on('player_update', (data) => {
      if (!data || typeof data !== 'object') return;
      const { roomCode, pos, heading, speed, cash, stock, heat, alert } = data;

      const activeCode = activeRoomBySocket.get(socket.id);
      const normalizedCode =
        typeof roomCode === 'string' ? roomCode.trim().toUpperCase() : '';
      if (!activeCode || !normalizedCode || activeCode !== normalizedCode) return;

      const room = rooms.get(activeCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      if (
        !pos ||
        typeof pos !== 'object' ||
        !Number.isFinite(pos.x) ||
        !Number.isFinite(pos.z) ||
        !Number.isFinite(heading) ||
        !Number.isFinite(speed)
      ) {
        return;
      }

      player.pos = { x: pos.x, z: pos.z };
      player.hasValidPos = true;
      player.heading = heading;
      if (Number.isFinite(cash)) player.cash = cash;
      if (Number.isFinite(stock)) player.stock = stock;
      if (Number.isFinite(heat)) player.heat = heat;

      socket.to(activeCode).emit('opponent_update', {
        id: socket.id,
        roomCode: activeCode,
        pos: { x: pos.x, z: pos.z },
        heading,
        speed,
        cash: player.cash,
        stock: player.stock,
        heat: player.heat,
        alert: Boolean(alert)
      });
    });

    socket.on('disconnect', () => {
      cleanupSocketRoom(socket.id);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Thela Dhaka server running on http://localhost:${PORT}`);
  });
}

startServer();
