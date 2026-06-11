import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { MailMessage } from '../../lib/providers/types';

// GET /api/messages/list?accountId=&limit=&cursor=
// 골격 단계: 빈 목록을 반환한다. (M2/M3에서 게이트웨이 연결)
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const messages: MailMessage[] = [];
  res.status(200).json({ messages, nextCursor: null });
}
