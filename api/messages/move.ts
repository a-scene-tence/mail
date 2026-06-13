import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSessionId } from '../../lib/server/session.js';
import { resolveAccounts } from '../../lib/server/accounts.js';
import { moveMessage } from '../../lib/server/mailbox.js';

// POST /api/messages/move  body: { accountId, id, from, to }
// 지정 계정의 메시지를 from 폴더에서 to 폴더로 이동.
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const sessionId = readSessionId(req.headers.cookie);
  const { accountId, id, from, to } = (req.body ?? {}) as {
    accountId?: string;
    id?: string;
    from?: string;
    to?: string;
  };
  if (!sessionId || !accountId || !id || !to) {
    res.status(400).json({ error: '입력 누락 또는 미인증' });
    return;
  }

  try {
    const [resolved] = await resolveAccounts(sessionId, accountId);
    if (!resolved) {
      res.status(404).json({ error: '계정을 찾을 수 없음' });
      return;
    }
    await moveMessage(resolved, id, from || 'inbox', to);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}
