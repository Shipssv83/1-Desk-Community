require('dotenv').config();

const requiredEnv = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET'
];

const missing = requiredEnv.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error('CRITICAL: Missing required environment variables:', missing.join(', '));
  process.exit(1);
}

module.exports = {
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  port: parseInt(process.env.PORT, 10) || 4000,
  baseUrl: process.env.BASE_URL || 'http://localhost:4000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  nodeEnv: process.env.NODE_ENV || 'development',
  uploadDir: process.env.UPLOAD_DIR || '/app/media',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'password',
  // Key for encrypting integration credentials at rest. Falls back to deriving
  // from JWT_SECRET so the feature works without new env, but set a dedicated
  // INTEGRATION_ENC_KEY (32+ random chars) in production.
  integrationEncKey: process.env.INTEGRATION_ENC_KEY || process.env.JWT_SECRET,
};
