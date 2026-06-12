import type { MailDraft, MailMessage, Mailbox } from '../providers/types.js';
import { getProvider } from '../providers/registry.js';
import type { ResolvedAccount } from './accounts.js';
import { accessTokenFromRefresh } from './google.js';
import { listGmail, getGmail, sendGmail, trashGmail } from './gmail.js';
import { listImap, getImap, trashImap } from './imap.js';
import { sendSmtp } from './smtp.js';

// 제공자 디스패처 — auth 종류(oauth/imap)에 따라 적합한 게이트웨이로 라우팅.
// 엔드포인트(api/messages/*)는 이 함수만 호출하고 제공자를 직접 모른다.

function providerOf(r: ResolvedAccount) {
  const p = getProvider(r.account.providerId);
  if (!p) throw new Error(`알 수 없는 제공자: ${r.account.providerId}`);
  return p;
}

/** 메일함 목록 (기본 INBOX, mailbox='sent'면 보낸편지함). */
export async function listMailbox(
  r: ResolvedAccount,
  limit: number,
  mailbox: Mailbox = 'inbox',
): Promise<MailMessage[]> {
  const p = providerOf(r);
  if (p.auth === 'oauth') {
    const token = await accessTokenFromRefresh(r.secret);
    return listGmail(
      r.account.id,
      token,
      limit,
      mailbox === 'sent' ? 'SENT' : 'INBOX',
    );
  }
  if (!p.imap) throw new Error(`${p.id}: imap 설정 없음`);
  return listImap(
    r.account.id,
    r.account.address,
    r.secret,
    p.imap,
    limit,
    mailbox,
  );
}

/** 단일 메시지 (본문 포함). */
export async function getMessage(
  r: ResolvedAccount,
  id: string,
  mailbox: Mailbox = 'inbox',
): Promise<MailMessage> {
  const p = providerOf(r);
  if (p.auth === 'oauth') {
    const token = await accessTokenFromRefresh(r.secret);
    return getGmail(r.account.id, token, id);
  }
  if (!p.imap) throw new Error(`${p.id}: imap 설정 없음`);
  return getImap(r.account.id, r.account.address, r.secret, p.imap, id, mailbox);
}

/** 메일 발송. */
export async function sendMail(
  r: ResolvedAccount,
  draft: MailDraft,
): Promise<{ id: string }> {
  const p = providerOf(r);
  if (p.auth === 'oauth') {
    const token = await accessTokenFromRefresh(r.secret);
    return sendGmail(token, r.account.address, draft);
  }
  if (!p.smtp) throw new Error(`${p.id}: smtp 설정 없음`);
  return sendSmtp(r.account.address, r.secret, p.smtp, draft);
}

/** 메일 삭제 — 휴지통으로 이동 (복구 가능). */
export async function deleteMessage(
  r: ResolvedAccount,
  id: string,
  mailbox: Mailbox = 'inbox',
): Promise<{ ok: true }> {
  const p = providerOf(r);
  if (p.auth === 'oauth') {
    const token = await accessTokenFromRefresh(r.secret);
    await trashGmail(token, id);
    return { ok: true };
  }
  if (!p.imap) throw new Error(`${p.id}: imap 설정 없음`);
  await trashImap(r.account.address, r.secret, p.imap, id, mailbox);
  return { ok: true };
}
