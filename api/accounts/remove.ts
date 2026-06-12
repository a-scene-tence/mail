import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSessionId } from '../../lib/server/session.js';
import { getStore } from '../../lib/server/store.js';

// POST /api/accounts/remove  body: { accountId }
// 세션에서 계정 연결을 해제하고 저장된 자격증명을 폐기한다(연결 해제/로그아웃).
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const sessionId = readSessionId(req.headers.cookie);
  const { accountId } = (req.body ?? {}) as { accountId?: string };
  if (!sessionId || !accountId) {
    res.status(400).json({ error: '입력 누락 또는 미인증' });
    return;
  }

  try {
    const store = getStore();
    const ids = await store.getSessionAccountIds(sessionId);
    if (!ids.includes(accountId)) {
      res.status(404).json({ error: '세션에 없는 계정' });
      return;
    }
    await store.unlinkSession(sessionId, accountId);
    await store.deleteAccount(accountId);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}
