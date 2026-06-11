import type { MailProvider } from '@/lib/providers/types';

/** 로그인 화면의 제공자 선택 행 — 헤어라인 리스트, 호버 페이드. */
export function ProviderCard({
  provider,
  onSelect,
}: {
  provider: MailProvider;
  onSelect: (p: MailProvider) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(provider)}
      className="flex w-full items-center justify-between border-t border-hairline px-1 py-5 text-left transition-colors hover:bg-paper-off"
    >
      <span className="flex flex-col">
        <span className="text-lg tracking-tight text-ink">
          {provider.label}
        </span>
        <span className="mt-1 text-sm text-gray">{provider.domain}</span>
      </span>
      <span className="eyebrow">
        {provider.auth === 'oauth' ? 'OAuth' : 'IMAP'}
      </span>
    </button>
  );
}
