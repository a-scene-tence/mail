import type {
  MailDraft,
  MailFolder,
  MailMessage,
  Mailbox,
} from '../providers/types.js';
import { getProvider } from '../providers/registry.js';
import type { ResolvedAccount } from './accounts.js';
import { accessTokenFromRefresh } from './google.js';
import {
  listGmail,
  getGmail,
  sendGmail,
  trashGmail,
  getGmailAttachment,
  listGmailLabels,
} from './gmail.js';
import {
  listImap,
  getImap,
  trashImap,
  getImapAttachment,
  listImapFolders,
} from './imap.js';
import { sendSmtp } from './smtp.js';

/** mailbox 식별자 → Gmail 라벨 ID (의미 별칭 변환). */
function gmailLabel(mailbox: Mailbox): string {
  if (mailbox === 'inbox') return 'INBOX';
  if (mailbox === 'sent') return 'SENT';
  return mailbox;
}

// 제공자 디스패처 — auth 종류(oauth/imap)에 따라 적합한 게이트웨이로 라우팅.
// 엔드포인트(api/messages/*)는 이 함수만 호출하고 제공자를 직접 모른다.

function providerOf(r: ResolvedAccount) {
  const p = getProvider(r.account.providerId);
  if (!p) throw new Error(`알 수 없는 제공자: ${r.account.providerId}`);
  return p;
}

// 검색 시 가져올 최근 메시지 창 크기 (이 범위 내에서 부분일치 필터).
const SEARCH_WINDOW = 50;

/** 제목·보낸사람·받는사람·미리보기에서 대소문자 무시 부분일치. */
function matchesQuery(m: MailMessage, q: string): boolean {
  const s = q.toLowerCase();
  return (
    m.from.toLowerCase().includes(s) ||
    m.subject.toLowerCase().includes(s) ||
    m.to.some((t) => t.toLowerCase().includes(s)) ||
    (m.snippet ?? '').toLowerCase().includes(s)
  );
}

/**
 * 메일함 목록 (기본 INBOX, mailbox='sent'면 보낸편지함).
 * query가 있으면 최근 SEARCH_WINDOW개를 받아 서버에서 부분일치 필터(제공자 검색
 * 문법·CJK 색인 차이에 영향받지 않게 예측 가능한 substring 매칭).
 */
export async function listMailbox(
  r: ResolvedAccount,
  limit: number,
  mailbox: Mailbox = 'inbox',
  query?: string,
): Promise<MailMessage[]> {
  const p = providerOf(r);
  const q = query?.trim();
  const fetchLimit = q ? SEARCH_WINDOW : limit;

  let msgs: MailMessage[];
  if (p.auth === 'oauth') {
    const token = await accessTokenFromRefresh(r.secret);
    msgs = await listGmail(r.account.id, token, fetchLimit, gmailLabel(mailbox));
  } else {
    if (!p.imap) throw new Error(`${p.id}: imap 설정 없음`);
    msgs = await listImap(
      r.account.id,
      r.account.address,
      r.secret,
      p.imap,
      fetchLimit,
      mailbox,
    );
  }

  if (q) return msgs.filter((m) => matchesQuery(m, q)).slice(0, limit);
  return msgs;
}

/** 계정의 폴더(메일함) 목록 — 스팸 제외. */
export async function listFolders(
  r: ResolvedAccount,
): Promise<MailFolder[]> {
  const p = providerOf(r);
  if (p.auth === 'oauth') {
    const token = await accessTokenFromRefresh(r.secret);
    return listGmailLabels(token);
  }
  if (!p.imap) throw new Error(`${p.id}: imap 설정 없음`);
  return listImapFolders(r.account.address, r.secret, p.imap);
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

/** 첨부파일 바이너리 내려받기. */
export async function getAttachment(
  r: ResolvedAccount,
  messageId: string,
  attachmentId: string,
  mailbox: Mailbox = 'inbox',
): Promise<Buffer> {
  const p = providerOf(r);
  if (p.auth === 'oauth') {
    const token = await accessTokenFromRefresh(r.secret);
    return getGmailAttachment(token, messageId, attachmentId);
  }
  if (!p.imap) throw new Error(`${p.id}: imap 설정 없음`);
  return getImapAttachment(
    r.account.address,
    r.secret,
    p.imap,
    messageId,
    attachmentId,
    mailbox,
  );
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
