import { Resend } from "resend";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const resend = new Resend(env.RESEND_API_KEY);

// Gửi email chứa mã OTP xác thực tài khoản
export async function sendVerificationEmail(
  to: string,
  otp: string
): Promise<void> {
  const { error } = await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject: "Mã xác thực tài khoản",
    html: `<p>Mã xác thực tài khoản của bạn là:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${otp}</p><p>Mã có hiệu lực trong 10 phút. Không chia sẻ mã này cho bất kỳ ai.</p>`,
  });

  if (error) {
    logger.error("Gửi email OTP xác thực thất bại", error);
    throw new Error("Gửi email OTP xác thực thất bại");
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
