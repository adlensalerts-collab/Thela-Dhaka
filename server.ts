import express from 'express';
import fs from 'fs';
import { createServer, type IncomingMessage } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GITHUB_PAGES_ORIGIN = 'https://adlensalerts-collab.github.io';

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
  } catch {
    // Ignore malformed origin strings
  }
  return null;
}

function buildAllowedOrigins(port: number, isProduction: boolean): Set<string> {
  const allowed = new Set<string>([
    GITHUB_PAGES_ORIGIN,
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ]);

  if (!isProduction) {
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
    allowed.add('http://localhost:5173');
    allowed.add('http://127.0.0.1:5173');
  }

  const rawSources = [
    process.env.ALLOWED_ORIGINS,
    process.env.PUBLIC_ORIGIN,
    process.env.RENDER_EXTERNAL_URL,
    process.env.APP_URL,
    process.env.SHARED_APP_URL,
  ];

  for (const source of rawSources) {
    if (!source) continue;
    for (const part of source.split(',')) {
      const normalized = normalizeOrigin(part);
      if (normalized) {
        allowed.add(normalized);
        if (normalized.startsWith('https://ais-dev-')) {
          allowed.add(normalized.replace('https://ais-dev-', 'https://ais-pre-'));
        }
      }
    }
  }

  return allowed;
}

function isSameHostOrigin(normalizedOrigin: string, req?: IncomingMessage): boolean {
  if (!req) return false;
  const forwardedHost = req.headers['x-forwarded-host'];
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.headers.host;
  if (!rawHost) return false;
  const host = rawHost.split(',')[0].trim();
  if (!host) return false;
  return normalizedOrigin === `https://${host}` || normalizedOrigin === `http://${host}`;
}

async function startServer() {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.argv.includes('--production') ||
    process.env.npm_lifecycle_event === 'start';
  if (isProduction) {
    process.env.NODE_ENV = 'production';
  }

  const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
  const PORT = Number(process.env.PORT) || 3000;
  const allowedOrigins = buildAllowedOrigins(PORT, isProduction);

  const isOriginAllowed = (origin: string | undefined, req?: IncomingMessage): boolean => {
    if (!origin) return true;
    const normalized = normalizeOrigin(origin);
    if (!normalized) return false;
    if (allowedOrigins.has(normalized)) return true;
    if (isSameHostOrigin(normalized, req)) return true;
    return false;
  };

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      methods: ['GET', 'POST'],
    },
    allowRequest: (req, callback) => {
      if (isOriginAllowed(req.headers.origin, req)) {
        callback(null, true);
      } else {
        callback('Origin not allowed by CORS', false);
      }
    },
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
    round: number;
    rematchRequests: string[];
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

      room.rematchRequests = [];

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

  const handleRematchRequest = (socketId: string, data: unknown) => {
    if (!data || typeof data !== 'object') return;
    const payload = data as { roomCode?: unknown; round?: unknown };
    const normalizedCode =
      typeof payload.roomCode === 'string' ? payload.roomCode.trim().toUpperCase() : '';
    const activeCode = activeRoomBySocket.get(socketId);
    if (!activeCode || !normalizedCode || activeCode !== normalizedCode) return;

    const room = rooms.get(activeCode);
    if (!room || room.state !== 'playing' || room.players.length !== 2) return;
    if (!room.players.some((p) => p.id === socketId)) return;

    if (
      typeof payload.round !== 'number' ||
      !Number.isFinite(payload.round) ||
      payload.round !== room.round
    ) {
      return;
    }

    if (room.rematchRequests.includes(socketId)) {
      return;
    }

    room.rematchRequests.push(socketId);

    const bothAgreed =
      room.players.length === 2 &&
      room.players.every((p) => room.rematchRequests.includes(p.id));

    if (!bothAgreed) {
      io.to(activeCode).emit('rematch_requested', {
        roomCode: activeCode,
        round: room.round,
        requesterId: socketId
      });
      return;
    }

    room.round += 1;
    room.rematchRequests = [];
    room.state = 'playing';
    for (const participant of room.players) {
      participant.pos = { x: 0, z: participant.role === 'vendor' ? 7 : -23 };
      participant.hasValidPos = false;
      participant.heading = 0;
      participant.cash = 250;
      participant.stock = 10;
      participant.heat = 0;
    }

    io.to(activeCode).emit('start_multiplayer', room);
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
        state: 'waiting',
        round: 1,
        rematchRequests: []
      });
      activeRoomBySocket.set(socket.id, roomCode);
      socket.join(roomCode);
      socket.emit('room_created', { roomCode, role: assignedRole, round: 1 });
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
      room.round = 1;
      room.rematchRequests = [];
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

    socket.on('request_rematch', (data) => {
      handleRematchRequest(socket.id, data);
    });

    socket.on('rematch_request', (data) => {
      handleRematchRequest(socket.id, data);
    });

    socket.on('player_action', (data) => {
      if (!data || typeof data !== 'object') return;
      const { roomCode, type, amount, payload } = data;
      if (typeof type !== 'string' || !type) return;

      if (type === 'request_rematch' || type === 'rematch_request') {
        handleRematchRequest(socket.id, {
          roomCode,
          round: typeof data.round === 'number' ? data.round : payload?.round
        });
        return;
      }

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

  app.get('/healthz', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      mode: isProduction ? 'production' : 'development',
    });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    const distIndexPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(distIndexPath)) {
      console.error(
        `[server] Production frontend build not found at ${distIndexPath}. Run "npm run build" before starting in production.`
      );
      process.exit(1);
    }
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distIndexPath);
    });
  }

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] Received ${signal}, shutting down cleanly...`);
    const forceTimer = setTimeout(() => {
      process.exit(0);
    }, 5000);
    forceTimer.unref();

    io.close(() => {
      if (httpServer.listening) {
        httpServer.close(() => {
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Thela Dhaka server (${isProduction ? 'production' : 'development'}) running on http://0.0.0.0:${PORT}`
    );
  });
}

startServer();
