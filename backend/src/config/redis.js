const Redis = require('ioredis');

const redisClient = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

module.exports = redisClient;
