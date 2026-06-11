/** 대문자 + 넓은 자간 메타 라벨 (eyebrow). */
export function Label({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`eyebrow ${className}`}>{children}</span>;
}
