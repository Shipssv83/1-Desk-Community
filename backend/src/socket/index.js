const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/db');

let io;

function init(httpServer, redisClient) {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  // Redis adapter
  const pubClient = redisClient.duplicate();
  const subClient = redisClient.duplicate();
  io.adapter(createAdapter(redisClient, subClient));

  // Main Namespace: Auth via JWT. The access_token cookie is HttpOnly, so the
  // browser can't expose it to JS for handshake.auth.token — but withCredentials
  // sends it in the cookie header. Read it from there, falling back to auth.token.
  io.use(async (socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie || '';
    const cookieToken = cookieHeader
      .split('; ')
      .find((c) => c.startsWith('access_token='))
      ?.split('=')[1];
    const token = socket.handshake.auth.token || cookieToken;
    if (!token) {
      return next(new Error('Unauthorized'));
    }
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      
      // Verify user is active in DB
      const user = await db.user.findUnique({
        where: { id: payload.id },
        select: { id: true, email: true, name: true, role: true, isActive: true }
      });
      if (!user || !user.isActive) {
        return next(new Error('Unauthorized'));
      }
      
      socket.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: user.isActive
      };
      next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // console.log(`Operator connected: ${socket.user.email} (${socket.id})`);

    socket.on('join:inbox', ({ inboxId }) => {
      socket.join(`inbox:${inboxId}`);
    });

    socket.on('join:conversation', ({ conversationId }) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave:conversation', ({ conversationId }) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('disconnect', () => {
      // console.log(`Operator disconnected: ${socket.user.email}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.IO is not initialized!');
  }
  return io;
}

module.exports = { init, getIO };
