'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listAccounts, mailApi } from '@/lib/api-client';
import type {
  DraftAttachment,
  MailMessage,
  Mailbox,
} from '@/lib/providers/types';
import { MAX_ATTACHMENTS_TOTAL_BYTES } from '@/lib/providers/types';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';

// "Name <a@b.com>" 또는 "a@b.com"에서 이메일 주소만 추출.
function parseAddress(raw: string): string {
  const angled = raw.match(/<([^>]+)>/);
  if (angled) return angled[1].trim();
  const token = raw.split(/[\s,]+/).find((t) => t.includes('@'));
  return (token ?? raw).trim();
}

// 회신/전달 시 원본 인용 블록.
function quoteBody(src: MailMessage): string {
  const original = src.bodyText ?? src.snippet ?? '';
  return [
    '',
    '',
    '---------- 원본 메일 ----------',
    `보낸사람: ${src.from}`,
    `날짜: ${new Date(src.date).toLocaleString('ko-KR')}`,
    `제목: ${src.subject}`,
    '',
    original,
  ].join('\n');
}

function prefix(tag: string, subject: string): string {
  const re = new RegExp(`^\\s*${tag}:`, 'i');
  return re.test(subject) ? subject : `${tag}: ${subject}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// File → 순수 base64(접두사 제거). read 화면 다운로드의 역방향.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('읽기 실패'));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

type Attached = DraftAttachment & { size: number };

export default function ComposePage() {
  // 정적 export 호환: location을 직접 읽는다.
  const [ctx, setCtx] = useState<{
    mode: 'reply' | 'forward' | null;
    accountId: string;
    srcId: string;
    mailbox: Mailbox;
  } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get('mode');
    setCtx({
      mode: m === 'reply' || m === 'forward' ? m : null,
      accountId: q.get('accountId') ?? '',
      srcId: q.get('srcId') ?? '',
      mailbox: q.get('mailbox') || 'inbox',
    });
  }, []);

  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
    retry: false,
  });
  const accounts = accountsQ.data ?? [];

  // 회신/전달 원본 로드 (srcId 있을 때만).
  const sourceQ = useQuery({
    queryKey: ['message', ctx?.accountId, ctx?.srcId, ctx?.mailbox],
    queryFn: () => mailApi.getMessage(ctx!.accountId, ctx!.srcId, ctx!.mailbox),
    enabled: !!ctx?.srcId && !!ctx?.accountId,
    retry: false,
  });

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [readReceipt, setReadReceipt] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attached[]>([]);
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  // 회신 스레드 연결 정보 (전달은 새 대화라 비움).
  const [thread, setThread] = useState<{
    inReplyTo?: string;
    references?: string[];
    threadId?: string;
  }>({});
  const [prefilled, setPrefilled] = useState(false);

  // 원본이 도착하면 한 번만 프리필.
  useEffect(() => {
    if (prefilled || !ctx?.mode || !sourceQ.data) return;
    const src = sourceQ.data;
    setFrom(ctx.accountId);
    if (ctx.mode === 'reply') {
      setTo(parseAddress(src.from));
      setSubject(prefix('Re', src.subject));
      setThread({
        inReplyTo: src.messageId,
        references: src.messageId ? [src.messageId] : undefined,
        threadId: src.threadId,
      });
    } else {
      setSubject(prefix('Fwd', src.subject));
    }
    setBody(quoteBody(src));
    setPrefilled(true);
  }, [prefilled, ctx, sourceQ.data]);

  const accountId = from || ctx?.accountId || accounts[0]?.id || '';

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // 같은 파일 재선택 허용
    if (files.length === 0) return;
    setAttachErr(null);
    setReading(true);
    try {
      const current = attachments.reduce((s, a) => s + a.size, 0);
      let total = current;
      const added: Attached[] = [];
      for (const file of files) {
        if (total + file.size > MAX_ATTACHMENTS_TOTAL_BYTES) {
          setAttachErr('첨부파일 총 용량은 3MB까지 가능합니다.');
          break;
        }
        added.push({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: await fileToBase64(file),
          size: file.size,
        });
        total += file.size;
      }
      if (added.length) setAttachments((prev) => [...prev, ...added]);
    } catch {
      setAttachErr('첨부파일을 읽지 못했습니다.');
    } finally {
      setReading(false);
    }
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
    setAttachErr(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const toList = to
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!accountId || toList.length === 0 || !subject || !body) return;
    setSending(true);
    setErrMsg(null);
    try {
      await mailApi.sendMessage(accountId, {
        to: toList,
        subject,
        body,
        // 회신일 때만 스레드 헤더 포함.
        inReplyTo: thread.inReplyTo,
        references: thread.references,
        threadId: thread.threadId,
        readReceipt,
        attachments: attachments.length
          ? attachments.map(({ filename, mimeType, data }) => ({
              filename,
              mimeType,
              data,
            }))
          : undefined,
      });
      window.location.href = '/mail/';
    } catch {
      setErrMsg('발송에 실패했습니다. 다시 시도해 주세요.');
      setSending(false);
    }
  }

  const canSubmit =
    !sending && !reading && accountId && to.trim() && subject && body;
  const attachTotal = attachments.reduce((s, a) => s + a.size, 0);
  const heading =
    ctx?.mode === 'reply' ? '회신' : ctx?.mode === 'forward' ? '전달' : '메일 작성';
  const loadingSource = !!ctx?.srcId && sourceQ.isLoading;

  return (
    <main className="mx-auto min-h-screen w-full max-w-content px-6 py-16">
      <div className="flex items-center justify-between">
        <BrandMark />
        <Link href="/mail/" className="eyebrow">
          ← 받은편지함
        </Link>
      </div>

      <header className="mb-10 mt-6">
        <Label>Compose</Label>
        <h1 className="display mt-3">{heading}</h1>
      </header>

      {accountsQ.isLoading || loadingSource ? (
        <div className="h-4 w-32 animate-pulse bg-hairline" />
      ) : accounts.length === 0 ? (
        <p className="text-gray">
          연결된 계정이 없습니다.{' '}
          <Link href="/login" className="underline">
            계정 추가 →
          </Link>
        </p>
      ) : (
        <form className="space-y-8" onSubmit={onSubmit}>
          <div>
            <span className="eyebrow mb-2 block">보내는 계정</span>
            <select
              className="w-full border-0 border-b border-hairline bg-transparent py-2 text-base text-ink outline-none focus:border-ink"
              value={accountId}
              onChange={(e) => setFrom(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.address}
                </option>
              ))}
            </select>
          </div>

          <TextField
            id="to"
            label="받는 사람"
            type="text"
            placeholder="email@example.com (여러 명은 쉼표로)"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />

          <TextField
            id="subject"
            label="제목"
            type="text"
            placeholder="제목"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          <Textarea
            id="body"
            label="본문"
            placeholder="내용을 입력하세요"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={readReceipt}
                onChange={(e) => setReadReceipt(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-ink"
              />
              <span className="text-sm text-ink">
                수신확인 요청
                <span className="mt-0.5 block text-xs text-gray">
                  받는 사람의 메일 앱이 지원·동의할 때만 읽음 알림이 돌아옵니다.
                  자동 읽음 표시는 보장되지 않습니다.
                </span>
              </span>
            </label>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">
                첨부파일
                {attachments.length > 0 && (
                  <span className="ml-2 text-gray">
                    {attachments.length}개 · {formatBytes(attachTotal)}
                  </span>
                )}
              </span>
              <label className="eyebrow cursor-pointer hover:text-ink">
                {reading ? '읽는 중…' : '파일 추가 +'}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={reading}
                  onChange={onPickFiles}
                />
              </label>
            </div>
            {attachments.length > 0 && (
              <ul className="space-y-2">
                {attachments.map((a, i) => (
                  <li
                    key={`${a.filename}-${i}`}
                    className="flex items-center justify-between gap-3 border-b border-hairline pb-2"
                  >
                    <span className="min-w-0 truncate text-sm text-ink">
                      {a.filename}
                      <span className="ml-2 text-xs text-gray">
                        {formatBytes(a.size)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="eyebrow shrink-0 hover:text-ink"
                      aria-label={`${a.filename} 첨부 제거`}
                    >
                      제거
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-gray">최대 3MB까지 첨부할 수 있습니다.</p>
            {attachErr && <p className="mt-2 text-sm text-ink">{attachErr}</p>}
          </div>

          {errMsg && (
            <p className="border-t border-ink pt-3 text-sm text-ink">{errMsg}</p>
          )}

          <Button type="submit" disabled={!canSubmit}>
            {sending ? '발송 중…' : '보내기'}
          </Button>
        </form>
      )}
    </main>
  );
}
