import type { VercelRequest, VercelResponse } from '@vercel/node';

// GET /api/auth/google/callback?code=
// 골격 단계: 토큰 교환 자리(스텁).
// M2에서 code→token 교환, refresh token 암호화 저장 후 프론트로 리다이렉트.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(501).json({ error: 'Google OAuth callback: Not Implemented (M2)' });
}
