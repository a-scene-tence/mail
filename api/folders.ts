import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSessionId } from '../lib/server/session.js';
import { resolveAccounts } from '../lib/server/accounts.js';
import { listFolders } from '../lib/server/mailbox.js';

// GET /api/folders?accountId=
// 지정 계정의 폴더(메일함/라벨) 목록을 반환 (스팸 제외).
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
  if (!sessionId || !accountId) {
    res.status(400).json({ error: 'accountId 필요 또는 미인증' });
    return;
  }

  try {
    const [resolved] = await resolveAccounts(sessionId, accountId);
    if (!resolved) {
      res.status(404).json({ error: '계정을 찾을 수 없음' });
      return;
    }
    const folders = await listFolders(resolved);
    res.status(200).json({ folders });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}
