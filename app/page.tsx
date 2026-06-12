'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 마케팅 첫 화면 제거 — 앱은 곧장 받은편지함으로 진입한다.
// 계정 관리(로그인/연결 해제/상태)는 받은편지함 내 '계정' 패널에서.
export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/mail');
  }, [router]);
  return null;
}
