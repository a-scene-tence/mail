import Link from 'next/link';
import type { MailMessage } from '@/lib/providers/types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

interface Props {
  message: MailMessage;
  /** 선택 모드면 행 탭이 이동 대신 선택 토글로 동작 */
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}

/** 메일 목록 한 행 — 발신자/제목/스니펫/날짜. 선택 모드면 체크박스. */
export function MailListItem({ message, selectMode, selected, onToggle }: Props) {
  const meta = (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-4">
        <span
          className={`truncate text-sm ${
            message.unread ? 'text-ink' : 'text-gray'
          }`}
        >
          {message.from}
        </span>
        <span className="shrink-0 text-xs text-gray">
          {formatDate(message.date)}
        </span>
      </div>
      <h3
        className={`mt-1 truncate text-base tracking-tight ${
          message.unread ? 'font-semibold text-ink' : 'text-ink'
        }`}
      >
        {message.subject || '(제목 없음)'}
      </h3>
      <p className="mt-1 truncate text-sm text-gray">{message.snippet}</p>
    </div>
  );

  if (selectMode) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className="flex w-full gap-4 border-t border-hairline px-1 py-5 text-left transition-colors hover:bg-paper-off"
      >
        <span
          aria-hidden
          className={`mt-1.5 h-4 w-4 shrink-0 rounded-sm border ${
            selected ? 'border-ink bg-ink' : 'border-hairline bg-transparent'
          }`}
        />
        {meta}
      </button>
    );
  }

  const href = `/read/?accountId=${encodeURIComponent(
    message.accountId,
  )}&id=${encodeURIComponent(message.id)}`;
  return (
    <Link
      href={href}
      className="flex gap-4 border-t border-hairline px-1 py-5 transition-colors hover:bg-paper-off"
    >
      <span
        aria-hidden
        className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
          message.unread ? 'bg-ink' : 'bg-transparent'
        }`}
      />
      {meta}
    </Link>
  );
}
