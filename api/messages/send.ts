import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { MailDraft } from '../../lib/providers/types.js';
import { readSessionId } from '../../lib/server/session.js';
import { resolveAccounts } from '../../lib/server/accounts.js';
import { sendMail } from '../../lib/server/mailbox.js';

// POST /api/messages/send  body: { accountId, draft: MailDraft }
// 지정 계정(Gmail OAuth 또는 IMAP/SMTP)으로 메일 발송.
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const sessionId = readSessionId(req.headers.cookie);
  const { accountId, draft } = (req.body ?? {}) as {
    accountId?: string;
    draft?: MailDraft;
  };
  if (!sessionId || !accountId || !draft) {
    res.status(400).json({ error: '입력 누락 또는 미인증' });
    return;
  }

  try {
    const [resolved] = await resolveAccounts(sessionId, accountId);
    if (!resolved) {
      res.status(404).json({ error: '계정을 찾을 수 없음' });
      return;
    }
    const result = await sendMail(resolved, draft);
    res.status(200).json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}
