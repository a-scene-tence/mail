import Link from 'next/link';

// 좌측 상단 앱 브랜드 마크 — 탭하면 홈(받은편지함)으로.
// icon.svg는 흰 배경 런처 아이콘이라 흰 캔버스에서 묻히지 않도록 hairline 테두리 타일로 감싼다.
export function BrandMark() {
  return (
    <Link href="/mail/" aria-label="올인박스 홈" className="inline-flex shrink-0">
      {/* 정적 export 호환을 위해 next/image 대신 일반 img 사용. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon.svg"
        alt="올인박스"
        width={36}
        height={36}
        className="h-9 w-9 rounded-[10px] border border-hairline"
      />
    </Link>
  );
}
