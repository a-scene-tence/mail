'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PROVIDERS } from '@/lib/providers/registry';
import type { MailProvider } from '@/lib/providers/types';
import { ProviderCard } from '@/components/ProviderCard';
import { startGoogleLogin, imapLogin, ImapLoginError } from '@/lib/api-client';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { TextField } from '@/components/ui/TextField';

// 콜백 실패 단계(reason) → 사용자/개발자용 힌트.
const REASON_HINT: Record<string, string> = {
  token: 'Google 토큰 교환 실패 — 재동의가 필요할 수 있습니다.',
  email: 'Google 프로필(이메일) 조회에 실패했습니다.',
  seal: '서버 암호화 키 설정 오류 (CREDENTIALS_ENCRYPTION_KEY, 64자 hex).',
  store: '자격증명 저장소 오류 (KV 환경변수 KV_REST_API_URL/TOKEN 확인).',
};

export default function LoginPage() {
  const [selected, setSelected] = useState<MailProvider | null>(null);
  const [error, setError] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setError(params.get('error') === 'oauth');
    setReason(params.get('reason'));
  }, []);

  return (
    <main className="mx-auto min-h-screen w-full max-w-content px-6 py-16">
      <div className="flex items-center justify-between">
        <BrandMark />
        <Link href="/" className="eyebrow">
          ← 뒤로
        </Link>
      </div>

      <header className="mb-12 mt-6">
        <Label>Add Account</Label>
        <h1 className="display mt-3">계정 추가</h1>
        <p className="mt-4 text-gray">
          서비스를 선택해 로그인하면 메일을 불러옵니다.
        </p>
      </header>

      {error && (
        <div className="mb-8 border-t border-ink py-3 text-sm text-ink">
          <p>로그인에 실패했습니다. 다시 시도해 주세요.</p>
          {reason && (
            <p className="mt-1 text-gray">
              {REASON_HINT[reason] ?? `실패 단계: ${reason}`}
            </p>
          )}
        </div>
      )}

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [errDetail, setErrDetail] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrMsg(null);
    setErrDetail(null);
    try {
      await imapLogin(provider.id, email, password);
      window.location.href = '/mail/';
    } catch (err) {
      // 서버가 준 reason에 따라 구체적 안내. 원문(detail)은 진단용으로 함께 노출.
      const reason = err instanceof ImapLoginError ? err.reason : undefined;
      setErrMsg(
        reason === 'connect'
          ? '메일 서버에 연결하지 못했습니다. 네트워크나 IMAP 호스트 설정을 확인하고 잠시 후 다시 시도해 주세요.'
          : '로그인 실패 — 이메일/앱 비밀번호가 맞는지, 아래 IMAP/앱 비밀번호 설정을 마쳤는지 확인해 주세요.',
      );
      const detail = err instanceof ImapLoginError ? err.detail : undefined;
      if (detail) setErrDetail(detail);
      setSubmitting(false);
    }
  }

  const help = provider.imapHelp;

  return (
    <section>
      <button type="button" onClick={onBack} className="eyebrow mb-8">
        ← 다른 서비스
      </button>

      <h2 className="text-2xl tracking-tight">{provider.label}</h2>

      {provider.auth === 'oauth' ? (
        <div className="mt-8 space-y-4">
          <p className="text-gray">
            {provider.label} 계정으로 안전하게 로그인합니다. 자격증명은 서버에서만
            암호화 보관됩니다.
          </p>
          <Button onClick={() => startGoogleLogin()}>
            {provider.label}(으)로 계속
          </Button>
        </div>
      ) : (
        <>
          {help && (
            <div className="mt-8 border-t border-hairline pt-5">
              <p className="eyebrow mb-3">로그인 전 설정</p>
              {help.steps.length > 0 && (
                <ol className="space-y-2 text-sm text-gray">
                  {help.steps.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 text-ink">{i + 1}.</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              )}
              {help.twoFactor && (
                <div className="mt-5">
                  <p className="eyebrow mb-3">2단계 인증 · 앱 비밀번호 발급</p>
                  <ol className="space-y-2 text-sm text-gray">
                    {help.twoFactor.steps.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="shrink-0 text-ink">{i + 1}.</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {help.note && (
                <p className="mt-4 text-xs text-gray">{help.note}</p>
              )}
              {help.settingsUrl && (
                <a
                  href={help.settingsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm text-ink underline"
                >
                  {provider.label} 설정 열기 →
                </a>
              )}
            </div>
          )}

          <form className="mt-8 space-y-6" onSubmit={onSubmit}>
            <TextField
              id="address"
              label="이메일 주소"
              type="email"
              placeholder={`you@${provider.domain}`}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              id="app-password"
              label="앱 비밀번호"
              type="password"
              placeholder="앱 비밀번호"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-gray">
              IMAP({provider.imap?.host}) · SMTP({provider.smtp?.host}).
              자격증명은 서버에서 암호화 보관됩니다.
            </p>
            {errMsg && (
              <div className="border-t border-ink pt-3">
                <p className="text-sm text-ink">{errMsg}</p>
                {errDetail && (
                  <p className="mt-1 break-words text-xs text-gray">
                    서버 응답: {errDetail}
                  </p>
                )}
              </div>
            )}
            <Button
              type="submit"
              disabled={submitting || !email || !password}
            >
              {submitting ? '로그인 중…' : '로그인'}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}
