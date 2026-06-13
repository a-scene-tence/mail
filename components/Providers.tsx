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
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 재방문·탭 전환 시 즉시 캐시 표시(깜빡임 완화). 1분간 신선.
            staleTime: 60_000,
            gcTime: 10 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // 캐시 영속화: 진입 시 localStorage에서 복원(hydrate), 변경 시 디바운스 저장.
  // 재방문 시 직전 목록을 즉시 보여주고 백그라운드에서 갱신한다(자격증명은 저장 안 함).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { ts, state } = JSON.parse(raw) as { ts: number; state: unknown };
        if (Date.now() - ts < CACHE_MAX_AGE) {
          hydrate(client, state as Parameters<typeof hydrate>[1]);
        } else {
          localStorage.removeItem(CACHE_KEY);
        }
      }
    } catch {
      /* 손상/프라이빗 모드 무시 */
    }

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
