import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSessionId } from '../../lib/server/session';
import { resolveAccounts } from '../../lib/server/accounts';
import { getGmail } from '../../lib/server/gmail';

// GET /api/messages/get?accountId=&id=
// 지정 계정의 단일 메시지(본문 포함) 반환.
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const sessionId = readSessionId(req.headers.cookie);
  const accountId =
    typeof req.query.accountId === 'string' ? req.query.accountId : '';
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!sessionId || !accountId || !id) {
    res.status(400).json({ error: 'accountId/id 필요 또는 미인증' });
    return;
  }

  try {
    const [resolved] = await resolveAccounts(sessionId, accountId);
    if (!resolved) {
      res.status(404).json({ error: '계정을 찾을 수 없음' });
      return;
    }
    const message = await getGmail(resolved.account.id, resolved.accessToken, id);
    res.status(200).json(message);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}
