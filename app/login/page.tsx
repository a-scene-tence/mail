'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PROVIDERS } from '@/lib/providers/registry';
import type { MailProvider } from '@/lib/providers/types';
import { ProviderCard } from '@/components/ProviderCard';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { TextField } from '@/components/ui/TextField';

export default function LoginPage() {
  const [selected, setSelected] = useState<MailProvider | null>(null);

  return (
    <main className="mx-auto min-h-screen w-full max-w-content px-6 py-16">
      <Link href="/" className="eyebrow">
        ← 뒤로
      </Link>

      <header className="mb-12 mt-6">
        <Label>Add Account</Label>
        <h1 className="display mt-3">계정 추가</h1>
        <p className="mt-4 text-gray">
          서비스를 선택해 로그인하면 메일을 불러옵니다.
        </p>
      </header>

      {!selected ? (
        <section>
          {PROVIDERS.map((p) => (
            <ProviderCard key={p.id} provider={p} onSelect={setSelected} />
          ))}
          <div className="border-t border-hairline" />
        </section>
      ) : (
        <AuthForm provider={selected} onBack={() => setSelected(null)} />
      )}
    </main>
  );
}

function AuthForm({
  provider,
  onBack,
}: {
  provider: MailProvider;
  onBack: () => void;
}) {
  return (
    <section>
      <button type="button" onClick={onBack} className="eyebrow mb-8">
        ← 다른 서비스
      </button>

      <h2 className="text-2xl tracking-tight">{provider.label}</h2>

      {provider.auth === 'oauth' ? (
        <div className="mt-8 space-y-4">
          <p className="text-gray">
            {provider.label} 계정으로 안전하게 로그인합니다. (OAuth 연동은 다음
            단계)
          </p>
          {/* 다음 단계: /api/auth/google/start 로 리다이렉트 */}
          <Button disabled>{provider.label}(으)로 계속</Button>
        </div>
      ) : (
        <form className="mt-8 space-y-6" onSubmit={(e) => e.preventDefault()}>
          <TextField
            id="address"
            label="이메일 주소"
            type="email"
            placeholder={`you@${provider.domain}`}
            autoComplete="email"
          />
          <TextField
            id="app-password"
            label="앱 비밀번호"
            type="password"
            placeholder="앱 비밀번호"
            autoComplete="current-password"
          />
          <p className="text-xs text-gray">
            IMAP({provider.imap?.host}) · SMTP({provider.smtp?.host}). 자격증명은
            서버에서 암호화되어 보관됩니다. (연동은 다음 단계)
          </p>
          <Button type="submit" disabled>
            로그인
          </Button>
        </form>
      )}
    </section>
  );
}
