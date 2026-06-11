'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listAccounts } from '@/lib/api-client';
import { AccountList } from '@/components/AccountList';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';

export function AccountsSection() {
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
    retry: false,
  });

  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <Label>계정</Label>
        <Link href="/login">
          <Button variant="outline">계정 추가</Button>
        </Link>
      </div>
      {isLoading ? (
        <div className="border-t border-hairline py-16 text-center text-gray">
          불러오는 중…
        </div>
      ) : (
        <AccountList accounts={accounts} />
      )}
    </section>
  );
}
