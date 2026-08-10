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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Biến môi trường không hợp lệ:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;