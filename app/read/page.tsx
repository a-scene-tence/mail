'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { mailApi } from '@/lib/api-client';
import { Label } from '@/components/ui/Label';

export default function ReadPage() {
  // 정적 export 호환: useSearchParams(Suspense 필요) 대신 location을 직접 읽는다.
  const [params, setParams] = useState<{ accountId: string; id: string } | null>(
    null,
  );
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setParams({ accountId: q.get('accountId') ?? '', id: q.get('id') ?? '' });
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['message', params?.accountId, params?.id],
    queryFn: () => mailApi.getMessage(params!.accountId, params!.id),
    enabled: !!params?.accountId && !!params?.id,
    retry: false,
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-content px-6 py-16">
      <Link href="/mail" className="eyebrow">
        ← 받은편지함
      </Link>

      {isLoading || !params ? (
        <p className="mt-12 text-gray">불러오는 중…</p>
      ) : isError || !data ? (
        <p className="mt-12 text-gray">메일을 불러오지 못했습니다.</p>
      ) : (
        <article className="mt-8">
          <Label>{data.from}</Label>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {data.subject || '(제목 없음)'}
          </h1>
          <p className="mt-2 text-sm text-gray">
            {new Date(data.date).toLocaleString('ko-KR')}
          </p>

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
