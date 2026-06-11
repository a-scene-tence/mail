'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { mailApi } from '@/lib/api-client';
import { MailListItem } from '@/components/MailListItem';
import { Label } from '@/components/ui/Label';

export default function MailPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['messages', 'inbox'],
    queryFn: () => mailApi.listMessages({ limit: 30 }),
    // 골격 단계: 백엔드 미연동 시 실패해도 빈 상태를 보여준다.
    retry: false,
  });

  const messages = data ?? [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-content px-6 py-16">
      <Link href="/" className="eyebrow">
        ← 뒤로
      </Link>

      <header className="mb-10 mt-6">
        <Label>Inbox</Label>
        <h1 className="display mt-3">받은편지함</h1>
      </header>

      {isLoading ? (
        <Skeleton />
      ) : messages.length > 0 ? (
        <section>
          {messages.map((m) => (
            <MailListItem key={m.id} message={m} />
          ))}
          <div className="border-t border-hairline" />
        </section>
      ) : (
        <EmptyState connected={!isError} />
      )}
    </main>
  );
}

function Skeleton() {
  return (
    <ul aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="border-t border-hairline py-6">
          <div className="h-3 w-24 animate-pulse bg-hairline" />
          <div className="mt-3 h-4 w-2/3 animate-pulse bg-hairline" />
        </li>
      ))}
      <div className="border-t border-hairline" />
    </ul>
  );
}

function EmptyState({ connected }: { connected: boolean }) {
  return (
    <div className="border-t border-hairline py-20 text-center">
      <p className="text-gray">
        {connected
          ? '받은 메일이 없습니다.'
          : '아직 연결된 계정이 없습니다. 계정을 추가해 주세요.'}
      </p>
      <Link
        href="/login"
        className="mt-4 inline-block text-sm tracking-tight text-ink underline"
      >
        계정 추가 →
      </Link>
    </div>
  );
}
