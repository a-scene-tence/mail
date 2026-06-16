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
import type { MailFolder, MailMessage } from '@/lib/providers/types';
import { getProvider } from '@/lib/providers/registry';
import { MailListItem } from '@/components/MailListItem';
import { BrandMark } from '@/components/BrandMark';
import { Label } from '@/components/ui/Label';

type Ref = { accountId: string; id: string; folder?: string };

// 대분류 — 받은편지함/보낸편지함/휴지통. 폴더는 이 셋 중 하나로 묶인다.
type Category = 'inbox' | 'sent' | 'trash';
const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'inbox', label: '받은편지함' },
  { id: 'sent', label: '보낸편지함' },
  { id: 'trash', label: '휴지통' },
];

/** 폴더를 대분류로 분류 (sent/trash 외 모두 받은편지함 분류). */
function folderCategory(f: MailFolder): Category {
  if (f.kind === 'sent') return 'sent';
  if (f.kind === 'trash') return 'trash';
  return 'inbox';
}

// 받은편지함 분류에서 칩으로 표시할 폴더 설정(자격증명 아님)을 계정별 localStorage에 보관.
const visKey = (accountId: string) => `mail:visibleFolders:${accountId}`;
function loadVisibleFolders(accountId: string): string[] | null {
  try {
    const s = localStorage.getItem(visKey(accountId));
    const arr = s ? (JSON.parse(s) as unknown) : null;
    return Array.isArray(arr) ? (arr as string[]) : null;
  } catch {
    return null;
  }
}
function saveVisibleFolders(accountId: string, ids: string[]): void {
  try {
    localStorage.setItem(visKey(accountId), JSON.stringify(ids));
  } catch {
    /* 저장 실패 무시(프라이빗 모드 등) */
  }
}

const keyOf = (m: MailMessage) => `${m.accountId}:${m.id}`;

