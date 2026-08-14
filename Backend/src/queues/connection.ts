import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// Connection RIÊNG cho BullMQ, không dùng chung với config/redis.ts.
// BullMQ bắt buộc maxRetriesPerRequest = null cho connection blocking: nhận vào một ioredis
// instance có giá trị khác sẽ throw ngay lúc khởi động (redis-connection.js gọi
// checkBlockingOptions với throwError = true). Redis chính của app đang để 3 nên phải tách.
export function createQueueConnection(label: string): Redis {
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on("error", (err) => logger.error(`Lỗi kết nối Redis (${label})`, err));
  return connection;
}

// Producer và worker mỗi bên một connection: worker dùng lệnh blocking (BZPOPMIN) để chờ job,
// dùng chung thì lệnh đó giữ luôn connection và producer không add job được.
export const queueConnection = createQueueConnection("queue");
