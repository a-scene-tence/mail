'use client';

import { useEffect, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';

// 전역 로딩 표시 — 진행 중인 쿼리가 하나라도 있으면 화면 최상단에
// 얇은 진행 바 + '로딩중…' 라벨을 띄운다(최초 로드·배경 새로고침·prefetch 모두).
// 단, 캐시 hit·프리페치 등 빠른 응답에서 깜빡이지 않도록 ~350ms 이상 지속될 때만 노출한다.
const SHOW_DELAY_MS = 350;

export function GlobalLoadingBar() {
  const fetching = useIsFetching();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!fetching) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [fetching]);
  if (!fetching || !show) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      role="status"
      aria-live="polite"
    >
      <div className="h-0.5 w-full overflow-hidden bg-hairline">
        <div className="h-full w-2/5 animate-[loadingbar_1.1s_ease-in-out_infinite] bg-ink" />
      </div>
      <div className="flex justify-center">
        <span className="mt-1 rounded-full bg-ink/90 px-2.5 py-0.5 text-[11px] tracking-tight text-paper">
          로딩중…
        </span>
      </div>
    </div>
  );
}