export default function MailPage() {
  const queryClient = useQueryClient();
  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
    retry: false,
    // 계정은 거의 안 바뀜 → 포커스마다 재조회하지 않도록 길게 신선 유지.
    staleTime: 5 * 60_000,
  });
  const accounts = accountsQ.data ?? [];

  // 대분류 탭(받은/보낸/휴지통).
  const [category, setCategory] = useState<Category>('inbox');
  // 계정 필터 — undefined=전체, 아니면 account.id.
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  // 단일 계정 모드: 대분류 안에서 합쳐 볼 폴더(선택).
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  // 받은편지함 분류에서 칩으로 표시할 폴더(설정, 영속) + 설정 패널 토글.
  const [visibleFolders, setVisibleFolders] = useState<string[]>([]);
  const [showFolderSettings, setShowFolderSettings] = useState(false);
  // 제출된 검색어(입력 중 값과 분리해 Enter 시에만 서버 조회).
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  // '더 보기'로 점진적으로 키우는 조회 개수(계정당, 최대 500). 컨텍스트 전환 시 20으로 리셋.
  const [pageSize, setPageSize] = useState(20);
  const PAGE_STEP = 20;
  const PAGE_MAX = 500;

  const isSingleAccount = !!accountId;

  // 단일 계정 선택 시에만 그 계정의 폴더 목록을 불러온다.
  const foldersQ = useQuery({
    queryKey: ['folders', accountId],
    queryFn: () => listFolders(accountId as string),
    enabled: isSingleAccount,
    retry: false,
    // 폴더 구성은 거의 안 바뀜 → 포커스마다 IMAP/Gmail 폴더 호출이 새로 열리지 않게 길게 신선.
    staleTime: 5 * 60_000,
  });
  const folders = foldersQ.data ?? [];

  // 전체뷰(모든 계정) 받은편지함: 각 계정이 '폴더 설정'으로 정한 폴더(visibleFolders)를
  // 계정-스코프 복합키 'accountId|folderId'로 합산. 전체 탭엔 폴더 선택 UI가 없다.
  // localStorage는 정적 export·hydration 안전을 위해 effect에서만 읽는다.
  const [allInboxMailbox, setAllInboxMailbox] = useState('');
  useEffect(() => {
    if (isSingleAccount || category !== 'inbox' || accounts.length === 0) {
      setAllInboxMailbox('');
      return;
    }
    // 아무 계정도 커스텀 폴더를 정하지 않았으면 기존처럼 'inbox' 별칭(추가 비용 0).
    const anyCustom = accounts.some((a) => {
      const s = loadVisibleFolders(a.id);
      return !!(s && s.length);
    });
    if (!anyCustom) {
      setAllInboxMailbox('');
      return;
    }
    const tokens = accounts.flatMap((a) => {
      const saved = loadVisibleFolders(a.id);
      const fids = saved && saved.length ? saved : ['inbox']; // 미설정 계정은 대표 받은편지함
      return fids.map((fid) => `${a.id}|${fid}`);
    });
    setAllInboxMailbox(tokens.join(','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSingleAccount, category, accounts.map((a) => a.id).join(',')]);

  // 현재 대분류에 속한 폴더들 / 받은편지함 분류 폴더.
  const categoryFolders = folders.filter((f) => folderCategory(f) === category);
  const inboxFolders = folders.filter((f) => folderCategory(f) === 'inbox');
  // 받은편지함 분류에서 실제로 칩으로 보일 폴더(설정 ∩ 존재).
  const visibleInbox = inboxFolders.filter((f) => visibleFolders.includes(f.id));
  // 대분류의 대표 폴더(기본 선택값).
  const primaryFolderId = (cat: Category): string[] => {
    const inCat = folders.filter((f) => folderCategory(f) === cat);
    if (inCat.length === 0) return [];
    const primary = inCat.find((f) => f.kind === cat) ?? inCat[0];
    return [primary.id];
  };

  // 현재 대분류 기준 기본 선택: 받은편지함은 표시 폴더 전체, 그 외는 대표 폴더.
  const defaultSelection = (cat: Category, vis: string[]): string[] =>
    cat === 'inbox' ? vis : primaryFolderId(cat);

  // 계정 전환/폴더 도착 시: 표시 폴더 설정 로드 + 현재 대분류 기본 선택.
  useEffect(() => {
    if (!isSingleAccount) {
      setSelectedFolders([]);
      setVisibleFolders([]);
      setShowFolderSettings(false);
      return;
    }
    if (folders.length === 0) return;
    const inboxIds = new Set(
      folders.filter((f) => folderCategory(f) === 'inbox').map((f) => f.id),
    );
    const saved = loadVisibleFolders(accountId as string)?.filter((id) =>
      inboxIds.has(id),
    );
    const vis = saved && saved.length ? saved : primaryFolderId('inbox');
    setVisibleFolders(vis);
    setSelectedFolders(defaultSelection(category, vis));
    setShowFolderSettings(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, folders.length]);

  // 단일 계정이면 대분류 안 선택 폴더 합산.
  // 전체뷰 받은편지함은 각 계정이 정한 폴더를 자동 합산(allInboxMailbox), 없으면 'inbox' 별칭.
  // 보낸/휴지통 전체뷰는 종전대로 대분류 별칭.
  const effectiveMailbox = isSingleAccount
    ? selectedFolders.join(',')
    : category === 'inbox'
      ? allInboxMailbox || 'inbox'
      : category;
  const messagesEnabled = !isSingleAccount || selectedFolders.length > 0;

  const messagesQ = useQuery({
    queryKey: ['messages', accountId ?? 'all', effectiveMailbox, query, pageSize],
    queryFn: () =>
      mailApi.listMessages({
        limit: pageSize,
        mailbox: effectiveMailbox || 'inbox',
        accountId,
        query: query || undefined,
      }),
    enabled: messagesEnabled,
    placeholderData: keepPreviousData,
    retry: false,
  });

  // 탭/폴더/계정/검색 컨텍스트가 바뀌면 다시 첫 페이지(20개)부터.
  useEffect(() => {
    setPageSize(20);
  }, [accountId, category, effectiveMailbox, query]);

  const categoryLabel =
    CATEGORIES.find((c) => c.id === category)?.label ?? '받은편지함';
  const folderTitle =
    !isSingleAccount || selectedFolders.length <= 1
      ? categoryLabel
      : selectedFolders.length === visibleInbox.length
        ? `${categoryLabel} 전체`
        : `${categoryLabel} · ${selectedFolders.length}개`;

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Map<string, Ref>>(new Map());
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [showMoveTo, setShowMoveTo] = useState(false);
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

  // 좌우 스와이프로 대분류 전환 / 맨 위에서 아래로 당겨 새로고침.
  const touchRef = useRef<{ x: number; y: number; top: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, top: window.scrollY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = touchRef.current;
    touchRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // 당겨서 새로고침: 화면 최상단에서 세로 우세로 충분히 아래로 끌면 목록 재조회.
    if (s.top <= 4 && dy > 90 && Math.abs(dy) > Math.abs(dx)) {
      messagesQ.refetch();
      return;
    }
    // 가로 이동이 충분하고 세로보다 우세할 때만 대분류 전환.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    const order: Category[] = ['inbox', 'sent', 'trash'];
    const idx = order.indexOf(category);
    const next =
      dx < 0
        ? order[Math.min(idx + 1, order.length - 1)]
        : order[Math.max(idx - 1, 0)];
    switchCategory(next);
  }

  function resetSelect() {
    setSelectMode(false);
    setSelected(new Map());
    setShowMoveTo(false);
    setActionErr(null);
  }

  // 길게 누르기: 선택 모드 진입 + 그 메일 자동 선택.
  function onLongPress(m: MailMessage) {
    if (selectMode) return;
    setSelectMode(true);
    toggle(m);
  }

  // 누르는 순간/hover에 읽기 화면과 같은 키로 본문을 미리 가져온다(체감 속도).
  function prefetchMessage(m: MailMessage) {
    const box = m.folder ?? (effectiveMailbox || 'inbox');
    queryClient.prefetchQuery({
      queryKey: ['message', m.accountId, m.id, box],
      queryFn: () => mailApi.getMessage(m.accountId, m.id, box),
      staleTime: 60_000,
    });
  }

  // 활성 외 대분류를 미리 받아 둔다(탭 전환 즉시 표시). 실제 목록 쿼리 키와 정확히 일치시킨다
  // (그래야 전환 시 캐시 hit). 단일계정·전체뷰 모두 지원. 검색 중엔 키가 달라 생략.
  const categoryMailbox = (cat: Category): string =>
    isSingleAccount
      ? defaultSelection(cat, visibleFolders).join(',')
      : cat === 'inbox'
        ? allInboxMailbox || 'inbox'
        : cat;
  const visibleKey = visibleFolders.join(',');
  useEffect(() => {
    if (query || !messagesQ.isSuccess) return;
    for (const cat of CATEGORIES.map((c) => c.id)) {
      if (cat === category) continue;
      const mb = categoryMailbox(cat);
      if (isSingleAccount && !mb) continue; // 폴더 미로딩/대표 폴더 없음 → skip
      queryClient.prefetchQuery({
        queryKey: ['messages', accountId ?? 'all', mb || 'inbox', '', 20],
        queryFn: () =>
          mailApi.listMessages({ limit: 20, mailbox: mb || 'inbox', accountId }),
        staleTime: 60_000,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query,
    messagesQ.isSuccess,
    category,
    accountId,
    isSingleAccount,
    allInboxMailbox,
    visibleKey,
    folders.length,
    queryClient,
  ]);

  function switchCategory(cat: Category) {
    if (cat === category) return;
    setCategory(cat);
    setShowFolderSettings(false);
    resetSelect();
    if (isSingleAccount) setSelectedFolders(defaultSelection(cat, visibleFolders));
  }

  function switchAccount(id: string | undefined) {
    if (id === accountId) return;
    setAccountId(id);
    resetSelect();
    // 대분류는 유지(보낸/휴지통도 계정별로 분리 열람).
    // visible/selectedFolders는 foldersQ 도착 시 useEffect가 초기화.
  }

  // 보기: 받은편지함 표시 폴더 중 합쳐 볼 폴더 토글.
  function toggleFolder(id: string) {
    setSelectedFolders((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    resetSelect();
  }

  // 보기: 받은편지함 표시 폴더 전체 ↔ 대표 폴더.
  function toggleAllInbox() {
    const ids = visibleInbox.map((f) => f.id);
    setSelectedFolders((prev) =>
      prev.length === ids.length ? primaryFolderId('inbox') : ids,
    );
    resetSelect();
  }

  // 설정: 받은편지함에서 칩으로 표시할 폴더 토글(영속). 해제 시 보기에서도 제거.
  function toggleVisible(id: string) {
    if (!accountId) return;
    setVisibleFolders((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      saveVisibleFolders(accountId, next);
      return next;
    });
    setSelectedFolders((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev,
    );
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
  // 목록 스켈레톤은 '표시할 메시지가 전혀 없을 때(pending)'만. 계정 조회 로딩은
  // 계정 칩에만 영향을 주고, 캐시된 메시지가 있으면 목록을 가리지 않는다.
  const loading = messagesQ.isLoading;

  function toggle(m: MailMessage) {
    const k = keyOf(m);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(k)) next.delete(k);
      else next.set(k, { accountId: m.accountId, id: m.id, folder: m.folder });
      return next;
    });
  }

  // 낙관적 업데이트: 캐시된 모든 목록에서 해당 메시지들을 제거(작업을 즉시 반영하고
  // 블로킹 콜드 재조회를 없앤다). 영속 캐시도 디바운스로 동기화됨.
  function removeFromLists(keys: Set<string>) {
    queryClient.setQueriesData<MailMessage[]>({ queryKey: ['messages'] }, (old) =>
      old ? old.filter((m) => !keys.has(keyOf(m))) : old,
    );
  }

  async function onDelete() {
    if (deleting || selected.size === 0) return;
    if (!window.confirm(`선택한 ${selected.size}개 메일을 휴지통으로 이동할까요?`))
      return;
    const refs = [...selected.values()];
    // 낙관적: 목록에서 즉시 제거 + 선택 모드 종료. 서버 요청은 백그라운드로.
    removeFromLists(new Set(refs.map((r) => `${r.accountId}:${r.id}`)));
    resetSelect();
    setDeleting(true);
    const results = await Promise.allSettled(
      refs.map((r) =>
        mailApi.deleteMessage(r.accountId, r.id, r.folder ?? (effectiveMailbox || 'inbox')),
      ),
    );
    setDeleting(false);
    // 실패가 있으면 서버 상태로 되돌려 동기화 + 에러 표시.
    if (results.some((r) => r.status === 'rejected')) {
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
      setActionErr('일부 메일 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  async function onMove(destId: string, destName: string) {
    if (moving || selected.size === 0) return;
    if (
      !window.confirm(`선택한 ${selected.size}개 메일을 ‘${destName}’(으)로 이동할까요?`)
    )
      return;
    const refs = [...selected.values()];
    // 낙관적: 목록에서 즉시 제거 + 선택 모드 종료. 서버 요청은 백그라운드로.
    removeFromLists(new Set(refs.map((r) => `${r.accountId}:${r.id}`)));
    resetSelect();
    setMoving(true);
    const results = await Promise.allSettled(
      refs.map((r) =>
        mailApi.moveMessage(
          r.accountId,
          r.id,
          destId,
          r.folder ?? (effectiveMailbox || 'inbox'),
        ),
      ),
    );
    setMoving(false);
    if (results.some((r) => r.status === 'rejected')) {
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
      setActionErr(
        `일부 메일을 ‘${destName}’(으)로 이동하지 못했습니다. 잠시 후 다시 시도해 주세요.`,
      );
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
      <div className="flex items-center justify-between">
        <BrandMark />
        <button
          type="button"
          onClick={() => setShowAccounts((v) => !v)}
          className="eyebrow hover:text-ink"
        >
          계정 {showAccounts ? '닫기' : `· ${accounts.length}개 연결됨`}
        </button>
      </div>

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
            {category === 'sent'
              ? 'Sent'
              : category === 'trash'
                ? 'Trash'
                : 'Inbox'}
          </Label>
          <h1 className="display mt-3">{folderTitle}</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => messagesQ.refetch()}
            disabled={messagesQ.isFetching}
            className="eyebrow hover:text-ink disabled:opacity-40"
          >
            {messagesQ.isFetching ? '불러오는 중…' : '새로고침'}
          </button>
          <Link href="/compose/" className="eyebrow">
            작성 →
          </Link>
        </div>
      </header>

      <nav className="mb-6 flex gap-6 border-b border-hairline">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => switchCategory(c.id)}
            className={`-mb-px border-b-2 pb-3 text-sm tracking-tight transition-colors ${
              category === c.id
                ? 'border-ink text-ink'
                : 'border-transparent text-gray hover:text-ink'
            }`}
          >
            {c.label}
          </button>
        ))}
      </nav>

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

      {/* 폴더 선택은 '받은편지함' 분류에서만(보낸/휴지통은 숨김). */}
      {isSingleAccount && foldersQ.isLoading && (
        <p className="mb-6 py-1 text-sm text-gray">폴더 불러오는 중…</p>
      )}
      {isSingleAccount &&
        !foldersQ.isLoading &&
        category === 'inbox' &&
        inboxFolders.length > 1 && (
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <Label>폴더</Label>
              <button
                type="button"
                onClick={() => setShowFolderSettings((v) => !v)}
                className="eyebrow hover:text-ink"
              >
                {showFolderSettings ? '완료' : '폴더 설정'}
              </button>
            </div>

            {showFolderSettings ? (
              // 설정: 받은편지함에서 칩으로 표시할 폴더 체크(영속).
              <div>
                <p className="mb-3 text-xs text-gray">
                  받은편지함 바에 표시할 폴더를 선택하세요.
                </p>
                <div className="flex flex-wrap gap-2">
                  {inboxFolders.map((f) => (
                    <FolderChip
                      key={f.id}
                      label={f.name}
                      active={visibleFolders.includes(f.id)}
                      onClick={() => toggleVisible(f.id)}
                    />
                  ))}
                </div>
              </div>
            ) : visibleInbox.length === 0 ? (
              <p className="py-1 text-sm text-gray">
                표시할 폴더가 없습니다. ‘폴더 설정’에서 선택하세요.
              </p>
            ) : (
              // 보기: 표시 폴더 중 합쳐 볼 폴더 다중 선택.
              <div className="flex flex-wrap gap-2">
                {visibleInbox.length > 1 && (
                  <FolderChip
                    label="받은편지함 전체"
                    active={selectedFolders.length === visibleInbox.length}
                    onClick={toggleAllInbox}
                  />
                )}
                {visibleInbox.map((f) => (
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

      {/* 목록 상단 액션 툴바 — 평소엔 '선택', 선택 모드엔 회신/전달/삭제/취소. */}
      {messages.length > 0 &&
        (selectMode ? (
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
              {isSingleAccount && folders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMoveTo((v) => !v)}
                  disabled={count === 0 || moving}
                  className="eyebrow hover:text-ink disabled:opacity-40"
                >
                  {moving ? '이동 중…' : showMoveTo ? '이동 닫기' : '이동'}
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                disabled={count === 0 || deleting}
                className="eyebrow hover:text-ink disabled:opacity-40"
              >
                {deleting ? '삭제 중…' : '삭제'}
              </button>
              <button
                type="button"
                onClick={resetSelect}
                className="eyebrow hover:text-ink"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-2 flex items-center justify-end border-t border-hairline py-3">
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              className="eyebrow hover:text-ink"
            >
              선택
            </button>
          </div>
        ))}
      {/* 이동 대상 폴더 선택 — 선택 모드 + 단일 계정에서만. */}
      {selectMode && showMoveTo && isSingleAccount && folders.length > 0 && (
        <div className="mb-4 border-b border-hairline pb-4">
          <p className="mb-3 text-xs text-gray">이동할 폴더를 선택하세요.</p>
          <div className="flex flex-wrap gap-2">
            {folders.map((f) => (
              <FolderChip
                key={f.id}
                label={f.name}
                active={false}
                onClick={() => onMove(f.id, f.name)}
              />
            ))}
          </div>
        </div>
      )}
      {actionErr && <p className="mb-4 text-sm text-ink">{actionErr}</p>}

      {isSingleAccount && selectedFolders.length === 0 ? (
        foldersQ.isLoading ? (
          <Skeleton />
        ) : (
          <Notice
            text={
              categoryFolders.length === 0
                ? `${categoryLabel} 폴더가 없는 계정입니다.`
                : '폴더를 선택하세요.'
            }
            cta={false}
          />
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
              mailbox={category}
              selectMode={selectMode}
              selected={selected.has(keyOf(m))}
              onToggle={() => toggle(m)}
              onLongPress={() => onLongPress(m)}
              onPrefetch={() => prefetchMessage(m)}
            />
          ))}
          <div className="border-t border-hairline" />
          {/* 더 보기 — 검색이 아니고, 반환 개수가 요청 한도에 닿아(더 있을 가능성) 상한 미만일 때. */}
          {!query && messages.length >= pageSize && pageSize < PAGE_MAX && (
            <div className="py-6 text-center">
              <button
                type="button"
                onClick={() =>
                  setPageSize((p) => Math.min(p + PAGE_STEP, PAGE_MAX))
                }
                disabled={messagesQ.isFetching}
                className="text-sm tracking-tight text-ink underline disabled:opacity-40"
              >
                {messagesQ.isFetching ? '불러오는 중…' : '더 보기'}
              </button>
            </div>
          )}
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
