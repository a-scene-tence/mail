import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildAuthUrl } from '../../../lib/server/google.js';
import { randomToken } from '../../../lib/server/crypto.js';

// GET /api/auth/google/start
// 동의 화면으로 302 리다이렉트. state는 CSRF 방지용 난수.
// 세션 연속성은 콜백에서 기존 mail_session 쿠키(SameSite=Lax, 톱레벨 이동 시 전송)로 처리.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const state = randomToken(16);
    const url = buildAuthUrl(state);
    res.setHeader('Location', url);
    res.status(302).end();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
