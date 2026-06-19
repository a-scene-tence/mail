'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  mailApi,
  attachmentUrl,
  fetchAttachment,
  listFolders,
} from '@/lib/api-client';
import type { Mailbox, MailAttachment, MailMessage } from '@/lib/providers/types';
import { BrandMark } from '@/components/BrandMark';
import { Label } from '@/components/ui/Label';

function formatBytes(n: number): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// HTML 본문 앞에 base/referrer를 주입해 모든 링크가 새 탭에서 열리게 한다.
// (첫 <base target>이 우선이라 본문 자체 base가 있어도 우리 것이 이긴다.)
function wrapBodyHtml(html: string): string {
  return (
    '<base target="_blank">' +
    '<meta name="referrer" content="no-referrer">' +
    html
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 평문 본문: HTML 이스케이프 후 URL을 새 탭 링크로 변환(신뢰 불가 텍스트 → 이스케이프 우선).
function linkifyText(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(
    /(https?:\/\/[^\s<]+|www\.[^\s<]+)/g,
    (m) => {
      const href = m.startsWith('http') ? m : `http://${m}`;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-ink underline">${m}</a>`;
    },
  );
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
      mailbox: q.get('mailbox') || 'inbox',
    });
  }, []);

  const queryClient = useQueryClient();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [showMove, setShowMove] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['message', params?.accountId, params?.id, params?.mailbox],
    queryFn: () =>
      mailApi.getMessage(params!.accountId, params!.id, params!.mailbox),
    enabled: !!params?.accountId && !!params?.id,
    retry: false,
  });

  // 메일을 실제로 열면(프리페치 아님) 읽음 처리: 목록·읽기 캐시 즉시 갱신 + 서버 반영(백그라운드).
  const markedRef = useRef(false);
  useEffect(() => {
    if (!params || !data || !data.unread || markedRef.current) return;
    markedRef.current = true;
    const key = `${params.accountId}:${params.id}`;
    queryClient.setQueriesData<MailMessage[]>({ queryKey: ['messages'] }, (old) =>
      old
        ? old.map((m) =>
            `${m.accountId}:${m.id}` === key ? { ...m, unread: false } : m,
          )
        : old,
    );
    queryClient.setQueryData<MailMessage>(
      ['message', params.accountId, params.id, params.mailbox],
      (old) => (old ? { ...old, unread: false } : old),
    );
    mailApi.markRead(params.accountId, params.id, params.mailbox).catch(() => {});
  }, [params, data, queryClient]);

  // 이동 대상 폴더 목록 — 현재 메일이 든 폴더는 제외.
  const foldersQ = useQuery({
    queryKey: ['folders', params?.accountId],
    queryFn: () => listFolders(params!.accountId),
    enabled: !!params?.accountId && showMove,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const moveTargets = (foldersQ.data ?? []).filter(
    (f) => f.id !== params?.mailbox,
  );

  // 낙관적 업데이트: 캐시된 모든 목록에서 이 메시지를 즉시 제거.
  function removeFromLists() {
    if (!params) return;
    const key = `${params.accountId}:${params.id}`;
    queryClient.setQueriesData<MailMessage[]>({ queryKey: ['messages'] }, (old) =>
      old ? old.filter((m) => `${m.accountId}:${m.id}` !== key) : old,
    );
  }

  function onMove(destId: string, destName: string) {
    if (!params || moving) return;
    if (!window.confirm(`이 메일을 ‘${destName}’(으)로 이동할까요?`)) return;
    setMoving(true);
    // 낙관적: 목록에서 제거 후 즉시 복귀(하드 리로드 없이 SPA 네비게이션).
    removeFromLists();
    // 서버 요청은 백그라운드. 실패 시 다음 목록 조회에서 동기화되도록 무효화.
    mailApi
      .moveMessage(params.accountId, params.id, destId, params.mailbox)
      .catch(() => queryClient.invalidateQueries({ queryKey: ['messages'] }));
    router.push('/mail/');
  }

  function onDelete() {
    if (!params || deleting) return;
    if (!window.confirm('이 메일을 휴지통으로 이동할까요?')) return;
    setDeleting(true);
    removeFromLists();
    mailApi
      .deleteMessage(params.accountId, params.id, params.mailbox)
      .catch(() => queryClient.invalidateQueries({ queryKey: ['messages'] }));
    router.push('/mail/');
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
      <div className="flex items-center justify-between">
        <BrandMark />
        <Link href="/mail" className="eyebrow">
          ← {isSent ? '보낸편지함' : '받은편지함'}
        </Link>
      </div>

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
              onClick={() => setShowMove((v) => !v)}
              disabled={moving}
              className="eyebrow hover:text-ink disabled:opacity-50"
            >
              {moving ? '이동 중…' : showMove ? '이동 닫기' : '이동'}
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="eyebrow hover:text-ink disabled:opacity-50"
            >
              {deleting ? '삭제 중…' : '삭제'}
            </button>
          </div>
          {showMove && (
            <div className="mt-4 border-t border-hairline pt-4">
              {foldersQ.isLoading ? (
                <p className="text-sm text-gray">폴더 불러오는 중…</p>
              ) : moveTargets.length === 0 ? (
                <p className="text-sm text-gray">이동할 폴더가 없습니다.</p>
              ) : (
                <>
                  <p className="mb-3 text-xs text-gray">이동할 폴더를 선택하세요.</p>
                  <div className="flex flex-wrap gap-2">
                    {moveTargets.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onMove(f.id, f.name)}
                        className="rounded-full border border-hairline px-3 py-1 text-xs tracking-tight text-gray transition-colors hover:text-ink"
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
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
              // 샌드박스 iframe으로 본문 HTML 렌더. 스크립트·동일출처는 계속 차단하고,
              // 링크만 새 탭으로 열리도록 allow-popups + <base target="_blank"> 사용.
              <iframe
                title="message-body"
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                className="h-[60vh] w-full border-0"
                srcDoc={wrapBodyHtml(data.bodyHtml)}
              />
            ) : (
              <pre
                className="whitespace-pre-wrap break-words font-sans text-base leading-relaxed text-ink"
                dangerouslySetInnerHTML={{
                  __html: linkifyText(data.bodyText || data.snippet || ''),
                }}
              />
            )}
          </div>
        </article>
      )}
    </main>
  );
}
