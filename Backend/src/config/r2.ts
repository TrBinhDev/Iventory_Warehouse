import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';

// Cloudflare R2 tương thích API S3 nên dùng luôn S3Client, chỉ trỏ endpoint về R2.
// region phải đặt 'auto' — R2 không chia region như S3 nhưng SDK vẫn bắt buộc có giá trị.
export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export const R2_BUCKET = env.R2_BUCKET;

// Ghép key thành URL công khai để lưu vào DB (Product.images, User.avatarUrl)
export function buildPublicUrl(key: string): string {
  return `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

// Tách ngược key ra từ URL đã lưu — dùng lúc cần xoá file khỏi R2.
// Trả null nếu URL không thuộc bucket của mình (VD ảnh do người dùng dán link ngoài vào).
export function extractKeyFromUrl(url: string): string | null {
  const prefix = `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/`;
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  return key.length > 0 ? key : null;
}
