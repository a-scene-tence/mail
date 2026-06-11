import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getProvider } from '../../../lib/providers/registry.js';
import { seal, randomToken } from '../../../lib/server/crypto.js';
import { getStore } from '../../../lib/server/store.js';
import { verifyImap } from '../../../lib/server/imap.js';
import {
  buildSessionCookie,
  readSessionId,
} from '../../../lib/server/session.js';

// POST /api/auth/imap/login  body: { providerId, address, password }
// IMAP 자격증명 검증 → 계정 저장 → 세션 쿠키 발급.
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  try {
    const { providerId, address, password } = (req.body ?? {}) as {
      providerId?: string;
      address?: string;
      password?: string;
    };
    if (!providerId || !address || !password) {
      res.status(400).json({ error: '입력 누락' });
      return;
    }

    const provider = getProvider(providerId);
    if (!provider || provider.auth !== 'imap' || !provider.imap) {
      res.status(400).json({ error: '지원하지 않는 제공자' });
      return;
    }

    try {
      await verifyImap(address, password, provider.imap);
    } catch {
      res
        .status(401)
        .json({ error: '인증 실패 — 이메일/앱 비밀번호 또는 IMAP 설정 확인' });
      return;
    }

    const accountId = `${providerId}:${address}`;
    const store = getStore();
    await store.putAccount({
      id: accountId,
      providerId,
      address,
      secret: seal(password),
    });

    const sessionId = readSessionId(req.headers.cookie) ?? randomToken(32);
    await store.linkSession(sessionId, accountId);

    res.setHeader('Set-Cookie', buildSessionCookie(sessionId));
    res.status(200).json({ ok: true, account: { id: accountId, providerId, address } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
