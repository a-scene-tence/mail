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
  // 수신확인 요청 (MDN) — 발신자 주소로 알림 요청 헤더 추가.
  const headers = draft.readReceipt
    ? {
        'Disposition-Notification-To': address,
        'Return-Receipt-To': address,
      }
    : undefined;
  const info = await transporter.sendMail({
    from: address,
    to: draft.to,
    subject: draft.subject,
    text: draft.body,
    // 회신 스레드 연결 헤더 (있을 때만).
    inReplyTo: draft.inReplyTo,
    references: draft.references,
    headers,
    // 첨부 — nodemailer가 multipart MIME·파일명 인코딩 처리.
    attachments: draft.attachments?.map((a) => ({
      filename: a.filename,
      content: a.data,
      encoding: 'base64' as const,
      contentType: a.mimeType || undefined,
    })),
  });
  return { id: info.messageId };
}
