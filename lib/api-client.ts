import type {
  ListOptions,
  MailDraft,
  MailGateway,
  MailMessage,
} from './providers/types';

// 메일 백엔드(Vercel 서버리스 /api/*) 호출 래퍼.
// NEXT_PUBLIC_API_BASE_URL 이 비면 같은 오리진(/api)을 사용한다.
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`API ${path} 실패: ${res.status}`);
  }
  return (await res.json()) as T;
}

/** 프론트에서 쓰는 게이트웨이 — 모든 메일 동작은 백엔드를 경유한다. */
export const mailApi: MailGateway = {
  async listMessages(opts: ListOptions) {
    const params = new URLSearchParams();
    if (opts.accountId) params.set('accountId', opts.accountId);
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.cursor) params.set('cursor', opts.cursor);
    const qs = params.toString();
    const data = await request<{ messages: MailMessage[] }>(
      `/api/messages/list${qs ? `?${qs}` : ''}`,
    );
    return data.messages;
  },

  async getMessage(accountId: string, messageId: string) {
    return request<MailMessage>(
      `/api/messages/get?accountId=${encodeURIComponent(
        accountId,
      )}&id=${encodeURIComponent(messageId)}`,
    );
  },

  async sendMessage(accountId: string, draft: MailDraft) {
    return request<{ id: string }>(`/api/messages/send`, {
      method: 'POST',
      body: JSON.stringify({ accountId, draft }),
    });
  },
};
