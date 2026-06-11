import type { VercelRequest, VercelResponse } from '@vercel/node';
import { exchangeCode, fetchEmail } from '../../../lib/server/google.js';
import { seal, randomToken } from '../../../lib/server/crypto.js';
import { getStore } from '../../../lib/server/store.js';
import {
  buildSessionCookie,
  readSessionId,
} from '../../../lib/server/session.js';

// GET /api/auth/google/callback?code=&state=
// code→token 교환 → 이메일 조회 → refresh token 암호화 저장 →
// 세션에 계정 연결 → 프론트(/mail)로 리다이렉트.
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const appBase = process.env.APP_BASE_URL ?? '';
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) {
      res.status(400).json({ error: 'code 누락' });
      return;
    }

    const { refreshToken, accessToken } = await exchangeCode(code);
    const email = await fetchEmail(accessToken);

    const accountId = `gmail:${email}`;
    const store = getStore();
    await store.putAccount({
      id: accountId,
      providerId: 'gmail',
      address: email,
      secret: seal(refreshToken),
    });

    // 기존 세션이 있으면 재사용, 없으면 새로 발급.
    const existing = readSessionId(req.headers.cookie);
    const sessionId = existing ?? randomToken(32);
    await store.linkSession(sessionId, accountId);

    res.setHeader('Set-Cookie', buildSessionCookie(sessionId));
    res.setHeader('Location', `${appBase}/mail/`);
    res.status(302).end();
  } catch {
    // 실패 시 로그인 화면으로 에러 표시
    res.setHeader('Location', `${appBase}/login/?error=oauth`);
    res.status(302).end();
  }
}
