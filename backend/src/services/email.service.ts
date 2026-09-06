import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export interface MailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function smtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export async function sendEmail(payload: MailPayload): Promise<{ delivered: boolean }> {
  if (!smtpConfigured()) {
    console.info('[email:dev-fallback]', {
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });
    return { delivered: false };
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });

  return { delivered: true };
}

export async function sendInviteEmail(input: {
  to: string;
  username: string;
  temporaryPassword: string;
  loginUrl: string;
}): Promise<{ delivered: boolean }> {
  const text = [
    'Bạn đã được mời vào TestArchive.',
    '',
    `Email: ${input.to}`,
    `Tên đăng nhập: ${input.username}`,
    `Mật khẩu tạm: ${input.temporaryPassword}`,
    '',
    `Đăng nhập bằng email hoặc tên đăng nhập tại: ${input.loginUrl}`,
    'Bạn sẽ phải đổi mật khẩu ngay sau lần đăng nhập đầu tiên.',
    'Không chia sẻ mật khẩu tạm với người khác.',
  ].join('\n');

  return sendEmail({
    to: input.to,
    subject: 'Lời mời tài khoản TestArchive',
    text,
  });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
}): Promise<{ delivered: boolean }> {
  const text = [
    'Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu TestArchive.',
    '',
    `Mở liên kết sau để đặt mật khẩu mới: ${input.resetUrl}`,
    'Liên kết chỉ dùng một lần và sẽ hết hạn sớm.',
    'Nếu bạn không yêu cầu, hãy bỏ qua email này.',
  ].join('\n');

  return sendEmail({
    to: input.to,
    subject: 'Đặt lại mật khẩu TestArchive',
    text,
  });
}
