import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { AddressObject } from 'mailparser';
import type { MailMessage, Mailbox } from '../providers/types.js';

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

// 보낸편지함 폴더 이름 후보 (specialUse 미지원 서버 대비).
const SENT_FALLBACKS = [
  'Sent',
  'Sent Messages',
  'Sent Items',
  '[Gmail]/Sent Mail',
  '보낸편지함',
  '보낸 메일함',
  '보낸메일함',
];

/** mailbox 종류 → 실제 폴더 경로. inbox=INBOX, sent=specialUse '\\Sent' 우선. */
async function resolveMailbox(
  client: ImapFlow,
  mailbox: Mailbox,
): Promise<string | null> {
  if (mailbox === 'inbox') return 'INBOX';
  const boxes = await client.list();
  const special = boxes.find((b) => b.specialUse === '\\Sent');
  if (special) return special.path;
  const named = boxes.find((b) => SENT_FALLBACKS.includes(b.path));
  return named ? named.path : null;
}

/** 메일함 목록 (메타데이터). 기본 INBOX, mailbox='sent'면 보낸편지함. */
export async function listImap(
  accountId: string,
  address: string,
  password: string,
  cfg: ImapCfg,
  limit = 20,
  mailbox: Mailbox = 'inbox',
): Promise<MailMessage[]> {
  const client = makeClient(address, password, cfg);
  await client.connect();
  try {
    const path = await resolveMailbox(client, mailbox);
    if (!path) return [];
    const lock = await client.getMailboxLock(path);
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
  mailbox: Mailbox = 'inbox',
): Promise<MailMessage> {
  const client = makeClient(address, password, cfg);
  await client.connect();
  try {
    const path = await resolveMailbox(client, mailbox);
    if (!path) throw new Error('메일함을 찾을 수 없음');
    const lock = await client.getMailboxLock(path);
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
          messageId: parsed.messageId ?? undefined,
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

// 휴지통으로 쓸 폴백 폴더 이름 후보 (specialUse 미지원 서버 대비).
const TRASH_FALLBACKS = ['Trash', '[Gmail]/Trash', 'Deleted Messages', '휴지통'];

/** 휴지통 폴더 경로 탐색 — specialUse '\\Trash' 우선, 없으면 알려진 이름. */
async function findTrashPath(client: ImapFlow): Promise<string | null> {
  const boxes = await client.list();
  const special = boxes.find((b) => b.specialUse === '\\Trash');
  if (special) return special.path;
  const named = boxes.find((b) => TRASH_FALLBACKS.includes(b.path));
  return named ? named.path : null;
}

/** 메일을 휴지통으로 이동. 휴지통 폴더가 없으면 \Deleted 플래그+expunge로 폴백. */
export async function trashImap(
  address: string,
  password: string,
  cfg: ImapCfg,
  id: string,
  mailbox: Mailbox = 'inbox',
): Promise<void> {
  const client = makeClient(address, password, cfg);
  await client.connect();
  try {
    const trashPath = await findTrashPath(client);
    const srcPath = await resolveMailbox(client, mailbox);
    if (!srcPath) throw new Error('원본 메일함을 찾을 수 없음');
    const lock = await client.getMailboxLock(srcPath);
    try {
      const uid = String(Number(id));
      if (trashPath) {
        await client.messageMove(uid, trashPath, { uid: true });
      } else {
        // 휴지통이 없으면 삭제 플래그 후 영구 제거.
        await client.messageDelete(uid, { uid: true });
      }
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
