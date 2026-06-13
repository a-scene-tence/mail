import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSessionId } from '../../lib/server/session.js';
import { resolveAccounts } from '../../lib/server/accounts.js';
import { moveMessage, deleteMessage } from '../../lib/server/mailbox.js';

// POST /api/messages/move  body: { accountId, id, from, to }
// 메시지를 from 폴더에서 to 폴더로 이동.
// 삭제(휴지통)도 이 엔드포인트로 통합: to='trash'면 deleteMessage 경유
// (IMAP 휴지통 폴더가 없을 때 영구삭제 폴백을 살리기 위함).
// Hobby 플랜 서버리스 함수 12개 제한 때문에 delete/move를 한 함수로 합쳤다.
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
    if (to === 'trash') {
      await deleteMessage(resolved, id, from || 'inbox');
    } else {
      await moveMessage(resolved, id, from || 'inbox', to);
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}
