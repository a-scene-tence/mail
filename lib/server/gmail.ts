import type {
  MailAttachment,
  MailDraft,
  MailFolder,
  MailMessage,
} from '../providers/types.js';
import { randomToken } from './crypto.js';

// Gmail REST(v1) 호출 — access token 기반. 서버 전용.
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
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

/** payload 트리에서 첨부파일(파일명+attachmentId 보유 파트)을 수집. */
function extractAttachments(payload?: GmailPart): MailAttachment[] {
  const out: MailAttachment[] = [];
  const walk = (part?: GmailPart) => {
    if (!part) return;
    const aid = part.body?.attachmentId;
    if (aid && part.filename) {
      out.push({
        id: aid,
        filename: part.filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        size: part.body?.size ?? 0,
      });
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
    const atts = extractAttachments(m.payload);
    if (atts.length) base.attachments = atts;
  }
  return base;
}

const META_QUERY =
  'format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject';

// Gmail 배치 엔드포인트 — 여러 메시지 메타데이터를 multipart/mixed 1요청으로 묶는다.
const BATCH_URL = 'https://gmail.googleapis.com/batch/gmail/v1';

/** 배치 응답의 한 섹션에서 내부 HTTP 2xx의 JSON 본문을 추출. */
function gmailBatchSection(section: string): GmailMessage | null {
  const sep = section.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
  const segs = section.split(sep);
  // segs[0]=외부 파트 헤더, segs[1]=내부 HTTP 상태/헤더, segs[2..]=본문(JSON)
  if (segs.length < 3) return null;
  const statusLine = segs[1].trimStart().split(/\r?\n/)[0] ?? '';
  if (!/^HTTP\/\d\.\d\s+2\d\d/.test(statusLine)) return null;
  try {
    return JSON.parse(segs.slice(2).join(sep).trim()) as GmailMessage;
  } catch {
    return null;
  }
}

// Gmail batch 엔드포인트는 요청당 서브요청 100개 상한.
const BATCH_CHUNK = 100;

/** ≤100개 메시지 메타데이터를 배치 1요청으로 조회. 실패 시 throw. */
async function gmailMetaBatchChunk(
  accessToken: string,
  ids: string[],
): Promise<GmailMessage[]> {
  const boundary = `batch_${Math.random().toString(36).slice(2)}`;
  const body =
    ids
      .map(
        (id) =>
          `--${boundary}\r\n` +
          'Content-Type: application/http\r\n\r\n' +
          `GET /gmail/v1/users/me/messages/${id}?${META_QUERY}\r\n\r\n`,
      )
      .join('') + `--${boundary}--`;
  const res = await fetch(BATCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Gmail batch 실패: ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  const m = ct.match(/boundary=([^;]+)/i);
  if (!m) throw new Error('Gmail batch: 응답 boundary 없음');
  const respBoundary = m[1].replace(/^"|"$/g, '');
  const text = await res.text();
  const out: GmailMessage[] = [];
  for (const section of text.split(`--${respBoundary}`)) {
    const s = section.trim();
    if (!s || s === '--') continue;
    const msg = gmailBatchSection(section);
    if (msg && msg.id) out.push(msg);
  }
  return out;
}

/**
 * N개 메시지 메타데이터를 배치로 조회(100개씩 청크 → 병렬).
 * 한 청크라도 실패하면 throw → 호출부가 전체를 폴백(부분 누락 방지).
 */
async function gmailMetaBatch(
  accessToken: string,
  ids: string[],
): Promise<GmailMessage[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_CHUNK) {
    chunks.push(ids.slice(i, i + BATCH_CHUNK));
  }
  const results = await Promise.all(
    chunks.map((c) => gmailMetaBatchChunk(accessToken, c)),
  );
  return results.flat();
}

// 메시지 메타 워밍 캐시(워밍된 서버리스 인스턴스 내). key=`${accountId}:${id}` → 불변 메타.
// 토큰/폴더 캐시와 동일 패턴. 자격증명·본문은 저장하지 않음. unread는 TTL 내 지연될 수 있음.
const metaCache = new Map<string, { msg: MailMessage; exp: number }>();
const META_TTL_MS = 3 * 60_000;
const META_MAX_ENTRIES = 5000;

/** 조회한 메타를 캐시에 저장(메모리 무한증가 방지용 가벼운 상한). */
function cacheMetas(accountId: string, msgs: MailMessage[], now: number): void {
  if (metaCache.size > META_MAX_ENTRIES) {
    for (const [k, v] of metaCache) if (v.exp <= now) metaCache.delete(k);
    if (metaCache.size > META_MAX_ENTRIES) metaCache.clear();
  }
  for (const m of msgs) {
    metaCache.set(`${accountId}:${m.id}`, { msg: m, exp: now + META_TTL_MS });
  }
}

/** 메일함 목록 (메타데이터). label은 임의 라벨 ID(기본 INBOX). */
export async function listGmail(
  accountId: string,
  accessToken: string,
  limit = 20,
  label = 'INBOX',
): Promise<MailMessage[]> {
  // includeSpamTrash=true: 휴지통 라벨 조회 허용(INBOX 등 일반 라벨 결과엔 영향 없음).
  const list = await gget<{ messages?: { id: string }[] }>(
    accessToken,
    `/messages?maxResults=${limit}&labelIds=${encodeURIComponent(
      label,
    )}&includeSpamTrash=true`,
  );
  const ids = (list.messages ?? []).map((x) => x.id);
  if (ids.length === 0) return [];

  // 증분: 캐시에 있는 id는 재사용, 새/만료 id만 배치 조회(불변 메타 재다운로드 제거).
  const now = Date.now();
  const hits: MailMessage[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const c = metaCache.get(`${accountId}:${id}`);
    if (c && c.exp > now) hits.push(c.msg);
    else missing.push(id);
  }

  let fetched: MailMessage[] = [];
  if (missing.length > 0) {
    try {
      // 1) 배치 1요청으로 메타 수집(N+1 라운드트립 제거).
      const metas = await gmailMetaBatch(accessToken, missing);
      if (metas.length === 0) throw new Error('빈 배치 → 폴백');
      fetched = metas.map((m) => toMailMessage(accountId, m, false));
    } catch {
      // 2) 폴백: id별 메타 조회(Promise.all). 단일 실패는 무시.
      const r = await Promise.all(
        missing.map((id) =>
          gget<GmailMessage>(accessToken, `/messages/${id}?${META_QUERY}`)
            .then((m) => toMailMessage(accountId, m, false))
            .catch(() => null),
        ),
      );
      fetched = r.filter((m): m is MailMessage => m !== null);
    }
    cacheMetas(accountId, fetched, now);
  }

  // id 목록(최신순) 순서대로 hits ∪ fetched 매핑(누락 id 제외).
  const byId = new Map<string, MailMessage>();
  for (const m of hits) byId.set(m.id, m);
  for (const m of fetched) byId.set(m.id, m);
  return ids
    .map((id) => byId.get(id))
    .filter((m): m is MailMessage => m !== undefined);
}

// Gmail 시스템 라벨의 한글 표시명.
const GMAIL_LABEL_NAMES: Record<string, string> = {
  INBOX: '받은편지함',
  SENT: '보낸편지함',
  DRAFT: '임시보관함',
  TRASH: '휴지통',
  STARRED: '별표',
  IMPORTANT: '중요',
  CATEGORY_PERSONAL: '기본',
  CATEGORY_SOCIAL: '소셜',
  CATEGORY_PROMOTIONS: '프로모션',
  CATEGORY_UPDATES: '업데이트',
  CATEGORY_FORUMS: '포럼',
};

interface GmailLabel {
  id: string;
  name: string;
  type?: string;
}

/** 계정의 라벨(폴더) 목록 (스팸·읽음상태 라벨 제외). */
export async function listGmailLabels(
  accessToken: string,
): Promise<MailFolder[]> {
  const data = await gget<{ labels?: GmailLabel[] }>(accessToken, '/labels');
  const labels = data.labels ?? [];
  // 폴더가 아닌 상태 라벨(UNREAD)과 스팸은 제외.
  const EXCLUDE = new Set(['SPAM', 'UNREAD']);
  const kindOf = (id: string): MailFolder['kind'] =>
    id === 'INBOX'
      ? 'inbox'
      : id === 'SENT'
        ? 'sent'
        : id === 'TRASH'
          ? 'trash'
          : id === 'DRAFT'
            ? 'drafts'
            : 'folder';
  return labels
    .filter((l) => !EXCLUDE.has(l.id))
    .map((l) => ({
      id: l.id,
      name: GMAIL_LABEL_NAMES[l.id] ?? l.name,
      kind: kindOf(l.id),
    }));
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

// base64를 MIME 권장대로 76자마다 CRLF로 접는다.
function wrapB64(b64: string): string {
  return (b64.match(/.{1,76}/g) ?? []).join('\r\n');
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
  headers.push('MIME-Version: 1.0');

  const atts = draft.attachments ?? [];
  // 첨부 없으면 기존 단일 파트(text/plain) 유지 — 회귀 0.
  if (atts.length === 0) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      wrapB64(bodyB64),
    ].join('\r\n');
  }

  // 첨부 있으면 multipart/mixed: 본문 1파트 + 첨부 N파트.
  const boundary = `mixed_${randomToken(12)}`;
  const lines: string[] = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapB64(bodyB64),
  ];
  for (const a of atts) {
    const name = encodeSubject(a.filename); // RFC 2047 (한글 파일명)
    const type = a.mimeType || 'application/octet-stream';
    lines.push(
      `--${boundary}`,
      `Content-Type: ${type}; name="${name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${name}"`,
      '',
      wrapB64(a.data),
    );
  }
  lines.push(`--${boundary}--`, '');
  return lines.join('\r\n');
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

/** 첨부파일 바이너리 내려받기. */
export async function getGmailAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const data = await gget<{ data?: string }>(
    accessToken,
    `/messages/${messageId}/attachments/${attachmentId}`,
  );
  return Buffer.from(data.data ?? '', 'base64url');
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

/**
 * 메일을 다른 폴더(라벨)로 이동 (gmail.modify 스코프 필요).
 * Gmail은 라벨 모델 → 대상 라벨 추가 + 원본 라벨 제거로 '이동'을 구현.
 * fromLabel/toLabel은 라벨 ID(INBOX/SENT/TRASH 또는 사용자 라벨 ID).
 */
export async function moveGmail(
  accessToken: string,
  messageId: string,
  fromLabel: string,
  toLabel: string,
): Promise<void> {
  const res = await fetch(`${API}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addLabelIds: [toLabel],
      // 원본 라벨이 대상과 같으면 제거하지 않는다(이동 무효).
      removeLabelIds: fromLabel && fromLabel !== toLabel ? [fromLabel] : [],
    }),
  });
  if (!res.ok) throw new Error(`Gmail move 실패: ${res.status}`);
}
