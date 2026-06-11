import Link from 'next/link';
import type { MailMessage } from '@/lib/providers/types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

/** 메일 목록 한 행 — 발신자/제목/스니펫/날짜, 읽지 않음 dot. */
export function MailListItem({ message }: { message: MailMessage }) {
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
    </Link>
  );
}
