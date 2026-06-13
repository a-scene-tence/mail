import Link from 'next/link';
import { useRef } from 'react';
import type { MailMessage, Mailbox } from '@/lib/providers/types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

interface Props {
  message: MailMessage;
  /** 받은편지함이면 발신자, 보낸편지함이면 수신자를 표시 */
  mailbox?: Mailbox;
  /** 선택 모드면 행 탭이 이동 대신 선택 토글로 동작 */
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  /** 길게 누르면(모바일) / 우클릭(데스크톱) 선택 모드 진입 + 이 메일 선택 */
  onLongPress?: () => void;
  /** 누르는 순간/hover에 본문 미리 가져오기(읽기 화면 즉시 표시용) */
  onPrefetch?: () => void;
}

/** 메일 목록 한 행 — 상대방/제목/스니펫/날짜. 선택 모드면 체크박스. */
export function MailListItem({
  message,
  mailbox = 'inbox',
  selectMode,
  selected,
  onToggle,
  onLongPress,
  onPrefetch,
}: Props) {
  // 길게 누르기(long-press) 상태 — 외부 라이브러리 없이 타이머로 판정.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  function clearLongPress() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }
  function onTouchStart(e: React.TouchEvent) {
    onPrefetch?.();
    if (!onLongPress) return;
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    firedRef.current = false;
    clearLongPress();
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      navigator.vibrate?.(10);
      onLongPress();
    }, 500);
  }
  function onTouchMove(e: React.TouchEvent) {
    const s = startRef.current;
    if (!s) return;
    const t = e.touches[0];
    // 10px 이상 움직이면 스크롤/스와이프로 보고 long-press 취소.
    if (Math.abs(t.clientX - s.x) > 10 || Math.abs(t.clientY - s.y) > 10) {
      clearLongPress();
    }
  }
  // 보낸편지함은 수신자(받는 사람)를, 받은편지함은 발신자를 보여준다.
  const counterpart =
    mailbox === 'sent'
      ? message.to.length
        ? message.to.join(', ')
        : '(받는 사람 없음)'
      : message.from;
  const meta = (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-4">
        <span
          className={`truncate text-sm ${
            message.unread ? 'text-ink' : 'text-gray'
          }`}
        >
          {counterpart}
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

  // 집계 목록에선 메시지가 속한 폴더로 열어야 IMAP lock이 정확하다.
  const openMailbox = message.folder ?? mailbox;
  const href = `/read/?accountId=${encodeURIComponent(
    message.accountId,
  )}&id=${encodeURIComponent(message.id)}&mailbox=${encodeURIComponent(
    openMailbox,
  )}`;
  return (
    <Link
      href={href}
      className="flex gap-4 border-t border-hairline px-1 py-5 transition-colors hover:bg-paper-off"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={clearLongPress}
      onTouchCancel={clearLongPress}
      onMouseEnter={onPrefetch}
      onContextMenu={(e) => {
        if (onLongPress) {
          e.preventDefault();
          onLongPress();
        }
      }}
      onClick={(e) => {
        // long-press 직후 발생하는 클릭은 읽기 화면 이동을 막는다.
        if (firedRef.current) {
          e.preventDefault();
          firedRef.current = false;
        }
      }}
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
