'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listAccounts, mailApi } from '@/lib/api-client';
import type { MailMessage } from '@/lib/providers/types';
import { MailListItem } from '@/components/MailListItem';
import { Label } from '@/components/ui/Label';

type Ref = { accountId: string; id: string };

const keyOf = (m: MailMessage) => `${m.accountId}:${m.id}`;

export default function MailPage() {
  const queryClient = useQueryClient();
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

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Map<string, Ref>>(new Map());
  const [deleting, setDeleting] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const messages = messagesQ.data ?? [];
  const hasAccount = (accountsQ.data ?? []).length > 0;
  const loading = accountsQ.isLoading || messagesQ.isLoading;

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Map());
    setActionErr(null);
  }

  function toggle(m: MailMessage) {
    const k = keyOf(m);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(k)) next.delete(k);
      else next.set(k, { accountId: m.accountId, id: m.id });
      return next;
    });
  }

  async function onDelete() {
    if (deleting || selected.size === 0) return;
    if (!window.confirm(`선택한 ${selected.size}개 메일을 휴지통으로 이동할까요?`))
      return;
    setDeleting(true);
    setActionErr(null);
    const refs = [...selected.values()];
    const results = await Promise.allSettled(
      refs.map((r) => mailApi.deleteMessage(r.accountId, r.id)),
    );
    await queryClient.invalidateQueries({ queryKey: ['messages'] });
    const failed = results.filter((r) => r.status === 'rejected').length;
    setDeleting(false);
    if (failed > 0) {
      setActionErr(`${failed}개 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.`);
      // 실패분만 남기기 위해 성공한 항목은 선택 해제.
      setSelected((prev) => {
        const next = new Map(prev);
        refs.forEach((r, i) => {
          if (results[i].status === 'fulfilled') next.delete(`${r.accountId}:${r.id}`);
        });
        return next;
      });
    } else {
      exitSelect();
    }
  }

  function composeHref(mode: 'reply' | 'forward'): string {
    const r = [...selected.values()][0];
    return `/compose/?mode=${mode}&accountId=${encodeURIComponent(
      r.accountId,
    )}&srcId=${encodeURIComponent(r.id)}`;
  }

  const count = selected.size;

  return (
    <main className="mx-auto min-h-screen w-full max-w-content px-6 py-16">
      <Link href="/" className="eyebrow">
        ← 뒤로
      </Link>

      <header className="mb-10 mt-6 flex items-end justify-between">
        <div>
          <Label>Inbox</Label>
          <h1 className="display mt-3">받은편지함</h1>
        </div>
        <div className="flex items-center gap-5">
          {messages.length > 0 &&
            (selectMode ? (
              <button type="button" onClick={exitSelect} className="eyebrow hover:text-ink">
                취소
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className="eyebrow hover:text-ink"
              >
                선택
              </button>
            ))}
          {!selectMode && (
            <Link href="/compose/" className="eyebrow">
              작성 →
            </Link>
          )}
        </div>
      </header>

      {selectMode && (
        <div className="mb-2 flex items-center justify-between border-t border-ink py-3">
          <span className="text-sm text-gray">{count}개 선택</span>
          <div className="flex items-center gap-5">
            <Link
              href={count === 1 ? composeHref('reply') : '#'}
              aria-disabled={count !== 1}
              className={`eyebrow ${
                count === 1 ? 'hover:text-ink' : 'pointer-events-none opacity-40'
              }`}
            >
              회신
            </Link>
            <Link
              href={count === 1 ? composeHref('forward') : '#'}
              aria-disabled={count !== 1}
              className={`eyebrow ${
                count === 1 ? 'hover:text-ink' : 'pointer-events-none opacity-40'
              }`}
            >
              전달
            </Link>
            <button
              type="button"
              onClick={onDelete}
              disabled={count === 0 || deleting}
              className="eyebrow hover:text-ink disabled:opacity-40"
            >
              {deleting ? '삭제 중…' : '삭제'}
            </button>
          </div>
        </div>
      )}
      {actionErr && <p className="mb-4 text-sm text-ink">{actionErr}</p>}

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
            <MailListItem
              key={keyOf(m)}
              message={m}
              selectMode={selectMode}
              selected={selected.has(keyOf(m))}
              onToggle={() => toggle(m)}
            />
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
