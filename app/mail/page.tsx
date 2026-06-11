'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listAccounts, mailApi } from '@/lib/api-client';
import { MailListItem } from '@/components/MailListItem';
import { Label } from '@/components/ui/Label';

export default function MailPage() {
  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
    retry: false,
  });
  const messagesQ = useQuery({
    queryKey: ['messages', 'inbox'],
    queryFn: () => mailApi.listMessages({ limit: 30 }),
    retry: false,
  });

  const messages = messagesQ.data ?? [];
  const hasAccount = (accountsQ.data ?? []).length > 0;
  const loading = accountsQ.isLoading || messagesQ.isLoading;

  return (
    <main className="mx-auto min-h-screen w-full max-w-content px-6 py-16">
      <Link href="/" className="eyebrow">
        ← 뒤로
      </Link>

      <header className="mb-10 mt-6">
        <Label>Inbox</Label>
        <h1 className="display mt-3">받은편지함</h1>
      </header>

      {loading ? (
        <Skeleton />
      ) : messagesQ.isError ? (
        <Notice
          text="메일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
          cta={false}
        />
      ) : messages.length > 0 ? (
        <section>
          {messages.map((m) => (
            <MailListItem key={`${m.accountId}:${m.id}`} message={m} />
          ))}
          <div className="border-t border-hairline" />
        </section>
      ) : hasAccount ? (
        <Notice text="받은 메일이 없습니다." cta={false} />
      ) : (
        <Notice text="아직 연결된 계정이 없습니다." cta />
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

function Notice({ text, cta }: { text: string; cta: boolean }) {
  return (
    <div className="border-t border-hairline py-20 text-center">
      <p className="text-gray">{text}</p>
      {cta && (
        <Link
          href="/login"
          className="mt-4 inline-block text-sm tracking-tight text-ink underline"
        >
          계정 추가 →
        </Link>
      )}
    </div>
  );
}
