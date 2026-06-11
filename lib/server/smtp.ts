import nodemailer from 'nodemailer';
import type { MailDraft } from '../providers/types.js';

// SMTP 발송 게이트웨이 — nodemailer. 서버 전용.

interface SmtpCfg {
  host: string;
  port: number;
  secure: boolean; // 465 → true(SSL), 587 → false(STARTTLS 자동)
}

/** SMTP로 메일 발송. */
export async function sendSmtp(
  address: string,
  password: string,
  cfg: SmtpCfg,
  draft: MailDraft,
): Promise<{ id: string }> {
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: address, pass: password },
  });
  const info = await transporter.sendMail({
    from: address,
    to: draft.to,
    subject: draft.subject,
    text: draft.body,
  });
  return { id: info.messageId };
}
