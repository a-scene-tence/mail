import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { MailMessage } from '../../lib/providers/types.js';
import { readSessionId } from '../../lib/server/session.js';
import { resolveAccounts } from '../../lib/server/accounts.js';
import { listGmail } from '../../lib/server/gmail.js';

// GET /api/messages/list?accountId=&limit=
// 세션의 (전체 또는 특정) 계정에서 INBOX 목록을 모아 최신순 반환.
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
    res.status(200).json({ messages: [] });
    return;
  }

  const accountId =
    typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
  const limit = Math.min(
    Number(req.query.limit) || 20,
    50,
  );

  try {
    const accounts = await resolveAccounts(sessionId, accountId);
    const perAccount = await Promise.all(
      accounts.map(({ account, accessToken }) =>
        listGmail(account.id, accessToken, limit),
      ),
    );
    const messages: MailMessage[] = perAccount
      .flat()
      .sort((a, b) => b.date.localeCompare(a.date));
    res.status(200).json({ messages });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}
