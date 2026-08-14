import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET không được để trống'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET không được để trống'),
  SECRET_KEY: z.string().min(1, 'SECRET_KEY không được để trống'),

  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY không được để trống'),
  RESEND_FROM_EMAIL: z.string().email('RESEND_FROM_EMAIL phải là email hợp lệ'),
  CLIENT_APP_URL: z.string().url('CLIENT_APP_URL phải là URL hợp lệ'),

  // Cloudflare R2 — tương thích API S3 nên dùng chung @aws-sdk/client-s3
  R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID không được để trống'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID không được để trống'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY không được để trống'),
  R2_BUCKET: z.string().min(1, 'R2_BUCKET không được để trống'),
  // URL công khai để đọc file (public bucket hoặc custom domain) — đây là phần đầu của URL lưu vào DB
  R2_PUBLIC_URL: z.string().url('R2_PUBLIC_URL phải là URL hợp lệ'),

  // Hạn giữ chỗ của 1 phiếu Reservation. Có default nên .env cũ không cần sửa;
  // đây là chính sách kinh doanh nên để ở env, đổi không phải deploy lại.
  RESERVATION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .positive('RESERVATION_TTL_MINUTES phải là số nguyên dương')
    .default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Biến môi trường không hợp lệ:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;