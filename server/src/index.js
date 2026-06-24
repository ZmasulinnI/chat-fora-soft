import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { Server } from 'socket.io';
import { RoomStore } from './roomStore.js';
import { registerRoomLifecycleHandlers } from './socketHandlers.js';

const envPaths = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '.env')];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const clientOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
const httpServer = createServer(app);
const roomStore = new RoomStore();

function isAllowedOrigin(origin) {
  return !origin || clientOrigins.includes(origin);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin ?? clientOrigins[0]);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'video-chat-room-server',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS'));
    },
    methods: ['GET', 'POST']
  }
});

registerRoomLifecycleHandlers(io, roomStore);

httpServer.listen(port, () => {
  console.log(`Video chat server listening on http://localhost:${port}`);
});
