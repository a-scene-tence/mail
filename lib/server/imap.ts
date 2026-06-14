import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { AddressObject } from 'mailparser';
import type {
  MailAttachment,
  MailFolder,
  MailMessage,
  Mailbox,
} from '../providers/types.js';

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

// 스팸/정크 폴더 폴백명 (specialUse '\\Junk' 미지원 서버 대비).
const SPAM_FALLBACKS = [
  'Spam',
  'Junk',
  'Junk E-mail',
  'Bulk Mail',
  '스팸메일함',
  '스팸',
];

/**
 * mailbox 식별자 → 실제 폴더 경로.
 * - 'inbox' → INBOX
 * - 'sent'  → specialUse '\\Sent' 우선, 없으면 폴백명
 * - 'trash' → specialUse '\\Trash' 우선, 없으면 폴백명
 * - 그 외   → mailbox 자체를 폴더 path로 사용
 */
type ImapBoxes = Awaited<ReturnType<ImapFlow['list']>>;

/** mailbox 별칭(sent/trash)이 폴더 목록(client.list)을 필요로 하는가. */
function needsList(mailbox: Mailbox): boolean {
  return mailbox === 'sent' || mailbox === 'trash';
}

async function resolveMailbox(
  client: ImapFlow,
  mailbox: Mailbox,
  boxes?: ImapBoxes,
): Promise<string | null> {
  if (mailbox === 'inbox') return 'INBOX';
  if (mailbox === 'sent') {
    const list = boxes ?? (await client.list());
    const special = list.find((b) => b.specialUse === '\\Sent');
    if (special) return special.path;
    const named = list.find((b) => SENT_FALLBACKS.includes(b.path));
    return named ? named.path : null;
  }
  if (mailbox === 'trash') {
    const list = boxes ?? (await client.list());
    const special = list.find((b) => b.specialUse === '\\Trash');
    if (special) return special.path;
    const named = list.find((b) => TRASH_FALLBACKS.includes(b.path));
    return named ? named.path : null;
  }
  return mailbox;
}

/** 계정의 폴더 목록 (스팸/정크 제외). */
export async function listImapFolders(
  address: string,
  password: string,
  cfg: ImapCfg,
): Promise<MailFolder[]> {
  const client = makeClient(address, password, cfg);
  await client.connect();
  try {
    const boxes = await client.list();
    const kindOf = (su?: string): MailFolder['kind'] => {
      if (su === '\\Sent') return 'sent';
      if (su === '\\Trash') return 'trash';
      if (su === '\\Drafts') return 'drafts';
      return 'folder';
    };
    return boxes
      .filter((b) => b.specialUse !== '\\Junk' && !SPAM_FALLBACKS.includes(b.path))
      // 선택 불가(\\Noselect) 폴더는 제외.
      .filter((b) => !b.flags?.has('\\Noselect'))
      .map((b) => ({
        id: b.path,
        name: b.path === 'INBOX' ? '받은편지함' : b.name || b.path,
        kind: b.path === 'INBOX' ? ('inbox' as const) : kindOf(b.specialUse),
      }));
  } finally {
    await client.logout().catch(() => client.close());
  }
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

/** 한 IMAP 연결에서 특정 폴더의 메타 목록을 읽어 folder 태깅까지 마친다. */
async function fetchImapFolder(
  client: ImapFlow,
  accountId: string,
  limit: number,
  folder: Mailbox,
): Promise<MailMessage[]> {
  const path = await resolveMailbox(client, folder);
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
          ? env.from[0].name || env.from[0].address || ''
          : '',
        to: (env?.to ?? []).map((t) => t.address ?? '').filter(Boolean),
        subject: env?.subject ?? '',
        snippet: '',
        date: toIso(env?.date ?? msg.internalDate),
        unread: !msg.flags?.has('\\Seen'),
        folder,
      });
    }
    return out.reverse(); // 최신순
  } finally {
    lock.release();
  }
}

/**
 * 여러 폴더를 단일 연결로 순회해 합산(폴더마다 새 TLS 핸드셰이크 제거).
 * 각 메시지는 출처 `folder`로 태깅된다. 폴더 단위 실패는 건너뛴다.
 */
export async function listImapMany(
  accountId: string,
  address: string,
  password: string,
  cfg: ImapCfg,
  limit: number,
  folderIds: string[],
): Promise<MailMessage[]> {
  const client = makeClient(address, password, cfg);
  await client.connect();
  try {
    const out: MailMessage[] = [];
    for (const fid of folderIds) {
      try {
        out.push(...(await fetchImapFolder(client, accountId, limit, fid)));
      } catch {
        /* 한 폴더 실패가 전체를 깨뜨리지 않도록 무시 */
      }
    }
    return out;
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
        const attachments: MailAttachment[] = (parsed.attachments ?? []).map(
          (a, i) => ({
            id: String(i),
            filename: a.filename || `첨부파일-${i + 1}`,
            mimeType: a.contentType || 'application/octet-stream',
            size: a.size ?? 0,
          }),
        );
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
          attachments: attachments.length ? attachments : undefined,
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

/** 첨부파일 바이너리 내려받기. attachmentId = getImap이 매긴 배열 인덱스. */
export async function getImapAttachment(
  address: string,
  password: string,
  cfg: ImapCfg,
  id: string,
  attachmentId: string,
  mailbox: Mailbox = 'inbox',
): Promise<Buffer> {
  const client = makeClient(address, password, cfg);
  await client.connect();
  try {
    const path = await resolveMailbox(client, mailbox);
    if (!path) throw new Error('메일함을 찾을 수 없음');
    const lock = await client.getMailboxLock(path);
    try {
      const idx = Number(attachmentId);
      for await (const msg of client.fetch(
        String(Number(id)),
        { uid: true, source: true },
        { uid: true },
      )) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const att = parsed.attachments?.[idx];
        if (!att) throw new Error('첨부파일을 찾을 수 없음');
        return att.content;
      }
      throw new Error('메시지를 찾을 수 없음');
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
function findTrashPath(boxes: ImapBoxes): string | null {
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
    // 휴지통 탐색에 폴더 목록이 반드시 필요하므로 한 번만 받아 원본 해석에도 재사용.
    const boxes = await client.list();
    const trashPath = findTrashPath(boxes);
    const srcPath = await resolveMailbox(client, mailbox, boxes);
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

/**
 * 메일을 다른 폴더로 이동. 원본 폴더에서 잠그고 대상 폴더로 messageMove.
 * from/to는 mailbox 식별자(별칭 또는 폴더 path).
 */
export async function moveImap(
  address: string,
  password: string,
  cfg: ImapCfg,
  id: string,
  from: Mailbox,
  to: Mailbox,
): Promise<void> {
  const client = makeClient(address, password, cfg);
  await client.connect();
  try {
    // from/to 중 별칭(sent/trash)이 있을 때만 폴더 목록을 1회 받아 둘 다에 재사용.
    const boxes =
      needsList(from) || needsList(to) ? await client.list() : undefined;
    const srcPath = await resolveMailbox(client, from, boxes);
    const destPath = await resolveMailbox(client, to, boxes);
    if (!srcPath) throw new Error('원본 메일함을 찾을 수 없음');
    if (!destPath) throw new Error('대상 메일함을 찾을 수 없음');
    if (srcPath === destPath) return; // 같은 폴더면 이동 불필요.
    const lock = await client.getMailboxLock(srcPath);
    try {
      await client.messageMove(String(Number(id)), destPath, { uid: true });
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
