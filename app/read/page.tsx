'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mailApi, attachmentUrl, fetchAttachment } from '@/lib/api-client';
import type { Mailbox, MailAttachment } from '@/lib/providers/types';
import { Label } from '@/components/ui/Label';

function formatBytes(n: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ReadPage() {
  // 정적 export 호환: useSearchParams(Suspense 필요) 대신 location을 직접 읽는다.
  const [params, setParams] = useState<{
    accountId: string;
    id: string;
    mailbox: Mailbox;
  } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setParams({
      accountId: q.get('accountId') ?? '',
      id: q.get('id') ?? '',
      mailbox: q.get('mailbox') === 'sent' ? 'sent' : 'inbox',
    });
  }, []);

  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['message', params?.accountId, params?.id, params?.mailbox],
    queryFn: () =>
      mailApi.getMessage(params!.accountId, params!.id, params!.mailbox),
    enabled: !!params?.accountId && !!params?.id,
    retry: false,
  });

  async function onDelete() {
    if (!params || deleting) return;
    if (!window.confirm('이 메일을 휴지통으로 이동할까요?')) return;
    setDeleting(true);
    setDelErr(false);
    try {
      await mailApi.deleteMessage(params.accountId, params.id, params.mailbox);
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
      window.location.href = '/mail/';
    } catch {
      setDelErr(true);
      setDeleting(false);
    }
  }

  const isSent = params?.mailbox === 'sent';
  const compose = (mode: 'reply' | 'forward') =>
    `/compose/?mode=${mode}&accountId=${encodeURIComponent(
      params?.accountId ?? '',
    )}&srcId=${encodeURIComponent(params?.id ?? '')}&mailbox=${
      params?.mailbox ?? 'inbox'
    }`;

  async function downloadAttachment(att: MailAttachment) {
    if (!params) return;
    try {
      const blob = await fetchAttachment(
        params.accountId,
        params.id,
        att,
        params.mailbox,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('첨부파일을 내려받지 못했습니다.');
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-content px-6 py-16">
      <Link href="/mail" className="eyebrow">
        ← {isSent ? '보낸편지함' : '받은편지함'}
      </Link>

      {isLoading || !params ? (
        <p className="mt-12 text-gray">불러오는 중…</p>
      ) : isError || !data ? (
        <p className="mt-12 text-gray">메일을 불러오지 못했습니다.</p>
      ) : (
        <article className="mt-8">
          <Label>
            {isSent
              ? `받는 사람: ${data.to.length ? data.to.join(', ') : '(없음)'}`
              : data.from}
          </Label>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {data.subject || '(제목 없음)'}
          </h1>
          <p className="mt-2 text-sm text-gray">
            {new Date(data.date).toLocaleString('ko-KR')}
          </p>

          <div className="mt-6 flex items-center gap-6 border-t border-hairline pt-4">
            <Link href={compose('reply')} className="eyebrow hover:text-ink">
              회신
            </Link>
            <Link href={compose('forward')} className="eyebrow hover:text-ink">
              전달
            </Link>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="eyebrow hover:text-ink disabled:opacity-50"
            >
              {deleting ? '삭제 중…' : '삭제'}
            </button>
          </div>
          {delErr && (
            <p className="mt-3 text-sm text-ink">
              삭제에 실패했습니다. 다시 시도해 주세요.
            </p>
          )}

          {data.attachments && data.attachments.length > 0 && (
            <div className="mt-6 border-t border-hairline pt-4">
              <p className="eyebrow mb-3">첨부파일 {data.attachments.length}</p>
              <div className="flex flex-wrap gap-2">
                {data.attachments.map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => downloadAttachment(att)}
                    className="flex items-center gap-2 rounded border border-hairline px-3 py-2 text-sm text-ink hover:bg-paper-off"
                  >
                    <span className="max-w-[200px] truncate">{att.filename}</span>
                    {att.size ? (
                      <span className="shrink-0 text-xs text-gray">
                        {formatBytes(att.size)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              {/* 이미지 첨부는 인라인 미리보기 */}
              {data.attachments
                .filter((a) => a.mimeType.startsWith('image/'))
                .map((att) => (
                  <img
                    key={`prev-${att.id}`}
                    src={attachmentUrl(
                      params!.accountId,
                      params!.id,
                      att,
                      params!.mailbox,
                    )}
                    alt={att.filename}
                    className="mt-3 max-h-80 rounded border border-hairline"
                  />
                ))}
            </div>
          )}

          <div className="mt-8 border-t border-hairline pt-8">
            {data.bodyHtml ? (
              // 안전을 위해 샌드박스 iframe으로 본문 HTML 렌더.
              <iframe
                title="message-body"
                sandbox=""
                className="h-[60vh] w-full border-0"
                srcDoc={data.bodyHtml}
              />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-sans text-base leading-relaxed text-ink">
                {data.bodyText || data.snippet}
              </pre>
            )}
          </div>
        </article>
      )}
    </main>
  );
}
