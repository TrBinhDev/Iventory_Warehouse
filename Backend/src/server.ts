import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { redis } from "./config/redis.js";
import { logger } from "./config/logger.js";
import { registerSweepJob } from "./queues/reservation.queue.js";
import { createReservationWorker } from "./queues/reservation.worker.js";

async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info("✅ PostgreSQL đã kết nối");
  } catch (err) {
    logger.error("❌ Kết nối PostgreSQL thất bại", err);
    process.exit(1);
  }

  try {
    await redis.ping();
  } catch (err) {
    logger.error("❌ Kết nối Redis thất bại", err);
    process.exit(1);
  }

  // Worker chạy chung process cho tiện phát triển, nhưng code không dính gì tới Express —
  // muốn tách ra process riêng chỉ cần thêm entry gọi đúng 2 hàm này.
  try {
    createReservationWorker();
    await registerSweepJob();
    logger.info("✅ Worker reservation đã khởi động");
  } catch (err) {
    logger.error("❌ Không khởi động được worker reservation", err);
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    logger.info(`🚀 Server đang chạy tại http://localhost:${env.PORT}`);
  });
}

bootstrap();
