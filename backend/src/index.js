const http = require('http');
const app = require('./app');
const redisClient = require('./config/redis');
const env = require('./config/env');
const seed = require('./seed');
const backfillOrg = require('./backfillOrg');
const socketModule = require('./socket');

const server = http.createServer(app);

async function startServer() {
  try {
    // Run seed
    await seed();

    // Backfill multi-tenancy data for pre-existing rows
    await backfillOrg();

    // Init socket.io
    socketModule.init(server, redisClient);

    const PORT = env.port;
    server.listen(PORT, () => {
      console.log(`Backend server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
