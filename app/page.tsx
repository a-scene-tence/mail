import Link from 'next/link';
import { AccountsSection } from '@/components/AccountsSection';
import { Label } from '@/components/ui/Label';

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-content px-6 py-16">
      <header className="mb-12">
        <Label>Unified Inbox</Label>
        <h1 className="display mt-3">한 곳에서, 모든 메일.</h1>
        <p className="mt-4 max-w-md text-gray">
          흩어진 이메일 계정을 한 번의 로그인으로 모아 읽고 보냅니다.
        </p>
      </header>

      <AccountsSection />

      <section className="mt-12 border-t border-hairline pt-8">
        <Link href="/mail" className="text-sm tracking-tight text-ink underline">
          받은편지함 보기 →
        </Link>
      </section>
    </main>
  );
}
