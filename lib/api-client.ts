import type {
  ListOptions,
  Mailbox,
  MailAccount,
  MailAttachment,
  MailDraft,
  MailFolder,
  MailGateway,
  MailMessage,
} from './providers/types';

// 메일 백엔드(Vercel 서버리스 /api/*) 호출 래퍼.
// NEXT_PUBLIC_API_BASE_URL 이 비면 같은 오리진(/api)을 사용한다.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    // 세션 쿠키 전송 (httpOnly mail_session)
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`API ${path} 실패: ${res.status}`);
  }
  return (await res.json()) as T;
}

/** 연결된 계정 목록. */
export async function listAccounts(): Promise<MailAccount[]> {
  const data = await request<{ accounts: MailAccount[] }>('/api/accounts/list');
  return data.accounts;
}

/** 계정의 폴더(메일함) 목록 — 스팸 제외. */
export async function listFolders(accountId: string): Promise<MailFolder[]> {
  const data = await request<{ folders: MailFolder[] }>(
    `/api/folders?accountId=${encodeURIComponent(accountId)}`,
  );
  return data.folders;
}

/** 계정 연결 해제(로그아웃) — 세션에서 제거하고 자격증명 폐기. */
export async function removeAccount(accountId: string): Promise<void> {
  await request('/api/accounts/remove', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

/** Gmail OAuth 시작 — 동의 화면으로 이동. */
export function startGoogleLogin(): void {
  window.location.href = `${API_BASE}/api/auth/google/start`;
}

/** IMAP 로그인 실패 시 서버가 준 사유(reason)를 함께 던지는 에러. */
export class ImapLoginError extends Error {
  reason?: string;
  detail?: string;
  constructor(message: string, reason?: string, detail?: string) {
    super(message);
    this.name = 'ImapLoginError';
    this.reason = reason;
    this.detail = detail;
  }
}

/** IMAP 계정 로그인 — 자격증명을 서버에 전송해 검증 후 세션 발급. */
export async function imapLogin(
  providerId: string,
  address: string,
  password: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/imap/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, address, password }),
  });
  if (!res.ok) {
    // 서버가 준 reason/detail을 끌어내 구체적 안내에 활용.
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      reason?: string;
      detail?: string;
    };
    throw new ImapLoginError(
      body.error ?? `로그인 실패 (${res.status})`,
      body.reason,
      body.detail,
    );
  }
}

/** 첨부파일 다운로드 URL (파일명/타입은 메타에서 쿼리로 전달). */
export function attachmentUrl(
  accountId: string,
  messageId: string,
  att: MailAttachment,
  mailbox: Mailbox = 'inbox',
): string {
  const params = new URLSearchParams({
    accountId,
    messageId,
    attachmentId: att.id,
    mailbox,
    filename: att.filename,
    mimeType: att.mimeType,
  });
  return `${API_BASE}/api/messages/attachment?${params.toString()}`;
}

/** 첨부파일을 Blob으로 받아온다 (세션 쿠키 포함). */
export async function fetchAttachment(
  accountId: string,
  messageId: string,
  att: MailAttachment,
  mailbox: Mailbox = 'inbox',
): Promise<Blob> {
  const res = await fetch(
    attachmentUrl(accountId, messageId, att, mailbox),
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`첨부파일 다운로드 실패: ${res.status}`);
  return res.blob();
}

/** 프론트에서 쓰는 게이트웨이 — 모든 메일 동작은 백엔드를 경유한다. */
export const mailApi: MailGateway = {
  async listMessages(opts: ListOptions) {
    const params = new URLSearchParams();
    if (opts.accountId) params.set('accountId', opts.accountId);
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.mailbox) params.set('mailbox', opts.mailbox);
    if (opts.query) params.set('q', opts.query);
    const qs = params.toString();
    const data = await request<{ messages: MailMessage[] }>(
      `/api/messages/list${qs ? `?${qs}` : ''}`,
    );
    return data.messages;
  },

  async getMessage(accountId: string, messageId: string, mailbox?: Mailbox) {
    const box = mailbox ? `&mailbox=${mailbox}` : '';
    return request<MailMessage>(
      `/api/messages/get?accountId=${encodeURIComponent(
        accountId,
      )}&id=${encodeURIComponent(messageId)}${box}`,
    );
  },

  async sendMessage(accountId: string, draft: MailDraft) {
    return request<{ id: string }>(`/api/messages/send`, {
      method: 'POST',
      body: JSON.stringify({ accountId, draft }),
    });
  },

  async deleteMessage(accountId: string, messageId: string, mailbox?: Mailbox) {
    // 삭제 = 휴지통으로 이동. move 엔드포인트로 통합(to='trash').
    return request<{ ok: true }>(`/api/messages/move`, {
      method: 'POST',
      body: JSON.stringify({ accountId, id: messageId, from: mailbox, to: 'trash' }),
    });
  },

  async moveMessage(
    accountId: string,
    messageId: string,
    to: Mailbox,
    from?: Mailbox,
  ) {
    return request<{ ok: true }>(`/api/messages/move`, {
      method: 'POST',
      body: JSON.stringify({ accountId, id: messageId, to, from }),
    });
  },

  async markRead(accountId: string, messageId: string, mailbox?: Mailbox) {
    // 읽음 처리도 move 엔드포인트로 통합(action='read').
    return request<{ ok: true }>(`/api/messages/move`, {
      method: 'POST',
      body: JSON.stringify({ accountId, id: messageId, from: mailbox, action: 'read' }),
    });
  },
};
