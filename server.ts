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

  // In-memory 1v1 rooms
  const rooms = new Map();

  io.on('connection', (socket) => {
    socket.on('create_room', ({ role, playerName }) => {
      const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      rooms.set(roomCode, {
        code: roomCode,
        players: [
          {
            id: socket.id,
            role: role === 'vendor' ? 'vendor' : 'police',
            name: playerName || 'Vendor Master',
            pos: { x: 0, z: role === 'vendor' ? 7 : -23 },
            heading: 0,
            cash: 250,
            stock: 10,
            heat: 0
          }
        ],
        state: 'waiting'
      });
      socket.join(roomCode);
      socket.emit('room_created', { roomCode, role: role === 'vendor' ? 'vendor' : 'police' });
    });

    socket.on('join_room', ({ roomCode, playerName }) => {
      const room = rooms.get(roomCode);
      if (!room) {
        socket.emit('error_message', 'Room not found. Check code.');
        return;
      }
      if (room.players.length >= 2) {
        socket.emit('error_message', 'Room is full (1v1 limit).');
        return;
      }
      const existingRole = room.players[0].role;
      const assignedRole = existingRole === 'vendor' ? 'police' : 'vendor';
      room.players.push({
        id: socket.id,
        role: assignedRole,
        name: playerName || (assignedRole === 'vendor' ? 'Dhaka Vendor' : 'Constable'),
        pos: { x: 0, z: assignedRole === 'vendor' ? 7 : -23 },
        heading: 0,
        cash: 250,
        stock: 10,
        heat: 0
      });
      room.state = 'playing';
      socket.join(roomCode);
      io.to(roomCode).emit('start_multiplayer', room);
    });

    socket.on('player_action', (data) => {
      const { roomCode, type, payload } = data;
      socket.to(roomCode).emit('opponent_action', { id: socket.id, type, payload });
    });

    socket.on('player_update', (data) => {
      const { roomCode, pos, heading, cash, stock, heat } = data;
      socket.to(roomCode).emit('opponent_update', { id: socket.id, pos, heading, cash, stock, heat });
    });

    socket.on('disconnect', () => {
      for (const [code, room] of rooms.entries()) {
        const idx = room.players.findIndex((p: any) => p.id === socket.id);
        if (idx !== -1) {
          room.players.splice(idx, 1);
          io.to(code).emit('player_disconnected', { id: socket.id });
          if (room.players.length === 0) {
            rooms.delete(code);
          }
        }
      }
    });
  });

  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' }
  });
  app.use(vite.middlewares);

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Thela Dhaka server running on http://localhost:${PORT}`);
  });
}

startServer();
