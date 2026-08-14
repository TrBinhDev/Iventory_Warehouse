import { Queue } from "bullmq";
import { queueConnection } from "./connection.js";
import { logger } from "../config/logger.js";

export const RESERVATION_QUEUE_NAME = "reservation";

// Job chạy đúng 1 lần khi phiếu hết hạn
export const JOB_EXPIRE_ONE = "expire-one";
// Job lặp mỗi 15 phút, quét phiếu quá hạn mà job trên bỏ sót (VD Redis restart mất job)
export const JOB_SWEEP = "sweep-expired";

export interface ExpireOneJobData {
  reservationId: string;
}

export const reservationQueue = new Queue(RESERVATION_QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    // Giữ lại một ít để soi khi cần, không để phình Redis
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

// Hẹn giờ nhả reserved đúng lúc phiếu hết hạn.
// GỌI SAU KHI transaction commit: hẹn bên trong mà rollback thì job vẫn tồn tại và sẽ đi nhả
// hàng của một phiếu chưa từng ra đời. Best-effort — Redis lỗi thì cron ở JOB_SWEEP dọn bù,
// không được để văng lỗi làm hỏng response của một phiếu đã tạo thành công.
export async function scheduleExpireJob(reservationId: string, expiresAt: Date): Promise<void> {
  const delay = Math.max(0, expiresAt.getTime() - Date.now());

  try {
    await reservationQueue.add(
      JOB_EXPIRE_ONE,
      { reservationId } satisfies ExpireOneJobData,
      // jobId cố định theo phiếu để hẹn lại cùng phiếu không tạo job trùng.
      // Dùng gạch ngang chứ KHÔNG dùng dấu hai chấm: BullMQ dành ':' làm phân cách key Redis
      // nên "Custom Id cannot contain :" — mà lỗi này bị catch bên dưới nuốt thành log, đường
      // chính hỏng âm thầm và chỉ cron dự phòng cứu.
      { delay, jobId: `expire-${reservationId}` }
    );
  } catch (err) {
    logger.error(`Không hẹn được job hết hạn cho phiếu ${reservationId}`, err);
  }
}

// Đăng ký job quét định kỳ. BullMQ 6 bỏ cách cũ (add kèm opts.repeat), giờ dùng job scheduler —
// upsert nên server khởi động lại bao nhiêu lần cũng không sinh lịch trùng.
export async function registerSweepJob(): Promise<void> {
  await reservationQueue.upsertJobScheduler(
    "sweep-expired",
    { every: 15 * 60 * 1000 },
    { name: JOB_SWEEP }
  );
}
