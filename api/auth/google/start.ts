import type { VercelRequest, VercelResponse } from '@vercel/node';

// GET /api/auth/google/start
// 골격 단계: OAuth 동의 화면으로의 리다이렉트 자리(스텁).
// M2에서 google OAuth2 client로 authUrl 생성 후 302 redirect.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(501).json({ error: 'Google OAuth start: Not Implemented (M2)' });
}
