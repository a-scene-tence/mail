import type { VercelRequest, VercelResponse } from '@vercel/node';

// GET /api/health
// 의존성 없는 핑 — 루트 /api 서버리스 라우팅이 살아있는지 확인하는 스모크 테스트용.
// 기대 응답: 200 { ok: true }
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, service: 'unified-mail-api' });
}
