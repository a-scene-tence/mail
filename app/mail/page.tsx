'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  listAccounts,
  listFolders,
  mailApi,
  removeAccount,
} from '@/lib/api-client';
import type { MailMessage, Mailbox } from '@/lib/providers/types';
import { getProvider } from '@/lib/providers/registry';
import { MailListItem } from '@/components/MailListItem';
import { Label } from '@/components/ui/Label';

type Ref = { accountId: string; id: string; folder?: string };

const keyOf = (m: MailMessage) => `${m.accountId}:${m.id}`;

export default function MailPage() {
  const queryClient = useQueryClient();
  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
    retry: false,
  });
  const accounts = accountsQ.data ?? [];

  // 전체계정 모드의 받은/보낸 탭.
  const [mailbox, setMailbox] = useState<Mailbox>('inbox');
  // 계정 필터 — undefined=전체, 아니면 account.id.
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  // 단일 계정 모드에서 합쳐 볼 폴더 id 집합.
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  // 제출된 검색어(입력 중 값과 분리해 Enter 시에만 서버 조회).
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');

  const isSingleAccount = !!accountId;

  // 단일 계정 선택 시에만 그 계정의 폴더 목록을 불러온다.
  const foldersQ = useQuery({
    queryKey: ['folders', accountId],
    queryFn: () => listFolders(accountId as string),
    enabled: isSingleAccount,
    retry: false,
  });
  const folders = foldersQ.data ?? [];

  // 계정 전환 또는 폴더 목록 도착 시 기본 선택을 받은편지함으로 초기화.
  useEffect(() => {
    if (!isSingleAccount) {
      setSelectedFolders([]);
      return;
    }
    if (folders.length === 0) return;
    const inbox = folders.find((f) => f.kind === 'inbox') ?? folders[0];
    setSelectedFolders([inbox.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, folders.length]);

  // 단일 계정이면 선택 폴더 합산, 아니면 받은/보낸 탭.
  const effectiveMailbox = isSingleAccount
    ? selectedFolders.join(',')
    : mailbox;
  const messagesEnabled = !isSingleAccount || selectedFolders.length > 0;

  const messagesQ = useQuery({
    queryKey: ['messages', accountId ?? 'all', effectiveMailbox, query],
    queryFn: () =>
      mailApi.listMessages({
        limit: 30,
        mailbox: effectiveMailbox || 'inbox',
        accountId,
        query: query || undefined,
      }),
    enabled: messagesEnabled,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const allFoldersSelected =
    folders.length > 0 && selectedFolders.length === folders.length;
  const folderTitle = !isSingleAccount
    ? mailbox === 'sent'
      ? '보낸편지함'
      : '받은편지함'
    : selectedFolders.length === 0
      ? '폴더 선택'
      : allFoldersSelected
        ? '전체 폴더'
        : selectedFolders.length === 1
          ? (folders.find((f) => f.id === selectedFolders[0])?.name ?? '폴더')
          : `${selectedFolders.length}개 폴더`;

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Map<string, Ref>>(new Map());
  const [deleting, setDeleting] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // 계정 관리 패널(현재 로그인 상태 / 연결 해제 / 로그인).
  const [showAccounts, setShowAccounts] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function onDisconnect(id: string, address: string) {
    if (removingId) return;
    if (!window.confirm(`${address} 계정 연결을 해제할까요?`)) return;
    setRemovingId(id);
    try {
      await removeAccount(id);
      if (accountId === id) setAccountId(undefined);
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
    } catch {
      window.alert('연결 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setRemovingId(null);
    }
  }

  // 좌우 스와이프로 받은/보낸 탭 전환.
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = touchRef.current;
    touchRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    if (isSingleAccount) return; // 단일 계정은 폴더 패널로 전환.
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // 가로 이동이 충분하고 세로보다 우세할 때만 탭 전환.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    switchBox(dx < 0 ? 'sent' : 'inbox');
  }

  function resetSelect() {
    setSelectMode(false);
    setSelected(new Map());
    setActionErr(null);
  }

  function switchBox(b: Mailbox) {
    if (b === mailbox) return;
    setMailbox(b);
    resetSelect();
    // 반대 탭을 미리 적재해 전환 체감 단축.
    const other: Mailbox = b === 'inbox' ? 'sent' : 'inbox';
    queryClient.prefetchQuery({
      queryKey: ['messages', accountId ?? 'all', other, query],
      queryFn: () =>
        mailApi.listMessages({
          limit: 30,
          mailbox: other,
          accountId,
          query: query || undefined,
        }),
    });
  }

  function switchAccount(id: string | undefined) {
    if (id === accountId) return;
    setAccountId(id);
    setMailbox('inbox'); // 전체계정 탭 기본값.
    resetSelect();
    // selectedFolders는 foldersQ 도착 시 useEffect가 초기화.
  }

  function toggleFolder(id: string) {
    setSelectedFolders((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    resetSelect();
  }

  function toggleAllFolders() {
    const allIds = folders.map((f) => f.id);
    setSelectedFolders((prev) => (prev.length === allIds.length ? [] : allIds));
    resetSelect();
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setQuery(searchInput.trim());
    resetSelect();
  }

  function clearSearch() {
    setSearchInput('');
    setQuery('');
  }

  // 계정 탭 — 전체 + 연결된 계정별(라벨은 제공자명, 동일 제공자 복수면 주소 병기).
  const providerCount = new Map<string, number>();
  accounts.forEach((a) =>
    providerCount.set(a.providerId, (providerCount.get(a.providerId) ?? 0) + 1),
  );
  const accountTabs = accounts.map((a) => {
    const label = getProvider(a.providerId)?.label ?? a.providerId;
    return {
      id: a.id,
      label: (providerCount.get(a.providerId) ?? 0) > 1 ? a.address : label,
    };
  });

  const messages = messagesQ.data ?? [];
  const hasAccount = accounts.length > 0;
  const loading = accountsQ.isLoading || messagesQ.isLoading;

  function toggle(m: MailMessage) {
    const k = keyOf(m);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(k)) next.delete(k);
      else next.set(k, { accountId: m.accountId, id: m.id, folder: m.folder });
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
      refs.map((r) =>
        mailApi.deleteMessage(r.accountId, r.id, r.folder ?? (effectiveMailbox || 'inbox')),
      ),
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
      resetSelect();
    }
  }

  function composeHref(mode: 'reply' | 'forward'): string {
    const r = [...selected.values()][0];
    const box = r.folder ?? (effectiveMailbox || 'inbox');
    return `/compose/?mode=${mode}&accountId=${encodeURIComponent(
      r.accountId,
    )}&srcId=${encodeURIComponent(r.id)}&mailbox=${encodeURIComponent(box)}`;
  }

  const count = selected.size;

  return (
    <main
      className="mx-auto min-h-screen w-full max-w-content px-6 py-16"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        type="button"
        onClick={() => setShowAccounts((v) => !v)}
        className="eyebrow hover:text-ink"
      >
        계정 {showAccounts ? '닫기' : `· ${accounts.length}개 연결됨`}
      </button>

      {showAccounts && (
        <AccountsPanel
          accounts={accounts}
          removingId={removingId}
          onDisconnect={onDisconnect}
        />
      )}

      <header className="mb-6 mt-6 flex items-end justify-between">
        <div>
          <Label>
            {isSingleAccount
              ? 'Folders'
              : mailbox === 'sent'
                ? 'Sent'
                : 'Inbox'}
          </Label>
          <h1 className="display mt-3">{folderTitle}</h1>
        </div>
        <div className="flex items-center gap-5">
          {messages.length > 0 &&
            (selectMode ? (
              <button type="button" onClick={resetSelect} className="eyebrow hover:text-ink">
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

      {!isSingleAccount && (
        <nav className="mb-8 flex gap-6 border-b border-hairline">
          {(['inbox', 'sent'] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => switchBox(b)}
              className={`-mb-px border-b-2 pb-3 text-sm tracking-tight transition-colors ${
                mailbox === b
                  ? 'border-ink text-ink'
                  : 'border-transparent text-gray hover:text-ink'
              }`}
            >
              {b === 'inbox' ? '받은편지함' : '보낸편지함'}
            </button>
          ))}
        </nav>
      )}

      {accountTabs.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <AccountChip
            label="전체"
            active={accountId === undefined}
            onClick={() => switchAccount(undefined)}
          />
          {accountTabs.map((t) => (
            <AccountChip
              key={t.id}
              label={t.label}
              active={accountId === t.id}
              onClick={() => switchAccount(t.id)}
            />
          ))}
        </div>
      )}

      {isSingleAccount && (
        <div className="mb-6 border-b border-hairline pb-4">
          {foldersQ.isLoading ? (
            <p className="py-2 text-sm text-gray">폴더 불러오는 중…</p>
          ) : folders.length === 0 ? (
            <p className="py-2 text-sm text-gray">폴더가 없습니다.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <FolderChip
                label="전체 폴더"
                active={allFoldersSelected}
                onClick={toggleAllFolders}
              />
              {folders.map((f) => (
                <FolderChip
                  key={f.id}
                  label={f.name}
                  active={selectedFolders.includes(f.id)}
                  onClick={() => toggleFolder(f.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {hasAccount && (
        <form onSubmit={onSearchSubmit} className="mb-6">
          <div className="flex items-center gap-3 border-b border-hairline focus-within:border-ink">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="메일 검색 (제목·보낸사람·내용)"
              className="w-full bg-transparent py-2 text-base text-ink outline-none placeholder:text-gray"
            />
            {query ? (
              <button
                type="button"
                onClick={clearSearch}
                className="eyebrow shrink-0 hover:text-ink"
              >
                지우기
              </button>
            ) : (
              <button type="submit" className="eyebrow shrink-0 hover:text-ink">
                검색
              </button>
            )}
          </div>
          {query && (
            <p className="mt-2 text-xs text-gray">
              ‘{query}’ 검색결과 {messagesQ.isFetching ? '검색 중…' : `${messages.length}건`}
            </p>
          )}
        </form>
      )}

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

      {isSingleAccount && selectedFolders.length === 0 ? (
        foldersQ.isLoading ? (
          <Skeleton />
        ) : (
          <Notice text="표시할 폴더를 선택하세요." cta={false} />
        )
      ) : loading ? (
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
              mailbox={mailbox}
              selectMode={selectMode}
              selected={selected.has(keyOf(m))}
              onToggle={() => toggle(m)}
            />
          ))}
          <div className="border-t border-hairline" />
        </section>
      ) : hasAccount ? (
        <Notice
          text={
            query
              ? `‘${query}’에 대한 검색결과가 없습니다.`
              : `${folderTitle}에 메일이 없습니다.`
          }
          cta={false}
        />
      ) : (
        <Notice text="아직 연결된 계정이 없습니다." cta />
      )}
    </main>
  );
}

function AccountsPanel({
  accounts,
  removingId,
  onDisconnect,
}: {
  accounts: { id: string; providerId: string; address: string }[];
  removingId: string | null;
  onDisconnect: (id: string, address: string) => void;
}) {
  return (
    <section className="mb-4 mt-5 border-t border-hairline pt-5">
      <div className="mb-3 flex items-center justify-between">
        <Label>계정</Label>
        <Link href="/login" className="eyebrow hover:text-ink">
          계정 추가 +
        </Link>
      </div>
      {accounts.length === 0 ? (
        <p className="py-4 text-sm text-gray">
          연결된 계정이 없습니다.{' '}
          <Link href="/login" className="text-ink underline">
            로그인 →
          </Link>
        </p>
      ) : (
        <ul>
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between border-t border-hairline py-4"
            >
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 truncate text-sm text-ink">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink"
                  />
                  {a.address}
                </span>
                <span className="mt-1 text-xs text-gray">
                  {getProvider(a.providerId)?.label ?? a.providerId} · 연결됨
                </span>
              </span>
              <button
                type="button"
                onClick={() => onDisconnect(a.id, a.address)}
                disabled={removingId === a.id}
                className="eyebrow shrink-0 hover:text-ink disabled:opacity-40"
              >
                {removingId === a.id ? '해제 중…' : '연결 해제'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs tracking-tight transition-colors ${
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-hairline text-gray hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

// 폴더 다중 선택 칩 — 체크 상태를 체크표시로 표현.
function FolderChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs tracking-tight transition-colors ${
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-hairline text-gray hover:text-ink'
      }`}
    >
      {active ? '✓ ' : ''}
      {label}
    </button>
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
