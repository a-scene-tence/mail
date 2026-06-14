import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { MailMessage } from '../../lib/providers/types.js';
import { readSessionId } from '../../lib/server/session.js';
import { resolveAccounts } from '../../lib/server/accounts.js';
import { listMailboxes } from '../../lib/server/mailbox.js';

// GET /api/messages/list?accountId=&limit=
// 세션의 (전체 또는 특정) 계정에서 INBOX 목록을 모아 최신순 반환.
// 계정별 조회 실패는 빈 배열로 무시해 나머지 계정을 정상 반환한다.
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const sessionId = readSessionId(req.headers.cookie);
  if (!sessionId) {
    res.status(200).json({ messages: [] });
    return;
  }

  const accountId =
    typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
  const limit = Math.min(Number(req.query.limit) || 20, 500);
  const mailboxParam =
    typeof req.query.mailbox === 'string' && req.query.mailbox
      ? req.query.mailbox
      : 'inbox';
  // 콤마 분리 → 다폴더 집계. 빈 값이면 받은편지함.
  // 토큰은 두 종류:
  //  - 글로벌 folderId(예: 'inbox' | 'SENT' | 'Label_5' | IMAP path) → 모든 계정에 동일 적용(기존 동작).
  //  - 계정-스코프 'accountId|folderId' → 그 계정에만 해당 폴더 적용(전체뷰 계정별 폴더 선택).
  // accountId 자체에 ':'가 들어가므로(예: 'gmail:a@x') 구분자는 '|'를 쓴다.
  // (folderId에 '|'가 든 IMAP 경로는 미지원 — 콤마 한계와 동급, 사실상 없음.)
  const scoped = new Map<string, string[]>();
  const globalIds: string[] = [];
  for (const t of mailboxParam.split(',').map((s) => s.trim()).filter(Boolean)) {
    const bar = t.indexOf('|');
    if (bar > 0) {
      const aid = t.slice(0, bar);
      const fid = t.slice(bar + 1);
      if (fid) {
        const arr = scoped.get(aid) ?? [];
        arr.push(fid);
        scoped.set(aid, arr);
      }
    } else {
      globalIds.push(t);
    }
  }
  const query = typeof req.query.q === 'string' ? req.query.q : undefined;

  try {
    const accounts = await resolveAccounts(sessionId, accountId);
    const perAccount = await Promise.all(
      accounts.map((r) => {
        // 계정-스코프 지정이 있으면 그 폴더만, 없으면 글로벌 폴더. 둘 다 없으면 조회 생략.
        const fids = scoped.get(r.account.id) ?? globalIds;
        if (fids.length === 0) return Promise.resolve([] as MailMessage[]);
        return listMailboxes(r, limit, fids, query).catch(
          () => [] as MailMessage[],
        );
      }),
    );
    const messages: MailMessage[] = perAccount
      .flat()
      .sort((a, b) => b.date.localeCompare(a.date));
    res.status(200).json({ messages });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}
