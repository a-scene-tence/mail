import type { MailDraft, MailMessage } from '../providers/types.js';

// Gmail REST(v1) 호출 — access token 기반. 서버 전용.
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: GmailHeader[];
}
interface GmailMessage {
  id: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
}

async function gget<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail API ${path} 실패: ${res.status}`);
  }
  return (await res.json()) as T;
}

function header(headers: GmailHeader[] | undefined, name: string): string {
  const h = headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

function decodeB64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}

/** payload 트리에서 text/plain·text/html 본문을 추출. */
function extractBody(payload?: GmailPart): {
  text?: string;
  html?: string;
} {
  const out: { text?: string; html?: string } = {};
  const walk = (part?: GmailPart) => {
    if (!part) return;
    const data = part.body?.data;
    if (data) {
      if (part.mimeType === 'text/plain' && !out.text)
        out.text = decodeB64Url(data);
      if (part.mimeType === 'text/html' && !out.html)
        out.html = decodeB64Url(data);
    }
    part.parts?.forEach(walk);
  };
  walk(payload);
  return out;
}

function toMailMessage(
  accountId: string,
  m: GmailMessage,
  withBody: boolean,
): MailMessage {
  const headers = m.payload?.headers;
  const dateMs = m.internalDate ? Number(m.internalDate) : NaN;
  const base: MailMessage = {
    id: m.id,
    accountId,
    from: header(headers, 'From'),
    to: header(headers, 'To')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    subject: header(headers, 'Subject'),
    snippet: m.snippet ?? '',
    date: Number.isNaN(dateMs)
      ? new Date().toISOString()
      : new Date(dateMs).toISOString(),
    unread: (m.labelIds ?? []).includes('UNREAD'),
  };
  if (withBody) {
    const body = extractBody(m.payload);
    base.bodyText = body.text;
    base.bodyHtml = body.html;
    base.messageId = header(headers, 'Message-ID') || undefined;
    base.threadId = m.threadId;
  }
  return base;
}

/** 메일함 목록 (메타데이터). 기본 INBOX, label='SENT'면 보낸편지함. */
export async function listGmail(
  accountId: string,
  accessToken: string,
  limit = 20,
  label: 'INBOX' | 'SENT' = 'INBOX',
): Promise<MailMessage[]> {
  const list = await gget<{ messages?: { id: string }[] }>(
    accessToken,
    `/messages?maxResults=${limit}&labelIds=${label}`,
  );
  const ids = list.messages ?? [];
  const metaHeaders = '&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject';
  const messages = await Promise.all(
    ids.map((x) =>
      gget<GmailMessage>(
        accessToken,
        `/messages/${x.id}?format=metadata${metaHeaders}`,
      )
        .then((m) => toMailMessage(accountId, m, false))
        // 단일 메시지 조회 실패가 전체 목록을 깨뜨리지 않도록 무시.
        .catch(() => null),
    ),
  );
  return messages.filter((m): m is MailMessage => m !== null);
}

/** 단일 메시지 (본문 포함). */
export async function getGmail(
  accountId: string,
  accessToken: string,
  messageId: string,
): Promise<MailMessage> {
  const m = await gget<GmailMessage>(
    accessToken,
    `/messages/${messageId}?format=full`,
  );
  return toMailMessage(accountId, m, true);
}

// RFC 2047 encoded-word for non-ASCII subjects (Korean 등).
function encodeSubject(s: string): string {
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

function buildMime(from: string, draft: MailDraft): string {
  const bodyB64 = Buffer.from(draft.body, 'utf8').toString('base64');
  const headers = [
    `From: ${from}`,
    `To: ${draft.to.join(', ')}`,
    `Subject: ${encodeSubject(draft.subject)}`,
  ];
  // 회신 스레드 연결 헤더 (있을 때만).
  if (draft.inReplyTo) headers.push(`In-Reply-To: ${draft.inReplyTo}`);
  if (draft.references?.length)
    headers.push(`References: ${draft.references.join(' ')}`);
  // 수신확인 요청 (MDN). 받는 클라이언트가 지원할 때만 알림이 돌아온다.
  if (draft.readReceipt) {
    headers.push(`Disposition-Notification-To: ${from}`);
    headers.push(`Return-Receipt-To: ${from}`);
  }
  return [
    ...headers,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64,
  ].join('\r\n');
}

/** Gmail REST로 메일 발송. */
export async function sendGmail(
  accessToken: string,
  from: string,
  draft: MailDraft,
): Promise<{ id: string }> {
  const raw = Buffer.from(buildMime(from, draft), 'utf8').toString('base64url');
  const payload: { raw: string; threadId?: string } = { raw };
  // 회신을 같은 스레드로 묶기 (Gmail).
  if (draft.threadId) payload.threadId = draft.threadId;
  const res = await fetch(`${API}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Gmail send 실패: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

/** 메일을 휴지통으로 이동 (gmail.modify 스코프 필요). */
export async function trashGmail(
  accessToken: string,
  messageId: string,
): Promise<void> {
  const res = await fetch(`${API}/messages/${messageId}/trash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail trash 실패: ${res.status}`);
}
