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
  // 실패 단계 추적 — catch에서 ?reason=<stage>로 노출해 진단 가능하게.
  let stage = 'init';
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) {
      res.status(400).json({ error: 'code 누락' });
      return;
    }

    stage = 'token';
    const { refreshToken, accessToken } = await exchangeCode(code);
    stage = 'email';
    const email = await fetchEmail(accessToken);

    stage = 'seal';
    const secret = seal(refreshToken);

    stage = 'store';
    const accountId = `gmail:${email}`;
    const store = getStore();
    await store.putAccount({
      id: accountId,
      providerId: 'gmail',
      address: email,
      secret,
    });

    // 기존 세션이 있으면 재사용, 없으면 새로 발급.
    const existing = readSessionId(req.headers.cookie);
    const sessionId = existing ?? randomToken(32);
    await store.linkSession(sessionId, accountId);

    res.setHeader('Set-Cookie', buildSessionCookie(sessionId));
    res.setHeader('Location', `${appBase}/mail/`);
    res.status(302).end();
  } catch (err) {
    // 실패 단계와 메시지를 함수 로그에 남기고, 화면엔 사유 코드만 전달.
    console.error(`oauth callback 실패 @${stage}:`, (err as Error).message);
    res.setHeader('Location', `${appBase}/login/?error=oauth&reason=${stage}`);
    res.status(302).end();
  }
}
