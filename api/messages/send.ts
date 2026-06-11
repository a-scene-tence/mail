import type { VercelRequest, VercelResponse } from '@vercel/node';

// POST /api/messages/send  { accountId, draft }
// 골격 단계: 미구현(501). (M2/M3에서 게이트웨이 연결)
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  res.status(501).json({ error: 'Not Implemented (M2/M3)' });
}
