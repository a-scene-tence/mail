import type { MailAccount } from '@/lib/providers/types';
import { getProvider } from '@/lib/providers/registry';

/** 홈의 등록 계정 목록. */
export function AccountList({ accounts }: { accounts: MailAccount[] }) {
  if (accounts.length === 0) {
    return (
      <div className="border-t border-hairline py-16 text-center">
        <p className="text-gray">아직 등록된 계정이 없습니다.</p>
      </div>
    );
  }

  return (
    <ul>
      {accounts.map((acc) => {
        const provider = getProvider(acc.providerId);
        return (
          <li
            key={acc.id}
            className="flex items-center justify-between border-t border-hairline px-1 py-5"
          >
            <span className="flex flex-col">
              <span className="text-base tracking-tight text-ink">
                {acc.address}
              </span>
              <span className="mt-1 text-sm text-gray">
                {provider?.label ?? acc.providerId}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
