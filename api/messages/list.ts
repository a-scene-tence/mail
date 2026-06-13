import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { MailMessage } from '../../lib/providers/types.js';
import { readSessionId } from '../../lib/server/session.js';
import { resolveAccounts } from '../../lib/server/accounts.js';
import { listMailboxes } from '../../lib/server/mailbox.js';

// GET /api/messages/list?accountId=&limit=
// 세션의 (전체 또는 특정) 계정에서 INBOX 목록을 모아 최신순 반환.
// 계정별 조회 실패는 빈 배열로 무시해 나머지 계정을 정상 반환한다.
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
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const mailboxParam =
    typeof req.query.mailbox === 'string' && req.query.mailbox
      ? req.query.mailbox
      : 'inbox';
  // 콤마 분리 → 다폴더 집계. 빈 값이면 받은편지함.
  const folderIds = mailboxParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const query = typeof req.query.q === 'string' ? req.query.q : undefined;

  try {
    const accounts = await resolveAccounts(sessionId, accountId);
    const perAccount = await Promise.all(
      accounts.map((r) =>
        listMailboxes(r, limit, folderIds, query).catch(
          () => [] as MailMessage[],
        ),
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
