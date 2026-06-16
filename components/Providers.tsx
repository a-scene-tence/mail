'use client';

import { useEffect, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hydrate,
} from '@tanstack/react-query';
import { GlobalLoadingBar } from './GlobalLoadingBar';

// 영속 캐시 키/수명. 버전(v1)으로 스키마 변경 시 무효화.
const CACHE_KEY = 'mail:rqcache:v1';
const CACHE_MAX_AGE = 24 * 60 * 60_000; // 24h
// 디스크에 저장할 목록류 쿼리(메타·작음). 본문(message)·자격증명은 저장하지 않음.
const PERSIST_KEYS = new Set(['messages', 'accounts', 'folders']);

/** TanStack Query 등 클라이언트 전역 프로바이더. */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    const c = new QueryClient({
      defaultOptions: {
        queries: {
          // 재방문·탭 전환 시 즉시 캐시 표시(깜빡임 완화). 1분간 신선.
          staleTime: 60_000,
          gcTime: 10 * 60_000,
          retry: 1,
          // 앱/탭 복귀·네트워크 재연결 시 백그라운드로 새 메일 갱신(staleTime 지나야 실제 조회).
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
        },
      },
    });
    // 첫 페인트 전에 동기 복원: 재진입 시 직전 목록을 스켈레톤 없이 즉시 표시.
    // (정적 export 빌드 시점엔 window가 없어 건너뜀 → 클라이언트 첫 렌더에서만 복원.)
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const { ts, state } = JSON.parse(raw) as {
            ts: number;
            state: unknown;
          };
          if (Date.now() - ts < CACHE_MAX_AGE) {
            hydrate(c, state as Parameters<typeof hydrate>[1]);
          } else {
            localStorage.removeItem(CACHE_KEY);
          }
        }
      } catch {
        /* 손상/프라이빗 모드 무시 */
      }
    }
    return c;
  });

  // 캐시 영속화: 변경 시 디바운스로 localStorage에 저장(복원은 위 동기 단계에서 완료).
  // 자격증명·본문은 저장하지 않는다(PERSIST_KEYS 화이트리스트).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const persist = () => {
      try {
        const state = dehydrate(client, {
          shouldDehydrateQuery: (q) =>
            q.state.status === 'success' &&
            PERSIST_KEYS.has(String(q.queryKey?.[0])),
        });
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ ts: Date.now(), state }),
        );
      } catch {
        /* 용량 초과/프라이빗 모드 무시 */
      }
    };
    const unsub = client.getQueryCache().subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(persist, 1000);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [client]);

  return (
    <QueryClientProvider client={client}>
      <GlobalLoadingBar />
      {children}
    </QueryClientProvider>
  );
}
