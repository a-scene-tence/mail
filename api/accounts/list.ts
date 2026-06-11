import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { MailAccount } from '../../lib/providers/types';
import { readSessionId } from '../../lib/server/session';
import { getStore } from '../../lib/server/store';

// GET /api/accounts/list
// 세션에 연결된 계정 목록(식별자만, 자격증명 제외) 반환.
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const sessionId = readSessionId(req.headers.cookie);
  if (!sessionId) {
    res.status(200).json({ accounts: [] });
    return;
  }

  const store = getStore();
  const ids = await store.getSessionAccountIds(sessionId);
  const records = await Promise.all(ids.map((id) => store.getAccount(id)));
  const accounts: MailAccount[] = records
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => ({ id: r.id, providerId: r.providerId, address: r.address }));

  res.status(200).json({ accounts });
}
