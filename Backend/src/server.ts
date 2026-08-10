import express from "express";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { redis } from "./config/redis.js";
import { logger } from "./config/logger.js";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

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

  app.listen(env.PORT, () => {
    logger.info(`🚀 Server đang chạy tại http://localhost:${env.PORT}`);
  });
}

bootstrap();
