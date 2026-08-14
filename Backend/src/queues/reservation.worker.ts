import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { createQueueConnection } from "./connection.js";
import { logger } from "../config/logger.js";
import {
  JOB_EXPIRE_ONE,
  JOB_SWEEP,
  RESERVATION_QUEUE_NAME,
  type ExpireOneJobData,
} from "./reservation.queue.js";
import * as reservationService from "../modules/reservation/reservation.service.js";

// Xử lý 1 job: nhả hàng của đúng 1 phiếu, hoặc quét dọn các phiếu quá hạn còn sót
async function process(job: Job): Promise<void> {
  if (job.name === JOB_EXPIRE_ONE) {
    const { reservationId } = job.data as ExpireOneJobData;
    const released = await reservationService.expireReservation(reservationId);

    // Không nhả nghĩa là khách đã tự huỷ hoặc phiếu đã chốt thành đơn — chuyện bình thường
    if (released) logger.info(`Phiếu ${reservationId} hết hạn, đã nhả hàng`);
    return;
  }

  if (job.name === JOB_SWEEP) {
    const released = await reservationService.sweepExpiredReservations();
    if (released > 0) logger.warn(`Cron dọn ${released} phiếu quá hạn bị job chính bỏ sót`);
    return;
  }

  logger.warn(`Job lạ trong queue reservation: ${job.name}`);
}

// Khởi động worker. Tách khỏi Express nên muốn chạy process riêng chỉ cần thêm entry gọi hàm này.
export function createReservationWorker(): Worker {
  const worker = new Worker(RESERVATION_QUEUE_NAME, process, {
    connection: createQueueConnection("worker"),
    concurrency: 5,
  });

  // Job fail vẫn được BullMQ thử lại theo attempts; hết lượt thì cron JOB_SWEEP là lưới đỡ cuối
  worker.on("failed", (job, err) => {
    logger.error(`Job ${job?.name} (${job?.id}) thất bại`, err);
  });

  worker.on("error", (err) => logger.error("Lỗi worker reservation", err));

  return worker;
}
