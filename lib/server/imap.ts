import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { AddressObject } from 'mailparser';
import type { MailMessage } from '../providers/types.js';

// IMAP 수신 게이트웨이 — imapflow + mailparser. 서버 전용.
// Vercel 서버리스는 무상태라 요청마다 새 연결을 열고 finally에서 반드시 닫는다.

interface ImapCfg {
  host: string;
  port: number;
  secure: boolean;
}

function makeClient(address: string, password: string, cfg: ImapCfg): ImapFlow {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: address, pass: password },
    logger: false,
  });
}

function addrArray(a: AddressObject | AddressObject[] | undefined): string[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  return arr.flatMap((o) => o.value.map((v) => v.address ?? '')).filter(Boolean);
}

function toIso(d: Date | string | undefined): string {
  if (!d) return new Date().toISOString();
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

/** INBOX 메시지 목록 (메타데이터). */
export async function listImap(
  accountId: string,
  address: string,
  password: string,
  cfg: ImapCfg,
  limit = 20,
): Promise<MailMessage[]> {
  const client = makeClient(address, password, cfg);
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const total =
        typeof client.mailbox === 'object' && client.mailbox
          ? (client.mailbox as { exists: number }).exists
          : 0;
      if (!total) return [];
      const start = Math.max(1, total - limit + 1);
      const out: MailMessage[] = [];
      for await (const msg of client.fetch(`${start}:*`, {
        envelope: true,
        flags: true,
        internalDate: true,
      })) {
        const env = msg.envelope;
        out.push({
          id: String(msg.uid),
          accountId,
          from: env?.from?.[0]
            ? (env.from[0].name || env.from[0].address || '')
            : '',
          to: (env?.to ?? []).map((t) => t.address ?? '').filter(Boolean),
          subject: env?.subject ?? '',
          snippet: '',
          date: toIso(env?.date ?? msg.internalDate),
          unread: !(msg.flags?.has('\\Seen')),
        });
      }
      return out.reverse(); // 최신순
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** 단일 메시지 (본문 포함). id = UID 문자열. */
export async function getImap(
  accountId: string,
  address: string,
  password: string,
  cfg: ImapCfg,
  id: string,
): Promise<MailMessage> {
  const client = makeClient(address, password, cfg);
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      let found: MailMessage | null = null;
      for await (const msg of client.fetch(
        String(Number(id)),
        { uid: true, source: true, envelope: true, flags: true, internalDate: true },
        { uid: true },
      )) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const env = msg.envelope;
        found = {
          id,
          accountId,
          from: parsed.from?.text ?? (env?.from?.[0]?.address ?? ''),
          to: parsed.to ? addrArray(parsed.to) : [],
          subject: parsed.subject ?? env?.subject ?? '',
          snippet: (parsed.text ?? '').slice(0, 200),
          date: toIso(parsed.date ?? env?.date ?? msg.internalDate),
          unread: !(msg.flags?.has('\\Seen')),
          bodyText: parsed.text ?? undefined,
          bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
        };
      }
      if (!found) throw new Error('메시지를 찾을 수 없음');
      return found;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** 자격증명 검증 — IMAP 연결 시도 후 즉시 로그아웃. 실패 시 throw. */
export async function verifyImap(
  address: string,
  password: string,
  cfg: ImapCfg,
): Promise<void> {
  const client = makeClient(address, password, cfg);
  await client.connect();
  await client.logout().catch(() => client.close());
}
