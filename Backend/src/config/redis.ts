import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => logger.info('✅ Redis đã kết nối'));
redis.on('error', (err) => logger.error('Lỗi kết nối Redis', err));