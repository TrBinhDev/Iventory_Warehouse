import { Resend } from "resend";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const resend = new Resend(env.RESEND_API_KEY);

// Gửi email xác thực tài khoản kèm link verify chứa token
export async function sendVerificationEmail(
  to: string,
  token: string
): Promise<void> {
  const verifyUrl = `${env.CLIENT_APP_URL}/verify-email?token=${token}`;

  const { error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject: "Xác thực tài khoản",
    html: `<p>Nhấn vào link sau để xác thực tài khoản của bạn:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>Link có hiệu lực trong 24 giờ.</p>`,
  });

  if (error) {
    logger.error("Gửi email xác thực thất bại", error);
    throw new Error("Gửi email xác thực thất bại");
  }
}

// Gửi email đặt lại mật khẩu kèm link reset chứa token
export async function sendPasswordResetEmail(
  to: string,
  token: string
): Promise<void> {
  const resetUrl = `${env.CLIENT_APP_URL}/reset-password?token=${token}`;

  const { error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject: "Đặt lại mật khẩu",
    html: `<p>Nhấn vào link sau để đặt lại mật khẩu:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Link có hiệu lực trong 15 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
  });

  if (error) {
    logger.error("Gửi email đặt lại mật khẩu thất bại", error);
    throw new Error("Gửi email đặt lại mật khẩu thất bại");
  }
}
