// 앱인토스 WebView 브리지 가드.
// 웹(Vercel)에서는 no-op, Toss WebView 안에서는 네이티브 브리지를 사용한다.
// 실제 SDK(@apps-in-toss/web-framework) 연결은 다음 단계. 지금은 안전한 분기만 제공.

export function isInToss(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Toss WebView의 UA/전역 브리지 존재 여부로 추정 (정식 감지는 SDK로 교체 예정).
  const ua = navigator.userAgent || '';
  const hasBridge =
    typeof window !== 'undefined' &&
    // @ts-expect-error — 네이티브 브리지 전역(런타임에만 존재)
    typeof window.__TOSS__ !== 'undefined';
  return /toss/i.test(ua) || hasBridge;
}

/** 뒤로가기 핸들링 등록 (웹에서는 history 기반, Toss에서는 브리지로 교체 예정). */
export function registerBackHandler(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onPop = () => handler();
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}
