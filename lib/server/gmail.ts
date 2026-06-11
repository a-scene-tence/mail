import type { MailMessage } from '../providers/types';

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
  }
  return base;
}

/** INBOX 메시지 목록 (메타데이터). */
export async function listGmail(
  accountId: string,
  accessToken: string,
  limit = 20,
): Promise<MailMessage[]> {
  const list = await gget<{ messages?: { id: string }[] }>(
    accessToken,
    `/messages?maxResults=${limit}&labelIds=INBOX`,
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
