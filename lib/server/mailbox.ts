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
  if (mailbox === 'trash') return 'TRASH';
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

// 다폴더 집계 시 과부하 방지를 위한 폴더 수 상한.
const MAX_FOLDERS = 15;

/** 단일 폴더에서 메시지 목록 fetch (제공자 분기). */
async function fetchFolder(
  r: ResolvedAccount,
  limit: number,
  folder: Mailbox,
): Promise<MailMessage[]> {
  const p = providerOf(r);
  if (p.auth === 'oauth') {
    const token = await accessTokenFromRefresh(r.secret);
    return listGmail(r.account.id, token, limit, gmailLabel(folder));
  }
  if (!p.imap) throw new Error(`${p.id}: imap 설정 없음`);
  return listImap(r.account.id, r.account.address, r.secret, p.imap, limit, folder);
}

/**
 * 한 계정에서 여러 폴더를 합쳐 최신순 목록을 만든다.
 * - 각 폴더 메시지에 `folder`를 태깅(열람/삭제를 정확한 폴더로).
 * - accountId:id 로 중복 제거(Gmail 라벨 중복 대비).
 * - query가 있으면 최근 SEARCH_WINDOW개를 받아 서버 substring 필터.
 */
export async function listMailboxes(
  r: ResolvedAccount,
  limit: number,
  folderIds: string[],
  query?: string,
): Promise<MailMessage[]> {
  const ids = (folderIds.length ? folderIds : ['inbox']).slice(0, MAX_FOLDERS);
  const q = query?.trim();
  const fetchLimit = q ? SEARCH_WINDOW : limit;

  const perFolder = await Promise.all(
    ids.map((fid) =>
      fetchFolder(r, fetchLimit, fid)
        .then((msgs) => msgs.map((m) => ({ ...m, folder: fid })))
        .catch(() => [] as MailMessage[]),
    ),
  );

  const seen = new Set<string>();
  const merged: MailMessage[] = [];
  for (const m of perFolder
    .flat()
    .sort((a, b) => b.date.localeCompare(a.date))) {
    const k = `${m.accountId}:${m.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(m);
  }

  const result = q ? merged.filter((m) => matchesQuery(m, q)) : merged;
  return result.slice(0, limit);
}

/** 단일 메일함 목록 (호환용 래퍼). */
export async function listMailbox(
  r: ResolvedAccount,
  limit: number,
  mailbox: Mailbox = 'inbox',
  query?: string,
): Promise<MailMessage[]> {
  return listMailboxes(r, limit, [mailbox], query);
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
