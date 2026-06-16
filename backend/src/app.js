const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const db = require('./config/db');
const redisClient = require('./config/redis');
const env = require('./config/env');

const app = express();
// Behind Cloudflare → NPM → frontend nginx. Trust the proxy chain so req.ip and
// express-rate-limit read the real client IP from X-Forwarded-For (and to avoid
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false
}));

// CORS setup
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(cookieParser());

// JSON body parser with rawBody capture
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ extended: true }));

// Serve uploads static folder
const uploadDir = env.uploadDir;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const startTime = Date.now();
    await db.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - startTime;

    let redisStatus = 'ok';
    try {
      await redisClient.ping();
    } catch {
      redisStatus = 'error';
    }

    let uploadsWritable = false;
    try {
      const testFile = path.join(uploadDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      uploadsWritable = true;
    } catch {}

    const isHealthy = dbLatency < 1000 && redisStatus === 'ok' && uploadsWritable;

    res.status(isHealthy ? 200 : 500).json({
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'ok', latencyMs: dbLatency },
        redis: { status: redisStatus },
        uploads: { status: uploadsWritable ? 'ok' : 'error', writable: uploadsWritable }
      },
      version: '1.0.0'
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
});

// Import and mount routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/inboxes', require('./routes/inboxes'));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/integrations', require('./routes/integrations'));
app.use('/api/bots', require('./routes/bots'));
app.use('/api/media', require('./routes/media'));
app.use('/api/webhooks', require('./routes/webhooks'));

// API-only service. The operator UI is served by the separate frontend app.
app.get('/', (req, res) => {
  res.json({ name: '1-Desk Community', status: 'ok' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

module.exports = app;
