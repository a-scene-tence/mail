/** 1px 헤어라인 구분선. */
export function Hairline({ className = '' }: { className?: string }) {
  return <hr className={`hairline ${className}`} />;
}
