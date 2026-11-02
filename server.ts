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
      const { roomCode, type, amount, payload } = data || {};
      if (type === 'arrest_attempt') {
        const room = rooms.get(roomCode);
        if (!room) return;
        const sender = room.players.find((p: any) => p.id === socket.id);
        const other = room.players.find((p: any) => p.id !== socket.id);
        if (sender && sender.role === 'police' && other && sender.pos && other.pos) {
          const dist = Math.hypot(
            (sender.pos.x ?? 0) - (other.pos.x ?? 0),
            (sender.pos.z ?? 0) - (other.pos.z ?? 0)
          );
          if (dist <= 2.6) {
            io.to(roomCode).emit('arrest_confirmed');
          } else {
            socket.emit('error_message', 'Too far to arrest');
          }
        } else {
          socket.emit('error_message', 'Too far to arrest');
        }
        return;
      }
      socket.to(roomCode).emit('opponent_action', { id: socket.id, type, amount, payload });
    });

    socket.on('player_update', (data) => {
      const { roomCode, pos, heading, speed, cash, stock, heat, alert } = data || {};
      const room = rooms.get(roomCode);
      if (room) {
        const player = room.players.find((p: any) => p.id === socket.id);
        if (player) {
          if (pos) player.pos = { x: pos.x, z: pos.z };
          if (typeof heading === 'number') player.heading = heading;
          if (typeof cash === 'number') player.cash = cash;
          if (typeof stock === 'number') player.stock = stock;
          if (typeof heat === 'number') player.heat = heat;
        }
      }
      socket.to(roomCode).emit('opponent_update', {
        id: socket.id,
        pos,
        heading,
        speed,
        cash,
        stock,
        heat,
        alert
      });
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
