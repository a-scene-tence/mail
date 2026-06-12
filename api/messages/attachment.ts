import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSessionId } from '../../lib/server/session.js';
import { resolveAccounts } from '../../lib/server/accounts.js';
import { getAttachment } from '../../lib/server/mailbox.js';

// GET /api/messages/attachment?accountId=&messageId=&attachmentId=&mailbox=&filename=&mimeType=
// 지정 계정 메시지의 첨부파일을 바이너리로 내려준다. 파일명/타입은 클라이언트가
// 이미 가진 메타데이터에서 전달(서버는 식별자로 내용만 조회).
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const sessionId = readSessionId(req.headers.cookie);
  const q = req.query;
  const accountId = typeof q.accountId === 'string' ? q.accountId : '';
  const messageId = typeof q.messageId === 'string' ? q.messageId : '';
  const attachmentId = typeof q.attachmentId === 'string' ? q.attachmentId : '';
  const mailbox = typeof q.mailbox === 'string' && q.mailbox ? q.mailbox : 'inbox';
  const filename = typeof q.filename === 'string' ? q.filename : 'attachment';
  const mimeType =
    typeof q.mimeType === 'string' ? q.mimeType : 'application/octet-stream';

  if (!sessionId || !accountId || !messageId || !attachmentId) {
    res.status(400).json({ error: 'accountId/messageId/attachmentId 필요' });
    return;
  }

  try {
    const [resolved] = await resolveAccounts(sessionId, accountId);
    if (!resolved) {
      res.status(404).json({ error: '계정을 찾을 수 없음' });
      return;
    }
    const buffer = await getAttachment(resolved, messageId, attachmentId, mailbox);
    // RFC 5987 — 비ASCII 파일명도 안전하게 전달.
    const encoded = encodeURIComponent(filename);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encoded}`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}
